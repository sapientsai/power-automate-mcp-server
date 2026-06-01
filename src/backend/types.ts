/**
 * Clean domain models returned by the {@link FlowBackend} — the shapes tools serialize for
 * the agent. Deliberately flatter and more stable than the raw api.flow.microsoft.com
 * payloads, so a future Dataverse backend can produce the same types from a different source.
 *
 * Because the underlying API is unofficial and its payloads vary, the richer types keep a
 * `raw` escape hatch carrying the original `properties` blob — nothing is lost while the
 * clean shape stabilizes (see docs/api-notes.md).
 */

export type Environment = {
  id: string
  name: string
  displayName: string
  location: string
  isDefault: boolean
}

export type FlowSummary = {
  /** The flow's GUID name (used as the `flow` parameter everywhere else). */
  name: string
  displayName: string
  /** "Started" | "Stopped" | "Suspended" (free-form: the API is not enum-stable). */
  state: string
  createdTime: string
  lastModifiedTime: string
  /** Creator principal (userId or email) when present. */
  owner?: string
}

export type FlowDetail = FlowSummary & {
  /** The workflow definition JSON (triggers + actions). */
  definition?: unknown
  connectionReferences?: unknown
  /** Trigger names parsed from the definition. */
  triggers: string[]
  /** Action names parsed from the definition. */
  actions: string[]
}

export type RunStatus = "Succeeded" | "Failed" | "Running" | "Cancelled"

export type RunSummary = {
  /** The run's id (used as the `run` parameter). */
  name: string
  status: string
  startTime: string
  endTime?: string
  durationMs?: number
  triggerName?: string
  /** Short error message when the run failed. */
  error?: string
}

export type RunDetail = RunSummary & {
  /** Error code/message detail surfaced for the first failure, when present. */
  errorCode?: string
  /** Original `properties` blob — per-action breakdown lives here when the API includes it. */
  raw?: unknown
}

export type Connection = {
  name: string
  apiName: string
  displayName: string
  /** "Connected" when healthy; anything else (e.g. "Error") signals a broken connection. */
  status: string
  accountName?: string
  expiresAt?: string
}

export type FlowOwner = {
  principalId: string
  principalType: string
  roleName: string
  principalDisplayName?: string
}
