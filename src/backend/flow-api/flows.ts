/**
 * Flow listing + detail. `GET /environments/{env}/flows[/{flow}]`.
 *
 * The owner filter matches the creator's userId/email (the API exposes the creator as an
 * object id, not a UPN — see docs/api-notes.md).
 */

import type { Either } from "functype"

import type { FlowApiError } from "../../errors.js"
import type { FlowDetail, FlowSummary } from "../types.js"
import type { FlowApiClient } from "./client.js"

type RawCreator = { userId?: string; email?: string; displayName?: string }

type RawDefinition = { triggers?: Record<string, unknown>; actions?: Record<string, unknown> }

type RawFlowProperties = {
  displayName?: string
  state?: string
  createdTime?: string
  lastModifiedTime?: string
  definition?: RawDefinition
  connectionReferences?: unknown
  creator?: RawCreator
}

type RawFlow = { name?: string; properties?: RawFlowProperties }

type ListEnvelope<T> = { value?: T[] }

export type FlowFilter = { owner?: string }

const ownerOf = (creator?: RawCreator): string | undefined => creator?.userId ?? creator?.email ?? creator?.displayName

const namesOf = (record?: Record<string, unknown>): string[] => (record ? Object.keys(record) : [])

const mapSummary = (raw: RawFlow): FlowSummary => {
  const p = raw.properties ?? {}
  return {
    name: raw.name ?? "",
    displayName: p.displayName ?? raw.name ?? "",
    state: p.state ?? "Unknown",
    createdTime: p.createdTime ?? "",
    lastModifiedTime: p.lastModifiedTime ?? "",
    owner: ownerOf(p.creator),
  }
}

export const listFlows = async (
  client: FlowApiClient,
  env: string,
  filter?: FlowFilter,
): Promise<Either<FlowApiError, FlowSummary[]>> => {
  const result = await client.request<ListEnvelope<RawFlow>>("GET", `/environments/${encodeURIComponent(env)}/flows`)
  return result.map((envelope) => {
    const flows = (envelope.value ?? []).map(mapSummary)
    const owner = filter?.owner
    return owner ? flows.filter((f) => f.owner === owner) : flows
  })
}

export const getFlow = async (
  client: FlowApiClient,
  env: string,
  flow: string,
): Promise<Either<FlowApiError, FlowDetail>> => {
  const result = await client.request<RawFlow>(
    "GET",
    `/environments/${encodeURIComponent(env)}/flows/${encodeURIComponent(flow)}`,
  )
  return result.map((raw) => {
    const definition = raw.properties?.definition
    return {
      ...mapSummary(raw),
      definition,
      connectionReferences: raw.properties?.connectionReferences,
      triggers: namesOf(definition?.triggers),
      actions: namesOf(definition?.actions),
    }
  })
}

// ── Write ─────────────────────────────────────────────────────────────

export const enableFlow = (client: FlowApiClient, env: string, flow: string): Promise<Either<FlowApiError, unknown>> =>
  client.request<unknown>("POST", `/environments/${encodeURIComponent(env)}/flows/${encodeURIComponent(flow)}/start`)

export const disableFlow = (client: FlowApiClient, env: string, flow: string): Promise<Either<FlowApiError, unknown>> =>
  client.request<unknown>("POST", `/environments/${encodeURIComponent(env)}/flows/${encodeURIComponent(flow)}/stop`)

export type CreateFlowInput = {
  displayName: string
  definition: unknown
  connectionReferences?: unknown
  state?: "Started" | "Stopped"
}

/** Create a flow. Verified: POST .../flows with `{ properties: { displayName, state, definition, connectionReferences } }`. */
export const createFlow = (
  client: FlowApiClient,
  env: string,
  input: CreateFlowInput,
): Promise<Either<FlowApiError, FlowDetail>> =>
  client
    .request<RawFlow>("POST", `/environments/${encodeURIComponent(env)}/flows`, {
      body: {
        properties: {
          displayName: input.displayName,
          state: input.state ?? "Stopped",
          definition: input.definition,
          connectionReferences: input.connectionReferences ?? {},
        },
      },
    })
    .then((result) =>
      result.map((raw) => {
        const definition = raw.properties?.definition
        return {
          ...mapSummary(raw),
          definition,
          connectionReferences: raw.properties?.connectionReferences,
          triggers: namesOf(definition?.triggers),
          actions: namesOf(definition?.actions),
        }
      }),
    )

export type UpdateFlowInput = {
  displayName?: string
  definition?: unknown
  connectionReferences?: unknown
  state?: "Started" | "Stopped"
}

/** Patch a flow's properties (only the provided fields). PATCH .../flows/{flow}. */
export const updateFlow = (
  client: FlowApiClient,
  env: string,
  flow: string,
  changes: UpdateFlowInput,
): Promise<Either<FlowApiError, unknown>> => {
  const properties: Record<string, unknown> = {}
  if (changes.displayName !== undefined) properties.displayName = changes.displayName
  if (changes.definition !== undefined) properties.definition = changes.definition
  if (changes.connectionReferences !== undefined) properties.connectionReferences = changes.connectionReferences
  if (changes.state !== undefined) properties.state = changes.state
  return client.request<unknown>(
    "PATCH",
    `/environments/${encodeURIComponent(env)}/flows/${encodeURIComponent(flow)}`,
    {
      body: { properties },
    },
  )
}

export const deleteFlow = (client: FlowApiClient, env: string, flow: string): Promise<Either<FlowApiError, unknown>> =>
  client.request<unknown>("DELETE", `/environments/${encodeURIComponent(env)}/flows/${encodeURIComponent(flow)}`)
