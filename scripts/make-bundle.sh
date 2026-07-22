#!/usr/bin/env bash
# make-bundle.sh — Build a Capgo-compatible OTA update bundle
# Usage: bash scripts/make-bundle.sh <version>
# Example: bash scripts/make-bundle.sh 1.5.1

set -euo pipefail

VERSION="${1:?Usage: bash scripts/make-bundle.sh <version> (e.g. 1.5.1)}"
REPO="underwindAdmin/healthyboss"
ZIP_NAME="acupoints3d-web-v${VERSION}.zip"

echo "=== Building OTA bundle v${VERSION} ==="

# Step 1: sync web assets
echo "[1/5] Syncing www/ ..."
npm run www:sync

# Step 2: remove hidden files that break Capgo unzip
echo "[2/5] Cleaning hidden files ..."
find www -name ".DS_Store" -delete 2>/dev/null || true
find www -name "._*" -delete 2>/dev/null || true
rm -rf www/__MACOSX 2>/dev/null || true

# Step 3: create zip from www/ root
echo "[3/5] Creating ${ZIP_NAME} ..."
(cd www && zip -r "../${ZIP_NAME}" . -x ".*" -x "__MACOSX/*")

# Step 4: verify zip structure
echo "[4/5] Verifying zip ..."
ZIP_LIST=$(unzip -l "${ZIP_NAME}")
if ! echo "${ZIP_LIST}" | grep -q "index.html"; then
  echo "ERROR: index.html not found at zip root!" >&2
  exit 1
fi
if echo "${ZIP_LIST}" | grep -qE "\.DS_Store|__MACOSX"; then
  echo "ERROR: Hidden files detected in zip!" >&2
  exit 1
fi
echo "  Zip OK: $(du -h "${ZIP_NAME}" | cut -f1)"

# Step 5: generate version.json
echo "[5/5] Generating version.json ..."
mkdir -p dist
cp "${ZIP_NAME}" dist/
cat > version.json << VEOF
{
  "version": "${VERSION}",
  "zipUrl": "https://cdn.jsdelivr.net/gh/${REPO}@main/dist/${ZIP_NAME}",
  "notes": "Web bundle v${VERSION}",
  "notesCn": "网页包 v${VERSION}",
  "minNativeVersion": "1.5.0"
}
VEOF

echo ""
echo "=== Done ==="
echo "  Bundle: ${ZIP_NAME}"
echo "  Dist:   dist/${ZIP_NAME}"
echo "  Manifest: version.json"
echo ""
echo "Next steps:"
echo "  1. Commit & push version.json + dist/ to main"
echo "  2. Purge jsDelivr cache:"
echo "     curl https://purge.jsdelivr.net/gh/${REPO}@main/version.json"
echo "     curl https://purge.jsdelivr.net/gh/${REPO}@main/dist/${ZIP_NAME}"
