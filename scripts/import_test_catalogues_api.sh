#!/bin/bash
# Import test catalogues using the application's API
# Make sure the application is running on http://localhost:3001

set -e

API_URL="http://localhost:3001/api"
TEST_DATA_DIR="test-data"

echo "============================================================"
echo "Earthquake Catalogue Import Tool (API Method)"
echo "============================================================"
echo ""

# Check if server is running
if ! curl -s "${API_URL}/catalogues" > /dev/null 2>&1; then
    echo "❌ Error: Application is not running on http://localhost:3001"
    echo "Please start the application first:"
    echo "  npm run dev"
    exit 1
fi

echo "✓ Application is running"
echo ""

# Function to import a catalogue
import_catalogue() {
    local file=$1
    local filepath="${TEST_DATA_DIR}/${file}"
    
    if [ ! -f "$filepath" ]; then
        echo "❌ Error: File not found: $filepath"
        return 1
    fi
    
    echo "Importing: $file"
    
    # Read the JSON file
    local catalogue_data=$(cat "$filepath")
    local catalogue_name=$(echo "$catalogue_data" | jq -r '.catalogue_name')
    local description=$(echo "$catalogue_data" | jq -r '.description')
    local region=$(echo "$catalogue_data" | jq -r '.region')
    
    echo "  Catalogue: $catalogue_name"
    echo "  Region: $region"
    
    # Create catalogue
    local create_response=$(curl -s -X POST "${API_URL}/catalogues" \
        -H "Content-Type: application/json" \
        -d "{\"name\": \"$catalogue_name\", \"description\": \"$description\"}")
    
    local catalogue_id=$(echo "$create_response" | jq -r '.id')
    
    if [ "$catalogue_id" = "null" ] || [ -z "$catalogue_id" ]; then
        echo "  ❌ Failed to create catalogue"
        echo "  Response: $create_response"
        return 1
    fi
    
    echo "  ✓ Created catalogue with ID: $catalogue_id"
    
    # Import events in batches
    local events=$(echo "$catalogue_data" | jq -c '.events[]')
    local total=$(echo "$catalogue_data" | jq '.events | length')
    local count=0
    local focal_mech_count=0
    
    echo "  Importing $total events..."
    
    while IFS= read -r event; do
        # Import event
        curl -s -X POST "${API_URL}/catalogues/${catalogue_id}/events" \
            -H "Content-Type: application/json" \
            -d "$event" > /dev/null
        
        # Check if event has focal mechanism
        if echo "$event" | jq -e '.focal_mechanisms' > /dev/null 2>&1; then
            ((focal_mech_count++))
        fi
        
        ((count++))
        
        # Progress indicator
        if [ $((count % 50)) -eq 0 ]; then
            printf "\r  Progress: %d/%d events" "$count" "$total"
        fi
    done <<< "$events"
    
    printf "\r  ✓ Imported %d events (%d with focal mechanisms)\n" "$count" "$focal_mech_count"
    echo ""
}

# Import all catalogues
import_catalogue "new-zealand-catalogue.json"
import_catalogue "california-catalogue.json"
import_catalogue "japan-catalogue.json"

echo "============================================================"
echo "IMPORT COMPLETE"
echo "============================================================"
echo ""
echo "✓ All catalogues imported successfully!"
echo ""
echo "You can now:"
echo "  1. View catalogues at: http://localhost:3001/catalogues"
echo "  2. Test geographic filtering with the bounds from each region"
echo "  3. View focal mechanisms for M≥5.0 events on the map"
echo "============================================================"

