/**
 * Script to download NZ Active Faults data from GNS Science WFS service
 * and save it as a local GeoJSON file
 */

import fs from 'fs';
import path from 'path';
import https from 'https';

const WFS_URL = 'https://maps.gns.cri.nz/gns/wfs';

async function downloadFaultData() {
  console.log('Downloading NZ Active Faults data from GNS Science...\n');

  try {
    // Construct WFS GetFeature request for all NZ faults
    const params = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeName: 'gns:AF250.FAULTS',
      outputFormat: 'application/json',
      srsName: 'EPSG:4326',
      // Get all faults for New Zealand region
      bbox: '166.0,-47.5,179.0,-34.0,EPSG:4326',
    });

    const url = `${WFS_URL}?${params.toString()}`;
    console.log('Fetching from:', url);

    const response = await new Promise<string>((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve(data));
        res.on('error', reject);
      }).on('error', reject);
    });

    const data = JSON.parse(response);

    console.log(`✓ Downloaded ${data.features?.length || 0} fault features`);

    // Create public/data directory if it doesn't exist
    const dataDir = path.join(process.cwd(), 'public', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('✓ Created public/data directory');
    }

    // Save to file
    const outputPath = path.join(dataDir, 'nz-active-faults.geojson');
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

    console.log(`✓ Saved fault data to: ${outputPath}`);
    console.log(`\nFile size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);

    // Print some statistics
    if (data.features && data.features.length > 0) {
      console.log('\nFault Data Statistics:');
      console.log(`- Total faults: ${data.features.length}`);
      
      // Count by slip type
      const slipTypes: Record<string, number> = {};
      data.features.forEach((feature: any) => {
        const slipType = feature.properties?.SLIP_TYPE || 'Unknown';
        slipTypes[slipType] = (slipTypes[slipType] || 0) + 1;
      });
      
      console.log('\nFaults by slip type:');
      Object.entries(slipTypes)
        .sort((a, b) => b[1] - a[1])
        .forEach(([type, count]) => {
          console.log(`  - ${type}: ${count}`);
        });

      // Sample fault names
      console.log('\nSample fault names:');
      data.features.slice(0, 10).forEach((feature: any) => {
        const name = feature.properties?.NAME || 'Unnamed';
        const slipType = feature.properties?.SLIP_TYPE || 'Unknown';
        console.log(`  - ${name} (${slipType})`);
      });
    }

    console.log('\n✓ Download complete!');

  } catch (error) {
    console.error('Error downloading fault data:', error);
    process.exit(1);
  }
}

// Run the download
downloadFaultData();

