/**
 * Run listing + detail. `GET /environments/{env}/flows/{flow}/runs[/{run}]`.
 *
 * get_flow_run is the debugging workhorse: it surfaces status, the failing trigger/error,
 * and keeps the original `properties` blob in `raw` so per-action detail (when the API
 * includes it) is available to the agent.
 */

import type { Either } from "functype"

import type { FlowApiError } from "../../errors.js"
import type { RunDetail, RunSummary } from "../types.js"
import type { FlowApiClient } from "./client.js"

type RawTrigger = { name?: string; status?: string; code?: string }
type RawRunError = { code?: string; message?: string }

type RawRunProperties = {
  status?: string
  startTime?: string
  endTime?: string
  trigger?: RawTrigger
  error?: RawRunError
  code?: string
}

type RawRun = { name?: string; properties?: RawRunProperties }

type ListEnvelope<T> = { value?: T[] }

export type RunListOpts = { top?: number; status?: string }

const durationMs = (start?: string, end?: string): number | undefined => {
  if (!start || !end) return undefined
  const s = Date.parse(start)
  const e = Date.parse(end)
  return Number.isFinite(s) && Number.isFinite(e) ? e - s : undefined
}

const mapRunSummary = (raw: RawRun): RunSummary => {
  const p = raw.properties ?? {}
  return {
    name: raw.name ?? "",
    status: p.status ?? "Unknown",
    startTime: p.startTime ?? "",
    endTime: p.endTime,
    durationMs: durationMs(p.startTime, p.endTime),
    triggerName: p.trigger?.name,
    error: p.error?.message,
  }
}

export const listRuns = async (
  client: FlowApiClient,
  env: string,
  flow: string,
  opts: RunListOpts = {},
): Promise<Either<FlowApiError, RunSummary[]>> => {
  const top = Math.min(Math.max(opts.top ?? 20, 1), 100)
  const result = await client.request<ListEnvelope<RawRun>>(
    "GET",
    `/environments/${encodeURIComponent(env)}/flows/${encodeURIComponent(flow)}/runs`,
    { query: { $top: top } },
  )
  return result.map((envelope) => {
    const runs = (envelope.value ?? []).map(mapRunSummary)
    const status = opts.status
    return status ? runs.filter((r) => r.status.toLowerCase() === status.toLowerCase()) : runs
  })
}

export const getRun = async (
  client: FlowApiClient,
  env: string,
  flow: string,
  run: string,
): Promise<Either<FlowApiError, RunDetail>> => {
  const result = await client.request<RawRun>(
    "GET",
    `/environments/${encodeURIComponent(env)}/flows/${encodeURIComponent(flow)}/runs/${encodeURIComponent(run)}`,
  )
  return result.map((raw) => ({
    ...mapRunSummary(raw),
    errorCode: raw.properties?.error?.code ?? raw.properties?.code,
    raw: raw.properties,
  }))
}

// ── Write ─────────────────────────────────────────────────────────────

export const cancelRun = (
  client: FlowApiClient,
  env: string,
  flow: string,
  run: string,
): Promise<Either<FlowApiError, unknown>> =>
  client.request<unknown>(
    "POST",
    `/environments/${encodeURIComponent(env)}/flows/${encodeURIComponent(flow)}/runs/${encodeURIComponent(run)}/cancel`,
  )

export const resubmitRun = (
  client: FlowApiClient,
  env: string,
  flow: string,
  trigger: string,
  run: string,
): Promise<Either<FlowApiError, unknown>> =>
  client.request<unknown>(
    "POST",
    `/environments/${encodeURIComponent(env)}/flows/${encodeURIComponent(flow)}/triggers/${encodeURIComponent(
      trigger,
    )}/histories/${encodeURIComponent(run)}/resubmit`,
  )
