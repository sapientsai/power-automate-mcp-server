/**
 * Read-only run tools: list_flow_runs, get_flow_run (the debugging workhorse).
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

export const registerRunReadTools = (
  server: SomaServerInstance,
  backend: FlowBackend,
  opts: ReadToolOptions = {},
): void => {
  server.addTool({
    name: "list_flow_runs",
    description: [
      "List recent runs of a flow, newest first.",
      "Returns: array of { name, status, startTime, endTime, durationMs, triggerName, error }. `name` is the run id used by get_flow_run.",
      "Parameters: flow (required), environment (optional), top (optional, default 20, max 100), status (optional: Succeeded/Failed/Running/Cancelled).",
      DISCLAIMER,
      'Example: list_flow_runs { "flow": "<guid>", "status": "Failed", "top": 10 }',
    ].join("\n"),
    annotations: { readOnlyHint: true, title: "List flow runs" },
    parameters: z.object({
      environment: ENV_PARAM,
      flow: z.string().describe("Flow GUID name (from list_flows)."),
      top: z.number().int().min(1).max(100).optional().describe("Max runs to return (default 20, max 100)."),
      status: z.enum(["Succeeded", "Failed", "Running", "Cancelled"]).optional().describe("Filter by run status."),
    }),
    execute: async ({ environment, flow, top, status }) =>
      (await resolveEnvironment(backend, opts.defaultEnvironment, environment)).fold(
        (err) => {
          throw appErrorToThrowable(err)
        },
        async (env) => renderResult(await backend.listRuns(env, flow, { top, status })),
      ),
  })

  server.addTool({
    name: "get_flow_run",
    description: [
      "Get one run in detail for debugging: status, timing, the triggering action, and the first-failure error code/message. The original run `properties` are included under `raw` (per-action breakdown lives there when the API provides it).",
      "Parameters: flow (required), run (required, from list_flow_runs), environment (optional).",
      DISCLAIMER,
      'Example: get_flow_run { "flow": "<guid>", "run": "<runId>" }',
    ].join("\n"),
    annotations: { readOnlyHint: true, title: "Get flow run detail" },
    parameters: z.object({
      environment: ENV_PARAM,
      flow: z.string().describe("Flow GUID name (from list_flows)."),
      run: z.string().describe("Run id (from list_flow_runs)."),
    }),
    execute: async ({ environment, flow, run }) =>
      (await resolveEnvironment(backend, opts.defaultEnvironment, environment)).fold(
        (err) => {
          throw appErrorToThrowable(err)
        },
        async (env) => renderResult(await backend.getRun(env, flow, run)),
      ),
  })
}

export const registerRunWriteTools = (
  server: SomaServerInstance,
  backend: FlowBackend,
  opts: WriteToolOptions,
): void => {
  const gated = opts.enableWrite ? "" : " [DISABLED: set ENABLE_WRITE_OPS=true]"

  server.addTool({
    name: "cancel_flow_run",
    description: [
      `Cancel an in-progress run (POST .../runs/{run}/cancel)${gated}.`,
      "Parameters: flow (required), run (required), environment (optional).",
      DISCLAIMER,
    ].join("\n"),
    annotations: { destructiveHint: true, title: "Cancel flow run" },
    parameters: z.object({
      environment: ENV_PARAM,
      flow: z.string().describe("Flow GUID name (from list_flows)."),
      run: z.string().describe("Run id (from list_flow_runs)."),
    }),
    execute: async ({ environment, flow, run }) => {
      ensureWriteEnabled(opts.enableWrite, "cancel_flow_run")
      return (await resolveEnvironment(backend, opts.defaultEnvironment, environment)).fold(
        (err) => {
          throw appErrorToThrowable(err)
        },
        async (env) =>
          (await backend.cancelFlowRun(env, flow, run)).fold(
            (err) => {
              throw appErrorToThrowable(err)
            },
            () => confirmWrite("cancel_flow_run", { environment: env, flow, run }),
          ),
      )
    },
  })

  server.addTool({
    name: "resubmit_flow_run",
    description: [
      `Resubmit (replay) a run from its trigger (POST .../triggers/{trigger}/histories/{run}/resubmit)${gated}.`,
      "Parameters: flow (required), run (required), trigger (required — trigger name from get_flow's triggers), environment (optional).",
      DISCLAIMER,
    ].join("\n"),
    annotations: { destructiveHint: true, title: "Resubmit flow run" },
    parameters: z.object({
      environment: ENV_PARAM,
      flow: z.string().describe("Flow GUID name (from list_flows)."),
      run: z.string().describe("Run id to resubmit (from list_flow_runs)."),
      trigger: z.string().describe("Trigger name (from get_flow's `triggers`)."),
    }),
    execute: async ({ environment, flow, run, trigger }) => {
      ensureWriteEnabled(opts.enableWrite, "resubmit_flow_run")
      return (await resolveEnvironment(backend, opts.defaultEnvironment, environment)).fold(
        (err) => {
          throw appErrorToThrowable(err)
        },
        async (env) =>
          (await backend.resubmitFlowRun(env, flow, trigger, run)).fold(
            (err) => {
              throw appErrorToThrowable(err)
            },
            () => confirmWrite("resubmit_flow_run", { environment: env, flow, run, trigger }),
          ),
      )
    },
  })
}
