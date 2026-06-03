#!/bin/bash
# Build the Claude Desktop Extension (.mcpb) — a zip of dist/ + manifest.json at the root.

set -e

if [ ! -f "package.json" ] || [ ! -d "src" ] || [ ! -f "manifest.json" ]; then
  echo "Error: run this from the repository root (need package.json, src/, manifest.json)."
  echo "Current directory: $(pwd)"
  exit 1
fi

echo "Building Power Automate MCP Server desktop extension (.mcpb)…"

# Build if dist is missing.
if [ ! -d "dist" ]; then
  echo "Building…"
  pnpm install
  pnpm build
  [ -d "dist" ] || { echo "Error: build failed — dist/ not found"; exit 1; }
fi

# Clean previous artifacts.
rm -f power-automate-mcp-server.mcpb
rm -rf bundle-temp

mkdir -p bundle-temp
cd bundle-temp

# manifest.json MUST be at the bundle root.
cp -r ../dist .
cp ../package.json .
cp ../manifest.json .
cp ../README.md .
cp ../LICENSE . 2>/dev/null || echo "Warning: LICENSE not found"
[ -d "../assets" ] && cp -r ../assets .

# Production dependencies only.
echo "Installing production dependencies…"
npm install --production --silent 2>/dev/null || pnpm install --prod --silent

echo "Zipping .mcpb…"
zip -r ../power-automate-mcp-server.mcpb . -q

cd ..
rm -rf bundle-temp

# Verify manifest is at the root of the archive.
if unzip -l power-automate-mcp-server.mcpb | grep -q "manifest.json"; then
  echo "✓ manifest.json at bundle root"
else
  echo "Error: manifest.json not at bundle root!"
  exit 1
fi

echo ""
echo "Desktop extension built:"
ls -lh power-automate-mcp-server.mcpb
echo ""
echo "Distribute via GitHub Releases — users download and open it in Claude Desktop."
