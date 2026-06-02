// Probe creating a flow via api.flow.microsoft.com (deferred v2 capability — verifying the
// payload shape). Creates a minimal, connection-free flow (Recurrence -> Compose) in the
// default environment using the cached Flow token. Prints the new flow id or the error shape.
//
//   AZURE_CLIENT_ID=$MS365_CLIENT_ID AZURE_TENANT_ID=$MS365_TENANT_ID node scripts/diag-create-flow.mjs [envId]

import "dotenv/config"

import { readFile } from "node:fs/promises"
import { homedir } from "node:os"

import { PublicClientApplication } from "@azure/msal-node"

const clientId = process.env.AZURE_CLIENT_ID
const tenantId = process.env.AZURE_TENANT_ID || "common"
const env = process.argv[2] || "Default-4d68a3d9-bb53-47bd-962e-424ecece3395"
const scopes = ["https://service.flow.microsoft.com/Flows.Manage.All"]
const cachePath = `${homedir()}/.cache/power-automate-mcp/token.json`

const cacheData = await readFile(cachePath, "utf-8").catch(() => null)
if (!clientId || !cacheData) {
  console.error("Need AZURE_CLIENT_ID and a token cache (sign in via the MCP server first).")
  process.exit(1)
}

const pca = new PublicClientApplication({
  auth: { clientId, authority: `https://login.microsoftonline.com/${tenantId}` },
  cache: {
    cachePlugin: {
      beforeCacheAccess: async (ctx) => ctx.tokenCache.deserialize(cacheData),
      afterCacheAccess: async () => {},
    },
  },
})
const accounts = await pca.getTokenCache().getAllAccounts()
const { accessToken } = await pca.acquireTokenSilent({ account: accounts[0], scopes })

const definition = {
  $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
  contentVersion: "1.0.0.0",
  parameters: {},
  triggers: {
    Recurrence: { type: "Recurrence", recurrence: { frequency: "Day", interval: 1 } },
  },
  actions: {
    Compose: { type: "Compose", inputs: "Hello from the Power Automate MCP server", runAfter: {} },
  },
}

const body = {
  properties: {
    displayName: "MCP Test Flow (safe to delete)",
    state: "Stopped",
    definition,
    connectionReferences: {},
  },
}

const url = `https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/${env}/flows?api-version=2016-11-01`
const res = await fetch(url, {
  method: "POST",
  headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify(body),
})

console.log(`POST flows -> ${res.status} ${res.statusText}`)
const text = await res.text()
if (res.ok) {
  const json = JSON.parse(text)
  console.log(
    `✓ created flow: name=${json.name}  displayName=${json.properties?.displayName}  state=${json.properties?.state}`,
  )
  console.log(`   (use this name with get_flow / update_flow / delete; remember to delete it)`)
} else {
  // Error body reveals the required payload shape.
  console.log(text.slice(0, 1200))
}
