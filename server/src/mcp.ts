import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Context } from "hono";
import { z } from "zod";

import { resolveCriteria } from "./criteria.ts";
import { PlanError } from "./plan.ts";
import { publicDevice, publicRequest, sessionSummary, type Store } from "./store.ts";

const SCHEMA = `A session plan is one JSON object, the same shape as docs/plan-format.md.

Required shape:
- v: 1
- kind: "plan"
- mode: roam, quests, events, fun, farm, or custom (default custom)
- budget: whole minutes from 5 to 240 (default 60). The in-game buttons are 30, 60, and 120; other values are allowed.
- tasks: 1 to 40 objects

Each task:
- id: 1-80 characters, letters, digits, colon, dot, underscore, hyphen (example mentor:ashes)
- title: non-empty, at most 240 bytes
- estMinutes: 1 to 240 (default 15)
- mapID: optional ui map id
- x and y: optional, both required together, fractions of the map from 0 to 1. Wowhead 0-100 coordinates must be divided by 100.
- note: optional, at most 400 bytes. Shown in full in the in-game tracker; say where to go and what to do.
- waypoints: optional, 1 to 10 points [{ mapID, x, y, label }] in route order. x and y are 0 to 1, label at most 80 bytes. The addon sets the native waypoint arrow (and TomTom when installed) on point 1 and moves to the next point when the player comes within about 30 yards. Use it for a multi-stop task. Without waypoints the task's own mapID, x, y is the single point.
- complete: how the game finishes the task. Omit it and the player presses Done.

complete.kind:
- manual
- achievement with achievementID
- criteria with achievementID and criteriaID or criteriaIndex
- quest with questID
- mount with mountID and/or mountIDs (1-8 ids)
- toy with itemID
- pet with speciesID
- currency with currencyID and optional minQuantity
- zone with mapID
- proximity with mapID, x, y, optional radiusYards 5-500 (default 40)
- vignette with vignetteID and/or questID, optional mapID, x, y
- any: array of 1 to 4 of the above, not nested

Routing: a request from list_requests carries context (mapID, zone, subzone, x, y, level, faction, class, spec, ilvl, gold, skyriding, canFly, inInstance, hearth, trackedQuests, plan progress). Start the first task near context.mapID / x / y, order the rest as one sensible route, and only send the player to another continent when the wish asks for it or nothing nearby fits. context.hearth is where their hearthstone goes.

The server stores the plan and returns a UNB1: string. The companion polls GET /v1/plan and writes that string into the game.`;

