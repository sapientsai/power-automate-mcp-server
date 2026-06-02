// Raw device-code probe — bypasses MSAL, calls AAD's /devicecode endpoint with fetch directly.
// If this returns a real user_code/verification_uri, MSAL is the culprit (its callback hands
// back an empty object) and we should hand-roll the device-code flow.
//
//   node scripts/diag-raw-devicecode.mjs        (needs AZURE_CLIENT_ID; AZURE_TENANT_ID optional)

import "dotenv/config"

const clientId = process.env.AZURE_CLIENT_ID
const tenantId = process.env.AZURE_TENANT_ID || "common"
const scope = process.argv[2] || "https://service.flow.microsoft.com/.default"

if (!clientId) {
  console.error("AZURE_CLIENT_ID is not set. Export it (or put it in .env) and re-run.")
  process.exit(1)
}

console.log(`node ${process.version}  tenant: ${tenantId}  scope: ${scope}\n`)

const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ client_id: clientId, scope }).toString(),
})

console.log(`HTTP ${res.status} ${res.statusText}`)
const json = await res.json().catch(() => ({}))

// device_code is the secret used to poll for the token — redact it.
const { device_code: _redacted, ...safe } = json
console.log(JSON.stringify(safe, null, 2))

if (safe.user_code && safe.verification_uri) {
  console.log("\n=> RAW FETCH WORKS. AAD returns a real code; MSAL is the broken layer.")
} else if (safe.error) {
  console.log(`\n=> AAD rejected it: ${safe.error} — ${safe.error_description?.split("\\n")[0] ?? ""}`)
} else {
  console.log("\n=> Unexpected: no code and no error. Inspect the body above.")
}
