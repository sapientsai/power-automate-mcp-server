/**
 * Typed error model for the Power Automate MCP server.
 *
 * All backend calls return `Either<AppError, T>`. Tool `execute` functions convert a
 * `Left` into a thrown `Error` via {@link appErrorToThrowable}; SomaMCP's `wrapTool`
 * then classifies that error (by message keyword) and returns an enriched, agent-facing
 * payload. Because SomaMCP surfaces the error *message* verbatim, the human-readable
 * suggestion must live in the message itself — see {@link FLOW_API_SUGGESTIONS}.
 */

import { type Either, Left } from "functype"

// ── Error variants ────────────────────────────────────────────────────

export type ConfigError = { readonly _tag: "ConfigError"; readonly message: string }

export type AuthErrorReason =
  | "config"
  | "no_token"
  | "expired"
  | "device_code_failed"
  | "silent_failed"
  | "client_credentials_failed"

export type AuthError = {
  readonly _tag: "AuthError"
  readonly message: string
  readonly reason: AuthErrorReason
}

export type FlowApiErrorKind =
  | "auth_expired"
  | "not_found"
  | "forbidden"
  | "rate_limited"
  | "bad_request"
  | "server_error"
  | "network"
  | "unsupported_api_drift"

export type FlowApiError = {
  readonly _tag: "FlowApiError"
  readonly kind: FlowApiErrorKind
  readonly message: string
  readonly status?: number
  readonly detail?: unknown
}

export type AppError = ConfigError | AuthError | FlowApiError

// ── Constructors ──────────────────────────────────────────────────────

export const configError = (message: string): ConfigError => ({ _tag: "ConfigError", message })

export const authError = (message: string, reason: AuthErrorReason = "config"): AuthError => ({
  _tag: "AuthError",
  message,
  reason,
})

export const flowApiError = (
  kind: FlowApiErrorKind,
  message: string,
  opts?: { status?: number; detail?: unknown },
): FlowApiError => ({
  _tag: "FlowApiError",
  kind,
  message,
  status: opts?.status,
  detail: opts?.detail,
})

// ── `Left` helpers (save the ceremony at call sites) ──────────────────

export const leftConfig = <T>(message: string): Either<ConfigError, T> => Left(configError(message))
export const leftAuth = <T>(message: string, reason?: AuthErrorReason): Either<AuthError, T> =>
  Left(authError(message, reason))
export const leftFlowApi = <T>(
  kind: FlowApiErrorKind,
  message: string,
  opts?: { status?: number; detail?: unknown },
): Either<FlowApiError, T> => Left(flowApiError(kind, message, opts))

// ── Agent-facing rendering ────────────────────────────────────────────

/**
 * Human-readable next-step for each Flow API failure kind. Embedded into the thrown
 * message so it reaches the agent (SomaMCP's generic per-category suggestions are coarse).
 */
const FLOW_API_SUGGESTIONS: Record<FlowApiErrorKind, string> = {
  auth_expired: "Token cache is stale or the session expired. Restart the server to re-run the device-code sign-in.",
  not_found:
    "The flow, run, or environment was not found in this environment. List the parent resource first to confirm the identifier.",
  forbidden: "The signed-in user lacks permission on this resource. Check flow ownership or your Power Automate role.",
  rate_limited: "Too many requests to the Power Automate API. Wait a few seconds and retry.",
  bad_request: "The request was rejected as malformed. Re-check the parameters against the tool's schema.",
  server_error: "The Power Automate service returned a server error. Retry later.",
  network: "Could not reach api.flow.microsoft.com. Check network connectivity and try again.",
  unsupported_api_drift:
    "This server uses Microsoft's unofficial api.flow.microsoft.com endpoints, which may have changed shape. Use the report_feedback tool to flag the drift.",
}

/**
 * Leading phrase chosen so SomaMCP's `classifyError` (substring match) buckets the error
 * correctly: "auth"→auth, "not found"→not_found, "forbidden"→auth, "invalid"→validation.
 */
const FLOW_API_CLASSIFY_PREFIX: Record<FlowApiErrorKind, string> = {
  auth_expired: "auth error",
  not_found: "not found",
  forbidden: "forbidden",
  rate_limited: "rate limited",
  bad_request: "invalid request",
  server_error: "server error",
  network: "network error",
  unsupported_api_drift: "unsupported api drift",
}

/**
 * Convert an {@link AppError} into a throwable `Error` whose message both classifies well
 * under SomaMCP and carries an actionable suggestion for the agent.
 */
export const appErrorToThrowable = (error: AppError): Error => {
  switch (error._tag) {
    case "FlowApiError": {
      const prefix = FLOW_API_CLASSIFY_PREFIX[error.kind]
      const suggestion = FLOW_API_SUGGESTIONS[error.kind]
      const status = error.status ? ` (HTTP ${error.status})` : ""
      return new Error(`${prefix}${status}: ${error.message}\n\nSuggestion: ${suggestion}`)
    }
    case "AuthError":
      return new Error(`auth error: ${error.message}\n\nSuggestion: ${FLOW_API_SUGGESTIONS.auth_expired}`)
    case "ConfigError":
      return new Error(`configuration error: ${error.message}`)
  }
}
