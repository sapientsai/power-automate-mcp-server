/**
 * Token acquisition for the Flow API audience.
 *
 * Exposes a single seam — {@link TokenProvider.getToken} — so the Flow API client never
 * cares *how* a token was obtained. v1 provides two implementations:
 *
 *   - interactive (default): MSAL device-code flow over stdio, with silent refresh from a
 *     file-persisted cache. Full per-user reach (sees personal "My Flows").
 *   - clientCredentials: app-only via client secret, in-memory token only. Unattended, but
 *     limited Flow reach (see README).
 *
 * A future v2 HTTP/per-user path (FastMCP AzureProvider) can satisfy the same seam with
 * `() => Right(session.accessToken)` — no change to the client or tools.
 *
 * The Flow-audience scope that actually works for a custom public client is unknown until
 * first sign-in (see {@link FLOW_SCOPE_CANDIDATES}); the device-code path tries candidates
 * in order and logs the winner.
 */

import {
  type AccountInfo,
  type AuthenticationResult,
  ConfidentialClientApplication,
  PublicClientApplication,
} from "@azure/msal-node"
import { type Either, Right, Try } from "functype"

import { type AuthError, leftAuth } from "../errors.js"
import { createFileCachePlugin } from "./token-cache.js"
import { FLOW_SCOPE_CANDIDATES, type ServerConfig } from "./types.js"

export type TokenProvider = {
  getToken: () => Promise<Either<AuthError, string>>
}

export type TokenManagerOptions = {
  /** Sink for device-code prompts and the winning-scope diagnostic. Defaults to stderr. */
  log?: (message: string) => void
}

const REFRESH_BUFFER_MS = 5 * 60 * 1000

type Current = {
  accessToken: string
  expiresAt: number
  scopeUsed: string[]
  account?: AccountInfo
}

const errMsg = (e: unknown): string => {
  // MSAL errors carry the actionable detail (incl. the AADSTS code) on errorCode/errorMessage,
  // not the generic .message. Surface all of it so first-sign-in failures are diagnosable.
  if (e && typeof e === "object") {
    const m = e as { errorCode?: string; errorMessage?: string; subError?: string; message?: string }
    const parts = [m.errorCode, m.subError, m.errorMessage].filter((p): p is string => Boolean(p))
    if (parts.length > 0) return parts.join(" / ")
    if (m.message) return m.message
  }
  return e instanceof Error ? e.message : String(e)
}

const isValid = (c: Current): boolean => Date.now() < c.expiresAt - REFRESH_BUFFER_MS

const toCurrent = (result: AuthenticationResult, scopeUsed: string[]): Current => ({
  accessToken: result.accessToken,
  expiresAt: result.expiresOn ? result.expiresOn.getTime() : 0,
  scopeUsed,
  account: result.account ?? undefined,
})

const authorityFor = (tenantId: string): string => `https://login.microsoftonline.com/${tenantId}`

/** Distinct scope sets to attempt: the configured one first, then the documented candidates. */
const scopeSets = (config: ServerConfig): string[][] => {
  const seen = new Set<string>()
  const out: string[][] = []
  for (const set of [config.flowScopes, ...FLOW_SCOPE_CANDIDATES]) {
    const arr = [...set]
    const key = arr.join(" ")
    if (arr.length > 0 && !seen.has(key)) {
      seen.add(key)
      out.push(arr)
    }
  }
  return out
}

// ── clientCredentials (app-only) ──────────────────────────────────────

const createClientCredentialsManager = (config: ServerConfig, log: (m: string) => void): TokenProvider => {
  const app = new ConfidentialClientApplication({
    auth: { clientId: config.clientId, authority: authorityFor(config.tenantId), clientSecret: config.clientSecret },
  })
  const state: { current: Current | null } = { current: null }

  const getToken = async (): Promise<Either<AuthError, string>> => {
    if (state.current && isValid(state.current)) return Right(state.current.accessToken)
    const scopes = [...config.flowScopes]
    const result = await Try.fromPromise(app.acquireTokenByClientCredential({ scopes }))
    return result.fold(
      (err) => leftAuth(`client-credentials token request failed: ${errMsg(err)}`, "client_credentials_failed"),
      (auth) => {
        if (!auth) return leftAuth("client-credentials flow returned no token", "client_credentials_failed")
        state.current = toCurrent(auth, scopes)
        log(`[auth] acquired Flow token (client credentials) using scope: ${scopes.join(" ")}`)
        return Right(auth.accessToken)
      },
    )
  }

  return { getToken }
}

// ── interactive (device code) ─────────────────────────────────────────

