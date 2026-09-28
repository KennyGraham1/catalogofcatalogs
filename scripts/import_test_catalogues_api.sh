#!/bin/bash
# Import the scripts/generate_test_data.py catalogues through the application's
# real authenticated API. Make sure the application is running (APP_URL, default
# http://localhost:3000) and CATALOGUE_API_EMAIL / CATALOGUE_API_PASSWORD name an
# existing Editor-or-Admin account: creating a catalogue requires Editor
# permissions (lib/auth/types.ts ROLE_PERMISSIONS), and self-registered accounts
# are Viewers.
#
# This script previously could never import anything (finding gp#6):
#   - it POSTed each event to /api/catalogues/<id>/events, which has never had a
#     POST handler (app/api/catalogues/[id]/events/route.ts exports only GET),
#     and threw the (always-erroring) response away with `> /dev/null`;
#   - under `set -e`, `((count++))` starting from count=0 evaluates to 0, and a
#     `(( ))` arithmetic command returns exit status 1 when its value is 0 (the
#     bash manual), so errexit silently killed the script after the first event
#     on bash >= 4.1 (the shebang's #!/bin/bash, e.g. 5.2 here);
#   - it looked for test-data/new-zealand-, california- and japan-catalogue.json,
#     while scripts/generate_test_data.py has always written
#     test-data/north-island-, south-island- and deep-events-catalogue.json.
#
# The redesign below sidesteps the first two problems structurally rather than
# patching them: POST /api/catalogues (app/api/catalogues/route.ts) accepts the
# full `events` array inline in the SAME request that creates the catalogue —
# there was never a need for a separate per-event call or a per-event counter.
# Every step checks an HTTP status code and fails loudly with guidance instead
# of continuing past an error.

set -euo pipefail

APP_URL="${APP_URL:-http://localhost:3000}"
API_URL="${APP_URL}/api"
TEST_DATA_DIR="test-data"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

require_cmd() {
    command -v "$1" > /dev/null 2>&1 || { echo "❌ Error: '$1' is required but not installed." >&2; exit 1; }
}
require_cmd curl
require_cmd jq

echo "============================================================"
echo "Earthquake Catalogue Import Tool (API Method)"
echo "============================================================"
echo ""

# Check the server is up AND answering, not just that curl could connect —
# `curl -s ... > /dev/null 2>&1` (the old check) is 0 even for a 404/500.
health_status=$(curl -s -o /dev/null -w '%{http_code}' "${API_URL}/catalogues" || echo "000")
if [ "$health_status" != "200" ]; then
    echo "❌ Error: Application is not reachable at ${APP_URL} (HTTP ${health_status})." >&2
    echo "Start it first: npm run dev   (or set APP_URL to point elsewhere)" >&2
    exit 1
fi
echo "✓ Application is running at ${APP_URL}"
echo ""

if [ -z "${CATALOGUE_API_EMAIL:-}" ] || [ -z "${CATALOGUE_API_PASSWORD:-}" ]; then
    echo "❌ Error: CATALOGUE_API_EMAIL and CATALOGUE_API_PASSWORD must be set, naming" >&2
    echo "an existing Editor-or-Admin account." >&2
    echo "" >&2
    echo "  export CATALOGUE_API_EMAIL=you@example.com" >&2
    echo "  export CATALOGUE_API_PASSWORD='...'" >&2
    echo "  npx tsx scripts/promote-to-admin.ts you@example.com   # if that account is only a Viewer" >&2
    exit 1
fi

echo "🔐 Signing in as ${CATALOGUE_API_EMAIL}..."

# Standard NextAuth credentials-provider curl login: fetch a CSRF token, POST it
# with the credentials, and keep the resulting session cookie in the jar for
# every request after this (HttpOnly only restricts browser JS, not curl).
csrf_token=$(curl -s -c "$COOKIE_JAR" "${APP_URL}/api/auth/csrf" | jq -r '.csrfToken // empty')
if [ -z "$csrf_token" ]; then
    echo "❌ Error: could not fetch a CSRF token from ${APP_URL}/api/auth/csrf" >&2
    exit 1
fi

login_status=$(curl -s -o /dev/null -w '%{http_code}' \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -X POST "${APP_URL}/api/auth/callback/credentials?json=true" \
    --data-urlencode "csrfToken=${csrf_token}" \
    --data-urlencode "email=${CATALOGUE_API_EMAIL}" \
    --data-urlencode "password=${CATALOGUE_API_PASSWORD}")
