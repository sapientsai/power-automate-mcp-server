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
})
