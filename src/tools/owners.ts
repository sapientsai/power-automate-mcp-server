/**
 * Owner/permission tools. Read: list_flow_owners. (Write owner tools — add/remove — are
 * appended by the write batch and gated behind ENABLE_WRITE_OPS.)
 */

import type { SomaServerInstance } from "somamcp"
import { z } from "zod"

import type { FlowBackend } from "../backend/index.js"
import { appErrorToThrowable } from "../errors.js"
import {
  confirmWrite,
  DISCLAIMER,
  ensureWriteEnabled,
  type ReadToolOptions,
  renderResult,
  resolveEnvironment,
  type WriteToolOptions,
} from "./shared.js"

const ENV_PARAM = z
  .string()
  .optional()
  .describe("Environment id (from list_environments). Omit to use the user's default environment.")

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

export const registerOwnerWriteTools = (
  server: SomaServerInstance,
  backend: FlowBackend,
  opts: WriteToolOptions,
): void => {
  const gated = opts.enableWrite ? "" : " [DISABLED: set ENABLE_WRITE_OPS=true]"

  server.addTool({
    name: "add_flow_owner",
    description: [
      `Grant a principal a role on a flow (PUT .../permissions/{principalId})${gated}.`,
      "Parameters: flow (required), principalId (required — AAD object id), roleName (CanEdit|CanView), environment (optional).",
      DISCLAIMER,
    ].join("\n"),
    annotations: { destructiveHint: true, title: "Add flow owner" },
    parameters: z.object({
      environment: ENV_PARAM,
      flow: z.string().describe("Flow GUID name (from list_flows)."),
      principalId: z.string().describe("Azure AD object id of the user/group to grant."),
      roleName: z.enum(["CanEdit", "CanView"]).describe("Role to grant."),
    }),
    execute: async ({ environment, flow, principalId, roleName }) => {
      ensureWriteEnabled(opts.enableWrite, "add_flow_owner")
      return (await resolveEnvironment(backend, opts.defaultEnvironment, environment)).fold(
        (err) => {
          throw appErrorToThrowable(err)
        },
        async (env) =>
          (await backend.addFlowOwner(env, flow, principalId, roleName)).fold(
            (err) => {
              throw appErrorToThrowable(err)
            },
            () => confirmWrite("add_flow_owner", { environment: env, flow, principalId, roleName }),
          ),
      )
    },
  })

  server.addTool({
    name: "remove_flow_owner",
    description: [
      `Revoke a principal's access to a flow (DELETE .../permissions/{principalId})${gated}.`,
      "Parameters: flow (required), principalId (required), environment (optional).",
      DISCLAIMER,
    ].join("\n"),
    annotations: { destructiveHint: true, title: "Remove flow owner" },
    parameters: z.object({
      environment: ENV_PARAM,
      flow: z.string().describe("Flow GUID name (from list_flows)."),
      principalId: z.string().describe("Azure AD object id of the user/group to revoke."),
    }),
    execute: async ({ environment, flow, principalId }) => {
      ensureWriteEnabled(opts.enableWrite, "remove_flow_owner")
      return (await resolveEnvironment(backend, opts.defaultEnvironment, environment)).fold(
        (err) => {
          throw appErrorToThrowable(err)
        },
        async (env) =>
          (await backend.removeFlowOwner(env, flow, principalId)).fold(
            (err) => {
              throw appErrorToThrowable(err)
            },
            () => confirmWrite("remove_flow_owner", { environment: env, flow, principalId }),
          ),
      )
    },
  })
}
