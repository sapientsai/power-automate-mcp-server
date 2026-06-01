/**
 * `GET /environments` — the Power Automate environments visible to the signed-in user.
 *
 * The default environment (id `Default-<tenantId>`) surfaces with `isDefault: true`; tools
 * that omit an explicit environment fall back to it.
 */

import type { Either } from "functype"

import type { FlowApiError } from "../../errors.js"
import type { Environment } from "../types.js"
import type { FlowApiClient } from "./client.js"

type RawEnvironment = {
  name?: string
  location?: string
  properties?: { displayName?: string; isDefault?: boolean }
}

type ListEnvelope<T> = { value?: T[] }

const mapEnvironment = (raw: RawEnvironment): Environment => ({
  id: raw.name ?? "",
  name: raw.name ?? "",
  displayName: raw.properties?.displayName ?? raw.name ?? "",
  location: raw.location ?? "",
  isDefault: raw.properties?.isDefault ?? false,
})

export const listEnvironments = async (client: FlowApiClient): Promise<Either<FlowApiError, Environment[]>> => {
  const result = await client.request<ListEnvelope<RawEnvironment>>("GET", "/environments")
  return result.map((envelope) => (envelope.value ?? []).map(mapEnvironment))
}
