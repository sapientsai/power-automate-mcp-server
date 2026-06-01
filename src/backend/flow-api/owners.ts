/**
 * Flow ownership/permissions. `GET /environments/{env}/flows/{flow}/permissions`.
 */

import type { Either } from "functype"

import type { FlowApiError } from "../../errors.js"
import type { FlowOwner } from "../types.js"
import type { FlowApiClient } from "./client.js"

type RawPrincipal = { id?: string; type?: string; displayName?: string; email?: string; tenantId?: string }

type RawPermissionProperties = { principal?: RawPrincipal; roleName?: string }

type RawPermission = { name?: string; properties?: RawPermissionProperties }

type ListEnvelope<T> = { value?: T[] }

const mapOwner = (raw: RawPermission): FlowOwner => {
  const principal = raw.properties?.principal ?? {}
  return {
    principalId: principal.id ?? raw.name ?? "",
    principalType: principal.type ?? "Unknown",
    roleName: raw.properties?.roleName ?? "Unknown",
    principalDisplayName: principal.displayName ?? principal.email,
  }
}

export const listFlowOwners = async (
  client: FlowApiClient,
  env: string,
  flow: string,
): Promise<Either<FlowApiError, FlowOwner[]>> => {
  const result = await client.request<ListEnvelope<RawPermission>>(
    "GET",
    `/environments/${encodeURIComponent(env)}/flows/${encodeURIComponent(flow)}/permissions`,
  )
  return result.map((envelope) => (envelope.value ?? []).map(mapOwner))
}

// ── Write ─────────────────────────────────────────────────────────────

export type OwnerRole = "CanEdit" | "CanView"

/**
 * Grant a principal a role on a flow. The exact PUT permissions body shape for this
 * unofficial endpoint is not firmly documented — verify against the portal's network tab
 * and update docs/api-notes.md if the API rejects this payload.
 */
export const addFlowOwner = (
  client: FlowApiClient,
  env: string,
  flow: string,
  principalId: string,
  roleName: OwnerRole,
): Promise<Either<FlowApiError, unknown>> =>
  client.request<unknown>(
    "PUT",
    `/environments/${encodeURIComponent(env)}/flows/${encodeURIComponent(flow)}/permissions/${encodeURIComponent(
      principalId,
    )}`,
    { body: { properties: { principal: { id: principalId, type: "User" }, roleName } } },
  )

export const removeFlowOwner = (
  client: FlowApiClient,
  env: string,
  flow: string,
  principalId: string,
): Promise<Either<FlowApiError, unknown>> =>
  client.request<unknown>(
    "DELETE",
    `/environments/${encodeURIComponent(env)}/flows/${encodeURIComponent(flow)}/permissions/${encodeURIComponent(
      principalId,
    )}`,
  )
