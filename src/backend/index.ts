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

import type { Either } from "functype"

import type { TokenProvider } from "../auth/token-manager.js"
import type { FlowApiError } from "../errors.js"
import { createFlowApiClient } from "./flow-api/client.js"
import { listEnvironments } from "./flow-api/environments.js"
import type { Environment } from "./types.js"

export type FlowBackend = {
  listEnvironments: () => Promise<Either<FlowApiError, Environment[]>>
}

export const createFlowApiBackend = (deps: { tokenProvider: TokenProvider }): FlowBackend => {
  const client = createFlowApiClient({ tokenProvider: deps.tokenProvider })
  return {
    listEnvironments: () => listEnvironments(client),
  }
}
