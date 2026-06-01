/**
 * Auth-layer types and the Flow API resource/scope constants.
 *
 * The exact OAuth scope that yields a token for the `service.flow.microsoft.com` audience
 * from a *custom* public-client app registration is the #1 implementation unknown (see
 * README "Token audience"). {@link FLOW_SCOPE_CANDIDATES} is tried in order at first
 * device-code sign-in; the winner is logged in startup telemetry and should be pinned in
 * `FLOW_SCOPES` / documented in docs/api-notes.md.
 */

import type { AccountInfo } from "@azure/msal-node"

// ── Auth mode ─────────────────────────────────────────────────────────

export type AuthMode = "interactive" | "clientCredentials"

// ── Flow API audience ─────────────────────────────────────────────────

/** Resource/audience for the Power Automate management API. */
export const FLOW_RESOURCE = "https://service.flow.microsoft.com/" as const

/**
 * Ordered scope candidates to try for the Flow audience under a public client.
 * The double-slash form appears in several Microsoft samples and is intentional.
 */
export const FLOW_SCOPE_CANDIDATES: ReadonlyArray<ReadonlyArray<string>> = [
  ["https://service.flow.microsoft.com//.default"],
  ["https://service.flow.microsoft.com/.default"],
  ["https://service.flow.microsoft.com/User"],
]

// ── Token cache shape ─────────────────────────────────────────────────

export type TokenSet = {
  readonly accessToken: string
  /** Epoch milliseconds. */
  readonly expiresAt: number
  /** The scope set that actually minted this token (pinned for reuse + diagnostics). */
  readonly scopeUsed: ReadonlyArray<string>
  /** MSAL account, needed for silent refresh in interactive mode. */
  readonly account?: AccountInfo
}

// ── Server configuration ──────────────────────────────────────────────

export type TransportKind = "stdio" | "http"

export type TelemetrySink = "console" | "file"

export type ServerConfig = {
  // Auth
  readonly clientId: string
  readonly tenantId: string
  readonly authMode: AuthMode
  readonly clientSecret?: string
  readonly flowResource: string
  /** Primary scope set; defaults to `<flowResource>.default`. Overridable via FLOW_SCOPES. */
  readonly flowScopes: ReadonlyArray<string>
  readonly tokenCachePath: string

  // Transport
  readonly transport: TransportKind
  readonly port: number
  readonly endpoint: `/${string}`
  /** Bearer token that protects the HTTP operational endpoints (health/info/dashboard). */
  readonly mcpApiKey?: string

  // Behavior
  readonly enableWriteOps: boolean
  readonly defaultEnvironment?: string

  // Telemetry
  readonly telemetry: ReadonlyArray<TelemetrySink>
  readonly telemetryFilePath: string
  readonly logLevel: string
}