function text(value: unknown, isError = false) {
  return {
    isError,
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed.";
  return text({ error: message }, true);
}

export function createMcpServer(store: Store, dataDir: string): McpServer {
  const server = new McpServer({
    name: "unbored",
    version: "0.3.0",
  });

  server.registerTool(
    "put_plan",
    {
      title: "Put a session plan",
      description: `Store the latest session plan for the player. The companion will pick it up on its next poll.\n\n${SCHEMA}`,
      inputSchema: {
        requestId: z
          .string()
          .optional()
          .describe("When set, mark this in-game request fulfilled and attach the new plan."),
        plan: z
          .object({
            v: z.number().optional(),
            kind: z.string().optional(),
            mode: z.string().optional(),
            budget: z.number().optional(),
            note: z.string().optional(),
            generatedAt: z.number().optional(),
            tasks: z
              .array(
                z
                  .object({
                    id: z.string(),
                    title: z.string(),
                    estMinutes: z.number().optional(),
                    mapID: z.number().optional(),
                    x: z.number().optional(),
                    y: z.number().optional(),
                    note: z.string().optional(),
                    waypoints: z
                      .array(
                        z
                          .object({
                            mapID: z.number(),
                            x: z.number(),
                            y: z.number(),
                            label: z.string().optional(),
                          })
                          .strict(),
                      )
                      .max(10)
                      .optional()
                      .describe("Route points in order. Coordinates are 0 to 1."),
                    complete: z.unknown().optional(),
                  })
                  .strict(),
              )
              .min(1)
              .max(40),
          })
          .strict()
          .describe("The plan object. Coordinates are 0 to 1, not 0 to 100."),
      },
    },
    async ({ plan, requestId }) => {
      try {
        if (requestId && !store.requestById(requestId)) {
          return failure(new Error("No request with that id."));
        }
        const stored = store.putPlan(plan);
        const request = requestId ? store.fulfillRequest(requestId, stored.id) : undefined;
        return text({
          id: stored.id,
          createdAt: stored.createdAt,
          plan: stored.unb1,
          stored: stored.plan,
          request: request ? publicRequest(request) : null,
        });
      } catch (error) {
        if (error instanceof PlanError || error instanceof Error) return failure(error);
        return failure(error);
      }
    },
  );

  server.registerTool(
    "get_current_plan",
    {
      title: "Get the current plan",
      description:
        "Return the latest stored plan as JSON and as the UNB1: string the companion writes into the game. Empty when nothing has been stored yet.",
    },
    async () => {
      const stored = store.latestPlan();
      if (!stored) return text({ plan: null });
      return text({
        id: stored.id,
        createdAt: stored.createdAt,
        plan: stored.unb1,
        stored: stored.plan,
      });
    },
  );

  server.registerTool(
    "get_progress",
    {
      title: "Get session progress",
      description:
        "Return the newest progress post from the companion, plus the newest post for each character. Progress is what the game wrote to SavedVariables on /reload or logout: done, skipped, remaining, and currentId. Optional account, realm, and character narrow the newest post.",
      inputSchema: {
        account: z.string().optional().describe("WoW account folder name, such as 111111#1"),
        realm: z.string().optional(),
        character: z.string().optional(),
      },
    },
    async (args) => {
      const filter = {
        account: args.account,
        realm: args.realm,
        character: args.character,
      };
      return text({
        latest: store.latestProgress(filter) ?? null,
        characters: store.latestPerCharacter().filter((row) => {
          if (filter.account && row.account !== filter.account) return false;
          if (filter.realm && row.realm !== filter.realm) return false;
          if (filter.character && row.character !== filter.character) return false;
          return true;
        }),
      });
    },
  );

  server.registerTool(
    "list_sessions",
    {
      title: "List stored plans",
      description:
        "List recent plans, newest first. Each row has id, createdAt, mode, budget, note, taskCount, and the UNB1 string. This is history, not only the plan the companion is polling.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe("How many plans to return. Default 20."),
      },
    },
    async ({ limit }) => {
      const sessions = store.listPlans(limit ?? 20).map(sessionSummary);
      return text({ sessions });
    },
  );

  server.registerTool(
    "list_devices",
    {
      title: "List companion devices",
      description:
        "List devices that asked to pair. status is pending, approved, or revoked. The device secret is not included. Approve a pending device so that companion can read the plan and post progress.",
    },
    async () => text({ devices: store.listDevices().map(publicDevice) }),
  );

  server.registerTool(
    "approve_device",
    {
      title: "Approve a companion device",
      description:
        "Mark a paired companion as approved. It can then GET /v1/plan and POST /v1/progress. It still cannot write plans. Pass the device id from list_devices.",
      inputSchema: {
        deviceId: z.string().describe("Device id from list_devices"),
      },
    },
    async ({ deviceId }) => {
      const device = store.setDeviceStatus(deviceId, "approved");
      if (!device) return failure(new Error("No device with that id."));
      return text({ device: publicDevice(device) });
    },
  );

  server.registerTool(
    "revoke_device",
    {
      title: "Revoke a companion device",
      description:
        "Mark a companion device as revoked. It can no longer read the plan or post progress. Pass the device id from list_devices.",
      inputSchema: {
        deviceId: z.string().describe("Device id from list_devices"),
      },
    },
    async ({ deviceId }) => {
      const device = store.setDeviceStatus(deviceId, "revoked");
      if (!device) return failure(new Error("No device with that id."));
      return text({ device: publicDevice(device) });
    },
  );

  server.registerTool(
    "list_requests",
    {
      title: "List in-game plan requests",
      description:
        "List requests the player made from the Unbored window. Pending is the default. Each row has id, character, realm, mode, budget, wish, and context: the game snapshot taken when the player pressed Get plan (mapID, zone, subzone, x, y, level, faction, class, spec, ilvl, gold, skyriding, canFly, inInstance, instanceType, hearth, trackedQuests, and the active plan's progress). Start the plan near that position.",
      inputSchema: {
        status: z
          .enum(["pending", "fulfilled", "failed"])
          .optional()
          .describe("Which requests to list. Defaults to pending."),
      },
    },
    async ({ status }) => text({ requests: store.listRequests(status ?? "pending").map(publicRequest) }),
  );

  server.registerTool(
    "fail_request",
    {
      title: "Fail an in-game plan request",
      description:
        "Mark a request failed. The companion writes the reason into Plan.lua and the addon shows it after /reload. Pass the request id and a short reason.",
      inputSchema: {
        requestId: z.string().describe("Request id from list_requests"),
        reason: z.string().describe("Why a plan was not made, shown in game"),
      },
    },
    async ({ requestId, reason }) => {
      const request = store.failRequest(requestId, reason.slice(0, 400));
      if (!request) return failure(new Error("No request with that id."));
      return text({ request: publicRequest(request) });
    },
  );

  server.registerTool(
    "resolve_criteria",
    {
      title: "Resolve a criteria tree id",
      description:
        "Blizzard's web API returns criteria-tree ids. The addon needs Criteria.dbc criteriaID and a 1-based criteriaIndex. This looks up CriteriaTree.CriteriaID for that tree id and the leaf order under the achievement's Criteria_tree (Achievement.csv). Both files are cached from wago.tools under the data directory. criteriaID 0 means the row is a parent; use a child tree id. criteriaIndex is the position among leaf criteria (CriteriaID > 0) under that achievement.",
      inputSchema: {
        achievementId: z.number().int().describe("Achievement id, for example 291"),
        criteriaTreeId: z.number().int().describe("Criteria tree id from the web API, not the criteria asset id"),
      },
    },
    async ({ achievementId, criteriaTreeId }) => {
      try {
        const hit = await resolveCriteria(dataDir, achievementId, criteriaTreeId);
        return text(hit);
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}

export async function handleMcp(c: Context, store: Store, dataDir: string): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  const server = createMcpServer(store, dataDir);
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
}
