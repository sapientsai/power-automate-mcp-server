# power-automate-mcp-server

[![Node.js CI](https://github.com/sapientsai/power-automate-mcp-server/actions/workflows/node.js.yml/badge.svg)](https://github.com/sapientsai/power-automate-mcp-server/actions/workflows/node.js.yml)
[![npm version](https://img.shields.io/npm/v/power-automate-mcp-server.svg)](https://www.npmjs.com/package/power-automate-mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/power-automate-mcp-server.svg)](https://www.npmjs.com/package/power-automate-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

An MCP server that lets agents **inspect, operate, and author Microsoft Power Automate cloud
flows** from a CLI/agent context — list and inspect flows, debug runs, check connections and
owners, and (when explicitly enabled) enable/disable flows, cancel/resubmit runs, manage
owners, and **create/update/delete flows**.

Primarily a **management** surface — the Power Automate portal's visual designer remains the
better place to author complex flow logic — but `create_flow`/`update_flow`/`delete_flow` are
also available (write-gated) for programmatic authoring. Built on
[SomaMCP](https://github.com/sapientsai/SomaMCP) (telemetry, health/info/
dashboard, error classification) over FastMCP.

> ⚠️ **Unofficial API.** v1 targets `api.flow.microsoft.com` — the surface the Power Automate
> portal itself uses. Microsoft labels it _"isn't supported. Customers should instead use the
> Dataverse Web APIs."_ It is stable in practice and, unlike Dataverse, sees **all** flows
> (including personal "My Flows") and works on M365‑seeded entitlements (no Premium license).
> Every tool's description carries this disclaimer. A supported Dataverse backend is stubbed
> for the future (see [`src/backend/dataverse/README.md`](src/backend/dataverse/README.md)).

## Quick start

```bash
pnpm install
cp .env.example .env          # set AZURE_CLIENT_ID (see "App registration" below)
pnpm build
pnpm dev:stdio                # local agent over stdio (device-code sign-in to stderr)
```

On first use the server prints a device-code prompt to **stderr**; open
`https://microsoft.com/devicelogin`, enter the code, and sign in. The token is cached
(`TOKEN_CACHE_PATH`, mode 0600) and silently refreshed thereafter.

### Add to an MCP client (stdio)

```jsonc
{
  "mcpServers": {
    "power-automate": {
      "command": "npx",
      "args": ["-y", "power-automate-mcp-server", "--stdio"],
      "env": { "AZURE_CLIENT_ID": "<your-app-registration-client-id>" },
    },
  },
}
```

**Developing on this repo?** It ships a project-scoped [`.mcp.json`](.mcp.json) (stdio, local
`dist/bin.js`). After `pnpm build`, export `AZURE_CLIENT_ID` and open the repo in Claude Code —
the `power-automate` server loads automatically (complete the device-code sign-in once; the
cached token is then reused).

## App registration

This server ships **no** default client id — you register your own (one‑time):

1. **Azure Portal → Microsoft Entra ID → App registrations → New registration.**
2. Name it (e.g. `power-automate-mcp`). Supported account types: **multitenant** (or
   single‑tenant if you'll only ever use one org).
3. **Authentication → Add a platform → Mobile and desktop applications.** Add redirect URI
   `http://localhost` (unused by device code, but required to register the platform). Set
   **"Allow public client flows" = Yes**.
4. **API permissions → Add a permission.** You need a **delegated** permission for the Power
   Automate / _Microsoft Flow Service_ API. If it isn't in the picker, see "Token audience"
   below — this is the known friction point.
5. Copy the **Application (client) ID** → `AZURE_CLIENT_ID`.

For unattended `clientCredentials` mode instead: add a **client secret**, grant **application**
permissions with **admin consent**, and set `AZURE_AUTH_MODE=clientCredentials`,
`AZURE_TENANT_ID=<your tenant>`, `AZURE_CLIENT_SECRET=...`. Note app‑only has **limited Flow
reach** (it generally cannot see personal "My Flows").

### Verified working setup ⚠️

Confirmed against a real tenant. Interactive Flow auth needs **all four** of these — each one,
if missing, fails with a different cryptic `AADSTS…` (details in [`docs/api-notes.md`](docs/api-notes.md)):

1. **A specific tenant** — `AZURE_TENANT_ID=<your-tenant-GUID>`, **not `common`**. `common` + a
   resource scope → `AADSTS50059` (and MSAL hides it as an empty device-code response).
2. **The _Microsoft Flow Service_ delegated permission** on the app (resource app id
   `7df0a125-d3be-4c96-aa54-591f83ff541c`). Missing → `AADSTS650057`.
3. **Specific scopes, not `.default`**, when reusing an app that has other (incrementally
   consented) permissions — `.default` validates the whole app and can fail with `AADSTS650051`.
   A _dedicated_ app may use `.default`. Pin via `FLOW_SCOPES`.
4. **"Allow public client flows" = Yes** (`isFallbackPublicClient=true`). Off → token redemption
   fails with `invalid_client`.

Verified `FLOW_SCOPES`:
`https://service.flow.microsoft.com/Flows.Read.All,https://service.flow.microsoft.com/Flows.Manage.All`

#### Configure an existing app via `az`

```bash
APP=<your-app-client-id>; FLOW=7df0a125-d3be-4c96-aa54-591f83ff541c
# Flows.Read.All + Flows.Manage.All (delegated), then tenant-wide consent:
az ad app permission add --id "$APP" --api "$FLOW" --api-permissions \
  e45c5562-459d-4d1b-8148-83eb1b6dcf83=Scope 30b2d850-00c3-4802-b7ae-ece9af9de5c6=Scope
az ad app permission admin-consent --id "$APP"
# enable device-code (public client flows):
az ad app update --id "$APP" --set isFallbackPublicClient=true
```

> **Recommended:** a **dedicated** public-client app with only the Flow delegated permissions
> avoids the `.default`/shared-app pitfalls (#3) entirely — cleaner than reusing a Graph app.

## Tools

All tools are **read‑only by default**. Write tools are registered but **refuse** unless
`ENABLE_WRITE_OPS=true`.

### Read-only (always enabled)

| Tool                | Parameters                                       | Returns                                                                    |
| ------------------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| `list_environments` | —                                                | `{ id, name, displayName, location, isDefault }[]`                         |
| `list_flows`        | `environment?`, `owner?`                         | `{ name, displayName, state, createdTime, lastModifiedTime, owner }[]`     |
| `get_flow`          | `environment?`, `flow`                           | full flow incl. `definition`, `connectionReferences`, trigger/action names |
| `list_flow_runs`    | `environment?`, `flow`, `top?` (≤100), `status?` | `{ name, status, startTime, endTime, durationMs, triggerName, error }[]`   |
| `get_flow_run`      | `environment?`, `flow`, `run`                    | run detail + first‑failure + `raw` properties (debugging)                  |
| `list_connections`  | `environment?`                                   | `{ name, apiName, displayName, status, accountName, expiresAt }[]`         |
| `list_flow_owners`  | `environment?`, `flow`                           | `{ principalId, principalType, roleName, principalDisplayName }[]`         |

### Write (require `ENABLE_WRITE_OPS=true`)

| Tool                           | Parameters                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `create_flow`                  | `environment?`, `displayName`, `definition`, `connectionReferences?`, `state?`                 |
| `update_flow`                  | `environment?`, `flow`, any of `displayName` / `definition` / `state` / `connectionReferences` |
| `delete_flow`                  | `environment?`, `flow`, `confirm` (must be `true`)                                             |
| `enable_flow` / `disable_flow` | `environment?`, `flow`                                                                         |
| `cancel_flow_run`              | `environment?`, `flow`, `run`                                                                  |
| `resubmit_flow_run`            | `environment?`, `flow`, `run`, `trigger`                                                       |
| `add_flow_owner`               | `environment?`, `flow`, `principalId`, `roleName` (`CanEdit`\|`CanView`)                       |
| `remove_flow_owner`            | `environment?`, `flow`, `principalId`                                                          |

> **Authoring (`create_flow`/`update_flow`):** `definition` is the raw Logic Apps-style
> workflow JSON (see `get_flow` output as a template). The visual designer is better for
> complex logic; for edits, `get_flow` → modify the `definition` → pass it back to `update_flow`.

When `environment` is omitted, tools use `DEFAULT_ENVIRONMENT` if set, else the discovered
default environment (`isDefault: true`).

### Built-in (from SomaMCP)

- `info` MCP tool — server name, version, git SHA, capability counts.
- `report_feedback` — file API‑drift/bug reports as GitHub issues (`FEEDBACK_GITHUB_REPO`,
  `GITHUB_TOKEN`).
- HTTP endpoints `/health`, `/health/detail`, `/info`, `/dashboard` (the detailed ones are
  protected by `MCP_API_KEY` when set).

## Configuration

See [`.env.example`](.env.example) for the full list. Highlights: `AZURE_CLIENT_ID` (required),
`AZURE_TENANT_ID` (`common`), `AZURE_AUTH_MODE`, `TRANSPORT` (`stdio`\|`http`), `PORT`,
`ENABLE_WRITE_OPS`, `DEFAULT_ENVIRONMENT`, `MCP_API_KEY`, `TELEMETRY`, `TOKEN_CACHE_PATH`.

## Transports & deployment

| Scenario                | Transport | Auth                                   | Notes                                                                        |
| ----------------------- | --------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| Local agent             | `stdio`   | device-code                            | Primary. Full reach. `pnpm dev:stdio`.                                       |
| Docker, single operator | `http`    | device-code + **mounted token volume** | Auth once via `docker logs`; persists. Full reach. `docker compose up`.      |
| Docker, unattended      | `http`    | `clientCredentials`                    | No human, but **no personal flows**; verify it can mint a Flow token at all. |

> **v2:** per‑user browser OAuth over HTTP via FastMCP's `AzureProvider` + disk token cache
> (the upstream token surfaces on the session). Reachable through SomaMCP's `backendOptions`
> passthrough without a fork — not wired in v1.

```bash
# Docker (single-operator device-code with a persisted token volume)
AZURE_CLIENT_ID=... docker compose up --build
docker compose logs -f          # grab the device code on first run
curl -s http://localhost:3333/health
```

## Development

```bash
pnpm validate        # format + lint + typecheck + test + build
pnpm test            # vitest (unit)
pnpm dev             # http transport, watch
pnpm dev:stdio       # stdio transport, watch
pnpm build           # tsdown -> dist/
```

Integration tests that hit a real tenant live under `test/integration/` and run only with
`INTEGRATION=1` (see that folder's README). CI runs unit tests only.

## Troubleshooting

- **Device code never grants a token / "device-code sign-in failed for all scope candidates"**
  → the Flow audience isn't grantable to your app. See "Token audience" and `docs/api-notes.md`.
- **`auth error` on every call** → token cache stale; restart to re‑auth, or delete
  `TOKEN_CACHE_PATH`.
- **`not found` on a known flow** → wrong environment; run `list_environments` / `list_flows`
  first. The flow `name` is the GUID, not the display name.
- **`forbidden`** → the signed‑in user lacks permission on that flow.
- **Empty `list_flows`** in `clientCredentials` mode → app‑only can't see personal flows; use
  `interactive`.
- **An endpoint 404/410s unexpectedly** → Microsoft may have moved the api‑version; check the
  portal's network tab and pin a newer `api-version` (see `docs/api-notes.md`).

## License

MIT.

---

**Sponsored by <a href="https://sapientsai.com/"><img src="https://sapientsai.com/images/logo.svg" alt="SapientsAI" width="20" style="vertical-align: middle;"> SapientsAI</a>** — Building agentic AI for businesses
