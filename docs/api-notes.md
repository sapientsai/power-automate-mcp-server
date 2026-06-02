# Flow API notes — what to verify at implementation time

`api.flow.microsoft.com` is unofficial and undocumented. This file is the running log of what
was discovered against a real tenant, so future maintainers don't re‑discover it. **Fill in
the "Finding" column as you learn each item on a real tenant.**

Base URL: `https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple`
Default api-version: `2016-11-01`

| #   | Item                                                                                                                                                                   | Status        | Finding                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------- |
| 1   | **OAuth scope/resource** that mints a `service.flow.microsoft.com` token for a custom public client. Candidates tried in order: `…//.default`, `…/.default`, `…/User`. | ❓ unverified | _record the winning scope here and pin via `FLOW_SCOPES`_ |
| 2   | **Is `api-version=2016-11-01` still served** for every endpoint?                                                                                                       | ❓ unverified | _note any endpoint needing a newer version + override_    |
| 3   | **Personal vs solution flows** both surface in `list_flows`? (community lore: yes)                                                                                     | ❓ unverified |                                                           |
| 4   | **clientCredentials (app-only) reach** — does `list_flows` return anything? Personal flows?                                                                            | ❓ unverified | _document the limitation precisely_                       |
| 5   | **Default environment** — `isDefault: true` present? id format `Default-<tenantId>`?                                                                                   | ❓ unverified |                                                           |
| 6   | **Error response shapes** — capture real 400/401/403/404/429 bodies; confirm the `statusToKind` mapping in `flow-api/client.ts`.                                       | ❓ unverified |                                                           |
| 7   | **get_flow_run per-action detail** — does the run object include actions, or is a follow-up call (`.../runs/{run}/actions`) needed? v1 surfaces `raw` properties.      | ❓ unverified |                                                           |
| 8   | **PUT permissions body** for `add_flow_owner` — the exact payload shape. v1 sends `{ properties: { principal: { id, type:"User" }, roleName } }`.                      | ❓ unverified | _adjust if the API rejects it_                            |
| 9   | **resubmit path** — `.../triggers/{trigger}/histories/{run}/resubmit`. Confirm trigger name source (from `get_flow` definition triggers).                              | ❓ unverified |                                                           |

## Verified findings — first real run (2026-06-02, Civala tenant)

Ran against tenant `4d68a3d9-…` (civala.com) reusing the `Civala-Microsoft365-MCP` app
(`7094d3e5-…`). 6 of 7 read tools work.

**Auth — the full chain that actually works (and the four walls hit getting there):**

1. **Tenant must be specific, not `common`.** `common` + a resource `.default` scope →
   `AADSTS50059: No tenant-identifying information`. Worse: **MSAL 5.2.2 swallows that 400 and
   fires `deviceCodeCallback` with an all-`undefined` response object** (no error), which looks
   like a broken SDK. Set `AZURE_TENANT_ID` to a real tenant GUID for interactive Flow.
2. **App needs the _Microsoft Flow Service_ delegated permission** (resource app id
   `7df0a125-d3be-4c96-aa54-591f83ff541c`). Without it → `AADSTS650057: Invalid resource`.
   Added `Flows.Read.All` + `Flows.Manage.All` via `az ad app permission add` + admin-consent.
3. **Don't use `.default` on a shared/incremental-consent app.** `…/.default` validates _every_
   granted permission on the app against its manifest; the MS365 app had an incrementally-
   consented Graph grant (`Chat.ReadWrite.All`) not in the manifest → `AADSTS650051`. Fix: request
   **specific** scopes. **Winning scopes:** `https://service.flow.microsoft.com/Flows.Read.All` +
   `…/Flows.Manage.All` (pinned via `FLOW_SCOPES`). `.default` is still fine for a _dedicated_ app.
4. **"Allow public client flows" must be ON** (`isFallbackPublicClient=true`). Off → the
   `/devicecode` call issues a code but token redemption fails with `invalid_client` (AAD wants a
   secret). `az ad app update --id <app> --set isFallbackPublicClient=true`.

Takeaway: a **dedicated public-client app** with only the Flow delegated perms would have avoided
walls #3 and the shared-app risk. Reusing the MS365 app works but couples the two.

**Per-tool results:**

| Tool                | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_environments` | ✅ default env present, `isDefault:true`, id `Default-<tenantId>` (resolves #5)                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `list_flows`        | ✅ personal flows surface (resolves #3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `get_flow`          | ✅ full `definition`, `connectionReferences`, parsed trigger/action names                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `list_flow_runs`    | ✅ status + computed `durationMs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `get_flow_run`      | ✅ `raw` has trigger + input/output links; **no per-action `actions` array** — action-level detail needs a follow-up call `…/runs/{run}/actions` (resolves #7)                                                                                                                                                                                                                                                                                                                                                                                |
| `list_flow_owners`  | ✅ `roleName` works; the API does **not** return `principalDisplayName` (only the id)                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `list_connections`  | ✅ **Solved.** Connections are NOT on `api.flow.microsoft.com` (every path 404s). They live on the environment's **regional PowerApps host**, advertised on the environment object as `properties.runtimeEndpoints["microsoft.PowerApps"]` (e.g. `https://unitedstates.api.powerapps.com`). Resolve that host, then `GET <host>/providers/Microsoft.PowerApps/connections?api-version=2016-11-01&$filter=environment eq '<env>'`. The **Flow-audience token is accepted** there (no separate PowerApps token). Surfaces `status:"Error"` for broken connections. See `scripts/diag-env.mjs`. |

404 → `not_found` mapping confirmed correct (#6 partially).

## If the Flow audience can't be obtained by a custom public client

The token-audience question (#1) is the make-or-break unknown. Fallback plans:

- **Plan B (on-behalf-of):** acquire a Graph token, exchange via OBO. Requires a _confidential_
  client → out of scope for the v1 public client.
- **Plan C (admin-registered app):** a tenant admin registers an app with explicit
  _Microsoft Flow Service_ delegated permissions and grants admin consent. Document the
  "Admin consent required" step for that tenant.

## How endpoints map to backend functions

| Operation          | Method + Path                                          | Code                       |
| ------------------ | ------------------------------------------------------ | -------------------------- |
| List environments  | `GET /environments`                                    | `flow-api/environments.ts` |
| List flows         | `GET /environments/{env}/flows`                        | `flow-api/flows.ts`        |
| Get flow           | `GET /environments/{env}/flows/{flow}`                 | `flow-api/flows.ts`        |
| Enable / disable   | `POST .../flows/{flow}/start` \| `/stop`               | `flow-api/flows.ts`        |
| List runs          | `GET .../flows/{flow}/runs?$top=`                      | `flow-api/runs.ts`         |
| Get run            | `GET .../flows/{flow}/runs/{run}`                      | `flow-api/runs.ts`         |
| Cancel run         | `POST .../runs/{run}/cancel`                           | `flow-api/runs.ts`         |
| Resubmit run       | `POST .../triggers/{trigger}/histories/{run}/resubmit` | `flow-api/runs.ts`         |
| List connections   | `GET /environments/{env}/connections`                  | `flow-api/connections.ts`  |
| List owners        | `GET .../flows/{flow}/permissions`                     | `flow-api/owners.ts`       |
| Add / remove owner | `PUT` \| `DELETE .../permissions/{principalId}`        | `flow-api/owners.ts`       |

To pin a newer api-version for a single endpoint, pass `{ apiVersion: "…" }` in the
`client.request(...)` options for that call.
