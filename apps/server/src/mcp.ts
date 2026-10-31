import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Context } from "hono";
import { z } from "zod";

import { markupIds } from "@unbored/contracts";

import type { BlizzardIds } from "./blizzard.ts";
import { resolveCriteria } from "./criteria.ts";
import { ID_KINDS, readable, changeSummary, type CharacterRow, type IdKind } from "./data.ts";
import { ANSWER_MAX_BYTES, cleanAnswer, PlanError, planMarkupIds } from "./plan.ts";
import { HISTORY_KINDS, publicDevice, publicRequest, sessionSummary, type Store } from "./store.ts";

const PLAN_SCOPE = `Plan the whole goal. A plan covers everything the request asks for (every criterion of an achievement, every piece of a set), never cut to fit a time. When the goal is long, split it into ordered steps and include all of them (up to 40), grouping small criteria that sit close together into one step when that reads better; an open request such as a preset with no single goal is usually 3 to 7 steps. estMinutes is shown to the player as information only. Requests have no time budget; budget is set only when the player typed minutes into the custom Something else form, and even then it is a hint about this sitting, never a reason to leave steps out.`;

const MARKUP = `Links (step title, note, why, condition text, plan goal, details and rewards, the plan note, answer messages): every game object you name is a token when you have its id from a tool; otherwise plain text. Bory shows a token as a native link with the game's own name and tooltip. Kinds, each with an optional |label:
- {item:ID} an item, e.g. {item:6948|Hearthstone}
- {quest:ID} a quest, e.g. {quest:78713|The Weight}
- {ach:ID} an achievement, e.g. {ach:964|Going Down?}
- {spell:ID} a spell, e.g. {spell:2006|Resurrection}
- {currency:ID} a currency, e.g. {currency:2815|Resonance Crystals}
- {mount:MOUNTID} a mount by mount journal id (not the item or spell), e.g. {mount:183|Ashes of Al'ar}
- {toy:ITEMID} a toy by its item id
- {pet:SPECIESID} a battle pet by species id
- {zone:UIMAPID} a zone by ui map id; a click opens the world map there
- {instance:JOURNALINSTANCEID} a dungeon or raid by Adventure Guide instance id; a click opens the guide
- {npc:ID} an npc; needs entities.npc["ID"] = { name, mapID, x, y } on the plan (or the answer), x and y in percent
- {pin:MAPID:X:Y} a map point, e.g. {pin:2339:52.1:47.3|the forge}; X and Y are map percent 0 to 100 with at most one decimal (wowhead numbers), unlike task x/y
Use only ids a tool gave you (get_player_profile, get_game_data, check_ids, get_suggestions, the request, resolve_criteria); never guess an id, write the plain name instead. check_ids confirms mount, toy and pet ids against the player's data. At most 12 tokens per step and 12 in goal plus details. A bad token is replaced by its label and listed in warnings in the reply: read them and fix the plan if a link mattered.`;

