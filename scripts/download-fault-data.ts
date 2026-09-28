/**
 * Script to download NZ Active Faults data from GNS Science WFS service
 * and save it as a local GeoJSON file
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { summarizeFaultFeatures } from './lib/fault-summary';

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

    // Print some statistics. summarizeFaultFeatures (scripts/lib/fault-summary.ts)
    // reads the AF250 layer's real, lower-case property names (`name`,
    // `slip_type`) — this used to read SLIP_TYPE/NAME, which are absent from the
    // real file, so every fault fell into "Unknown" and every sample name
    // printed "Unnamed".
    if (data.features && data.features.length > 0) {
      const summary = summarizeFaultFeatures(data.features);

      console.log('\nFault Data Statistics:');
      console.log(`- Total faults: ${summary.totalFaults}`);

      console.log('\nFaults by slip type:');
      summary.slipTypeCounts.forEach(([type, count]) => {
        console.log(`  - ${type}: ${count}`);
      });

      // Sample fault names
      console.log('\nSample fault names:');
      summary.sampleNames.forEach(({ name, slipType }) => {
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

