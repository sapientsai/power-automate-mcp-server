import { describe, expect, it } from "vitest"

import { activeTelemetrySinks, createPowerAutomateServer, loadConfig, PKG_VERSION } from "../../src/index"

const config = loadConfig({ AZURE_CLIENT_ID: "test-client", TELEMETRY: "" } as NodeJS.ProcessEnv).fold(
  (e) => {
    throw new Error(e.message)
  },
  (c) => c,
)

const configFrom = (env: Record<string, string>) =>
  loadConfig({ AZURE_CLIENT_ID: "test-client", ...env } as NodeJS.ProcessEnv).fold(
    (e) => {
      throw new Error(e.message)
    },
    (c) => c,
  )

describe("activeTelemetrySinks", () => {
  it("suppresses the console sink on stdio (stdout is the JSON-RPC channel)", () => {
    const sinks = activeTelemetrySinks(configFrom({ TRANSPORT: "stdio", TELEMETRY: "console,file" }))
    expect(sinks).not.toContain("console")
    expect(sinks).toContain("file")
  })

  it("keeps the console sink on the http transport", () => {
    const sinks = activeTelemetrySinks(configFrom({ TRANSPORT: "http", TELEMETRY: "console,file" }))
    expect(sinks).toContain("console")
    expect(sinks).toContain("file")
  })
})

describe("telemetry file default", () => {
  it("defaults to an absolute path so it never litters an unknown cwd", () => {
    const cfg = configFrom({})
    expect(cfg.telemetryFilePath.startsWith("./")).toBe(false)
    expect(cfg.telemetryFilePath).toMatch(/power-automate-mcp[/\\]events\.ndjson$/)
  })
})

describe("createPowerAutomateServer", () => {
  it("builds and reports server info", () => {
    const server = createPowerAutomateServer(config)
    const info = server.getInfo()
    expect(info.name).toBe("power-automate-mcp")
    expect(info.version).toBe(PKG_VERSION)
    expect(info.capabilities.tools).toBeGreaterThanOrEqual(1)
  })

  it("registers the full read-only tool set", () => {
    const server = createPowerAutomateServer(config)
    const tools = server.getCapabilities().tools.map((t) => t.name)
    for (const name of [
      "list_environments",
      "list_flows",
      "get_flow",
      "list_flow_runs",
      "get_flow_run",
      "list_connections",
      "list_flow_owners",
    ]) {
      expect(tools).toContain(name)
    }
  })

  it("registers write tools but marks them DISABLED when ENABLE_WRITE_OPS is unset", () => {
    const server = createPowerAutomateServer(config)
    const tools = server.getCapabilities().tools
    const names = tools.map((t) => t.name)
    for (const name of [
      "create_flow",
      "update_flow",
      "delete_flow",
      "enable_flow",
      "disable_flow",
      "cancel_flow_run",
      "resubmit_flow_run",
      "add_flow_owner",
      "remove_flow_owner",
    ]) {
      expect(names).toContain(name)
    }
    const enable = tools.find((t) => t.name === "enable_flow")
    expect(enable?.description).toMatch(/DISABLED/)
  })
})
