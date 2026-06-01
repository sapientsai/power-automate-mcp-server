/**
 * File-backed MSAL cache plugin.
 *
 * Persists MSAL's own serialized token cache (which holds the refresh token, enabling
 * silent refresh) to disk at mode 0600. The path is configurable via TOKEN_CACHE_PATH so
 * it can be pointed at a mounted volume in container deployments.
 *
 * Used only by the interactive (device-code) path. The clientCredentials path has no
 * refresh token and keeps its access token in memory only.
 */

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

import type { ICachePlugin, TokenCacheContext } from "@azure/msal-node"

export const createFileCachePlugin = (cachePath: string): ICachePlugin => ({
  beforeCacheAccess: async (context: TokenCacheContext): Promise<void> => {
    try {
      const data = await readFile(cachePath, "utf-8")
      context.tokenCache.deserialize(data)
    } catch {
      // No cache file yet (first run) — MSAL starts with an empty cache.
    }
  },
  afterCacheAccess: async (context: TokenCacheContext): Promise<void> => {
    if (!context.cacheHasChanged) return
    await mkdir(dirname(cachePath), { recursive: true })
    await writeFile(cachePath, context.tokenCache.serialize(), { mode: 0o600 })
    // writeFile's mode is only honored on file creation; enforce on existing files too.
    await chmod(cachePath, 0o600)
  },
})
