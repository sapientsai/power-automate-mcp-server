import { describe, expect, it } from "vitest"

import { loadConfig } from "../../src/config"

const env = (overrides: Record<string, string | undefined>): NodeJS.ProcessEnv => overrides as NodeJS.ProcessEnv

const leftMessage = (e: Record<string, string | undefined>): string =>
  loadConfig(env(e)).fold(
    (err) => err.message,
    () => "__UNEXPECTED_RIGHT__",
  )

describe("loadConfig", () => {
  it("fails when AZURE_CLIENT_ID is missing", () => {
    expect(leftMessage({})).toMatch(/AZURE_CLIENT_ID is required/)
  })

  it("applies sane defaults with only AZURE_CLIENT_ID set", () => {
    loadConfig(env({ AZURE_CLIENT_ID: "client-123" })).fold(
      (err) => expect.unreachable(`expected Right, got: ${err.message}`),
      (cfg) => {
        expect(cfg.clientId).toBe("client-123")
        expect(cfg.tenantId).toBe("common")
        expect(cfg.authMode).toBe("interactive")
        expect(cfg.transport).toBe("stdio")
        expect(cfg.enableWriteOps).toBe(false)
        expect(cfg.port).toBe(3333)
        expect(cfg.endpoint).toBe("/mcp")
        expect(cfg.flowScopes).toEqual(["https://service.flow.microsoft.com/.default"])
      },
    )
  })

  it("rejects an invalid auth mode", () => {
    expect(leftMessage({ AZURE_CLIENT_ID: "x", AZURE_AUTH_MODE: "bogus" })).toMatch(/Invalid AZURE_AUTH_MODE/)
  })

  it("clientCredentials requires a client secret", () => {
    expect(leftMessage({ AZURE_CLIENT_ID: "x", AZURE_AUTH_MODE: "clientCredentials", AZURE_TENANT_ID: "t1" })).toMatch(
      /requires AZURE_CLIENT_SECRET/,
    )
  })

  it("clientCredentials rejects the common tenant", () => {
    expect(
      leftMessage({ AZURE_CLIENT_ID: "x", AZURE_AUTH_MODE: "clientCredentials", AZURE_CLIENT_SECRET: "s" }),
    ).toMatch(/requires a specific AZURE_TENANT_ID/)
  })

  it("accepts a valid clientCredentials config", () => {
    loadConfig(
      env({
        AZURE_CLIENT_ID: "x",
        AZURE_AUTH_MODE: "clientCredentials",
        AZURE_CLIENT_SECRET: "s",
        AZURE_TENANT_ID: "t1",
      }),
    ).fold(
      (err) => expect.unreachable(err.message),
      (cfg) => {
        expect(cfg.authMode).toBe("clientCredentials")
        expect(cfg.clientSecret).toBe("s")
        expect(cfg.tenantId).toBe("t1")
      },
    )
  })

  it("parses FLOW_SCOPES, ENABLE_WRITE_OPS, and http transport overrides", () => {
    loadConfig(
      env({
        AZURE_CLIENT_ID: "x",
        FLOW_SCOPES: "https://service.flow.microsoft.com//.default, openid",
        ENABLE_WRITE_OPS: "true",
        TRANSPORT: "http",
        PORT: "4444",
        ENDPOINT: "flow",
      }),
    ).fold(
      (err) => expect.unreachable(err.message),
      (cfg) => {
        expect(cfg.flowScopes).toEqual(["https://service.flow.microsoft.com//.default", "openid"])
        expect(cfg.enableWriteOps).toBe(true)
        expect(cfg.transport).toBe("http")
        expect(cfg.port).toBe(4444)
        expect(cfg.endpoint).toBe("/flow")
      },
    )
  })

  it("accepts TRANSPORT=httpStream as an alias for http (sibling-server alignment)", () => {
    loadConfig(env({ AZURE_CLIENT_ID: "x", TRANSPORT: "httpStream" })).fold(
      (err) => expect.unreachable(err.message),
      (cfg) => expect(cfg.transport).toBe("http"),
    )
  })

  // A blank optional .mcpb field is passed through as the literal "${user_config.X}" placeholder
  // by Claude Desktop. These must be treated as unset, not used verbatim (which 400'd the URL).
  it("ignores an un-interpolated DEFAULT_ENVIRONMENT placeholder (treats it as unset)", () => {
    loadConfig(env({ AZURE_CLIENT_ID: "x", DEFAULT_ENVIRONMENT: "${user_config.default_environment}" })).fold(
      (err) => expect.unreachable(err.message),
      (cfg) => expect(cfg.defaultEnvironment).toBeUndefined(),
    )
  })

  it("ignores placeholders across optional fields, falling back to defaults", () => {
    loadConfig(
      env({
        AZURE_CLIENT_ID: "x",
        AZURE_AUTH_MODE: "${user_config.azure_auth_mode}",
        AZURE_TENANT_ID: "${user_config.azure_tenant_id}",
        FLOW_SCOPES: "${user_config.flow_scopes}",
        DEFAULT_ENVIRONMENT: "${user_config.default_environment}",
      }),
    ).fold(
      (err) => expect.unreachable(err.message),
      (cfg) => {
        expect(cfg.authMode).toBe("interactive")
        expect(cfg.tenantId).toBe("common")
        expect(cfg.flowScopes).toEqual(["https://service.flow.microsoft.com/.default"])
        expect(cfg.defaultEnvironment).toBeUndefined()
      },
    )
  })

  it("treats a placeholder AZURE_CLIENT_ID as missing (clear error, not a bad client id)", () => {
    expect(leftMessage({ AZURE_CLIENT_ID: "${user_config.azure_client_id}" })).toMatch(/AZURE_CLIENT_ID is required/)
  })

  it("keeps a real value that merely contains braces", () => {
    loadConfig(env({ AZURE_CLIENT_ID: "abc${def}", DEFAULT_ENVIRONMENT: "env-${x}-id" })).fold(
      (err) => expect.unreachable(err.message),
      (cfg) => {
        expect(cfg.clientId).toBe("abc${def}")
        expect(cfg.defaultEnvironment).toBe("env-${x}-id")
      },
    )
  })
})
