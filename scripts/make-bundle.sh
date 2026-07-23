#!/usr/bin/env bash
# make-bundle.sh — Build a Capgo-compatible OTA update bundle
#
# Two modes (run in this order to avoid the commit-hash chicken-and-egg):
#   bash scripts/make-bundle.sh <version> --zip
#       1) sync www/, 2) clean hidden files, 3) zip into dist/, 4) verify
#       -> then: git add + commit, so the zip exists in a commit hash
#   bash scripts/make-bundle.sh <version> --manifest
#       reads the CURRENT commit hash (which now contains the zip) and
#       writes version.json pointing at jsDelivr @<hash>
#       -> then: git add version.json + commit + push
#
# Example:
#   bash scripts/make-bundle.sh 1.5.2 --zip
#   git add main.js dist/ && git commit -m "release: web bundle v1.5.2"
#   bash scripts/make-bundle.sh 1.5.2 --manifest
#   git add version.json && git commit -m "chore: manifest v1.5.2" && git push

set -euo pipefail

VERSION="${1:?Usage: bash scripts/make-bundle.sh <version> [--zip|--manifest]}"
MODE="${2:---zip}"
REPO="underwindAdmin/healthyboss"
ZIP_NAME="acupoints3d-web-v${VERSION}.zip"

case "${MODE}" in
  --zip)
    echo "=== Building OTA bundle v${VERSION} ==="

    echo "[1/4] Syncing www/ ..."
    npm run www:sync

    echo "[2/4] Cleaning hidden files ..."
    find www -name ".DS_Store" -delete 2>/dev/null || true
    find www -name "._*" -delete 2>/dev/null || true
    rm -rf www/__MACOSX 2>/dev/null || true

    echo "[3/4] Creating dist/${ZIP_NAME} ..."
    mkdir -p dist
    (cd www && zip -r "../dist/${ZIP_NAME}" . -x ".*" -x "__MACOSX/*")

    echo "[4/4] Verifying zip ..."
    ZIP_LIST=$(unzip -l "dist/${ZIP_NAME}")
    if ! echo "${ZIP_LIST}" | grep -q "index.html"; then
      echo "ERROR: index.html not found at zip root!" >&2
      exit 1
    fi
    if echo "${ZIP_LIST}" | grep -qE "\.DS_Store|__MACOSX"; then
      echo "ERROR: Hidden files detected in zip!" >&2
      exit 1
    fi
    echo "  Zip OK: dist/${ZIP_NAME} ($(du -h "dist/${ZIP_NAME}" | cut -f1))"
    echo ""
    echo "NEXT: git add dist/${ZIP_NAME} (plus your code changes) && git commit"
    echo "      then run: bash scripts/make-bundle.sh ${VERSION} --manifest"
    ;;

  --manifest)
    COMMIT=$(git rev-parse HEAD)
    echo "=== Generating version.json for v${VERSION} @ commit ${COMMIT} ==="

    # The zip must already exist in this commit, otherwise jsDelivr 404s forever
    if ! git cat-file -e "HEAD:dist/${ZIP_NAME}" 2>/dev/null; then
      echo "ERROR: dist/${ZIP_NAME} is not committed at HEAD (${COMMIT})." >&2
      echo "Run --zip first, commit the zip, then re-run --manifest." >&2
      exit 1
    fi

    cat > version.json << VEOF
{
  "version": "${VERSION}",
  "zipUrl": "https://cdn.jsdelivr.net/gh/${REPO}@${COMMIT}/dist/${ZIP_NAME}",
  "notes": "Web bundle v${VERSION}",
  "notesCn": "网页包 v${VERSION}",
  "minNativeVersion": "1.5.0"
}
VEOF
    echo "  version.json written:"
    cat version.json
    echo ""
    echo "NEXT: git add version.json && git commit && git push"
    echo "      verify: curl https://rawcdn.githack.com/${REPO}/main/version.json"
    ;;

  *)
    echo "Unknown mode: ${MODE} (use --zip or --manifest)" >&2
    exit 1
    ;;
esac
