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
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const runLogin = async (config: Parameters<typeof createPowerAutomateServer>[0]): Promise<void> => {
  console.error("[power-automate] starting sign-in — follow the device-code prompt below…\n")
  const tokenManager = createTokenManager(config, { log: (m) => console.error(m) })

  // getToken issues the device code and returns immediately with `device_code_pending` while
  // the token completes in the background. Poll it until the cached token appears (success) or
  // a non-pending error occurs.
  let promptShown = false
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await tokenManager.getToken()
    const finished = result.fold(
      (err): boolean => {
        if (err.reason === "device_code_pending") {
          if (!promptShown) {
            console.error(`\n${err.message}\n`)
            promptShown = true
          }
          return false
        }
        console.error(`\n[power-automate] sign-in FAILED: ${err.message}`)
        process.exit(1)
      },
      (): boolean => {
        console.error("\n[power-automate] sign-in OK — token cached.")
        console.error(`[power-automate] cache: ${config.tokenCachePath}`)
        process.exit(0)
      },
    )
    if (!finished) await sleep(3000)
  }
  console.error("\n[power-automate] sign-in timed out waiting for completion.")
  process.exit(1)
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
