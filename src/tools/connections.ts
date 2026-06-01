/**
 * Read-only connection tool: list_connections.
 */

import type { SomaServerInstance } from "somamcp"
import { z } from "zod"

import type { FlowBackend } from "../backend/index.js"
import { appErrorToThrowable } from "../errors.js"
import { DISCLAIMER, type ReadToolOptions, renderResult, resolveEnvironment } from "./shared.js"

export const registerConnectionTools = (
  server: SomaServerInstance,
  backend: FlowBackend,
  opts: ReadToolOptions = {},
): void => {
  server.addTool({
    name: "list_connections",
    description: [
      "List the connections (API connectors) in an environment and their health.",
      'Returns: array of { name, apiName, displayName, status, accountName, expiresAt }. A status other than "Connected" indicates a broken/expired connection — a common cause of silently failing flows.',
      "Parameters: environment (optional).",
      DISCLAIMER,
      "Example: list_connections {}",
    ].join("\n"),
    annotations: { readOnlyHint: true, title: "List connections" },
    parameters: z.object({
      environment: z
        .string()
        .optional()
        .describe("Environment id (from list_environments). Omit to use the user's default environment."),
    }),
    execute: async ({ environment }) =>
      (await resolveEnvironment(backend, opts.defaultEnvironment, environment)).fold(
        (err) => {
          throw appErrorToThrowable(err)
        },
        async (env) => renderResult(await backend.listConnections(env)),
      ),
  })
}
