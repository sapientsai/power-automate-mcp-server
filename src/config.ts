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

/**
 * True for a manifest placeholder the host left un-interpolated — e.g. Claude Desktop passes the
 * literal `"${user_config.default_environment}"` as the env value when an optional `.mcpb` field
 * is left blank (it doesn't drop unset optional vars). Such a value must be treated as absent;
 * otherwise it leaks into config (e.g. straight into the request path, which 400s).
 */
const isUninterpolatedPlaceholder = (value: string): boolean => /^\$\{[^}]*\}$/.test(value.trim())

/** Drop env vars whose value is an un-interpolated `${...}` placeholder so a blank optional
 *  `.mcpb` field falls back to its default instead of being used literally. */
const sanitizeEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const out: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && !isUninterpolatedPlaceholder(value)) out[key] = value
  }
  return out
}

const parseAuthMode = (value: string | undefined): Either<ConfigError, AuthMode> => {
  if (!value || value === "interactive") return Right("interactive")
  if (value === "clientCredentials") return Right("clientCredentials")
  return Left(configError(`Invalid AZURE_AUTH_MODE: "${value}". Must be "interactive" or "clientCredentials".`))
}

const parseTransport = (value: string | undefined): Either<ConfigError, TransportKind> => {
  if (!value || value === "stdio") return Right("stdio")
  // Accept "httpStream" as an alias for "http" to align with the sibling MCP servers
  // (e.g. patents-mcp-server), which surface the underlying fastmcp transport name.
  if (value === "http" || value === "httpStream") return Right("http")
  return Left(configError(`Invalid TRANSPORT: "${value}". Must be "stdio", "http", or "httpStream".`))
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

export const loadConfig = (rawEnv: NodeJS.ProcessEnv = process.env): Either<ConfigError, ServerConfig> => {
  // A blank optional .mcpb field arrives as the literal "${...}" placeholder (Claude Desktop
  // doesn't drop unset optional vars); treat those as absent so they fall back to defaults
  // instead of, e.g., DEFAULT_ENVIRONMENT putting "${user_config.default_environment}" in the URL.
  const env = sanitizeEnv(rawEnv)
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
        // Default 0.0.0.0 so the HTTP transport is reachable through a container port-forward.
        // FastMCP otherwise resolves "localhost" to ::1 (IPv6-only), which a Docker publish and
        // the IPv4 healthcheck can't reach. Override with HOST for a narrower bind.
        host: env.HOST?.trim() || "0.0.0.0",
        port: parsePort(env.PORT),
        endpoint: ensureEndpoint(env.ENDPOINT),
        mcpApiKey: env.MCP_API_KEY?.trim() || undefined,
        enableWriteOps: env.ENABLE_WRITE_OPS === "true",
        defaultEnvironment: env.DEFAULT_ENVIRONMENT?.trim() || undefined,
        telemetry: parseTelemetry(env.TELEMETRY),
        // Absolute, writable default (like the token cache) so the file sink never litters or
        // fails in an unpredictable cwd — e.g. a Claude Desktop .mcpb or `npx … --stdio`.
        telemetryFilePath: expandHome(env.TELEMETRY_FILE?.trim() || "~/.cache/power-automate-mcp/events.ndjson"),
        logLevel: env.LOG_LEVEL?.trim() || "info",
        feedbackRepo: env.FEEDBACK_GITHUB_REPO?.trim() || "sapientsai/power-automate-mcp-server",
      }
      return Right(config)
    }),
  )
}