const SCHEMA = `A session plan is one JSON object, the same shape as docs/plan-format.md.

Required shape:
- v: 1
- kind: "plan"
- mode: roam, quests, events, fun, farm, or custom (default custom)
- budget: optional, whole minutes from 5 to 240. Leave it out unless the request carried one.
- tasks: 1 to 40 objects

The card (all optional, but a plan without a title gets a warning):
- title: 3 to 40 characters, a human, catchy name like a quest title. No tokens, no ids, at most one number, no "you have". State facts go in details.
  Good: "Badges for a Timereaver", "Hallow's End in one evening". Bad: "Warlords Timewalking: you have 3200 currency", "Plan for request mode surprise".
- goal: one sentence, at most 160 bytes: what the player does and why it is worth it. May carry tokens.
- details: at most 600 bytes of facts and state (currency counts, what Alts already did). May carry tokens.
- rewards: up to 6 strings, each exactly one token of kind mount, ach, item, toy, currency or pet, e.g. ["{mount:183}", "{ach:964}"].
- contains: optional reward contents, { "<item reward token>": ["<token>", ...] }. A container (cage, chest, bag) that drops is the reward; what it may hold goes in \`contains\`. Never list the possible contents as rewards themselves. The key is one {item:ID} that is also in rewards or a step's rewards; the list is 1 to 6 single tokens of kind mount, toy, pet or item; at most 2 containers; the contents count toward the 12 tokens of goal plus details. Bory shows "[cage] · may contain 1 of 3 mounts" and leaves out what the player already has.
Bory shows a calm card: closed it is only the title, the step, its why and the first reward; everything else opens on "Show more". So keep every text short: a step title is one line of what to do, why is one short reason, and long text belongs in note or details. No walls of text.

Each task:
- id: 1-80 characters, letters, digits, colon, dot, underscore, hyphen (example mentor:ashes)
- title: non-empty, at most 240 bytes
- estMinutes: 1 to 240 (default 15), a rough guess the player sees as information only
- mapID: optional ui map id
- x and y: optional, both required together, fractions of the map from 0 to 1. Wowhead 0-100 coordinates must be divided by 100.
- why: optional, at most 120 bytes, one short reason shown under the step. May carry tokens.
- note: optional, at most 400 bytes. Shown under Show more; say where to go and what to do.
- rewards: optional, up to 3 single tokens this step gives, same kinds as the plan rewards.
- condition: optional { text, check }. text (at most 160 bytes) is shown before the step, e.g. "If you have 5,000 {currency:1166}". check = { kind: currency | item | level | quest | ach, id, atLeast? } is evaluated live in the game: met shows Ready; unmet shows the live count and Skip moves past without counting it as skipped. For level, id is the level. Never guess the player's numbers; let the check read them.
- waypoints: optional, 1 to 10 points [{ mapID, x, y, label }] in route order. x and y are 0 to 1, label at most 80 bytes. The addon sets the native waypoint arrow (and TomTom when installed) on point 1 and moves to the next point when the player comes within about 30 yards. Use it for a multi-stop task. Without waypoints the task's own mapID, x, y is the single point.
- complete: how the game finishes the task. Omit it and the player presses Done.
- group: optional, 1 to 24 characters a-z, 0-9 and hyphen. Steps that can be done in any order (several rares, treasures, dailies in one zone) share a \`group\`. Give each grouped step a \`complete\` the game can check (quest or vignette for rares); a manual step in a group works but needs Done. Grouped steps must be next to each other, at least 2; the player flips between them with arrows and they tick off in any order.

${MARKUP}

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

The server stores the plan and returns a UNB1: string. The game never reloads per message: the companion writes the plan into the game's data file and the player sees it at their next login or when they accept Bory's Refresh offer. The game shows one step at a time; the full list opens in the same card.

${PLAN_SCOPE}`;

const ADVICE_ACTIONS = [
  "keep",
  "sell",
  "use",
  "bank",
  "send",
  "disenchant",
  "equip",
  "open",
  "turn_in",
  "info",
] as const;

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

const entitiesSchema = z
  .object({
    npc: z
      .record(
        z.string(),
        z.object({
          name: z.string(),
          mapID: z.number().optional(),
          x: z.number().optional(),
          y: z.number().optional(),
        }),
      )
      .optional(),
  })
  .strict();

