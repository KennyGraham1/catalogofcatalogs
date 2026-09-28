#!/bin/bash
# Clean and Setup Database Script
# Resets the MongoDB database (with a typed confirmation naming it) and
# recreates empty collections/indexes.
#
# `set -euo pipefail`: any failed step (a refused confirmation, a failed reset,
# a failed init) now stops the script instead of it printing "complete" anyway
# (the previous version had no `set -e` at all).
set -euo pipefail

# Pass --yes through for non-interactive/CI use: `./clean-and-setup-database.sh --yes`.
EXTRA_ARGS=()
if [[ "${1:-}" == "--yes" ]]; then
    EXTRA_ARGS+=("--yes")
fi

echo "🧹 Cleaning Database..."
echo "================================"

# Remove the legacy SQLite file, if one is still lying around from before the
# MongoDB migration (a542dc1). Harmless no-op otherwise.
if [ -f "merged_catalogues.db" ]; then
    echo "✓ Removing old SQLite file..."
    rm merged_catalogues.db
    echo "✓ SQLite file removed"
fi

echo ""
echo "🗄️  Resetting MongoDB..."
echo "================================"
# The actual database wipe, with its own "type the database name" confirmation
# (scripts/lib/db-reset.ts) — this used to be a no-op (only the SQLite file above
# was ever touched), so every catalogue and event survived a "clean".
npx tsx scripts/lib/db-reset.ts "${EXTRA_ARGS[@]}"

echo ""
echo "🔧 Initializing Database Schema..."
echo "================================"
npx tsx scripts/init-database.ts

echo ""
echo "✅ Database is clean and re-initialized (empty)."
echo "================================"
echo ""
# scripts/populate-realistic-nz-data.ts, previously invoked here, was deleted in
# 401ffa0 — this step has not run successfully since before the MongoDB
# migration. Point at the population paths that actually exist instead of
# shelling out to a missing script.
echo "📊 Populate it with data"
echo "================================"
echo "This script no longer populates synthetic data itself. To add data:"
echo ""
echo "  Synthetic NZ test catalogues (writes JSON files, then import via the UI/API):"
echo "    python3 scripts/generate_test_data.py"
echo ""
echo "  Real GeoNet baseline catalogue:"
echo "    npx tsx scripts/populate-geonet-baseline.ts"
echo ""
echo "  Or visit http://localhost:3000/import to import data manually."
echo ""
