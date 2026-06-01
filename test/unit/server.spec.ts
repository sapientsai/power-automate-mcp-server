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

  it("does not register write tools when ENABLE_WRITE_OPS is unset", () => {
    const server = createPowerAutomateServer(config)
    const tools = server.getCapabilities().tools.map((t) => t.name)
    expect(tools).not.toContain("enable_flow")
    expect(tools).not.toContain("disable_flow")
  })
})
