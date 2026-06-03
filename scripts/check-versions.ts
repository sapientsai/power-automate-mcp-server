#!/usr/bin/env tsx

/**
 * Version consistency checker.
 * Ensures package.json, server.json, and manifest.json all carry the same version,
 * and that package.json `mcpName` matches server.json `name`. Run in prepublishOnly so a
 * version bump can't half-publish (npm vs registry vs desktop extension out of sync).
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

interface PackageJson {
  version: string
  mcpName?: string
}

interface ServerJson {
  name: string
  version: string
  packages?: Array<{ version: string }>
}

interface ManifestJson {
  version: string
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, "..")

function readJSON<T>(filePath: string): T | null {
  const fullPath = path.join(ROOT, filePath)
  if (!fs.existsSync(fullPath)) {
    return null
  }
  return JSON.parse(fs.readFileSync(fullPath, "utf-8")) as T
}

function main(): void {
  const pkg = readJSON<PackageJson>("package.json")
  const server = readJSON<ServerJson>("server.json")
  const manifest = readJSON<ManifestJson>("manifest.json")

  if (!pkg) {
    console.error("Could not read package.json")
    process.exit(1)
  }

  const expectedVersion = pkg.version
  const errors: string[] = []

  console.log(`\nChecking version consistency (expected: ${expectedVersion})\n`)

  if (server) {
    if (server.version !== expectedVersion) {
      errors.push(`server.json: version is "${server.version}" (expected "${expectedVersion}")`)
    }
    const pkgVersion = server.packages?.[0]?.version
    if (pkgVersion !== expectedVersion) {
      errors.push(`server.json: packages[0].version is "${pkgVersion}" (expected "${expectedVersion}")`)
    }
    console.log(
      `✓ server.json: ${server.version === expectedVersion && pkgVersion === expectedVersion ? "OK" : "MISMATCH"}`,
    )
  }

  if (manifest) {
    if (manifest.version !== expectedVersion) {
      errors.push(`manifest.json: version is "${manifest.version}" (expected "${expectedVersion}")`)
    }
    console.log(`✓ manifest.json: ${manifest.version === expectedVersion ? "OK" : "MISMATCH"}`)
  }

  if (pkg.mcpName && server) {
    if (pkg.mcpName !== server.name) {
      errors.push(`package.json mcpName "${pkg.mcpName}" doesn't match server.json name "${server.name}"`)
    }
    console.log(`✓ mcpName consistency: ${pkg.mcpName === server.name ? "OK" : "MISMATCH"}`)
  }

  // src/version.ts — the version the server reports to SomaMCP.
  const versionTsPath = path.join(ROOT, "src/version.ts")
  if (fs.existsSync(versionTsPath)) {
    const match = fs.readFileSync(versionTsPath, "utf-8").match(/PKG_VERSION = "(\d+\.\d+\.\d+)"/)
    const tsVersion = match?.[1]
    if (tsVersion !== expectedVersion) {
      errors.push(`src/version.ts: PKG_VERSION is "${tsVersion ?? "unknown"}" (expected "${expectedVersion}")`)
    }
    console.log(`✓ src/version.ts: ${tsVersion === expectedVersion ? "OK" : "MISMATCH"}`)
  }

  console.log("")

  if (errors.length > 0) {
    console.error("Version mismatches found:\n")
    errors.forEach((err) => console.error(`  ✗ ${err}`))
    console.error("\nUpdate all version numbers to match package.json.\n")
    process.exit(1)
  }

  console.log("All versions are consistent!\n")
}

main()
