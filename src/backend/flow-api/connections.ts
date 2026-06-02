/**
 * Connection listing.
 *
 * Connections do NOT live on the global `api.flow.microsoft.com` (every path there 404s).
 * They're served by the environment's **regional PowerApps host**, advertised on the
 * environment object as `properties.runtimeEndpoints["microsoft.PowerApps"]` (e.g.
 * `https://unitedstates.api.powerapps.com`). So we resolve that host first, then query
 * `<host>/providers/Microsoft.PowerApps/connections?$filter=environment eq '<env>'`. The
 * Flow-audience token is accepted there — no separate PowerApps token needed.
 *
 * `status !== "Connected"` flags a broken/expired connection — the common root cause of a
 * flow that silently stops working.
 */

import { type Either, Left, Right } from "functype"

import { type FlowApiError, leftFlowApi } from "../../errors.js"
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

type RawEnvironmentDetail = { properties?: { runtimeEndpoints?: Record<string, string> } }

/** Resolve the environment's regional PowerApps host (where connections are served). */
const resolvePowerAppsHost = async (client: FlowApiClient, env: string): Promise<Either<FlowApiError, string>> => {
  const result = await client.request<RawEnvironmentDetail>("GET", `/environments/${encodeURIComponent(env)}`)
  return result.flatMap((raw) => {
    const host = raw.properties?.runtimeEndpoints?.["microsoft.PowerApps"]
    return host
      ? Right(host)
      : leftFlowApi<string>(
          "not_found",
          `could not resolve the PowerApps host (runtimeEndpoints) for environment ${env}`,
        )
  })
}

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
  const hostResult = await resolvePowerAppsHost(client, env)
  return hostResult.fold(
    async (err): Promise<Either<FlowApiError, Connection[]>> => Left(err),
    async (host): Promise<Either<FlowApiError, Connection[]>> => {
      const result = await client.request<ListEnvelope<RawConnection>>(
        "GET",
        "/providers/Microsoft.PowerApps/connections",
        { baseUrl: host, query: { $filter: `environment eq '${env}'` } },
      )
      return result.map((envelope) => (envelope.value ?? []).map(mapConnection))
    },
  )
}
