/**
 * `list_environments` — the entry point for every other tool (everything else needs an
 * environment id). Read-only.
 */

import type { SomaServerInstance } from "somamcp"
import { z } from "zod"

import type { FlowBackend } from "../backend/index.js"
import { appErrorToThrowable } from "../errors.js"

const DISCLAIMER =
  "Uses Microsoft's unofficial api.flow.microsoft.com endpoint, which Microsoft labels unsupported; behavior may change."

export const registerEnvironmentTools = (server: SomaServerInstance, backend: FlowBackend): void => {
  server.addTool({
    name: "list_environments",
    description: [
      "List the Power Automate environments visible to the signed-in user.",
      "Returns: { id, name, displayName, location, isDefault }. The entry with isDefault=true is the user's default environment, used by other tools when `environment` is omitted.",
      "Parameters: none.",
      DISCLAIMER,
      "Example: list_environments {}",
    ].join("\n"),
    annotations: { readOnlyHint: true, title: "List Power Automate environments" },
    parameters: z.object({}),
    execute: async () => {
      const result = await backend.listEnvironments()
      return result.fold(
        (err) => {
          throw appErrorToThrowable(err)
        },
        (environments) => JSON.stringify(environments, null, 2),
      )
    },
  })
}
