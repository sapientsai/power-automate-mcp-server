# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

`power-automate-mcp-server` — an MCP server to **manage and (lightly) author** Microsoft Power
Automate cloud flows from an agent context. Built on **SomaMCP** (over FastMCP), TypeScript,
pnpm, tsdown, vitest, functype, zod v4.

Primary surface is **management** (list/inspect/debug/enable-disable/owners). Flow **authoring**
(`create_flow`/`update_flow`/`delete_flow`) was originally a v2 non-goal but is now implemented
and verified — gated behind `ENABLE_WRITE_OPS`, with `delete_flow` requiring `confirm=true`. The
visual designer is still the better authoring surface for complex definitions; these tools emit
the raw workflow-definition JSON, so prefer get_flow-as-template + targeted edits.

- **Spec:** the build spec lives in the project history / Civala memory
  (`~/.claude/projects/-Users-jordanburke-IdeaProjects-Civala/memory/project_power_automate_mcp.md`).
- **Design references:** `../somamcp` (framework), `../microsoft-mcp-server` (sibling patterns —
  but note its auth is app-only/FastMCP-OAuth, **not** device-code).

## Key decisions (locked)

- **Backend:** v1 targets `api.flow.microsoft.com` (unofficial, full reach incl. personal
  flows, no Premium needed). Dataverse backend is stubbed (`src/backend/dataverse/README.md`).
  The `FlowBackend` interface (`src/backend/index.ts`) is the seam — renamed from "BackendAdapter"
  to avoid colliding with SomaMCP's own `BackendAdapter`.
- **Auth:** net-new MSAL device-code token manager behind a `getToken` seam
  (`src/auth/token-manager.ts`). v1 = `interactive` (device-code, stdio) primary +
  `clientCredentials` (app-only) secondary. **v2** = FastMCP `AzureProvider` HTTP per-user OAuth
  (FastMCP exposes the upstream token on the session; reachable via SomaMCP `backendOptions`
  passthrough — no fork). The Flow API client depends only on `getToken`, so v2 is a drop-in.
- **No default client id** — `AZURE_CLIENT_ID` is required (README documents registration).
- **Tenant default:** `common`. **Package:** public, unscoped `power-automate-mcp-server`.
- **functype `^1.2.0`**, somamcp `^1.0.9`, @azure/msal-node `^5.2.2`, zod `^4.4.3`.
- **Node 24** in `.nvmrc` + CI (OIDC trusted publishing needs npm 11.5.1+, which ships with
  Node 24). The `npm@latest` workaround was removed from `publish.yml`.

## The #1 unknown — Flow token audience

The OAuth scope that mints a `service.flow.microsoft.com` token for a _custom_ public client
is unverified until first real sign-in. The token manager tries candidates in order
(`FLOW_SCOPE_CANDIDATES` in `src/auth/types.ts`) and logs the winner. **Record findings in
`docs/api-notes.md`** and pin via `FLOW_SCOPES`. If no candidate works, the _Microsoft Flow
Service_ delegated permission may not be grantable to a third-party app (see api-notes Plan B/C).

## Architecture

```
bin.ts → index.ts (createPowerAutomateServer)
  ├─ config.ts            loadConfig → Either<ConfigError, ServerConfig>
  ├─ errors.ts            AppError union; appErrorToThrowable embeds a SomaMCP classify
  │                       keyword + an agent-facing suggestion INTO the thrown message
  │                       (SomaMCP surfaces the message verbatim — see wrapTool)
  ├─ auth/                token-manager (getToken seam) + file cache plugin (0600)
  ├─ backend/             FlowBackend seam; flow-api/* (client + per-resource modules)
  └─ tools/               one module per resource; read tools always on, write tools
                          registered-but-gated (ensureWriteEnabled refuses before any call)
```

- Backend methods return `Either<FlowApiError, T>` — **no throws**. Tools fold: `Right` →
  `JSON.stringify`, `Left` → throw `appErrorToThrowable(err)` (SomaMCP renders it).
- Write tools are **registered even when disabled** (design B, per acceptance criterion #8):
  description shows `[DISABLED]`, execute refuses with an actionable error, nothing mutates.

## Working in this repo

- `pnpm validate` (format + lint + typecheck + test + build) must stay green; commit per step.
- functype 1.2.0 gotchas: `.isRight()`/`.isLeft()` are **methods** (call them); `.tap` exists.
  Verify FP snippets with the functype MCP `validate_code` tool when unsure.
- Lint enforces functype patterns (`prefer-either`, no `any`). Use `Try.fromPromise` to wrap
  Promise-returning library calls into `Either`/`Try` rather than try/catch.
- Don't reintroduce a hardcoded client id or a community public client id.

## Status

On `main` (`sapientsai/power-automate-mcp-server`), `pnpm validate` green: auth, Flow API
client, **7 read tools + 9 gated write tools** (incl. create/update/delete_flow), feedback,
telemetry, health/info/dashboard, Docker, docs.

**Verified end-to-end against a real tenant** (Civala, 2026-06-02): in-chat device-code auth
(MSAL device-code with a pending/background model so the code surfaces in the tool result —
no terminal), all 7 read tools, and the full create→edit→delete authoring round-trip. The
auth maze (specific tenant + Flow Service delegated perm + specific scopes not `.default` +
public-client flows) and the connections endpoint (per-env regional PowerApps host) are
solved and recorded in `docs/api-notes.md`.

**Published `v0.1.1`** (2026-06-03): npm (`power-automate-mcp-server`, OIDC provenance), MCP
registry (`io.github.sapientsai/power-automate-mcp-server`, active), and a Claude Desktop
`.mcpb` attached to the GitHub release. Tag-driven: `npm version patch` → `git push
--follow-tags` runs `.github/workflows/publish.yml` (npm idempotent + registry via
mcp-publisher v1.7.9). Versions kept in lockstep across package.json / manifest.json /
server.json / src/version.ts by `scripts/{check,sync}-versions.ts` (check:versions in
prepublishOnly + the npm `version` lifecycle).

Gotchas baked in: `common` tenant + Flow `.default` → AADSTS50059 (MSAL hides it as an empty
device-code response); connections aren't on `api.flow.microsoft.com` (regional PowerApps
host via `runtimeEndpoints`); mutations return empty 200 bodies (client treats empty 2xx as
success); server.json description must be ≤100 chars (registry rejects longer).

## Open follow-ups (see GitHub issues)

- `run_flow` tool — on-demand trigger of a manual/button flow (listCallbackUrl + POST). The
  only thing scripts (`scripts/diag-*.mjs`) still do that the server can't.
- `clientCredentials` (app-only) mode built but never run against a real tenant (api-notes #4).
- Live-verify the untested write tools: `cancel_flow_run`, `resubmit_flow_run`,
  `add_flow_owner` (+ confirm its PUT body shape — api-notes #8), `remove_flow_owner`.
- Committed `.mcp.json` still defaults `AZURE_TENANT_ID` to `common` (a Flow footgun). Jordan's
  local copy uses `${MS365_*}` + `FLOW_SCOPES` + `ENABLE_WRITE_OPS=true` and is intentionally
  uncommitted.
- Publish workflow actions run on deprecated Node 20 (checkout/setup-node/etc.).
- Consider a dedicated public-client app instead of reusing `Civala-Microsoft365-MCP`.
