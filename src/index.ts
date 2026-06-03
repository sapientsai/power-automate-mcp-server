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
  createFeedbackTool,
  createGithubFeedback,
  createJsonFileTelemetry,
  createServer,
  type SomaServerInstance,
  type TelemetryCollector,
} from "somamcp"

import { createTokenManager } from "./auth/token-manager.js"
import type { ServerConfig, TelemetrySink } from "./auth/types.js"
import { createFlowApiBackend } from "./backend/index.js"
import { registerConnectionTools } from "./tools/connections.js"
import { registerEnvironmentTools } from "./tools/environments.js"
import { registerFlowReadTools, registerFlowWriteTools } from "./tools/flows.js"
import { registerOwnerReadTools, registerOwnerWriteTools } from "./tools/owners.js"
import { registerRunReadTools, registerRunWriteTools } from "./tools/runs.js"
import { PKG_VERSION } from "./version.js"

/**
 * Which telemetry sinks are active for a given config. The console sink writes events to
 * stdout — which IS the JSON-RPC channel on the stdio transport — so it is suppressed there
 * (emitting on stdout corrupts the protocol and an MCP client like Claude Desktop disconnects
 * with "Invalid JSON-RPC message"). Our own diagnostics already go to stderr. Exported for tests.
 */
export const activeTelemetrySinks = (config: ServerConfig): ReadonlyArray<TelemetrySink> => [
  ...(config.transport !== "stdio" && config.telemetry.includes("console") ? (["console"] as const) : []),
  ...(config.telemetry.includes("file") ? (["file"] as const) : []),
]

const buildTelemetry = (config: ServerConfig): TelemetryCollector | undefined => {
  const sinks = activeTelemetrySinks(config)
  const collectors: TelemetryCollector[] = []
  if (sinks.includes("console")) collectors.push(createConsoleTelemetry("[power-automate]"))
  if (sinks.includes("file")) collectors.push(createJsonFileTelemetry({ filePath: config.telemetryFilePath }))
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
  const writeOpts = { defaultEnvironment: config.defaultEnvironment, enableWrite: config.enableWriteOps }

  registerEnvironmentTools(server, backend)
  registerFlowReadTools(server, backend, readOpts)
  registerRunReadTools(server, backend, readOpts)
  registerConnectionTools(server, backend, readOpts)
  registerOwnerReadTools(server, backend, readOpts)

  registerFlowWriteTools(server, backend, writeOpts)
  registerRunWriteTools(server, backend, writeOpts)
  registerOwnerWriteTools(server, backend, writeOpts)

  // report_feedback — lets agents self-report API drift / bugs as GitHub issues.
  // Submits only when GITHUB_TOKEN is set; otherwise the tool reports that gracefully.
  server.addTool(
    createFeedbackTool({
      name: "report_feedback",
      extraLabels: ["mcp-feedback"],
      provider: createGithubFeedback({
        repo: config.feedbackRepo as `${string}/${string}`,
        getToken: () => process.env.GITHUB_TOKEN || undefined,
      }),
    }),
  )

  return server
}

export type { ServerConfig } from "./auth/types.js"
export type { FlowBackend } from "./backend/index.js"
export type { Environment } from "./backend/types.js"
export { loadConfig } from "./config.js"
export { PKG_VERSION } from "./version.js"
