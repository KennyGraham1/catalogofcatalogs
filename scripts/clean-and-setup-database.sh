#!/bin/bash

# Clean and Setup Database Script
# This script removes the old database, runs migration, and populates test data

echo "🧹 Cleaning Database..."
echo "================================"

# Remove old database file
if [ -f "merged_catalogues.db" ]; then
    echo "✓ Removing old database file..."
    rm merged_catalogues.db
    echo "✓ Database file removed"
else
    echo "ℹ No existing database file found"
fi

echo ""
echo "🔧 Running Database Migration..."
echo "================================"

# Run migration script
npx tsx scripts/migrate-database.ts

echo ""
echo "📊 Populating Test Data..."
echo "================================"

# Run test data population script
node scripts/populate-test-data.js

echo ""
echo "✅ Database setup complete!"
echo "================================"
echo ""
echo "Summary:"
echo "- Old database removed"
echo "- New database created with QuakeML 1.2 schema"
echo "- Test data populated (5 catalogues, ~192 events)"
echo ""
echo "You can now start the application with: npm run dev"

