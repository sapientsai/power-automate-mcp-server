/**
 * Helpers shared by every tool module: environment resolution and Either → tool-result
 * rendering. Keeping these here avoids repeating the fold/throw ceremony in each tool.
 */

import { type Either, Right } from "functype"
import { z } from "zod"

import type { FlowBackend } from "../backend/index.js"
import { type AppError, appErrorToThrowable, type FlowApiError } from "../errors.js"

export const DISCLAIMER =
  "Uses Microsoft's unofficial api.flow.microsoft.com endpoint, which Microsoft labels unsupported; behavior may change."

export type ReadToolOptions = { defaultEnvironment?: string }

export type WriteToolOptions = ReadToolOptions & { enableWrite: boolean }

/**
 * Resolve the environment for a tool call: explicit parameter, else the configured
 * DEFAULT_ENVIRONMENT, else the user's default environment discovered from the API.
 */
export const resolveEnvironment = async (
  backend: FlowBackend,
  defaultEnv: string | undefined,
  explicit?: string,
): Promise<Either<FlowApiError, string>> => {
  if (explicit) return Right(explicit)
  if (defaultEnv) return Right(defaultEnv)
  return backend.resolveDefaultEnvironment()
}

/** Render a backend result as a tool response: pretty JSON on success, throw on error. */
export const renderResult = <E extends AppError, T>(result: Either<E, T>): string =>
  result.fold(
    (err) => {
      throw appErrorToThrowable(err)
    },
    (value) => JSON.stringify(value, null, 2),
  )

/**
 * Gate a mutating tool. Throws (before any backend call, so nothing mutates) with an
 * actionable message when write ops are disabled.
 */
export const ensureWriteEnabled = (enableWrite: boolean, toolName: string): void => {
  if (!enableWrite) {
    throw new Error(
      `write operations are disabled: "${toolName}" did not run and no changes were made. Set ENABLE_WRITE_OPS=true to enable mutating tools.`,
    )
  }
}

/**
 * A workflow-definition / connection-references parameter that accepts EITHER a JSON object
 * OR a JSON string, parsing the string server-side.
 *
 * Why a union and not just an object: agents (notably Claude Desktop) frequently fail to emit
 * a large nested object through a tool's structured arguments — the call gets malformed and the
 * client falls back to a single `__unparsedToolInput` blob, which then fails validation. Passing
 * the definition as one JSON *string* is a single scalar the model emits reliably, sidestepping
 * that path. (Single quotes inside the JSON — e.g. `@parameters('$authentication')` — are valid
 * JSON and parse fine; they are not the cause of the failures.)
 */
export const jsonObjectParam = (description: string) =>
  z
    .union([z.record(z.string(), z.unknown()), z.string()])
    .transform((value, ctx): Record<string, unknown> => {
      if (typeof value !== "string") return value
      const parsed = ((): unknown => {
        try {
          return JSON.parse(value)
        } catch (e) {
          ctx.addIssue({ code: "custom", message: `not valid JSON: ${(e as Error).message}` })
          return z.NEVER
        }
      })()
      if (parsed === z.NEVER) return {} as Record<string, unknown>
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        ctx.addIssue({ code: "custom", message: "must be a JSON object (got an array or primitive)" })
        return {} as Record<string, unknown>
      }
      return parsed as Record<string, unknown>
    })
    .describe(description)

/** Confirmation payload for a successful mutation. */
export const confirmWrite = (operation: string, details: Record<string, unknown>): string =>
  JSON.stringify({ ok: true, operation, ...details }, null, 2)
