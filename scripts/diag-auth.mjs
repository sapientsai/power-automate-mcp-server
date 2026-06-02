// Diagnostic: probe which scopes a custom public client can get a device code for.
//
//   node scripts/diag-auth.mjs        (needs AZURE_CLIENT_ID in env; AZURE_TENANT_ID optional)
//
// For each scope it asks AAD for a device code with a short poll timeout. If the device-code
// prompt is ISSUED, the scope is accepted (we don't complete sign-in — issuance is enough to
// know). If AAD rejects it, we print the real errorCode / subError / AADSTS message.
//
// The Graph "User.Read" scope is a control: if it works but the Flow scopes don't, the problem
// is the Flow audience grant; if Graph also fails, device-code/public-client is misconfigured.

import "dotenv/config"

import { PublicClientApplication } from "@azure/msal-node"

const clientId = process.env.AZURE_CLIENT_ID
const tenantId = process.env.AZURE_TENANT_ID || "common"

if (!clientId) {
  console.error("AZURE_CLIENT_ID is not set in this shell. Export it and re-run.")
  process.exit(1)
}

console.log(`node ${process.version}   client: ${clientId.slice(0, 8)}…   tenant: ${tenantId}\n`)

const pca = new PublicClientApplication({
  auth: { clientId, authority: `https://login.microsoftonline.com/${tenantId}` },
})

const scopeSets = [
  { label: "Graph User.Read (control)", scopes: ["User.Read"] },
  { label: "Flow //.default", scopes: ["https://service.flow.microsoft.com//.default"] },
  { label: "Flow /.default", scopes: ["https://service.flow.microsoft.com/.default"] },
  { label: "Flow /User", scopes: ["https://service.flow.microsoft.com/User"] },
]

for (const { label, scopes } of scopeSets) {
  let issued = false
  let detail = ""
  try {
    await pca.acquireTokenByDeviceCode({
      scopes,
      timeout: 2, // seconds: poll briefly, then bail — we only care whether a code was issued
      deviceCodeCallback: (resp) => {
        issued = true
        // userCode + verificationUri are meant to be shown to the user — not secrets.
        detail = `userCode=${resp?.userCode ?? "MISSING"} uri=${resp?.verificationUri ?? "MISSING"} messageEmpty=${!resp?.message}`
      },
    })
    console.log(`✓ ${label}: ACCEPTED (token completed) — ${detail}`)
  } catch (e) {
    if (issued) {
      console.log(`✓ ${label}: ACCEPTED (code issued) — ${detail}`)
    } else {
      const code = e?.errorCode ?? e?.name ?? "unknown"
      const sub = e?.subError ? ` / ${e.subError}` : ""
      const msg = e?.errorMessage ?? e?.message ?? String(e)
      const cid = e?.correlationId ? `  [correlationId ${e.correlationId}]` : ""
      console.log(`✗ ${label}: ${code}${sub}${cid}\n    ${msg}`)
    }
  }
}

process.exit(0)
