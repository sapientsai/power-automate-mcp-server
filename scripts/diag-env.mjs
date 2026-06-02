// Discover an environment's regional API hosts (properties.runtimeEndpoints) and probe
// connections endpoints against them, using the cached Flow token (silent — no prompt).
//
//   AZURE_CLIENT_ID=$MS365_CLIENT_ID AZURE_TENANT_ID=$MS365_TENANT_ID node scripts/diag-env.mjs [envId]

import "dotenv/config"

import { readFile } from "node:fs/promises"
import { homedir } from "node:os"

import { PublicClientApplication } from "@azure/msal-node"

const clientId = process.env.AZURE_CLIENT_ID
const tenantId = process.env.AZURE_TENANT_ID || "common"
const env = process.argv[2] || "Default-4d68a3d9-bb53-47bd-962e-424ecece3395"
const scopes = ["https://service.flow.microsoft.com/Flows.Read.All"]
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
const auth = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }

// 1) Environment detail → runtimeEndpoints
const envUrl = `https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/${env}?api-version=2016-11-01`
const envRes = await fetch(envUrl, { headers: auth })
console.log(`environment GET: ${envRes.status}`)
const envJson = await envRes.json().catch(() => ({}))
const endpoints = envJson?.properties?.runtimeEndpoints ?? {}
console.log("runtimeEndpoints:")
console.log(JSON.stringify(endpoints, null, 2))

const flowHost = endpoints["microsoft.Flow"] // e.g. https://unitedstates.api.flow.microsoft.com
const paHost = endpoints["microsoft.PowerApps"] // e.g. https://unitedstates.api.powerapps.com

// 2) Probe connections candidates (flow-audience token; powerapps host likely needs a different audience)
const filter = encodeURIComponent(`environment eq '${env}'`)
const candidates = [
  flowHost && `${flowHost}/providers/Microsoft.ProcessSimple/environments/${env}/connections?api-version=2016-11-01`,
  flowHost && `${flowHost}/providers/Microsoft.PowerApps/connections?api-version=2016-11-01&$filter=${filter}`,
  paHost && `${paHost}/providers/Microsoft.PowerApps/connections?api-version=2016-11-01&$filter=${filter}`,
  flowHost &&
    `${flowHost}/providers/Microsoft.ProcessSimple/environments/${env}/apis/shared_office365/connections?api-version=2016-11-01`,
].filter(Boolean)

console.log("\nconnection endpoint probes:")
for (const url of candidates) {
  const res = await fetch(url, { headers: auth }).catch((e) => ({ status: "ERR", text: async () => String(e) }))
  console.log(`[${res.status}] ${url}`)
  if (res.status === 200) {
    const j = JSON.parse(await res.text())
    console.log(`   => ${j.value?.length ?? "?"} item(s); first keys: ${Object.keys(j.value?.[0] ?? {}).join(",")}`)
  }
}
