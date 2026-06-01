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
