/**
 * Version the server reports to SomaMCP (which requires the strict
 * `${number}.${number}.${number}` shape). Kept in lockstep with package.json by
 * `scripts/sync-versions.ts` (npm version lifecycle) and guarded by `scripts/check-versions.ts`.
 */
export const PKG_VERSION = "0.1.1" as const
