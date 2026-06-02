/**
 * Read-only flow tools: list_flows, get_flow.
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

export const registerFlowWriteTools = (
  server: SomaServerInstance,
  backend: FlowBackend,
  opts: WriteToolOptions,
): void => {
  const gated = opts.enableWrite ? "" : " [DISABLED: set ENABLE_WRITE_OPS=true]"

  server.addTool({
    name: "enable_flow",
    description: [
      `Turn a flow on (POST .../start)${gated}.`,
      "Parameters: flow (required), environment (optional). Verify with get_flow (state -> Started).",
      DISCLAIMER,
    ].join("\n"),
    annotations: { destructiveHint: true, title: "Enable flow" },
    parameters: z.object({
      environment: ENV_PARAM,
      flow: z.string().describe("Flow GUID name (from list_flows)."),
    }),
    execute: async ({ environment, flow }) => {
      ensureWriteEnabled(opts.enableWrite, "enable_flow")
      return (await resolveEnvironment(backend, opts.defaultEnvironment, environment)).fold(
        (err) => {
          throw appErrorToThrowable(err)
        },
        async (env) =>
          (await backend.enableFlow(env, flow)).fold(
            (err) => {
              throw appErrorToThrowable(err)
            },
            () => confirmWrite("enable_flow", { environment: env, flow }),
          ),
      )
    },
  })

  server.addTool({
    name: "disable_flow",
    description: [
      `Turn a flow off (POST .../stop)${gated}.`,
      "Parameters: flow (required), environment (optional). Verify with get_flow (state -> Stopped).",
      DISCLAIMER,
    ].join("\n"),
    annotations: { destructiveHint: true, title: "Disable flow" },
    parameters: z.object({
      environment: ENV_PARAM,
      flow: z.string().describe("Flow GUID name (from list_flows)."),
    }),
    execute: async ({ environment, flow }) => {
      ensureWriteEnabled(opts.enableWrite, "disable_flow")
      return (await resolveEnvironment(backend, opts.defaultEnvironment, environment)).fold(
        (err) => {
          throw appErrorToThrowable(err)
        },
        async (env) =>
          (await backend.disableFlow(env, flow)).fold(
            (err) => {
              throw appErrorToThrowable(err)
            },
            () => confirmWrite("disable_flow", { environment: env, flow }),
          ),
      )
    },
  })

  server.addTool({
    name: "create_flow",
    description: [
      `Create a new cloud flow from a workflow definition (POST .../flows)${gated}.`,
      "Parameters: displayName (required); definition (required — the workflow definition JSON with $schema, triggers, actions); connectionReferences (optional); state (Started|Stopped, default Stopped); environment (optional). Returns the created flow.",
      "Authoring a valid definition is non-trivial — use get_flow on an existing flow as a template. Connection-dependent actions also need matching connectionReferences.",
      DISCLAIMER,
    ].join("\n"),
    annotations: { destructiveHint: true, title: "Create flow" },
    parameters: z.object({
      environment: ENV_PARAM,
      displayName: z.string().describe("Display name for the new flow."),
      definition: z
        .record(z.string(), z.unknown())
        .describe("Workflow definition JSON: $schema, contentVersion, parameters, triggers, actions."),
      connectionReferences: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Connection references the definition uses (match get_flow's connectionReferences shape)."),
      state: z.enum(["Started", "Stopped"]).optional().describe("Initial state (default Stopped)."),
    }),
    execute: async ({ environment, displayName, definition, connectionReferences, state }) => {
      ensureWriteEnabled(opts.enableWrite, "create_flow")
      return (await resolveEnvironment(backend, opts.defaultEnvironment, environment)).fold(
        (err) => {
          throw appErrorToThrowable(err)
        },
        async (env) =>
          renderResult(await backend.createFlow(env, { displayName, definition, connectionReferences, state })),
      )
    },
  })

  server.addTool({
    name: "update_flow",
    description: [
      `Update an existing flow's properties — only the fields you pass (PATCH .../flows/{flow})${gated}.`,
      "Parameters: flow (required); any of displayName, definition (full workflow JSON), state (Started|Stopped), connectionReferences; environment (optional).",
      "To edit logic safely: get_flow first, modify the returned `definition`, then pass the whole definition back here.",
      DISCLAIMER,
    ].join("\n"),
    annotations: { destructiveHint: true, title: "Update flow" },
    parameters: z.object({
      environment: ENV_PARAM,
      flow: z.string().describe("Flow GUID name (from list_flows)."),
      displayName: z.string().optional().describe("New display name."),
      definition: z.record(z.string(), z.unknown()).optional().describe("Replacement workflow definition JSON."),
      connectionReferences: z.record(z.string(), z.unknown()).optional().describe("Replacement connection references."),
      state: z.enum(["Started", "Stopped"]).optional().describe("New state."),
    }),
    execute: async ({ environment, flow, displayName, definition, connectionReferences, state }) => {
      ensureWriteEnabled(opts.enableWrite, "update_flow")
      return (await resolveEnvironment(backend, opts.defaultEnvironment, environment)).fold(
        (err) => {
          throw appErrorToThrowable(err)
        },
        async (env) =>
          (await backend.updateFlow(env, flow, { displayName, definition, connectionReferences, state })).fold(
            (err) => {
              throw appErrorToThrowable(err)
            },
            () => confirmWrite("update_flow", { environment: env, flow }),
          ),
      )
    },
  })

  server.addTool({
    name: "delete_flow",
    description: [
      `Permanently delete a flow (DELETE .../flows/{flow})${gated}.`,
      "Parameters: flow (required); confirm (must be true — guard against accidents); environment (optional). This cannot be undone.",
      DISCLAIMER,
    ].join("\n"),
    annotations: { destructiveHint: true, title: "Delete flow" },
    parameters: z.object({
      environment: ENV_PARAM,
      flow: z.string().describe("Flow GUID name (from list_flows)."),
      confirm: z.boolean().describe("Must be true to actually delete."),
    }),
    execute: async ({ environment, flow, confirm }) => {
      ensureWriteEnabled(opts.enableWrite, "delete_flow")
      if (!confirm) {
        throw new Error("delete_flow requires confirm=true — no flow was deleted.")
      }
      return (await resolveEnvironment(backend, opts.defaultEnvironment, environment)).fold(
        (err) => {
          throw appErrorToThrowable(err)
        },
        async (env) =>
          (await backend.deleteFlow(env, flow)).fold(
            (err) => {
              throw appErrorToThrowable(err)
            },
            () => confirmWrite("delete_flow", { environment: env, flow }),
          ),
      )
    },
  })
}
