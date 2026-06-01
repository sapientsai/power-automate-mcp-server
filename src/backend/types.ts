/**
 * Clean domain models returned by the {@link FlowBackend} — the shapes tools serialize for
 * the agent. Deliberately flatter and more stable than the raw api.flow.microsoft.com
 * payloads, so a future Dataverse backend can produce the same types from a different source.
 */

export type Environment = {
  id: string
  name: string
  displayName: string
  location: string
  isDefault: boolean
}
