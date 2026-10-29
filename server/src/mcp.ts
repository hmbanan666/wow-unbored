import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Context } from "hono";
import { z } from "zod";

import { resolveCriteria } from "./criteria.ts";
import { ANSWER_MAX_BYTES, cleanAnswer, PlanError } from "./plan.ts";
import { HISTORY_KINDS, publicDevice, publicRequest, sessionSummary, type Store } from "./store.ts";

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

The server stores the plan and returns a UNB1: string. The game never reloads per message: the companion writes the plan into the game's data file and the player sees it at their next login or when they accept Wisp's Refresh offer. Plans are 3 to 7 steps; the game shows one at a time.`;

const ADVICE_ACTIONS = ["keep", "sell", "use", "bank", "send", "disenchant", "equip", "open", "turn_in", "info"] as const;

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

const waypointSchema = z
  .object({
    mapID: z.number(),
    x: z.number(),
    y: z.number(),
    label: z.string().optional(),
  })
  .strict();

export function createMcpServer(store: Store, dataDir: string): McpServer {
  const server = new McpServer({
    name: "unbored",
    version: "0.6.0",
  });

  const taskSchema = z
    .object({
      id: z.string(),
      title: z.string(),
      estMinutes: z.number().optional(),
      mapID: z.number().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      note: z.string().optional(),
      waypoints: z
        .array(waypointSchema)
        .max(10)
        .optional()
        .describe("Route points in order. Coordinates are 0 to 1."),
      complete: z.unknown().optional(),
    })
    .strict();
  const planSchema = z
    .object({
      v: z.number().optional(),
      kind: z.string().optional(),
      mode: z.string().optional(),
      budget: z.number().optional(),
      note: z.string().optional(),
      generatedAt: z.number().optional(),
      tasks: z.array(taskSchema).min(1).max(40),
    })
    .strict();

  server.registerTool(
    "put_plan",
    {
      title: "Put a session plan",
      description: `Store the latest session plan for the player. The companion will pick it up on its next poll. Write 3 to 7 steps, each one thing the player can just do; the game shows one at a time. A plan for a preset request replaces the quick plan the game built itself only if the player agrees, and steps they already finished there (same task id) are dropped, so reuse the game's ids (quest:<questID> and the like) when you mean the same thing.\n\n${SCHEMA}`,
      inputSchema: {
        requestId: z
          .string()
          .optional()
          .describe("When set, mark this in-game request fulfilled and attach the new plan."),
        plan: planSchema
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
        "List requests the player made in game, newest first. Pending is the default. type is plan (a preset chip or Something else: mode, budget, wish; topic names the preset: nearby = stay in this zone, mount = get a mount, collect = pets/toys/transmog/achievements in this zone, grind = level/renown/reputation, gold = gold or crafting mats, surprise = anything fun; no topic means the wish is the player's own words), question (Ask something: the player's free text in question, and topic \"nearby\" for What to do nearby), or item (What is this item: item.itemID, and item.name, item.link, item.bag/slot when known). lang is the language of the question (en or ru): answer in it. account links the character to its Account; get_player_profile with that account shows every Alt (professions, bags, banks). Every request carries the full context (subzone, faction, class, spec, ilvl, gold, skyriding, canFly, inInstance, hearth, trackedQuests, plan progress). The full player profile is in get_player_profile and past requests and answers in get_player_history. Answer plan requests with put_plan and requestId; answer item and question requests with answer_request. Start any route near that position.",
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
    "get_player_profile",
    {
      title: "Get the player profile",
      description:
        "The latest player state the companion uploaded from the game, kept as a rolling snapshot (an empty value never overwrites a known one): context (location, level, class, spec, ilvl, gold, hearth, tracked quests, active plan), professions with skill levels, equipped items, bags, the last seen bank, reagent bank and warband bank (itemID and count), currencies, collections (mounts, pets, toys, achievement points), renown, recent sessions (start, stop, zones), recent finished or skipped steps, and unmatchedItems (item ids Wisp had no advice for). Read it before planning so you need not ask for anything. Pass character (and realm) for one character. Pass account (from list_requests or the accounts list) to get every character of that Account: use it for alt routing, e.g. an herb on one character that an Alchemist alt needs. Without arguments you get the most recently updated character, the list of known characters, and the accounts. savedAt is when the game wrote it.",
      inputSchema: {
        character: z.string().max(80).optional().describe("Character name, as in list_requests."),
        realm: z.string().max(80).optional().describe("Realm, when the name is on several realms."),
        account: z
          .string()
          .max(80)
          .optional()
          .describe("Account key from list_requests or get_player_profile; returns all its characters."),
      },
    },
    async ({ character, realm, account }) => {
      if (account) {
        const characters = store.profilesForAccount(account);
        if (characters.length === 0) return failure(new Error("No characters on that account yet."));
        return text({ account: characters[0]!.account, characters });
      }
      const profile = store.profileFor(character || undefined, realm || undefined);
      if (!profile) return failure(new Error("No profile yet. The companion uploads one after the next reload."));
      return text({ profile, characters: store.listProfiles(), accounts: store.listAccounts() });
    },
  );

  server.registerTool(
    "get_player_history",
    {
      title: "Get the player history",
      description:
        "Dated history the server keeps per character, newest first: request (what the player asked, with its context), answer (your reply), plan (a plan given, with its steps), failed (a request you failed), progress (steps done, skipped, remaining), profile (a summary of each profile upload: level, ilvl, gold, zone, bag item count, collections, professions), and advice (a put_item_advice batch). Pass character (and realm) for one character, or account for every character of that Account. Use it to avoid repeating yourself, to see what the player liked or skipped, and to show progress over time. includeSnapshots adds the full profile snapshots.",
      inputSchema: {
        character: z.string().max(80).optional(),
        realm: z.string().max(80).optional(),
        account: z.string().max(80).optional().describe("Account key; returns every character of it."),
        kinds: z.array(z.enum(HISTORY_KINDS as [string, ...string[]])).optional().describe("Only these kinds."),
        since: z.number().int().optional().describe("Unix seconds; only entries at or after it."),
        limit: z.number().int().min(1).max(500).optional().describe("Default 100."),
        includeSnapshots: z.boolean().optional().describe("Add full profile snapshots (up to 10)."),
      },
    },
    async ({ character, realm, account, kinds, since, limit, includeSnapshots }) => {
      const filter = { character: character || undefined, realm: realm || undefined, account: account || undefined };
      const entries = store.history({
        ...filter,
        kinds: kinds as Parameters<Store["history"]>[0]["kinds"],
        since,
        limit: limit ?? 100,
      });
      return text({
        entries,
        snapshots: includeSnapshots ? store.profileSnapshots({ ...filter, limit: 10 }) : undefined,
      });
    },
  );

  server.registerTool(
    "put_item_advice",
    {
      title: "Put personal item advice",
      description:
        "Store Personal advice for one character's items. The companion downloads it into the game, where it shows from the next natural load as the item tooltip line \"Wisp: <line>\". Live game rules (quest items, uncollected mounts, toys, pets and looks, upgrades) still win; your advice replaces the generic keep, sell, junk, and reagent lines. Write line as a short action, at most 60 characters, in English, and lineRu in Russian: \"Bank it: Alchemy reagent, skill 75\", \"Sell on the AH\", \"Send to Mira (Alchemy): mail\". Base it on get_player_profile with the account, so items can go to the Alt who uses them: the warband bank for warbound items, mail otherwise. Never advise sending soulbound items, never say delete, and never say vendor for epic or bind-on-equip items. action is one of keep, sell, use, bank, send, disenchant, equip, open, turn_in, info; to names the Alt for send. replace drops this character's older advice first.",
      inputSchema: {
        character: z.string().max(80),
        realm: z.string().max(80),
        account: z.string().max(80).optional(),
        replace: z.boolean().optional(),
        items: z
          .array(
            z
              .object({
                itemID: z.number().int().min(1),
                action: z.enum(ADVICE_ACTIONS),
                line: z.string().min(1).max(120),
                lineRu: z.string().max(240).optional(),
                to: z.string().max(80).optional(),
              })
              .strict(),
          )
          .min(1)
          .max(500),
      },
    },
    async ({ character, realm, account, replace, items }) => {
      for (const item of items) {
        if (/\b(delete|destroy)\b|удали/i.test(`${item.line} ${item.lineRu ?? ""}`)) {
          return failure(new Error(`Advice for item ${item.itemID} must not say delete.`));
        }
      }
      const count = store.putItemAdvice({ character, realm, account, items, replace });
      return text({ stored: count, character, realm });
    },
  );

  server.registerTool(
    "answer_request",
    {
      title: "Answer an in-game request",
      description: `Reply to an item or question request (or add a message to a plan request). The player already got a quick local answer; yours arrives at their next login or when they accept Wisp's Refresh offer, so make it worth the wait. Write in the request's lang, like a friendly spoken chat reply: short sentences, no markdown, no links, at most ${ANSWER_MAX_BYTES} bytes. A blank line splits the reply into up to 3 chat bubbles. waypoints puts a route on the map. plan, when given, is stored like put_plan and starts in game together with the message. For an item, say what it is for for this character and its Alts, and what to do with it (keep, bank, sell, send to an Alt).`,
      inputSchema: {
        requestId: z.string().describe("Request id from list_requests"),
        message: z.string().describe(`The reply, at most ${ANSWER_MAX_BYTES} bytes`),
        waypoints: z
          .array(waypointSchema)
          .max(10)
          .optional()
          .describe("Optional route for the reply. Coordinates are 0 to 1."),
        plan: planSchema.optional().describe("Optional follow-up plan, same shape as put_plan."),
      },
    },
    async ({ requestId, message, waypoints, plan }) => {
      try {
        if (!store.requestById(requestId)) return failure(new Error("No request with that id."));
        const answer = cleanAnswer(message, waypoints, Math.floor(Date.now() / 1000));
        const stored = plan ? store.putPlan(plan) : undefined;
        const request = store.answerRequest(requestId, answer, stored?.id ?? null);
        return text({
          request: request ? publicRequest(request) : null,
          plan: stored ? { id: stored.id, plan: stored.unb1 } : null,
        });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "fail_request",
    {
      title: "Fail an in-game request",
      description:
        "Mark a plan, item, or question request failed. The mascot says the reason at the player's next login or Refresh. Pass the request id and a short, friendly reason in the request's lang.",
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
