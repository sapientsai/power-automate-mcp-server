/**
 * Power Automate MCP server — library entry point.
 *
 * Wires SomaMCP (telemetry, info/health/dashboard, error classification) to a Flow API
 * backend and registers the tool catalog. Read-only tools are always registered; mutating
 * tools are gated behind `ENABLE_WRITE_OPS=true`.
 *
 * See ./bin.ts for the CLI/transport entry point.
 */

import {
  createCompositeTelemetry,
  createConsoleTelemetry,
  createJsonFileTelemetry,
  createServer,
  type SomaServerInstance,
  type TelemetryCollector,
} from "somamcp"

import { createTokenManager } from "./auth/token-manager.js"
import type { ServerConfig } from "./auth/types.js"
import { createFlowApiBackend } from "./backend/index.js"
import { registerConnectionTools } from "./tools/connections.js"
import { registerEnvironmentTools } from "./tools/environments.js"
import { registerFlowReadTools } from "./tools/flows.js"
import { registerOwnerReadTools } from "./tools/owners.js"
import { registerRunReadTools } from "./tools/runs.js"
import { PKG_VERSION } from "./version.js"

const buildTelemetry = (config: ServerConfig): TelemetryCollector | undefined => {
  const collectors: TelemetryCollector[] = []
  if (config.telemetry.includes("console")) collectors.push(createConsoleTelemetry("[power-automate]"))
  if (config.telemetry.includes("file"))
    collectors.push(createJsonFileTelemetry({ filePath: config.telemetryFilePath }))
  if (collectors.length === 0) return undefined
  if (collectors.length === 1) return collectors[0]
  return createCompositeTelemetry(collectors)
}

const extractBearer = (request: unknown): string | undefined => {
  if (request && typeof request === "object" && "headers" in request) {
    const headers = (request as { headers?: unknown }).headers
    if (headers && typeof headers === "object") {
      const record = headers as Record<string, unknown>
      const auth = record.authorization ?? record.Authorization
      if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim()
    }
  }
  return undefined
}

/**
 * Protects the HTTP operational endpoints (and HTTP MCP calls) with a static bearer token.
 * Not invoked on stdio. Returns undefined when MCP_API_KEY is unset (local/dev: open).
 */
const buildAuthenticate = (
  config: ServerConfig,
): ((request: unknown) => Promise<Record<string, unknown> | undefined>) | undefined => {
  const apiKey = config.mcpApiKey
  if (!apiKey) return undefined
  return async (request: unknown): Promise<Record<string, unknown> | undefined> => {
    if (extractBearer(request) !== apiKey) {
      throw new Error("unauthorized: invalid or missing bearer token")
    }
    return { authorized: true }
  }
}

export const createPowerAutomateServer = (config: ServerConfig): SomaServerInstance => {
  const tokenManager = createTokenManager(config)
  const backend = createFlowApiBackend({ tokenProvider: tokenManager })

  const server = createServer({
    name: "power-automate-mcp",
    version: PKG_VERSION,
    instructions: [
      "Manage Microsoft Power Automate cloud flows: list/inspect flows, debug runs, check connections and owners.",
      "Read-only by default; set ENABLE_WRITE_OPS=true to enable mutating tools.",
      "Uses Microsoft's unofficial api.flow.microsoft.com management API (labeled unsupported by Microsoft).",
    ].join(" "),
    telemetry: buildTelemetry(config),
    authenticate: buildAuthenticate(config),
  })

  const readOpts = { defaultEnvironment: config.defaultEnvironment }
  registerEnvironmentTools(server, backend)
  registerFlowReadTools(server, backend, readOpts)
  registerRunReadTools(server, backend, readOpts)
  registerConnectionTools(server, backend, readOpts)
  registerOwnerReadTools(server, backend, readOpts)

  return server
}

export type { ServerConfig } from "./auth/types.js"
export type { FlowBackend } from "./backend/index.js"
export type { Environment } from "./backend/types.js"
export { loadConfig } from "./config.js"
export { PKG_VERSION } from "./version.js"
