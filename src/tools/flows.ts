/**
 * Read-only flow tools: list_flows, get_flow.
 */

import type { SomaServerInstance } from "somamcp"
import { z } from "zod"

import type { FlowBackend } from "../backend/index.js"
import { appErrorToThrowable } from "../errors.js"
import { DISCLAIMER, type ReadToolOptions, renderResult, resolveEnvironment } from "./shared.js"

const ENV_PARAM = z
  .string()
  .optional()
  .describe("Environment id (from list_environments). Omit to use the user's default environment.")

export const registerFlowReadTools = (
  server: SomaServerInstance,
  backend: FlowBackend,
  opts: ReadToolOptions = {},
): void => {
  server.addTool({
    name: "list_flows",
    description: [
      "List cloud flows in an environment.",
      "Returns: array of { name, displayName, state, createdTime, lastModifiedTime, owner }. `name` is the flow GUID used by the other flow tools; `state` is Started/Stopped/Suspended.",
      "Parameters: environment (optional), owner (optional — filter by creator userId/email).",
      DISCLAIMER,
      'Example: list_flows { "owner": "user@contoso.com" }',
    ].join("\n"),
    annotations: { readOnlyHint: true, title: "List Power Automate flows" },
    parameters: z.object({
      environment: ENV_PARAM,
      owner: z.string().optional().describe("Filter to flows created by this principal (userId or email)."),
    }),
    execute: async ({ environment, owner }) =>
      (await resolveEnvironment(backend, opts.defaultEnvironment, environment)).fold(
        (err) => {
          throw appErrorToThrowable(err)
        },
        async (env) => renderResult(await backend.listFlows(env, owner ? { owner } : undefined)),
      ),
  })

  server.addTool({
    name: "get_flow",
    description: [
      "Get the full definition of one flow: state, timestamps, owner, the workflow `definition` JSON, connectionReferences, and parsed trigger/action names.",
      "Parameters: flow (required, GUID from list_flows), environment (optional).",
      DISCLAIMER,
      'Example: get_flow { "flow": "00000000-0000-0000-0000-000000000000" }',
    ].join("\n"),
    annotations: { readOnlyHint: true, title: "Get flow definition" },
    parameters: z.object({
      environment: ENV_PARAM,
      flow: z.string().describe("Flow GUID name (from list_flows)."),
    }),
    execute: async ({ environment, flow }) =>
      (await resolveEnvironment(backend, opts.defaultEnvironment, environment)).fold(
        (err) => {
          throw appErrorToThrowable(err)
        },
        async (env) => renderResult(await backend.getFlow(env, flow)),
      ),
  })
}