export function createMcpServer(store: Store, dataDir: string, gameIds?: BlizzardIds): McpServer {
  const server = new McpServer({
    name: "unbored",
    version: "0.10.0",
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
      why: z.string().optional().describe("One short reason, at most 120 bytes"),
      rewards: z.array(z.string()).max(3).optional().describe("Up to 3 single link tokens"),
      condition: z
        .object({
          text: z.string(),
          check: z
            .object({
              kind: z.enum(["currency", "item", "level", "quest", "ach"]),
              id: z.number(),
              atLeast: z.number().optional(),
            })
            .strict()
            .optional(),
        })
        .strict()
        .optional()
        .describe("Shown before the step; check is run live in the game"),
      waypoints: z
        .array(waypointSchema)
        .max(10)
        .optional()
        .describe("Route points in order. Coordinates are 0 to 1."),
      complete: z.unknown().optional(),
      group: z
        .string()
        .optional()
        .describe("Step group: consecutive steps done in any order, 1-24 of a-z, 0-9, hyphen"),
    })
    .strict();
  const planSchema = z
    .object({
      v: z.number().optional(),
      kind: z.string().optional(),
      mode: z.string().optional(),
      budget: z.number().optional(),
      note: z.string().optional(),
      title: z.string().optional().describe("3 to 40 characters, like a quest title"),
      goal: z.string().optional().describe("One sentence, at most 160 bytes"),
      details: z.string().optional().describe("Facts and state, at most 600 bytes"),
      rewards: z
        .array(z.string())
        .max(6)
        .optional()
        .describe('Up to 6 single link tokens, like "{mount:183}"'),
      contains: z
        .record(z.string(), z.array(z.string()).max(6))
        .optional()
        .describe(
          "Reward contents: a container {item:ID} reward to the 1-6 mount, toy, pet or item tokens it may hold",
        ),
      generatedAt: z.number().optional(),
      tasks: z.array(taskSchema).min(1).max(40),
      entities: entitiesSchema
        .optional()
        .describe("Npc names and places for {npc:ID} tokens. x and y are percent 0 to 100."),
    })
    .strict();

  server.registerTool(
    "put_plan",
    {
      title: "Put a session plan",
      description: `Store the latest session plan for the player. The companion will pick it up on its next poll. Each step is one thing the player can just do; the game shows one at a time. Cover the whole goal in order, all of it, not a time-sized slice. A plan for a preset request replaces the quick plan the game built itself only if the player agrees, and steps they already finished there (same task id) are dropped, so reuse the game's ids (quest:<questID> and the like) when you mean the same thing.\n\n${SCHEMA}`,
      inputSchema: {
        requestId: z
          .string()
          .optional()
          .describe("When set, mark this in-game request fulfilled and attach the new plan."),
        plan: planSchema.describe("The plan object. Coordinates are 0 to 1, not 0 to 100."),
      },
    },
    async ({ plan, requestId }) => {
      try {
        const asked = requestId ? store.requestById(requestId) : undefined;
        if (requestId && !asked) {
          return failure(new Error("No request with that id."));
        }
        const warnings: string[] = [];
        const missing = gameIds ? await gameIds.missing(planMarkupIds(plan)) : undefined;
        const stored = store.putPlan(plan, undefined, { missing, warnings, wish: asked?.wish });
        const request = requestId ? store.fulfillRequest(requestId, stored.id) : undefined;
        return text({
          id: stored.id,
          createdAt: stored.createdAt,
          plan: stored.unb1,
          stored: stored.plan,
          request: request ? publicRequest(request) : null,
          warnings,
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
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("How many plans to return. Default 20."),
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
      description: `List requests the player made in game, newest first. Pending is the default. The player never types anything (0.9): every request is a pick. type is plan (a preset chip, Surprise me, or one of Bory's ideas: mode; topic names the preset: nearby = stay in this zone, mount = get a mount, collect = pets/toys/transmog/achievements in this zone, grind = level/renown/reputation, gold = gold or crafting mats, surprise = anything fun), or item (What is this item: item.itemID, and item.name, item.link, item.bag/slot when known). Addons 0.8 and older may still send topic "custom" with the player's own words in wish and minutes in budget, and question requests (free text in question): answer them as before. topic "suggestion" means the player picked one of Bory's ideas (get_suggestions): suggestionId names it and suggestion is a copy of it (title, goal, rewards, mapID); its tokens are ground truth for ids, so build the plan around them and do not swap in other ids. A suggestion with kind "chain" is an unfinished quest chain: suggestion.chain carries questLineID, nextQuestID, done and total from the game, so plan from nextQuestID on (the questLines Section in get_game_data has the same row) and never guess the chain's quests. lang is the language of the question (en or ru): answer in it. account links the character to its Account; get_player_profile with that account shows every Alt (professions, bags, banks). Every request carries the full context (subzone, faction, class, spec, ilvl, gold, skyriding, canFly, inInstance, hearth, trackedQuests, plan progress). The full player profile is in get_player_profile and past requests and answers in get_player_history. webhook says whether the planner webhook reached it (attempts, deliveredAt, lastError; null when it was never tried). Answer plan requests with put_plan and requestId; answer item and question requests with answer_request. Start any route near that position. ${PLAN_SCOPE}`,
      inputSchema: {
        status: z
          .enum(["pending", "fulfilled", "failed"])
          .optional()
          .describe("Which requests to list. Defaults to pending."),
      },
    },
    async ({ status }) =>
      text({
        expired: store.expireRequests(),
        requests: store.listRequests(status ?? "pending").map((request) => {
          const delivery = store.webhookDelivery(request.id);
          return {
            ...publicRequest(request),
            webhook: delivery
              ? {
                  attempts: delivery.attempts,
                  deliveredAt: delivery.deliveredAt,
                  lastError: delivery.lastError,
                }
              : null,
          };
        }),
      }),
  );

  server.registerTool(
    "get_player_profile",
    {
      title: "Get the player profile",
      description:
        'The latest player state from the game, assembled from the Game data snapshot Sections (and the 0.6 profile upload for older addons; an empty value never overwrites a known one): context (location, level, class, spec, ilvl, gold, hearth, tracked quests, active plan), professions with skill levels, equipped items, bags, the last seen bank, reagent bank and warband bank (itemID and count), currencies, collections (mounts, pets, toys, achievement points), renown, recent sessions (start, stop, zones), recent finished or skipped steps, and, from addons 0.7 and older, unmatchedItems (item ids Bory had no advice for; from 0.8 they are entries with kind "advice" in the unresolvedIds Section of get_game_data). Read it before planning so you need not ask for anything. Pass character (and realm) for one character. Pass account (from list_requests or the accounts list) to get every character of that Account: use it for alt routing, e.g. an herb on one character that an Alchemist alt needs. Without arguments you get the most recently updated character, the list of known characters, and the accounts. savedAt is when the game wrote it. sections lists which Sections it was built from. For quest, achievement, mount, toy, pet or recipe ids use check_ids; for raw Sections use get_game_data.',
      inputSchema: {
        character: z.string().max(80).optional().describe("Character name, as in list_requests."),
        realm: z.string().max(80).optional().describe("Realm, when the name is on several realms."),
        account: z
          .string()
          .max(80)
          .optional()
          .describe(
            "Account key from list_requests or get_player_profile; returns all its characters.",
          ),
      },
    },
    async ({ character, realm, account }) => {
      if (account) {
        const characters = store.profilesForAccount(account);
        if (characters.length === 0)
          return failure(new Error("No characters on that account yet."));
        return text({ account: characters[0]!.account, characters });
      }
      const profile = store.profileFor(character || undefined, realm || undefined);
      if (!profile)
        return failure(
          new Error("No profile yet. The companion uploads one after the next reload."),
        );
      return text({ profile, characters: store.listProfiles(), accounts: store.listAccounts() });
    },
  );

  server.registerTool(
    "get_player_history",
    {
      title: "Get the player history",
      description:
        "Dated history the server keeps per character, newest first: request (what the player asked, with its context), answer (your reply), plan (a plan given, with its steps), failed (a request you failed), progress (steps done, skipped, remaining), profile (a summary of each profile upload: level, ilvl, gold, zone, bag item count, collections, professions), advice (a put_item_advice batch), and win (something a plan promised that game data later showed obtained: ref like mount:ID, body with planId, requestId, kind, id, token, planTitle, category; see list_wins). What changed in the game data itself (new quests done, mounts, item counts, gold) is in get_data_changes. Pass character (and realm) for one character, or account for every character of that Account. Use it to avoid repeating yourself, to see what the player liked or skipped, and to show progress over time. includeSnapshots adds the full profile snapshots.",
      inputSchema: {
        character: z.string().max(80).optional(),
        realm: z.string().max(80).optional(),
        account: z
          .string()
          .max(80)
          .optional()
          .describe("Account key; returns every character of it."),
        kinds: z
          .array(z.enum(HISTORY_KINDS as [string, ...string[]]))
          .optional()
          .describe("Only these kinds."),
        since: z.number().int().optional().describe("Unix seconds; only entries at or after it."),
        limit: z.number().int().min(1).max(500).optional().describe("Default 100."),
        includeSnapshots: z.boolean().optional().describe("Add full profile snapshots (up to 10)."),
      },
    },
    async ({ character, realm, account, kinds, since, limit, includeSnapshots }) => {
      const filter = {
        character: character || undefined,
        realm: realm || undefined,
        account: account || undefined,
      };
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

  const data = store.data;
  const pickCharacters = (input: { account?: string; character?: string; realm?: string }) => {
    let rows: CharacterRow[] = input.account ? data.characters(input.account) : data.characters();
    if (input.character) rows = rows.filter((row) => row.name === input.character);
    if (input.realm) rows = rows.filter((row) => row.realm === input.realm);
    if (!input.account && !input.character) rows = rows.slice(0, 1);
    return rows;
  };
  const whoSchema = {
    account: z.string().max(80).optional().describe("Account key from list_requests."),
    character: z.string().max(80).optional().describe("Character name."),
    realm: z.string().max(80).optional().describe("Realm, when the name is on several realms."),
  };

  server.registerTool(
    "get_account_overview",
    {
      title: "Overview of an Account",
      description:
        "Every Character of an Account (or of every Account) with class, spec, level, item level, gold, professions, last seen, how fresh each Game data Section is, and missing: expected Sections it does not have, each with reason window (read only while the bank or a profession is open; hint says which), dropped (the addon dropped it to stay small), sharing (data sharing is off) or never (not uploaded yet). Start here before planning for a player with Alts.",
      inputSchema: { account: whoSchema.account },
    },
    async ({ account }) => {
      const accounts = account ? [data.account(account)].filter(Boolean) : data.accounts();
      if (accounts.length === 0) return failure(new Error("No game data for that Account yet."));
      return text({
        accounts: accounts.map((row) => ({
          account: row!.id,
          lastSeen: row!.lastSeen,
          sections: data
            .sections("account", row!.id)
            .map((s) => ({ name: s.section, at: s.at, savedAt: s.savedAt })),
          characters: data.characters(row!.id).map((char) => data.overview(char)),
        })),
      });
    },
  );

  server.registerTool(
    "get_ready_now",
    {
      title: "What the player can do now",
      description:
        "Ready now: what one Character can do or finish now, computed on demand by fixed rules from its latest Game data (every id comes from its Sections; nothing is guessed). Call it first for a plan request's Character and build from its items when they fit the pick. items (at most 25, best score first) each have kind (vault, paragon, lockout, achievement, renown, standing, currency, chain, event, key), key, title when the data has a name, tokens (link tokens you may use as is), have/need/left numbers, resetAt, why (plain English for you, not for the player), score and source (the Section). Rules: a vault or paragon reward waiting; a raid or dungeon lockout with bosses left this week; achievements at least 70% done (achProgress); renown within 25% of the next level with its rewards; a standing within 15% of the next; a currency near its cap or with weekly room; the 5 most finished quest chains; events on now; your keystone. taste is the player's history per category (picked, finished, doneSteps, skippedSteps, wins, rate, bonus -15 to 15, already in the scores): prefer what they finish, avoid what they keep skipping. alts lists achievements another Character of the Account is at least 20% further on: say it is easier on that Alt. missing names Sections the rules needed and did not have (see data_catalog for why).",
      inputSchema: whoSchema,
    },
    async (who) => {
      const ready = store.readyNow(who);
      if (!ready) return failure(new Error("No game data for that Character yet."));
      return text(ready);
    },
  );

  server.registerTool(
    "list_errors",
    {
      title: "List addon error reports",
      description:
        "Where the addon broke, as sent with the player's data when sharing is on (never what they typed or who they are): newest first, one row per Account, addon version, where (section:<name>, event:<EVENT>, ui:<view>, init) and message, with the stack (addon files only), how many times it happened (count), first and last time (firstAt, lastAt), the device name and the Character of the upload. new is true when the Server first saw it at or after since. Read it after each session and report new ones.",
      inputSchema: {
        account: whoSchema.account,
        since: z.number().int().optional().describe("Unix seconds; rows seen or updated since."),
        version: z.string().max(20).optional().describe("Only this addon version, like 0.10.0."),
        limit: z.number().int().min(1).max(200).optional().describe("Default 50."),
      },
    },
    async ({ account, since, version, limit }) =>
      text({ errors: store.listErrors({ account, since, version, limit: limit ?? 50 }) }),
  );

  server.registerTool(
    "list_wins",
    {
      title: "List wins",
      description:
        "Wins: things a plan promised (its rewards, a container's contents, the last step's quest, mount, toy, pet or achievement) that the player's game data later showed newly obtained, after the plan was made, within 30 days, one per id per Account. Only plans made for a request count. Returns wins (newest first: at, character, kind mount|ach|toy|pet|item|quest, id, token, planId, requestId, planTitle, category), totals per kind, and days (UTC YYYY-MM-DD, newest first). Do not tell the player about wins yet; use it to avoid offering what they just got.",
      inputSchema: {
        account: whoSchema.account,
        character: whoSchema.character,
        since: z.number().int().optional().describe("Unix seconds; wins at or after it."),
        limit: z.number().int().min(1).max(500).optional().describe("Default 100."),
      },
    },
    async ({ account, character, since, limit }) =>
      text(store.listWins({ account, character, since, limit: limit ?? 100 })),
  );

  server.registerTool(
    "get_suggestions",
    {
      title: "Get Bory's ideas",
      description:
        "The Suggestions the Server made for a Character from its own Game data and the addon's catalog (no guessing): current events (on now or starting within 3 days) with rewards still missing, unfinished quest chains (chain: questLineID, nextQuestID, done, total), achievements near where the player plays, rares not looted yet, and mounts nobody on the Account owns. Each has id, kind (event, chain, achievement, rare, collection), title, goal, rewards (link tokens), why, reason, and the request it sends when picked; up to 10 per Character. Expired ones are left out. Pass account for every Character of that Account, or character (and realm) for one; without arguments you get the most recently seen Character. computedAt is when they were made (after each upload, 30 s after the last one). They are written in the Character's language (en or ru: its char Section, else its last Request).",
      inputSchema: whoSchema,
    },
    async (who) => {
      const rows = pickCharacters(who);
      if (rows.length === 0) return failure(new Error("No game data for that Character yet."));
      const characters = rows
        .map((row) => store.suggestions.forCharacter(row))
        .filter((entry) => entry !== undefined);
      if (characters.length === 0)
        return failure(
          new Error("No ideas yet: they are made after the next upload from the Companion."),
        );
      return text({ characters });
    },
  );

  server.registerTool(
    "get_game_data",
    {
      title: "Read Game data Sections",
      description:
        "The latest bodies of Game data Sections for one Character (Character Sections plus its Account Sections). Pass sections to pick some (data_catalog lists them). questLines holds the Character's unfinished quest chains (questLineID, name, campaignID, chapter, mapID, x, y, done, total, nextQuestID, flags c = campaign, i = important, l = local story, a = finished on another Character); calendar holds the game events of the next 14 days (eventID, title, texture, starts, ends, sequenceType, and a description for today and tomorrow). Packed id sets come back as counts; pass expand to get the ids (capped at 2000 per set, with more saying how many were cut). For a yes/no on specific ids use check_ids instead.",
      inputSchema: {
        ...whoSchema,
        sections: z.array(z.string().max(40)).max(40).optional().describe("Section names."),
        expand: z.boolean().optional().describe("Unpack id sets (capped)."),
      },
    },
    async ({ account, character, realm, sections, expand }) => {
      const row = pickCharacters({ account, character, realm })[0];
      if (!row) return failure(new Error("No game data for that character yet."));
      const all = data.sectionsFor(row);
      const out: Record<string, unknown> = {};
      for (const [name, section] of all) {
        if (sections?.length && !sections.includes(name)) continue;
        out[name] = {
          scope: section.ownerKind,
          v: section.v,
          at: section.at,
          savedAt: section.savedAt,
          unknown: section.unknown,
          body: readable(section.body, expand === true),
        };
      }
      return text({
        character: row.name,
        realm: row.realm,
        account: row.accountId,
        sections: out,
        missing: (sections ?? []).filter((name) => !all.has(name)),
      });
    },
  );

  server.registerTool(
    "check_ids",
    {
      title: "Check ids against the game data",
      description:
        "Which of the given ids the player has: quest (completed, per Character), achievement (earned on the Account, and by each Character when known), mount, toy, pet (species, on the Account), recipe (learned, per Character; only professions whose window was opened). have is null when that Section was never read. Use it before suggesting something the player may already have, and never invent ids.",
      inputSchema: {
        kind: z.enum(ID_KINDS as [IdKind, ...IdKind[]]),
        ids: z.array(z.number().int().min(1)).min(1).max(500),
        ...whoSchema,
      },
    },
    async ({ kind, ids, account, character, realm }) => {
      const rows = pickCharacters({ account, character, realm });
      if (rows.length === 0) return failure(new Error("No game data for that player yet."));
      const first = rows[0]!;
      const targets = character || !first.accountId ? rows : data.characters(first.accountId);
      return text(data.checkIds(kind, ids, targets));
    },
  );

  server.registerTool(
    "get_data_changes",
    {
      title: "What changed in the game data",
      description:
        "Per-Section changes, newest first: ids added or removed (quests done, mounts, achievements, recipes), item counts that changed (bags, banks), and small fields that changed (gold, level, item level). Without since you get the last upload (the last session). initial means the first upload of that Section. Lists are capped at 2000.",
      inputSchema: {
        ...whoSchema,
        since: z.number().int().optional().describe("Unix seconds; changes at or after it."),
        sections: z.array(z.string().max(40)).max(40).optional(),
        limit: z.number().int().min(1).max(200).optional().describe("Default 50."),
      },
    },
    async ({ account, character, realm, since, sections, limit }) => {
      const rows = pickCharacters({ account, character, realm });
      if (rows.length === 0) return failure(new Error("No game data for that player yet."));
      const owners = [
        ...rows.map((row) => ({ kind: "char" as const, id: row.id })),
        ...[...new Set(rows.map((row) => row.accountId).filter(Boolean))].map((id) => ({
          kind: "account" as const,
          id,
        })),
      ];
      const byId = new Map(rows.map((row) => [row.id, row]));
      let entries = data.history({ owners, sections, since, limit: limit ?? 50 });
      if (since === undefined && entries.length > 0) {
        const last = Math.max(...entries.map((entry) => entry.savedAt ?? 0));
        entries = entries.filter((entry) => (entry.savedAt ?? 0) === last);
      }
      return text({
        changes: entries.map((entry) => ({
          section: entry.section,
          scope: entry.ownerKind,
          character: entry.ownerKind === "char" ? (byId.get(entry.ownerId)?.name ?? null) : null,
          at: entry.at,
          savedAt: entry.savedAt,
          summary: changeSummary(entry.kind, entry.body),
          change: entry.body,
        })),
      });
    },
  );

  server.registerTool(
    "data_catalog",
    {
      title: "Data explorer",
      description:
        "The Data explorer: every Account and Character with each Game data Section (version, read time, savedAt, size in bytes, id and item counts, the last change), Sections the addon dropped to stay small, unknown Sections a newer addon sent, and for unresolvedIds the count per kind (quest, item, advice: ids Bory could not resolve or had no advice for). Each Account and Character also has expected (every Section it should have; errors and the 0.6 profile are not expected) and missing (each with reason window, dropped, sharing or never, and a hint for window). Use it to see whether everything arrived; read bodies with get_game_data.",
      inputSchema: { account: whoSchema.account },
    },
    async ({ account }) => text(data.catalog({ account })),
  );

  server.registerTool(
    "delete_account_data",
    {
      title: "Delete an Account's data (owner only)",
      description:
        "Owner only. Erases every Game data Section, its history, the Characters, 0.6 profiles, Player history, personal advice and ideas of one Account, and (unless requests is false) its Requests and the plans made for them: the same set a player erases with Forget my data in the Companion, which also revokes that device. This cannot be undone; pass confirm: true.",
      inputSchema: {
        account: z.string().min(1).max(80),
        confirm: z.literal(true),
        requests: z
          .boolean()
          .optional()
          .describe("Also erase the Account's Requests and their plans. Default true."),
      },
    },
    async ({ account, requests }) => {
      try {
        return text(store.deleteAccountData(account, { requests: requests !== false }));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "put_item_advice",
    {
      title: "Put personal item advice",
      description:
        'Store Personal advice for one character\'s items. The companion downloads it into the game, where it shows from the next natural load as the item tooltip line "Bory: <line>". Live game rules (quest items, uncollected mounts, toys, pets and looks, upgrades) still win; your advice replaces the generic keep, sell, junk, and reagent lines. Write line as a short action, at most 60 characters, in English, and lineRu in Russian: "Bank it: Alchemy reagent, skill 75", "Sell on the AH", "Send to Mira (Alchemy): mail". Base it on get_player_profile with the account, so items can go to the Alt who uses them: the warband bank for warbound items, mail otherwise. Never advise sending soulbound items, never say delete, and never say vendor for epic or bind-on-equip items. action is one of keep, sell, use, bank, send, disenchant, equip, open, turn_in, info; to names the Alt for send. replace drops this character\'s older advice first.',
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
      description: `Reply to an item or question request (or add a message to a plan request). The player already got a quick local answer; yours arrives at their next login or when they accept Bory's Refresh offer, so make it worth the wait. Write in the request's lang, like a friendly spoken chat reply: short sentences, no markdown and no web links, at most ${ANSWER_MAX_BYTES} bytes. A blank line splits the reply into up to 3 chat bubbles. The message may carry the same link tokens as a plan, with entities for npcs. waypoints puts a route on the map. plan, when given, is stored like put_plan and starts in game together with the message. For an item, say what it is for for this character and its Alts, and what to do with it (keep, bank, sell, send to an Alt).`,
      inputSchema: {
        requestId: z.string().describe("Request id from list_requests"),
        message: z.string().describe(`The reply, at most ${ANSWER_MAX_BYTES} bytes`),
        waypoints: z
          .array(waypointSchema)
          .max(10)
          .optional()
          .describe("Optional route for the reply. Coordinates are 0 to 1."),
        plan: planSchema.optional().describe("Optional follow-up plan, same shape as put_plan."),
        entities: entitiesSchema
          .optional()
          .describe("Npc names and places for {npc:ID} tokens in the message."),
      },
    },
    async ({ requestId, message, waypoints, plan, entities }) => {
      try {
        const asked = store.requestById(requestId);
        if (!asked) return failure(new Error("No request with that id."));
        const warnings: string[] = [];
        const ids = [...markupIds(message), ...(plan ? planMarkupIds(plan) : [])];
        const missing = gameIds ? await gameIds.missing(ids) : undefined;
        const now = Math.floor(Date.now() / 1000);
        const answer = cleanAnswer(message, waypoints, now, entities, { missing, warnings });
        const stored = plan
          ? store.putPlan(plan, now, { missing, warnings, wish: asked.wish })
          : undefined;
        const request = store.answerRequest(requestId, answer, stored?.id ?? null);
        return text({
          request: request ? publicRequest(request) : null,
          plan: stored ? { id: stored.id, plan: stored.unb1 } : null,
          warnings,
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
        criteriaTreeId: z
          .number()
          .int()
          .describe("Criteria tree id from the web API, not the criteria asset id"),
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

export async function handleMcp(
  c: Context,
  store: Store,
  dataDir: string,
  gameIds?: BlizzardIds,
): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  const server = createMcpServer(store, dataDir, gameIds);
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
}
