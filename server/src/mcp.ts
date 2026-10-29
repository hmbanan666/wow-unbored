import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Context } from "hono";
import { z } from "zod";

import { PlanError } from "./plan.ts";
import { publicDevice, sessionSummary, type Store } from "./store.ts";

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
- note: optional, at most 400 bytes
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

export function createMcpServer(store: Store): McpServer {
  const server = new McpServer({
    name: "unbored",
    version: "0.1.0",
  });

  server.registerTool(
    "put_plan",
    {
      title: "Put a session plan",
      description: `Store the latest session plan for the player. The companion will pick it up on its next poll.\n\n${SCHEMA}`,
      inputSchema: {
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
    async ({ plan }) => {
      try {
        const stored = store.putPlan(plan);
        return text({
          id: stored.id,
          createdAt: stored.createdAt,
          plan: stored.unb1,
          stored: stored.plan,
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

  return server;
}

export async function handleMcp(c: Context, store: Store): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  const server = createMcpServer(store);
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
}
