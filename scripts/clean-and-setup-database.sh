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
echo "🔧 Initializing Database Schema..."
echo "================================"

# Run database initialization script
npx tsx scripts/init-database.ts

echo ""
echo "📊 Populating Realistic NZ Earthquake Data..."
echo "================================"

# Run realistic NZ data population script
npx tsx scripts/populate-realistic-nz-data.ts

echo ""
echo "✅ Database setup complete!"
echo "================================"