if [ "$login_status" -ge 400 ]; then
    echo "❌ Error: sign-in request failed (HTTP ${login_status})." >&2
    exit 1
fi

# The credentials callback redirects either way (invalid login -> the sign-in
# page with ?error=), so confirm success by reading back an authenticated
# session rather than trusting its own status code.
session_json=$(curl -s -b "$COOKIE_JAR" "${APP_URL}/api/auth/session")
signed_in_email=$(echo "$session_json" | jq -r '.user.email // empty')
if [ -z "$signed_in_email" ]; then
    echo "❌ Error: sign-in did not produce a session — check CATALOGUE_API_EMAIL/CATALOGUE_API_PASSWORD." >&2
    echo "  Response: ${session_json}" >&2
    exit 1
fi
signed_in_role=$(echo "$session_json" | jq -r '.user.role // "unknown"')
echo "✓ Signed in as ${signed_in_email} (role: ${signed_in_role})"
if [ "$signed_in_role" != "editor" ] && [ "$signed_in_role" != "admin" ]; then
    echo "❌ Error: role \"${signed_in_role}\" cannot create catalogues (Editor or Admin required)." >&2
    exit 1
fi
echo ""

# Function to import a catalogue
import_catalogue() {
    local file=$1
    local filepath="${TEST_DATA_DIR}/${file}"

    if [ ! -f "$filepath" ]; then
        echo "❌ Error: File not found: $filepath" >&2
        echo "  Generate it first: python3 scripts/generate_test_data.py" >&2
        return 1
    fi

    echo "Importing: $file"

    local catalogue_name event_count payload body_file http_status
    catalogue_name=$(jq -r '.catalogue_name' "$filepath")
    event_count=$(jq '.events | length' "$filepath")
    echo "  Catalogue: $catalogue_name"
    echo "  Region: $(jq -r '.region' "$filepath")"
    echo "  Events: $event_count"

    # One request creates the catalogue AND its events — POST /api/catalogues
    # accepts `events` inline (app/api/catalogues/route.ts); there is no
    # separate per-event endpoint, which is what made the old per-event loop
    # fail on every single call.
    payload=$(jq -c '{name: .catalogue_name, description: .description, events: .events}' "$filepath")
    body_file=$(mktemp)
    http_status=$(curl -s -o "$body_file" -w '%{http_code}' \
        -b "$COOKIE_JAR" \
        -X POST "${API_URL}/catalogues" \
        -H "Content-Type: application/json" \
        -d "$payload")

    if [ "$http_status" -ge 300 ]; then
        echo "  ❌ Failed to create catalogue (HTTP ${http_status})" >&2
        echo "  Response: $(cat "$body_file")" >&2
        rm -f "$body_file"
        return 1
    fi

    local catalogue_id imported total
    catalogue_id=$(jq -r '.id // empty' "$body_file")
    imported=$(jq -r '.validationReport.successfullyImported // empty' "$body_file")
    total=$(jq -r '.validationReport.totalSubmitted // empty' "$body_file")
    rm -f "$body_file"

    if [ -z "$catalogue_id" ]; then
        echo "  ❌ Response did not include a catalogue id (HTTP ${http_status}, but no id in body)" >&2
        return 1
    fi

    echo "  ✓ Created catalogue with ID: $catalogue_id"
    echo "  ✓ Imported ${imported:-?} of ${total:-$event_count} events"
    echo ""
}

failures=0
for f in north-island-catalogue.json south-island-catalogue.json deep-events-catalogue.json; do
    import_catalogue "$f" || failures=$((failures + 1))
done

echo "============================================================"
if [ "$failures" -eq 0 ]; then
    echo "IMPORT COMPLETE"
    echo "============================================================"
    echo ""
    echo "✓ All catalogues imported successfully!"
    echo ""
    echo "You can now:"
    echo "  1. View catalogues at: ${APP_URL}/catalogues"
    echo "  2. Test geographic filtering with the bounds from each region"
    echo "  3. View focal mechanisms for M≥5.0 events on the map"
    echo "============================================================"
else
    echo "IMPORT FINISHED WITH ${failures} FAILURE(S) — see errors above" >&2
    echo "============================================================" >&2
    exit 1
fi
