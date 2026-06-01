# Integration tests

These exercise the real `api.flow.microsoft.com` endpoints against a live tenant. They are
**skipped by default** and run only when `INTEGRATION=1` is set. CI runs unit tests only.

## Running

```bash
INTEGRATION=1 AZURE_CLIENT_ID=<your-app-id> pnpm test
```

On first run you'll complete the device-code sign-in (prompt on stderr). Point at a specific
tenant with `AZURE_TENANT_ID=<guid>` and a known environment with
`DEFAULT_ENVIRONMENT=<env-id>` to make assertions stable.

## What to cover (maps to acceptance criteria)

1. `list_environments` returns ≥1 environment (the default).
2. `list_flows` against the default environment returns flows (empty is OK).
3. If a flow exists: `get_flow` returns its `definition`; `list_flow_runs` returns runs;
   `get_flow_run` on a known run returns per-action detail / first failure.
4. `list_connections` returns connections with `status` populated.
5. With `ENABLE_WRITE_OPS=false`, `enable_flow` refuses and does not mutate.
6. With `ENABLE_WRITE_OPS=true`, `disable_flow`/`enable_flow` round-trip (verify via
   `get_flow` `state`). **Use a throwaway test flow.**

Record anything surprising about payloads or api-versions in [`../../docs/api-notes.md`](../../docs/api-notes.md).
