# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-06-03

### Fixed

- **stdio transport corrupted the JSON-RPC stream** (broke the `.mcpb` / Claude Desktop
  install). The console telemetry sink writes events to stdout — which is the JSON-RPC
  channel on stdio — so `server.start`/`session.connect` objects landed on stdout and the
  client disconnected with "Invalid JSON-RPC message". The console sink is now suppressed on
  the stdio transport (it stays on for HTTP); our own diagnostics already use stderr.
- The file telemetry sink now defaults to an **absolute** path
  (`~/.cache/power-automate-mcp/events.ndjson`, like the token cache) instead of
  `./logs/events.ndjson`, so it never litters or fails in an unpredictable cwd (`.mcpb`,
  `npx … --stdio`).

## [0.2.0] - 2026-06-03

### Fixed

- **HTTP transport reachability.** FastMCP resolves an unspecified host to IPv6 `::1`
  (loopback-only), so the HTTP transport bound `::1:PORT`. That silently broke both the
  published container port (Docker forwards `-p` to `eth0`, not `::1`) and the Dockerfile
  `HEALTHCHECK` (probes IPv4 `127.0.0.1`). The bind address is now threaded through to
  FastMCP's `httpStream.host`, reading `HOST` with a `0.0.0.0` default. Verified: the
  container binds `0.0.0.0`, `/health` returns 200 from the host and via the IPv4
  healthcheck, and the container reports `healthy`.

### Added

- `TRANSPORT=httpStream` is accepted as an alias for `http`, aligning with sibling MCP
  servers (e.g. `patents-mcp-server`).

### Changed

- The tracked `.mcp.json` is replaced with `.mcp.json.example` (and `.mcp.json` is now
  gitignored). This removes the `AZURE_TENANT_ID=common` footgun (`common` fails for the
  Flow audience with AADSTS50059) and stops local operator configs from showing as repo
  changes.

### Docs

- The README and `docker-compose.yml` now warn explicitly that the **HTTP transport is
  single-operator**: all callers share one Power Automate identity until the v2 per-user
  OAuth path lands (#9).

## [0.1.1] - 2026-06-03

### Fixed

- `server.json` description shortened to ≤100 chars (the MCP registry rejected longer
  values with HTTP 422).
- npm publish in the release workflow is now idempotent — it skips when the version is
  already on npm, so the MCP-registry step can be re-run without a duplicate-publish error.

## [0.1.0] - 2026-06-03

Initial public release — `power-automate-mcp-server` on npm (OIDC provenance) and the MCP
registry (`io.github.sapientsai/power-automate-mcp-server`), with a Claude Desktop `.mcpb`
on the GitHub release.

### Added

- MSAL **device-code** auth surfaced through the MCP lifecycle (the sign-in prompt appears
  in the tool result — no terminal needed), with silent refresh from a `0600` file cache.
  Secondary `clientCredentials` (app-only) mode.
- **7 read tools**: `list_environments`, `list_flows`, `get_flow`, `list_flow_runs`,
  `get_flow_run`, `list_connections`, `list_flow_owners`.
- **9 write tools** (registered but gated behind `ENABLE_WRITE_OPS`; `delete_flow` requires
  `confirm=true`): `create_flow`, `update_flow`, `delete_flow`, `enable_flow`,
  `disable_flow`, `cancel_flow_run`, `resubmit_flow_run`, `add_flow_owner`,
  `remove_flow_owner`.
- `report_feedback` tool, telemetry sinks, and SomaMCP health/info/dashboard endpoints.
- Docker (HTTP transport) and a Claude Desktop `.mcpb` extension.

[0.2.1]: https://github.com/sapientsai/power-automate-mcp-server/releases/tag/v0.2.1
[0.2.0]: https://github.com/sapientsai/power-automate-mcp-server/releases/tag/v0.2.0
[0.1.1]: https://github.com/sapientsai/power-automate-mcp-server/releases/tag/v0.1.1
[0.1.0]: https://github.com/sapientsai/power-automate-mcp-server/releases/tag/v0.1.0
