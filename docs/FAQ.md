# Frequently Asked Questions (FAQ)

## Table of Contents

1. [General Questions](#general-questions)
2. [Data Import & Upload](#data-import--upload)
3. [Data Quality & Validation](#data-quality--validation)
4. [Visualization & Maps](#visualization--maps)
5. [Merging Catalogues](#merging-catalogues)
6. [Export & Integration](#export--integration)
7. [Performance & Scalability](#performance--scalability)
8. [Troubleshooting](#troubleshooting)
9. [Technical Questions](#technical-questions)

---

## General Questions

### What is the Earthquake Catalogue Platform?

The Earthquake Catalogue Platform is a comprehensive web application for managing, analyzing, and visualizing earthquake catalogue data. It supports multiple data formats, automated imports from GeoNet, advanced merging capabilities, and sophisticated visualization tools.

### Who is this platform for?

The platform is designed for:
- Seismologists and earthquake researchers
- Geological survey organizations
- Emergency management agencies
- Academic institutions
- Anyone working with earthquake catalogue data

### What data formats are supported?

The platform supports:
- **CSV** (Comma-Separated Values)
- **TXT** (Tab or space-delimited text)
- **JSON** (JavaScript Object Notation)
- **QuakeML** (XML format - full QuakeML 1.2 BED specification)

### Is the platform free to use?

Yes, the platform is open-source and free to use. It's developed for the seismological community.

### Can I use this platform offline?

Yes, the platform can run entirely offline once deployed. The only feature requiring internet connectivity is the GeoNet import functionality.

---

## Data Import & Upload

### How do I import data from GeoNet?

1. Navigate to the **Import** page
2. Configure your import parameters (time range, magnitude filters, etc.)
3. Click "Start Import"
4. View import results and statistics

See the [User Guide](USER_GUIDE.md#importing-from-geonet) for detailed instructions.

### What is the maximum file size I can upload?

The maximum file size is 500 MB. This limit is configured to accommodate large earthquake catalogue files.

### Can I upload multiple files at once?

Currently, the platform supports uploading one file at a time. However, you can merge multiple catalogues after uploading them separately.

### How do I map custom field names to standard fields?

During the upload process:
1. The platform automatically detects common field names
2. Review the field mapping interface
3. Manually map any unrecognized fields
4. Save the mapping as a template for future use

### Can I update existing events with new data?

Yes, when importing from GeoNet, enable the "Update Existing Events" option. The platform will update events that already exist in your catalogue based on their source ID.

### What happens to duplicate events during import?

The platform uses intelligent duplicate detection based on:
- Event time (within configurable window)
- Location (within configurable distance)
- Magnitude (within configurable difference)

You can choose to skip duplicates or update existing events.

---

## Data Quality & Validation

### How is data quality assessed?

The platform uses a comprehensive quality scoring system that evaluates:
- **Location Quality** (30%): Horizontal and vertical uncertainties
- **Network Geometry** (25%): Azimuthal gap and station distribution
- **Solution Quality** (25%): Phase counts and RMS residual
- **Magnitude Quality** (20%): Station count and magnitude uncertainty

Events are graded from A+ (excellent) to F (poor).

### What are the required fields for earthquake events?

Required fields:
- **time**: Event origin time (ISO 8601 format)
- **latitude**: Latitude in decimal degrees (-90 to 90)
- **longitude**: Longitude in decimal degrees (-180 to 180)
- **magnitude**: Event magnitude (typically -2 to 10)

All other fields are optional but recommended for quality assessment.

### How do I filter events by quality?

1. Navigate to the **Analytics** page
2. Go to the **Quality** tab
3. View quality distribution
4. Use filters to select events by quality grade

### What validation is performed on uploaded data?

The platform validates:
- Required fields are present
- Data types are correct
- Values are within valid ranges
- Cross-field consistency (e.g., depth vs. location)
- Temporal ordering
- Geographic bounds

See the [Data Validation Guide](DATA_VALIDATION_GUIDE.md) for complete details.

### Can I customize quality scoring criteria?

Currently, quality scoring uses fixed criteria based on seismological best practices. Custom scoring may be added in a future release.

---

## Visualization & Maps

### Why are my earthquake markers not showing on the map?

Common causes:
- Events are outside the current map view (zoom out or pan)
- Filters are too restrictive (check magnitude, depth, time filters)
- Map tiles failed to load (check internet connection)
- Browser cache issue (try refreshing the page)

### How do I change the map color scheme?

On the map visualization:
1. Look for the color mode selector
2. Choose from:
   - **Magnitude**: Color by earthquake magnitude
   - **Depth**: Color by depth below surface
   - **Quality**: Color by quality score

### What are the triangular markers on the map?

Triangular markers represent seismic stations (not earthquake events). They show the locations of seismometers that recorded the earthquakes.

### Can I export the map as an image?

Currently, the platform doesn't have a built-in map export feature. You can use your browser's screenshot functionality or print to PDF.

### What are uncertainty ellipses?

Uncertainty ellipses visualize the location uncertainty of earthquake events. The size and shape of the ellipse represent the horizontal uncertainty in latitude and longitude.

### How do I view focal mechanisms?

1. Navigate to the **Analytics** page
2. Go to the **Details** tab
3. Select an event with focal mechanism data
4. View the beach ball diagram showing the fault plane solution

### Why is the map loading slowly?

Possible causes:
- Large number of events (>10,000)
- Slow internet connection (for map tiles)
- Browser performance

Solutions:
- Use filters to reduce displayed events
- Ensure good internet connection
- Try a different browser

---

## Merging Catalogues

### When should I merge catalogues?

Merge catalogues when you want to:
- Combine data from multiple sources
- Create a unified regional catalogue
- Compare and consolidate duplicate events
- Build a comprehensive dataset

### How does duplicate detection work during merging?

The platform matches events based on:
- **Time Window**: Events within X seconds are potential duplicates
- **Distance Threshold**: Events within X kilometers are potential duplicates
- **Magnitude Difference**: Events with magnitude difference < X are potential duplicates

All three criteria must be met for events to be considered duplicates.

### What are the conflict resolution strategies?

When duplicate events are found, you can choose:
- **Prefer First**: Use values from the first catalogue
- **Prefer Last**: Use values from the last catalogue
- **Prefer Largest Magnitude**: Use the event with the largest magnitude
- **Prefer Best Quality**: Use the event with the highest quality score

### Can I undo a merge?

No, merges cannot be undone. The merged catalogue is a new catalogue, and the original catalogues remain unchanged. You can delete the merged catalogue if needed.

### How long does merging take?

Merge time depends on:
- Number of catalogues
- Total number of events
- Matching rule strictness

Typical merge times:
- 1,000 events: < 1 second
- 10,000 events: 1-5 seconds
- 100,000 events: 10-30 seconds

---

## Export & Integration

### What export formats are available?

The platform supports:
- **CSV**: Spreadsheet format
- **JSON**: Structured data format
- **GeoJSON**: Geographic data format (for GIS)
- **KML**: Google Earth format
- **QuakeML**: Standard seismological XML format

### How do I export to Google Earth?

1. Navigate to the catalogue you want to export
2. Click the "Export" dropdown
3. Select "KML (Google Earth)"
4. Open the downloaded file in Google Earth

### Can I use the exported data in GIS software?

Yes, export to **GeoJSON** format for use in:
- QGIS
- ArcGIS
- MapInfo
- Other GIS applications

### Does the QuakeML export include all metadata?

Yes, the QuakeML export includes:
- Event origins and uncertainties
- Magnitudes and uncertainties
- Picks and arrivals (if available)
- Focal mechanisms (if available)
- Station magnitudes (if available)
- Evaluation metadata

### Can I import QuakeML files?

Yes, the platform supports QuakeML 1.2 BED (Basic Event Description) format for both import and export.

### How do I integrate with other systems?

The platform provides a REST API for integration. See the [API Reference](API_REFERENCE.md) for complete documentation.

---

## Performance & Scalability

### How many events can the platform handle?

The platform has been tested with:
- **10,000 events**: Excellent performance
- **50,000 events**: Good performance
- **100,000+ events**: Acceptable performance with pagination

For very large catalogues (>100,000 events), consider:
- Using filters to reduce displayed events
- Splitting into regional catalogues
- Increasing server resources

### Why is the application slow?

Common causes:
- Large catalogue size (>50,000 events)
- Complex visualizations (uncertainty ellipses, focal mechanisms)
- Limited server resources
- Database not optimized

Solutions:
- Use pagination and filters
- Increase server RAM
- Run database VACUUM and ANALYZE
- Enable caching

### Can I run this on a Raspberry Pi?

Yes, but performance will be limited. Recommended for:
- Small catalogues (<5,000 events)
- Personal use
- Testing and development

Not recommended for:
- Large catalogues
- Multiple concurrent users
- Production deployments

### How do I improve database performance?

1. **Run VACUUM**:
   ```bash
   sqlite3 merged_catalogues.db "VACUUM;"
   ```

2. **Analyze tables**:
   ```bash
   sqlite3 merged_catalogues.db "ANALYZE;"
   ```

3. **Check indexes**:
   ```bash
   sqlite3 merged_catalogues.db ".indexes"
   ```

4. **Enable WAL mode**:
   ```bash
   sqlite3 merged_catalogues.db "PRAGMA journal_mode=WAL;"
   ```

---

## Troubleshooting

### The application won't start

Check:
1. Node.js version (must be 18.x or higher)
2. Dependencies installed (`npm install`)
3. Database initialized (`npm run tsx scripts/init-database.ts`)
4. Port 3000 is available
5. Environment variables are set

### I get "Database is locked" errors

Causes:
- Multiple processes accessing the database
- Crashed process left lock file

Solutions:
```bash
# Remove journal file
rm merged_catalogues.db-journal

# Restart application
npm run dev
```

### Import from GeoNet fails

Check:
1. Internet connection
2. GeoNet service is online (https://www.geonet.org.nz)
3. Filter parameters are valid
4. Date range is within GeoNet's coverage

### Map tiles are not loading

Causes:
- No internet connection
- Tile server is down
- Browser blocking requests

Solutions:
- Check internet connection
- Try refreshing the page
- Check browser console for errors

### Upload fails with "Parse error"

Causes:
- Unsupported file format
- Corrupted file
- Invalid data format

Solutions:
- Verify file format (CSV, TXT, JSON, QuakeML)
- Check file encoding (UTF-8 recommended)
- Validate data structure
- Try a smaller sample file first

---

## Technical Questions

### What database does the platform use?

SQLite3 - a lightweight, file-based database that requires no separate server.

### Can I use PostgreSQL or MySQL instead?

Currently, only SQLite is supported. Support for other databases may be added in future releases.

### Is there a REST API?

Yes, the platform provides a comprehensive REST API. See the [API Reference](API_REFERENCE.md) for complete documentation.

### Can I customize the user interface?

Yes, the platform is built with React and Tailwind CSS. You can customize:
- Colors and themes
- Component layouts
- Add new features
- Modify existing functionality

See the [Developer Guide](DEVELOPER_GUIDE.md) for details.

### How do I contribute to the project?

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a merge request

See the [Developer Guide](DEVELOPER_GUIDE.md#contributing) for contribution guidelines.

### Is there a mobile app?

No, but the web interface is responsive and works on mobile devices.

### Can I run this in the cloud?

Yes, the platform can be deployed to:
- AWS (EC2, Elastic Beanstalk)
- Google Cloud Platform
- Azure
- DigitalOcean
- Any VPS provider

See the [Deployment Guide](DEPLOYMENT_GUIDE.md) for instructions.

### What license is the platform released under?

Check the LICENSE file in the repository for licensing information.

### How do I report bugs or request features?

- Create an issue in the GitLab repository
- Contact the development team
- Submit a merge request with fixes

### Is there commercial support available?

Contact GNS Science for information about commercial support and custom development.

---

## Additional Resources

- **[User Guide](USER_GUIDE.md)**: Complete user documentation
- **[Developer Guide](DEVELOPER_GUIDE.md)**: Technical documentation for developers
- **[API Reference](API_REFERENCE.md)**: Complete API documentation
- **[Deployment Guide](DEPLOYMENT_GUIDE.md)**: Production deployment instructions
- **[Data Validation Guide](DATA_VALIDATION_GUIDE.md)**: Data quality and validation details

---

*Last Updated: October 2024*

*Have a question not answered here? Contact the development team or create an issue in the repository.*
