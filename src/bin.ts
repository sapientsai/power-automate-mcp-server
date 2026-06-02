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

import { createTokenManager } from "./auth/token-manager.js"
import { loadConfig } from "./config.js"
import { createPowerAutomateServer } from "./index.js"

/**
 * `--login`: run the device-code (or client-credentials) sign-in once, interactively, then
 * exit. Use this in a terminal to pre-auth — the cached token then feeds the MCP server when
 * an MCP client spawns it over stdio (where the device-code prompt would otherwise be hidden).
 */
const runLogin = async (config: Parameters<typeof createPowerAutomateServer>[0]): Promise<void> => {
  console.error("[power-automate] starting sign-in — follow the device-code prompt below…\n")
  const result = await createTokenManager(config, { log: (m) => console.error(m) }).getToken()
  result.fold(
    (err) => {
      console.error(`\n[power-automate] sign-in FAILED: ${err.message}`)
      process.exit(1)
    },
    () => {
      console.error("\n[power-automate] sign-in OK — token cached. The winning scope is logged above.")
      console.error(`[power-automate] cache: ${config.tokenCachePath}`)
      process.exit(0)
    },
  )
}

const main = async (): Promise<void> => {
  await loadConfig().fold(
    async (err): Promise<void> => {
      console.error(`[power-automate] configuration error: ${err.message}`)
      process.exit(1)
    },
    async (config): Promise<void> => {
      if (process.argv.includes("--login")) {
        await runLogin(config)
        return
      }

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
