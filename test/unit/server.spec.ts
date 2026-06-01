import { describe, expect, it } from "vitest"

import { createPowerAutomateServer, loadConfig } from "../../src/index"

const config = loadConfig({ AZURE_CLIENT_ID: "test-client", TELEMETRY: "" } as NodeJS.ProcessEnv).fold(
  (e) => {
    throw new Error(e.message)
  },
  (c) => c,
)

describe("createPowerAutomateServer", () => {
  it("builds and reports server info", () => {
    const server = createPowerAutomateServer(config)
    const info = server.getInfo()
    expect(info.name).toBe("power-automate-mcp")
    expect(info.version).toBe("0.1.0")
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