const createInteractiveManager = (config: ServerConfig, log: (m: string) => void): TokenProvider => {
  const app = new PublicClientApplication({
    auth: { clientId: config.clientId, authority: authorityFor(config.tenantId) },
    cache: { cachePlugin: createFileCachePlugin(config.tokenCachePath) },
  })
  // `pending` holds an in-flight device-code sign-in: the user-facing prompt plus the
  // background promise that caches the token once the user completes the browser step.
  const state: { current: Current | null; pending: { message: string; promise: Promise<void> } | null } = {
    current: null,
    pending: null,
  }

  const trySilent = async (): Promise<Either<AuthError, string>> => {
    const accounts = (await Try.fromPromise(app.getTokenCache().getAllAccounts())).fold(
      () => [] as AccountInfo[],
      (a) => a,
    )
    const account = state.current?.account ?? accounts[0]
    if (!account) return leftAuth("no cached account for silent refresh", "silent_failed")
    const scopes = state.current?.scopeUsed ?? [...config.flowScopes]
    const result = await Try.fromPromise(app.acquireTokenSilent({ account, scopes }))
    return result.fold(
      (err) => leftAuth(`silent token refresh failed: ${errMsg(err)}`, "silent_failed"),
      (auth) => {
        state.current = toCurrent(auth, scopes)
        return Right(auth.accessToken)
      },
    )
  }

  /**
   * Begin a device-code sign-in. Tries scope candidates until the AAD endpoint *accepts* one
   * (a bad scope fails before any prompt is shown). For the accepted scope it returns
   * immediately with `device_code_pending` carrying the user prompt, while the token is
   * acquired in the background and cached on completion — so this works inside the MCP
   * lifecycle without a hidden stderr prompt.
   */
  const beginDeviceCode = async (): Promise<Either<AuthError, string>> => {
    let lastError = "no scope candidates configured"

    for (const scopes of scopeSets(config)) {
      // A mutable box (not bare `let`s) so the async callbacks' writes survive TS narrowing
      // across the `await` below.
      const box: { message: string | null; outcome: Either<AuthError, string> | null } = {
        message: null,
        outcome: null,
      }
      let signalMessage: () => void = () => {}
      const messageReady = new Promise<void>((resolve) => {
        signalMessage = resolve
      })

      const background = app
        .acquireTokenByDeviceCode({
          scopes,
          deviceCodeCallback: (response) => {
            box.message = response.message
            signalMessage()
          },
        })
        .then(
          (auth): void => {
            if (auth) {
              state.current = toCurrent(auth, scopes)
              log(`[auth] acquired Flow token (device code) using scope: ${scopes.join(" ")}`)
              box.outcome = Right(auth.accessToken)
            } else {
              box.outcome = leftAuth("device-code flow returned no token", "device_code_failed")
            }
            state.pending = null
          },
          (err): void => {
            lastError = errMsg(err)
            box.outcome = leftAuth(`device-code completion failed: ${lastError}`, "device_code_failed")
            state.pending = null
          },
        )

      // Whichever happens first: the prompt is issued (scope accepted) or the request settles
      // (scope rejected, or — rarely — an instant cached completion).
      await Promise.race([messageReady, background])

      if (box.message !== null && box.outcome === null) {
        log(`[auth] device-code prompt issued using scope: ${scopes.join(" ")}`)
        state.pending = { message: box.message, promise: background }
        return leftAuth(
          `Authorization required. ${box.message} After you complete sign-in in the browser, call the tool again — it finishes in the background.`,
          "device_code_pending",
        )
      }
      if (box.outcome !== null && box.outcome.isRight()) return box.outcome
      // Otherwise this scope was rejected before a prompt — try the next candidate.
    }

    return leftAuth(
      `device-code sign-in failed for all scope candidates. Last error: ${lastError}`,
      "device_code_failed",
    )
  }

  const getToken = async (): Promise<Either<AuthError, string>> => {
    if (state.current && isValid(state.current)) return Right(state.current.accessToken)

    const silent = await trySilent()
    if (silent.isRight()) return silent

    // A sign-in is already in flight — tell the caller to finish it rather than starting another.
    if (state.pending) {
      return leftAuth(
        `Authorization pending. ${state.pending.message} Call the tool again once you've completed sign-in.`,
        "device_code_pending",
      )
    }

    return beginDeviceCode()
  }

  return { getToken }
}

export const createTokenManager = (config: ServerConfig, opts?: TokenManagerOptions): TokenProvider => {
  const log = opts?.log ?? ((message: string): void => console.error(message))
  return config.authMode === "clientCredentials"
    ? createClientCredentialsManager(config, log)
    : createInteractiveManager(config, log)
}
