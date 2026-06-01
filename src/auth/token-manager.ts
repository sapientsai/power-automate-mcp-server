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

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

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
  const state: { current: Current | null } = { current: null }

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

  const tryDeviceCode = async (): Promise<Either<AuthError, string>> => {
    let lastError = "no scope candidates configured"
    for (const scopes of scopeSets(config)) {
      const result = await Try.fromPromise(
        app.acquireTokenByDeviceCode({ scopes, deviceCodeCallback: (response) => log(response.message) }),
      )
      const outcome = result.fold(
        (err): Either<AuthError, string> | null => {
          lastError = errMsg(err)
          return null
        },
        (auth): Either<AuthError, string> | null => {
          if (!auth) {
            lastError = "device-code flow returned no token"
            return null
          }
          state.current = toCurrent(auth, scopes)
          log(`[auth] acquired Flow token (device code) using scope: ${scopes.join(" ")}`)
          return Right(auth.accessToken)
        },
      )
      if (outcome) return outcome
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
    return tryDeviceCode()
  }

  return { getToken }
}

export const createTokenManager = (config: ServerConfig, opts?: TokenManagerOptions): TokenProvider => {
  const log = opts?.log ?? ((message: string): void => console.error(message))
  return config.authMode === "clientCredentials"
    ? createClientCredentialsManager(config, log)
    : createInteractiveManager(config, log)
}
