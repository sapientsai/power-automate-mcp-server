/**
 * Helpers shared by every tool module: environment resolution and Either → tool-result
 * rendering. Keeping these here avoids repeating the fold/throw ceremony in each tool.
 */

import { type Either, Right } from "functype"

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
