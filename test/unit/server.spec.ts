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

  it("registers the list_environments tool", () => {
    const server = createPowerAutomateServer(config)
    const tools = server.getCapabilities().tools.map((t) => t.name)
    expect(tools).toContain("list_environments")
  })
})
