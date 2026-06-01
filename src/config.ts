/**
 * Environment-variable parsing into a validated {@link ServerConfig}.
 *
 * Returns `Either<ConfigError, ServerConfig>` so the caller (bin.ts) can fail loudly with
 * an actionable message. Every variable either has a sane default or is reported as missing.
 */

import { homedir } from "node:os"
import { resolve } from "node:path"

import { type Either, Left, Right } from "functype"

import {
  type AuthMode,
  FLOW_RESOURCE,
  type ServerConfig,
  type TelemetrySink,
  type TransportKind,
} from "./auth/types.js"
import { type ConfigError, configError } from "./errors.js"

const expandHome = (p: string): string => {
  if (p === "~") return homedir()
  if (p.startsWith("~/")) return resolve(homedir(), p.slice(2))
  return p
}

const parseAuthMode = (value: string | undefined): Either<ConfigError, AuthMode> => {
  if (!value || value === "interactive") return Right("interactive")
  if (value === "clientCredentials") return Right("clientCredentials")
  return Left(configError(`Invalid AZURE_AUTH_MODE: "${value}". Must be "interactive" or "clientCredentials".`))
}

const parseTransport = (value: string | undefined): Either<ConfigError, TransportKind> => {
  if (!value || value === "stdio") return Right("stdio")
  if (value === "http") return Right("http")
  return Left(configError(`Invalid TRANSPORT: "${value}". Must be "stdio" or "http".`))
}

const parseTelemetry = (value: string | undefined): ReadonlyArray<TelemetrySink> =>
  (value ?? "console,file")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is TelemetrySink => s === "console" || s === "file")

const ensureEndpoint = (value: string | undefined): `/${string}` => {
  const e = value?.trim() || "/mcp"
  return (e.startsWith("/") ? e : `/${e}`) as `/${string}`
}

const parsePort = (value: string | undefined): number => {
  const n = Number.parseInt(value ?? "3333", 10)
  return Number.isFinite(n) ? n : 3333
}

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Either<ConfigError, ServerConfig> => {
  const clientId = env.AZURE_CLIENT_ID?.trim()
  if (!clientId) {
    return Left(
      configError(
        'AZURE_CLIENT_ID is required. Register a multi-tenant public client app and set AZURE_CLIENT_ID. See README "App registration".',
      ),
    )
  }

  return parseAuthMode(env.AZURE_AUTH_MODE).flatMap((authMode) =>
    parseTransport(env.TRANSPORT).flatMap((transport) => {
      const tenantId = env.AZURE_TENANT_ID?.trim() || "common"
      const clientSecret = env.AZURE_CLIENT_SECRET?.trim() || undefined

      if (authMode === "clientCredentials") {
        if (!clientSecret) {
          return Left(configError("AZURE_AUTH_MODE=clientCredentials requires AZURE_CLIENT_SECRET to be set."))
        }
        if (tenantId === "common") {
          return Left(
            configError('AZURE_AUTH_MODE=clientCredentials requires a specific AZURE_TENANT_ID (not "common").'),
          )
        }
      }

      const flowResource = env.FLOW_RESOURCE?.trim() || FLOW_RESOURCE
      const flowScopes = env.FLOW_SCOPES?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [`${flowResource}.default`]

      const config: ServerConfig = {
        clientId,
        tenantId,
        authMode,
        clientSecret,
        flowResource,
        flowScopes,
        tokenCachePath: expandHome(env.TOKEN_CACHE_PATH?.trim() || "~/.cache/power-automate-mcp/token.json"),
        transport,
        port: parsePort(env.PORT),
        endpoint: ensureEndpoint(env.ENDPOINT),
        mcpApiKey: env.MCP_API_KEY?.trim() || undefined,
        enableWriteOps: env.ENABLE_WRITE_OPS === "true",
        defaultEnvironment: env.DEFAULT_ENVIRONMENT?.trim() || undefined,
        telemetry: parseTelemetry(env.TELEMETRY),
        telemetryFilePath: env.TELEMETRY_FILE?.trim() || "./logs/events.ndjson",
        logLevel: env.LOG_LEVEL?.trim() || "info",
        feedbackRepo: env.FEEDBACK_GITHUB_REPO?.trim() || "jordanburke/power-automate-mcp-server",
      }
      return Right(config)
    }),
  )
}
