# Dataverse backend (stub — not implemented in v1)

This directory is a placeholder for a second `FlowBackend` implementation backed by the
**officially supported** Dataverse Web API, as an alternative to v1's
`api.flow.microsoft.com` backend (`../flow-api`).

## Why a second backend

|                 | `flow-api` (v1)                                            | `dataverse` (future)                                       |
| --------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| Endpoint        | `api.flow.microsoft.com/providers/Microsoft.ProcessSimple` | `https://<org>.<region>.dynamics.com/api/data/v9.2`        |
| Support status  | Microsoft labels it **unsupported**                        | **Officially supported**, OData-clean                      |
| Flow visibility | All flows, incl. personal "My Flows"                       | **Solution-aware flows only**                              |
| Licensing       | Works on M365-seeded entitlements                          | Requires Power Automate/Apps **Premium** (~$15–20/user/mo) |
| Auth audience   | `service.flow.microsoft.com`                               | `https://<org>.dynamics.com`                               |

v1 targets `flow-api` because Civala is on seeded entitlements (no Premium) and needs
personal-flow visibility. A Dataverse backend becomes worthwhile when running against a
Premium tenant that wants the supported, stable surface.

## The contract to implement

Implement `createDataverseBackend(deps): FlowBackend` satisfying the same
[`FlowBackend`](../index.ts) interface the tools already depend on. Nothing in `../../tools`
or `../../index.ts` should change — only the wiring in `createPowerAutomateServer` would
choose a backend based on config (e.g. a `BACKEND=flow-api|dataverse` env var).

## What changes vs. the flow-api backend

- **Auth audience**: request a token for `https://<org>.dynamics.com/.default` instead of
  `service.flow.microsoft.com`. The existing `TokenProvider` seam is reusable — only the
  scope/resource differs.
- **Entity model**: flows are the `workflows` entity (`category = 5` for modern flows).
  - `listFlows` → `GET /workflows?$filter=category eq 5&$select=workflowid,name,statecode,...`
  - `getFlow` → `GET /workflows(<workflowid>)`
  - state is `statecode` (0 = Draft/Off, 1 = Activated/On) rather than `Started`/`Stopped`.
- **Runs**: flow run history is **not** uniformly exposed via Dataverse; this is the main
  gap. Document the limitation or fall back to `flow-api` for run inspection.
- **Owners**: `PrincipalObjectAccess` / `AssignRequest` rather than the `permissions`
  endpoint.
- **Mapping**: produce the same clean [domain types](../types.ts) so tool output is
  identical regardless of backend.

## Verify before building

- Whether the target tenant actually has Premium + Dataverse provisioned.
- The org URL + region discovery (`GET https://globaldisco.crm.dynamics.com/api/discovery/...`).
- Which operations have no Dataverse equivalent (runs) and how to degrade gracefully.
