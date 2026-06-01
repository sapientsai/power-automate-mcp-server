/**
 * Connection listing. `GET /environments/{env}/connections`.
 *
 * `status !== "Connected"` flags a broken/expired connection — the common root cause of a
 * flow that silently stops working.
 */

import type { Either } from "functype"

import type { FlowApiError } from "../../errors.js"
import type { Connection } from "../types.js"
import type { FlowApiClient } from "./client.js"

type RawApi = { name?: string; displayName?: string }
type RawStatus = { status?: string }

type RawConnectionProperties = {
  displayName?: string
  apiId?: string
  api?: RawApi
  statuses?: RawStatus[]
  status?: string
  accountName?: string
  createdBy?: { displayName?: string; email?: string }
  expirationTime?: string
  expiresAt?: string
}

type RawConnection = { name?: string; properties?: RawConnectionProperties }

type ListEnvelope<T> = { value?: T[] }

const apiNameOf = (p: RawConnectionProperties): string => {
  if (p.api?.name) return p.api.name
  if (p.apiId) return p.apiId.split("/").filter(Boolean).pop() ?? p.apiId
  return ""
}

const statusOf = (p: RawConnectionProperties): string => p.statuses?.[0]?.status ?? p.status ?? "Unknown"

const mapConnection = (raw: RawConnection): Connection => {
  const p = raw.properties ?? {}
  return {
    name: raw.name ?? "",
    apiName: apiNameOf(p),
    displayName: p.displayName ?? raw.name ?? "",
    status: statusOf(p),
    accountName: p.accountName ?? p.createdBy?.email ?? p.createdBy?.displayName,
    expiresAt: p.expirationTime ?? p.expiresAt,
  }
}

export const listConnections = async (
  client: FlowApiClient,
  env: string,
): Promise<Either<FlowApiError, Connection[]>> => {
  const result = await client.request<ListEnvelope<RawConnection>>(
    "GET",
    `/environments/${encodeURIComponent(env)}/connections`,
  )
  return result.map((envelope) => (envelope.value ?? []).map(mapConnection))
}
