#!/usr/bin/env node
/**
 * CLI entry point. Loads config from the environment (.env supported via dotenv), builds the
 * server, and starts the chosen transport.
 *
 *   power-automate-mcp-server            # transport from TRANSPORT env (default stdio)
 *   power-automate-mcp-server --stdio    # force stdio regardless of TRANSPORT
 *
 * On the interactive auth path the device-code prompt is written to stderr, keeping stdout
 * clean for the stdio MCP protocol.
 */

import "dotenv/config"

import { loadConfig } from "./config.js"
import { createPowerAutomateServer } from "./index.js"

const main = async (): Promise<void> => {
  await loadConfig().fold(
    async (err): Promise<void> => {
      console.error(`[power-automate] configuration error: ${err.message}`)
      process.exit(1)
    },
    async (config): Promise<void> => {
      const transport = process.argv.includes("--stdio") ? "stdio" : config.transport
      const server = createPowerAutomateServer({ ...config, transport })

      if (transport === "http") {
        await server.start({
          transportType: "httpStream",
          httpStream: { port: config.port, endpoint: config.endpoint },
        })
        console.error(`[power-automate] listening on http://localhost:${config.port}${config.endpoint}`)
      } else {
        await server.start({ transportType: "stdio" })
        console.error("[power-automate] running on stdio")
      }
    },
  )
}

void main()
