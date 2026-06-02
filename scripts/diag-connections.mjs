// Probe candidate "list connections" endpoints with the already-cached Flow token.
// Reuses the MSAL file cache (silent — no device code) and tries several URLs, printing status.
//
//   AZURE_CLIENT_ID=$MS365_CLIENT_ID AZURE_TENANT_ID=$MS365_TENANT_ID node scripts/diag-connections.mjs [envId]

import "dotenv/config"

import { readFile } from "node:fs/promises"
import { homedir } from "node:os"

import { PublicClientApplication } from "@azure/msal-node"

const clientId = process.env.AZURE_CLIENT_ID
const tenantId = process.env.AZURE_TENANT_ID || "common"
const env = process.argv[2] || "Default-4d68a3d9-bb53-47bd-962e-424ecece3395"
const scopes = ["https://service.flow.microsoft.com/Flows.Read.All"]
const cachePath = `${homedir()}/.cache/power-automate-mcp/token.json`

if (!clientId) {
  console.error("AZURE_CLIENT_ID not set")
  process.exit(1)
}

const cacheData = await readFile(cachePath, "utf-8").catch(() => null)
if (!cacheData) {
  console.error("No token cache — run a tool through the MCP server first to sign in.")
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
console.log(`got token (silent) for ${accounts[0]?.username}\n`)

const filter = encodeURIComponent(`environment eq '${env}'`)
const candidates = [
  `https://api.flow.microsoft.com/providers/Microsoft.PowerApps/connections?api-version=2016-11-01&$filter=${filter}`,
  `https://api.flow.microsoft.com/providers/Microsoft.PowerApps/scopes/admin/environments/${env}/connections?api-version=2016-11-01`,
  `https://api.flow.microsoft.com/providers/Microsoft.PowerApps/apis/shared_office365/connections?api-version=2016-11-01&$filter=${filter}`,
  `https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/${env}/connections?api-version=2016-11-01`,
  `https://api.flow.microsoft.com/providers/Microsoft.PowerApps/connections?api-version=2020-06-01&$filter=${filter}`,
]

for (const url of candidates) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  }).catch((e) => ({ status: "ERR", text: async () => String(e) }))
  const body = await res.text()
  const short = url.replace("https://api.flow.microsoft.com/providers/", "")
  console.log(`[${res.status}] ${short}`)
  if (res.status === 200) {
    const json = JSON.parse(body)
    const n = json.value?.length ?? "?"
    console.log(`   => ${n} connection(s). first keys: ${Object.keys(json.value?.[0] ?? {}).join(",")}`)
  }
}
