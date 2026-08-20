#!/usr/bin/env bash
# Build the release artifacts and keep sw.js's cache name locked to APP_VERSION,
# so every deploy purges the previous one and nobody is stranded on a stale build.
set -euo pipefail
cd "$(dirname "$0")"
V=$(grep -o 'const APP_VERSION="v[0-9.]*"' index.html | grep -o 'v[0-9.]*')
sed -i.bak -E "s/const CACHE = \"ct-v[0-9.]*\"/const CACHE = \"ct-${V}\"/" sw.js && rm -f sw.js.bak
echo "sw.js cache -> ct-${V}"
rm -f criminal-terminal.zip CriminalTerminal-offline.zip "CriminalTerminal-${V}.html"
cp index.html "CriminalTerminal-${V}.html"
zip -q -X criminal-terminal.zip index.html manifest.webmanifest sw.js icon-192.png icon-512.png
echo "built criminal-terminal.zip + CriminalTerminal-${V}.html"
