# Forge

A workflow orchestrator with an IDE-style dashboard. Author graphs of steps —
shell commands, model calls, HTTP requests, transforms, branches — on a canvas,
then run them and watch output stream in live.

It also keeps track of where your time went: goals, planned blocks, a timer,
and an **activity ledger** that reads your AI tools' own histories so most of
the tracking happens without you doing anything.

Single-user, local-first. Next.js 16 · React 19 · TypeScript · Prisma 7 · SQLite.

---

## Running it

```bash
npm run dev
```

First visit creates the account at `/setup` and seeds a demo workflow. To seed a
dev account non-interactively instead:

```bash
npx tsx prisma/seed.ts
```

That creates `dev@local` / `forge-dev` (override with `SEED_EMAIL` /
`SEED_PASSWORD`) plus the **Build & notify** demo workflow.

Give the demo workflow some version history to look at:

```bash
npx tsx prisma/seed-history.ts
```

```bash
npm test
```

```bash
npx prisma studio
```

## Running it for real, and from your phone

Forge is local-first because it has to be: the harvester reads your AI tools'
histories out of this machine's home directory. Host it on a server and there
is nothing there to read — the ledger stays empty forever. So it runs here, and
you reach it privately.

```bash
npm run build && npm start
```

`next start` binds to `0.0.0.0`, so it is already reachable on the LAN. To get
it from a phone anywhere, put the machine on a [Tailscale](https://tailscale.com)
tailnet and serve it with a real certificate:

```bash
tailscale serve --bg 3000
```

That publishes `https://<machine>.<tailnet>.ts.net` to your devices only —
nothing is exposed to the internet, and because it is genuine HTTPS the session
cookie keeps its `Secure` flag.

**If you serve plain `http://` instead** — the raw tailnet IP, or a LAN address —
set `FORGE_ALLOW_INSECURE_COOKIE=1`. A `Secure` cookie is not sent over HTTP, so
without it every login silently bounces back to the login page with no error
anywhere. Only ever do this on a private network.

To keep both the server and the harvest running without a terminal open:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows-tasks.ps1
```

Two scheduled tasks under your own account — no elevation, nothing
system-wide — starting the server at logon and harvesting every 30 minutes.
`-Uninstall` removes them.

### Before putting it anywhere public

Two things in here are fine for a single trusted user on a private network and
are not fine on the internet, both called out under _Known limitations_: the
`new Function` expression evaluator, and the hand-rolled session cookie.
Tailscale sidesteps both by never exposing the app in the first place.

---

## Runs and versions

Every save archives the graph it replaced, so **Versions** shows what each
version introduced — nodes added, removed or edited down to the config key, and
connections gained or lost. Moving a node is reported as _layout only_: it bumps
the version but changes nothing the workflow does. Restoring is itself a save,
so it's undoable rather than destructive.

A run pins the version it executed. **Re-run** replays that exact graph, not
whatever the canvas looks like now — otherwise "re-run" quietly means something
different after every edit.

On a run, selecting a step in the timeline shows what it received and what it
produced, and narrows the log stream to that step.

---

## Where the time went

Three records, kept apart on purpose:

|              |                                                           |
| ------------ | --------------------------------------------------------- |
| **Block**    | time you _planned_ — the intention, before the day starts |
| **Session**  | time you _claimed_ — you started a timer                  |
| **Activity** | time a tool _witnessed_ — harvested from its own history  |

Collapsing any two of these loses the only genuinely useful signal. The gap
between Block and Session tells you whether the plan was real. The gap between
Session and Activity tells you what you did without ever thinking to log it.

They are never summed into one number without saying which is which — a harvest
must not be able to silently inflate a day you already stood behind by hand.

### Harvesting

**Projects** is where this lands. Press _Harvest_ and it reads your AI tools'
histories, then lists every folder you've worked in with the time observed
there. The one decision left to you is which goal each project's time counts
toward — until you make it, the time is recorded but counts toward nothing.

From the command line instead:

```bash
npm run harvest:preview   # dry run — reads transcripts, writes nothing
npm run harvest           # the real thing
npm run harvest -- --full # ignore the watermark, re-read everything
```

Harvesters are strictly read-only: they open a tool's history and nothing else.
Nothing outside this app's own database is ever written, moved or touched.

`~/.claude/projects/<encoded>/<sessionId>.jsonl` is Claude Code's history. The
folder name looks decodable — `C--Users-me-IELTS-4-Weeks` — but it isn't: `-`
stands for both a separator and a literal hyphen, so any decoder eventually
attributes work to a folder that doesn't exist. The transcript carries the real
`cwd` inside it, and that is the only source trusted.

Codex writes `~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-<ts>-<uuid>.jsonl` —
date-nested, so that walk recurses, rooted at `sessions/` to keep the recursion
away from the caches and SQLite databases in the rest of `~/.codex`. Its `cwd`
arrives on the first line, in a `session_meta` record.

Gemini (Antigravity) splits it across two files, and is the awkward one:

```
brain/<id>/.system_generated/logs/transcript.jsonl   when the work happened
conversations/<id>.db                                where it happened
```

The transcript has no working directory anywhere in it. The paths that _do_
appear are incidental — files a tool call happened to touch — and inferring a
project from those is exactly the guess this module refuses to make. The real
workspace lives in the conversation database, protobuf-encoded, and is read by
scanning the blob's printable runs for the first `file:///` URI. That is a
scrape, and it will break when the layout upstream changes. It breaks _safely_:
a failed scrape yields no path, and a session with no path is dropped as
unattributed rather than filed under the wrong project. Six of eight sessions
resolve on this machine; the other two are dropped.

Note the transcript is also written to `logs/chunks/…` and
`transcript_full.jsonl`. Those are other renderings of the same conversation,
so the walk constructs the one path it wants rather than discovering files —
a recursive search would count every Gemini session three times.

**`activeMinutes` is not `endedAt - startedAt`.** Gaps longer than the idle
threshold are dropped, because a transcript left open overnight otherwise
claims fourteen hours. The threshold is 15 minutes, in `lib/harvest/idle.ts`.

```bash
npm run harvest:calibrate   # re-derive it from the transcripts
```

The threshold is the one number here that can quietly rot, so it gets its own
script rather than a comment asserting it was reasonable once. Total active
time at threshold _t_ is the cumulative sum of every gap up to _t_, so sweeping
_t_ and differencing the totals shows how much time sits in each band of gap
length — no change to the `ToolHarvester` contract, no re-implemented parsers.

Read it looking for a **valley**: a run of bands contributing nothing is where
the boundary between "thinking" and "gone" actually falls, and a threshold
inside one is stable under a few minutes' drift. Note the ledger _cannot_
answer this — `Activity.activeMinutes` is already gap-adjusted on the way in,
so the gap structure is gone by the time it reaches the database.

As of 2026-08-16, across all three tools: 15 sits at the edge of an empty
15–20m band, so 15–20 all give the same 10h53m, and 78% of inter-message time
falls inside it. The next empty band is 40–60m, worth 1h50m more — rejected
because a 40-minute silence is lunch, not thinking. That last part is a
judgement, not a measurement, and it's written down in `idle.ts` so it can be
argued with.

**Harvests are idempotent.** `(tool, sessionRef)` is the key, so re-reading the
session you are currently sitting in updates its row rather than adding a
second one. The watermark saved after a run is the time it _started_ — a file
written mid-harvest then has a later mtime and gets re-read next time, instead
of being skipped forever.

**Sub-agent sessions are not counted.** Both tools record a spawned agent as
its own transcript — Codex as a sibling file, Claude Code nested under
`subagents/` — and a sub-agent runs _while its parent waits_, inside the
parent's own span. Counting both double-counts the same wall clock, and not by
a little: across the nine Codex rollouts on this machine it is 327 active
minutes naively against 163 with sub-agents removed. Codex marks them with
`parent_thread_id`; Claude Code's are excluded by the walk not recursing.

### Adding a tool

1. Write `lib/harvest/<tool>.ts` exporting a `ToolHarvester`.
2. Add it to the array in `lib/harvest/registry.ts`.

Same shape as `NodeExecutor`: one file per implementation, one line to
register. The orchestrator, the action, both scripts and the UI all iterate the
registry, so none of them need touching.

Each tool keeps its own watermark, so adding one back-fills its whole history
on first run while the others stay incremental.

---

## Execution is simulated — deliberately

No shell command actually runs, no model is called, no HTTP request is sent.
What _is_ real: the scheduler, the event bus, persistence, streaming,
cancellation, concurrency limits and failure propagation.

The seam is `NodeExecutor` in `lib/engine/types.ts`:

```ts
export interface NodeExecutor<TConfig> {
  kind: string;
  configSchema: z.ZodType<TConfig>;
  ports: { inputs: PortDef[]; outputs: PortDef[] };
  run(ctx: ExecContext<TConfig>): AsyncIterable<RunEvent>;
}
```

`run()` is an async generator yielding `log` / `progress` / `succeeded` /
`failed`. Making execution real means writing a second implementation of that
one method — spawn a child process, call the Anthropic SDK, `fetch` the URL.
Nothing above it changes.

Two node kinds already execute for real, because they're pure functions over
data: **`transform`** and **`branch`**. That means data genuinely flows through
the graph and branch conditions genuinely evaluate.

---

## Getting around

| Key               |                                                               |
| ----------------- | ------------------------------------------------------------- |
| `Ctrl K`          | Command palette — workflows, recent runs, navigation, actions |
| `Ctrl P`          | Go to workflow (scoped quick-open)                            |
| `Ctrl B`          | Toggle the explorer                                           |
| `Ctrl S`          | Save the open workflow                                        |
| `Alt 1`–`9`       | Switch to the nth tab                                         |
| `Alt W`           | Close the active tab                                          |
| `Alt [` / `Alt ]` | Previous / next tab, wrapping                                 |

Alt rather than Ctrl for tab manipulation: Chrome reserves `Ctrl 1‑9` and
`Ctrl W` at the browser level and won't let a page intercept them. The map lives
in `components/shell/shortcuts.ts`, which is also what the settings page renders
— so the documentation can't drift from the bindings.

Tabs persist across reloads. The explorer lists workflows and recent runs with
live status dots, and `/runs?w=<slug>` filters history to one workflow.

## Adding a node kind

1. Write `lib/executors/<kind>.ts` exporting a `NodeExecutor`.
2. Add it to the array in `lib/engine/registry.ts`.

That's it. Its config form, canvas node, palette button, validation and
reference-page entry all derive from the executor's own declaration.

The trick is that `configSchema` does three jobs at once: it validates config on
save, types `ctx.config` inside `run()` via `z.infer`, and **generates the
inspector form** — `lib/engine/schema-form.ts` introspects the Zod schema and
picks a control per field. Annotate with `.meta({ control: "code" })` to
override.

---

## Architecture

```
lib/engine/     types · registry · scheduler · bus · run-manager · validate · schema-form
lib/executors/  start · shell · ai · http · transform · branch · end
lib/harvest/    types · paths · jsonl · idle · registry · claude-code · codex · gemini · run
data/           the authorization boundary
actions/        Server Actions: authenticate → parse → delegate → revalidate
app/(app)/      the IDE shell and its pages
components/     shell · canvas · inspector · console · timeline · goals · time · projects
```

**`data/` is the authorization boundary.** Every function takes `userId` first
and filters on it; Server Actions never touch `prisma` directly. There is no
code path that reads a record without proving who is asking.

**Scheduling.** A node runs once every incoming edge has resolved and at least
one is live; if all resolved dead, it is skipped. Naive "wait for every parent
to succeed" deadlocks the moment a branch exists, since one arm never succeeds.

**Streaming.** `/api/runs/[id]/stream` replays persisted log lines in `seq`
order _before_ attaching to the live bus, so reloading mid-run loses nothing.

**The graph is JSON** on the `Workflow` row rather than normalised node/edge
tables — React Flow's model _is_ `{nodes, edges}`, saves are atomic, and
versioning is a snapshot. `Run.version` pins which graph a run belongs to.

---

## Known limitations

- **`transform` and `branch` use `new Function`.** Expressions are arbitrary
  JavaScript with access to globals. Acceptable here because the app is local
  and single-user and the person writing the expression is the person running
  it — the same trust level as a shell node. Do **not** expose this to
  untrusted input without a real sandbox.
- **Auth is a signed cookie**, not a full framework (`lib/session.ts`). Fine for
  a local single-user tool; swap in Auth.js at `requireUserId()` if this ever
  grows multi-user or goes on a network. Set `AUTH_SECRET` in `.env`.
- **No retries yet.** `NodeRun.attempt` exists so adding them is additive.
- **Projects can't be renamed from the UI.** `renameProject` exists and is
  wired to an action; nothing calls it yet, so a project keeps the folder's
  name.
- **`Session.minutes` is denormalised, so it has an invariant to keep.** Goal
  totals are a `SUM` over that column rather than a scan of every session, and
  `stopSession()` is the only thing that writes it. Anything else that sets
  `endedAt` must set `minutes` too, or that session vanishes from goal totals
  with no error. The alternative — computing the duration in SQL — needs
  `julianday()` on SQLite and `EXTRACT(EPOCH …)` on Postgres, which would give
  up the portability the schema is built around.
- **Three harvesters.** Claude Code, Codex and Gemini are read. Cline and
  Copilot keep their history entirely in SQLite — no transcript to stream, so
  they need more than a new parser.
- **Cursor is installed but unused, so it has no harvester yet.** What is known
  from reconnaissance, to save repeating it:

  ```
  ~/.cursor/chats/<workspace-hash>/<chat-id>/meta.json
    { schemaVersion, createdAtMs, updatedAtMs, hasConversation, cwd }
  ```

  `cwd` is explicit, which is the hard part solved — no guessing from
  incidental paths as with Gemini. What is missing is per-message timestamps:
  `createdAtMs`/`updatedAtMs` give only a span, and span is the number this
  whole design exists to reject. Those timestamps must be in whatever file
  appears when `hasConversation` turns true, and that file does not exist until
  Cursor is actually used once. `ai-tracking/ai-code-tracking.db` has a
  `conversation_summaries` table (`conversationId`, `title`) that would make a
  good label — also empty today. `%APPDATA%/Cursor/User` is empty; there is no
  `workspaceStorage`/`state.vscdb` on this machine.

- **Gemini's workspace is scraped from a protobuf blob.** See above. It fails
  safe, but it is the first thing to check if Gemini sessions start turning up
  unattributed after an Antigravity update.
- **`messageCount` isn't comparable across tools.** Claude Code counts every
  `user`/`assistant` line, which includes tool results; Codex counts only
  user-visible turns. Both are honest activity signals on their own and neither
  should be summed with the other.
- **Sub-agent skips are counted as `filesSkipped`**, the same bucket as
  "unchanged since last harvest". Telling the two apart in the UI would mean a
  fifth counter on `HarvestState` and a migration, for a number that is only
  ever displayed.
- **The idle threshold is calibrated against one person's habits.** 15 minutes
  is re-derived and stable on this machine (`npm run harvest:calibrate`), but
  it encodes an assumption — that a pause over a quarter of an hour isn't work
  — which is a judgement rather than a measurement.
- Schedules, secrets storage, webhooks and graph↔YAML round-tripping are
  stubbed in the UI as disabled tabs, not implemented.

## Environment notes

- `better-sqlite3` is a native addon and npm's `allowScripts` policy blocks its
  postinstall by default. It's already approved in `package.json`; if the
  binding ever goes missing, `npm rebuild better-sqlite3`.
- Postgres is a small move: swap `@prisma/adapter-better-sqlite3` for
  `@prisma/adapter-pg` in `lib/db.ts` and flip `provider` in the schema. There
  are no native enums or SQLite-only types anywhere.
