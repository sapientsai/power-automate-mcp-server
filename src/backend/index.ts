/**
 * The {@link FlowBackend} seam — the contract every tool depends on, independent of which
 * Microsoft surface answers it.
 *
 * Named `FlowBackend` (not `BackendAdapter`) deliberately: SomaMCP exports its own
 * `BackendAdapter` for the MCP *transport* layer, which is a different concern.
 *
 * v1 ships only {@link createFlowApiBackend} (api.flow.microsoft.com). A future Dataverse
 * backend (see ./dataverse/README.md) would implement the same interface from
 * `<org>.dynamics.com/api/data/v9.2/workflows`.
 */

import { type Either, Right } from "functype"

import type { TokenProvider } from "../auth/token-manager.js"
import { type FlowApiError, leftFlowApi } from "../errors.js"
import { createFlowApiClient } from "./flow-api/client.js"
import { listConnections } from "./flow-api/connections.js"
import { listEnvironments } from "./flow-api/environments.js"
import { type FlowFilter, getFlow, listFlows } from "./flow-api/flows.js"
import { listFlowOwners } from "./flow-api/owners.js"
import { getRun, listRuns, type RunListOpts } from "./flow-api/runs.js"
import type { Connection, Environment, FlowDetail, FlowOwner, FlowSummary, RunDetail, RunSummary } from "./types.js"

export type { FlowFilter } from "./flow-api/flows.js"
export type { RunListOpts } from "./flow-api/runs.js"

export type FlowBackend = {
  listEnvironments: () => Promise<Either<FlowApiError, Environment[]>>
  /** Resolve the user's default environment id (isDefault, else first). */
  resolveDefaultEnvironment: () => Promise<Either<FlowApiError, string>>
  listFlows: (env: string, filter?: FlowFilter) => Promise<Either<FlowApiError, FlowSummary[]>>
  getFlow: (env: string, flow: string) => Promise<Either<FlowApiError, FlowDetail>>
  listRuns: (env: string, flow: string, opts?: RunListOpts) => Promise<Either<FlowApiError, RunSummary[]>>
  getRun: (env: string, flow: string, run: string) => Promise<Either<FlowApiError, RunDetail>>
  listConnections: (env: string) => Promise<Either<FlowApiError, Connection[]>>
  listFlowOwners: (env: string, flow: string) => Promise<Either<FlowApiError, FlowOwner[]>>
}

export const createFlowApiBackend = (deps: { tokenProvider: TokenProvider }): FlowBackend => {
  const client = createFlowApiClient({ tokenProvider: deps.tokenProvider })

  return {
    listEnvironments: () => listEnvironments(client),
    resolveDefaultEnvironment: async () => {
      const envs = await listEnvironments(client)
      return envs.flatMap((list) => {
        const def = list.find((e) => e.isDefault) ?? list[0]
        return def ? Right(def.id) : leftFlowApi<string>("not_found", "no environments available to resolve a default")
      })
    },
    listFlows: (env, filter) => listFlows(client, env, filter),
    getFlow: (env, flow) => getFlow(client, env, flow),
    listRuns: (env, flow, opts) => listRuns(client, env, flow, opts),
    getRun: (env, flow, run) => getRun(client, env, flow, run),
    listConnections: (env) => listConnections(client, env),
    listFlowOwners: (env, flow) => listFlowOwners(client, env, flow),
  }
}
