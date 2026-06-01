/**
 * Authenticated fetch wrapper for Microsoft's *unofficial* Power Automate management API
 * (`api.flow.microsoft.com/providers/Microsoft.ProcessSimple`).
 *
 * Injects the bearer token from the {@link TokenProvider} seam and maps HTTP status codes
 * to typed {@link FlowApiError}s. Every method returns `Either<FlowApiError, T>` — no throws.
 */

import { type Either, Right, Try } from "functype"

import type { TokenProvider } from "../../auth/token-manager.js"
import { type FlowApiError, flowApiError, type FlowApiErrorKind, leftFlowApi } from "../../errors.js"

const BASE_URL = "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple"
const DEFAULT_API_VERSION = "2016-11-01"

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE"

export type RequestOptions = {
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  /** Override the default 2016-11-01 api-version for an endpoint that needs a newer one. */
  apiVersion?: string
}

export type FlowApiClient = {
  request: <T>(method: HttpMethod, path: string, options?: RequestOptions) => Promise<Either<FlowApiError, T>>
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

const statusToKind = (status: number): FlowApiErrorKind => {
  if (status === 400) return "bad_request"
  if (status === 401) return "auth_expired"
  if (status === 403) return "forbidden"
  if (status === 404) return "not_found"
  if (status === 429) return "rate_limited"
  if (status >= 500) return "server_error"
  return "unsupported_api_drift"
}

const buildUrl = (path: string, options: RequestOptions): string => {
  const url = new URL(`${BASE_URL}${path}`)
  url.searchParams.set("api-version", options.apiVersion ?? DEFAULT_API_VERSION)
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

export const createFlowApiClient = (deps: { tokenProvider: TokenProvider }): FlowApiClient => {
  const request = async <T>(
    method: HttpMethod,
    path: string,
    options: RequestOptions = {},
  ): Promise<Either<FlowApiError, T>> => {
    const tokenE = await deps.tokenProvider.getToken()
    if (tokenE.isLeft()) {
      const message = tokenE.fold(
        (e) => e.message,
        () => "",
      )
      return leftFlowApi<T>("auth_expired", `could not acquire a Flow API token: ${message}`)
    }
    const token = tokenE.orElse("")

    const hasBody = options.body !== undefined
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
    }

    const fetchResult = await Try.fromPromise(fetch(buildUrl(path, options), init))
    return fetchResult.fold(
      async (err): Promise<Either<FlowApiError, T>> =>
        leftFlowApi<T>("network", `${method} ${path} could not reach api.flow.microsoft.com: ${errMsg(err)}`),
      async (response): Promise<Either<FlowApiError, T>> => {
        if (!response.ok) {
          const detail = (await Try.fromPromise(response.text())).orElse("")
          return leftFlowApi<T>(statusToKind(response.status), `${method} ${path} returned ${response.status}`, {
            status: response.status,
            detail,
          })
        }
        // 204 No Content (common for start/stop/cancel/delete) — nothing to parse.
        if (response.status === 204) return Right(undefined as T)

        const parsed = await Try.fromPromise(response.json())
        return parsed.fold(
          (err) =>
            leftFlowApi<T>("unsupported_api_drift", `${method} ${path} returned an unparseable body: ${errMsg(err)}`),
          (json) => Right(json as T),
        )
      },
    )
  }

  return { request }
}

export { flowApiError }
