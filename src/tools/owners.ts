/**
 * Owner/permission tools. Read: list_flow_owners. (Write owner tools — add/remove — are
 * appended by the write batch and gated behind ENABLE_WRITE_OPS.)
 */

import type { SomaServerInstance } from "somamcp"
import { z } from "zod"

import type { FlowBackend } from "../backend/index.js"
import { appErrorToThrowable } from "../errors.js"
import { DISCLAIMER, type ReadToolOptions, renderResult, resolveEnvironment } from "./shared.js"

export const registerOwnerReadTools = (
  server: SomaServerInstance,
  backend: FlowBackend,
  opts: ReadToolOptions = {},
): void => {
  server.addTool({
    name: "list_flow_owners",
    description: [
      "List the owners/permissions on a flow.",
      "Returns: array of { principalId, principalType, roleName, principalDisplayName }.",
      "Parameters: flow (required), environment (optional).",
      DISCLAIMER,
      'Example: list_flow_owners { "flow": "<guid>" }',
    ].join("\n"),
    annotations: { readOnlyHint: true, title: "List flow owners" },
    parameters: z.object({
      environment: z
        .string()
        .optional()
        .describe("Environment id (from list_environments). Omit to use the user's default environment."),
      flow: z.string().describe("Flow GUID name (from list_flows)."),
    }),
    execute: async ({ environment, flow }) =>
      (await resolveEnvironment(backend, opts.defaultEnvironment, environment)).fold(
        (err) => {
          throw appErrorToThrowable(err)
        },
        async (env) => renderResult(await backend.listFlowOwners(env, flow)),
      ),
  })
}
