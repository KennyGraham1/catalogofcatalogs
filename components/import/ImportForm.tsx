'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Download, CheckCircle, XCircle } from 'lucide-react';
import { ProgressOverlay } from '@/components/ui/ProgressOverlay';
import { InfoTooltip, TechnicalTermTooltip } from '@/components/ui/info-tooltip';
import { toast } from '@/hooks/use-toast';
import { NZ_NATIONAL_BOUNDS } from '@/lib/geo-bounds-utils';
import { invalidateCatalogueData } from '@/lib/client-cache';

export interface ImportResult {
  success: boolean;
  catalogueId: string;
  catalogueName: string;
  totalFetched: number;
  newEvents: number;
  updatedEvents: number;
  skippedEvents: number;
  // Rows not imported, by reason (see lib/geonet-import-service.ts ImportResult).
  collidedEvents?: number;
  invalidEvents?: number;
  excludedEvents?: number;
  excludedEventTypes?: Record<string, number>;
  failedEvents?: number;
  errors: string[];
  startTime: string;
  endTime: string;
  duration: number;
}

/** A catalogue as GET /api/catalogues returns it (only the fields used here). */
export interface ImportTargetCatalogue {
  id: string;
  name: string;
  merge_config?: string | null;
  event_count?: number;
}

interface ImportFormProps {
  readOnly?: boolean;
  /** Catalogues the page has loaded; the GeoNet import catalogues are offered as targets. */
  catalogues?: ImportTargetCatalogue[];
  /** Called when an import has run, so the page can refresh its catalogue list. */
  onImportComplete?: (result: ImportResult) => void;
}

const NEW_CATALOGUE = '__new__';
const DEFAULT_CATALOGUE_NAME = 'GeoNet - Automated Import';

/**
 * A catalogue the GeoNet importer created, recognised by the stamp it writes into
 * merge_config. The server applies the same test (isGeoNetImportCatalogue in
 * lib/geonet-import-service.ts) and refuses any other catalogue as a target.
 */
export function isGeoNetImportTarget(catalogue: Pick<ImportTargetCatalogue, 'merge_config'>): boolean {
  if (!catalogue.merge_config) return false;
  try {
    const config = JSON.parse(catalogue.merge_config);
    return !!config && typeof config === 'object' && config.source === 'GeoNet';
  } catch {
    return false;
  }
}

/**
 * A datetime-local value ('2024-10-24T00:00', which the form labels UTC) as an explicit
 * UTC ISO string. Sent bare, the server read it in ITS timezone and shifted the window.
 */
function datetimeLocalToUtc(value: string): string {
  return /T\d{2}:\d{2}$/.test(value) ? `${value}:00Z` : `${value}Z`;
}

export function ImportForm({ readOnly = false, catalogues = [], onImportComplete }: ImportFormProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importPhase, setImportPhase] = useState<string>('');

  // Form state
  const [timeRange, setTimeRange] = useState<'hours' | 'custom'>('hours');
  const [hours, setHours] = useState('24');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minMagnitude, setMinMagnitude] = useState('');
  const [maxMagnitude, setMaxMagnitude] = useState('');
  const [minDepth, setMinDepth] = useState('');
  const [maxDepth, setMaxDepth] = useState('');
  const [minLatitude, setMinLatitude] = useState('');
  const [maxLatitude, setMaxLatitude] = useState('');
  const [minLongitude, setMinLongitude] = useState('');
  const [maxLongitude, setMaxLongitude] = useState('');
  const [updateExisting, setUpdateExisting] = useState(false);
  const [target, setTarget] = useState<string>(NEW_CATALOGUE);
  const [catalogueName, setCatalogueName] = useState(DEFAULT_CATALOGUE_NAME);

  const importTargets = catalogues.filter(isGeoNetImportTarget);
  const addingToExisting = target !== NEW_CATALOGUE;

  // Helper to parse float safely, returning undefined for empty/invalid values
  const parseFloatSafe = (value: string): number | undefined => {
    if (!value || value.trim() === '') return undefined;
    const num = parseFloat(value);
    return isNaN(num) ? undefined : num;
  };

  const fillNzRegion = () => {
    setMinLatitude(String(NZ_NATIONAL_BOUNDS.minLatitude));
    setMaxLatitude(String(NZ_NATIONAL_BOUNDS.maxLatitude));
    setMinLongitude(String(NZ_NATIONAL_BOUNDS.minLongitude));
    setMaxLongitude(String(NZ_NATIONAL_BOUNDS.maxLongitude));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) {
      toast({
        title: 'Read-only mode',
        description: 'Log in to run GeoNet imports.',
        variant: 'destructive'
      });
      return;
    }

    // Client-side validation
    if (timeRange === 'custom') {
      if (!startDate || !endDate) {
        setError('Please enter both start and end dates.');
        return;
      }
      if (Date.parse(datetimeLocalToUtc(startDate)) > Date.parse(datetimeLocalToUtc(endDate))) {
        setError('Start date must be before end date.');
        return;
      }
    }

    // Parse and validate magnitude range
    const minMag = parseFloatSafe(minMagnitude);
    const maxMag = parseFloatSafe(maxMagnitude);
    if (minMag !== undefined && maxMag !== undefined && minMag > maxMag) {
      setError('Minimum magnitude cannot be greater than maximum magnitude.');
      return;
    }

    // Parse and validate depth range (km; the server accepts down to -5 km)
    const minDep = parseFloatSafe(minDepth);
    const maxDep = parseFloatSafe(maxDepth);
    if ((minDep !== undefined && minDep < -5) || (maxDep !== undefined && maxDep < -5)) {
      setError('Depths must be -5 km or deeper.');
      return;
    }
    if (minDep !== undefined && maxDep !== undefined && minDep > maxDep) {
      setError('Minimum depth cannot be greater than maximum depth.');
      return;
    }

    // Parse and validate latitude range
    const minLat = parseFloatSafe(minLatitude);
    const maxLat = parseFloatSafe(maxLatitude);
    if (minLat !== undefined && (minLat < -90 || minLat > 90)) {
      setError('Minimum latitude must be between -90 and 90.');
      return;
    }
    if (maxLat !== undefined && (maxLat < -90 || maxLat > 90)) {
      setError('Maximum latitude must be between -90 and 90.');
      return;
    }
    if (minLat !== undefined && maxLat !== undefined && minLat > maxLat) {
      setError('Minimum latitude cannot be greater than maximum latitude.');
      return;
    }

    // Parse and validate longitude range. A western edge east of the eastern edge is
    // not an error: it is a box across 180 degrees (RFC 7946 section 5.2), which the
    // server splits into two queries; it is how the Kermadec and Chatham Islands
    // are reached.
    const minLon = parseFloatSafe(minLongitude);
    const maxLon = parseFloatSafe(maxLongitude);
    if (minLon !== undefined && (minLon < -180 || minLon > 180)) {
      setError('Minimum longitude must be between -180 and 180.');
      return;
    }
    if (maxLon !== undefined && (maxLon < -180 || maxLon > 180)) {
      setError('Maximum longitude must be between -180 and 180.');
      return;
    }

    if (!addingToExisting && catalogueName.trim() === '') {
      setError('Please enter a name for the new catalogue.');
      return;
    }

    setIsImporting(true);
    setResult(null);
    setError(null);
    setImportPhase('Connecting to GeoNet API...');

    try {
      const body: Record<string, unknown> = {
        // Only an existing catalogue has events to update.
        updateExisting: addingToExisting && updateExisting,
      };
      if (addingToExisting) {
        body.catalogueId = target;
      } else {
        body.catalogueName = catalogueName.trim();
      }

      // Add time range
      if (timeRange === 'hours') {
        body.hours = parseInt(hours, 10);
      } else {
        body.startDate = datetimeLocalToUtc(startDate);
        body.endDate = datetimeLocalToUtc(endDate);
      }

      // Add magnitude filters (using pre-validated values)
      if (minMag !== undefined) {
        body.minMagnitude = minMag;
      }
      if (maxMag !== undefined) {
        body.maxMagnitude = maxMag;
      }

      // Add depth filters
      if (minDep !== undefined) {
        body.minDepth = minDep;
      }
      if (maxDep !== undefined) {
        body.maxDepth = maxDep;
      }

      // Add geographic filters (using pre-validated values)
      if (minLat !== undefined) {
        body.minLatitude = minLat;
      }
      if (maxLat !== undefined) {
        body.maxLatitude = maxLat;
      }
      if (minLon !== undefined) {
        body.minLongitude = minLon;
      }
      if (maxLon !== undefined) {
        body.maxLongitude = maxLon;
      }

      const response = await fetch('/api/import/geonet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      // Check Content-Type before parsing as JSON
      const contentType = response.headers.get('content-type') || '';
      let data: any;

      if (contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch (parseError) {
          // JSON parsing failed even though Content-Type was JSON
          const textBody = await response.clone().text().catch(() => 'Unable to read response');
          console.error('[ImportForm] Failed to parse JSON response:', textBody.substring(0, 500));
          throw new Error(
            `Server returned invalid JSON. Status: ${response.status}. ` +
            `Response preview: ${textBody.substring(0, 100)}...`
          );
        }
      } else {
        // Response is not JSON - try to extract error message from text
        const textBody = await response.text();
        console.error('[ImportForm] Received non-JSON response:', {
          status: response.status,
          contentType,
          body: textBody.substring(0, 500)
        });

        // Check if it looks like an HTML error page
        if (textBody.includes('<!DOCTYPE') || textBody.includes('<html')) {
          throw new Error(
            `Server returned an HTML error page (status ${response.status}). ` +
            'The GeoNet API may be temporarily unavailable. Please try again later.'
          );
        }

        // Check for common error message formats
        if (textBody.toLowerCase().startsWith('an error') ||
            textBody.toLowerCase().startsWith('error:')) {
          throw new Error(`GeoNet API error: ${textBody.substring(0, 200)}`);
        }

        throw new Error(
          `Server returned non-JSON response (${contentType || 'unknown type'}). ` +
          `Status: ${response.status}. Response: ${textBody.substring(0, 100)}...`
        );
      }

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Import failed');
      }

      setResult(data);
      // The import may have created a catalogue or changed one (a partial run too), so
      // every cached catalogue list and event page is stale now.
      if (data.catalogueId) {
        invalidateCatalogueData();
      }
      onImportComplete?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsImporting(false);
      setImportPhase('');
    }
  };

  const crossesAntimeridian = (() => {
    const west = parseFloatSafe(minLongitude);
    const east = parseFloatSafe(maxLongitude);
    return west !== undefined && east !== undefined && west > east;
  })();

  const notImported = result
    ? [
        { label: 'Already stored / repeated IDs', value: result.collidedEvents ?? 0 },
        { label: 'Invalid or unusable rows', value: result.invalidEvents ?? 0 },
        {
          label: 'Excluded (GeoNet flags them as not real events)',
          value: result.excludedEvents ?? 0,
          detail: Object.entries(result.excludedEventTypes ?? {})
            .map(([type, count]) => `${type}: ${count}`)
            .join(', '),
        },
        { label: 'Not written (database error)', value: result.failedEvents ?? 0 },
      ].filter((row) => row.value > 0)
    : [];

  return (
    <div className="space-y-6">
      {/* Progress Overlay for Import */}
      <ProgressOverlay
        isOpen={isImporting}
        title="Importing from GeoNet"
        progress={0}
        message={importPhase}
        subMessage="This may take a few moments depending on the time range selected."
        indeterminate
      />

      <Card>
        <CardHeader>
          <CardTitle>Import from GeoNet</CardTitle>
          <CardDescription>
            Automatically import earthquake events from the GeoNet FDSN Event Web Service
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Target Catalogue */}
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="targetCatalogue">Target Catalogue</Label>
                  <InfoTooltip content="Create a new catalogue, or add to a catalogue an earlier GeoNet import created. Events are matched to stored ones by GeoNet event ID." />
                </div>
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger id="targetCatalogue" aria-label="Target catalogue">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NEW_CATALOGUE}>Create a new catalogue</SelectItem>
                    {importTargets.map((catalogue) => (
                      <SelectItem key={catalogue.id} value={catalogue.id}>
                        {catalogue.name}
                        {typeof catalogue.event_count === 'number' ? ` (${catalogue.event_count} events)` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!addingToExisting && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="catalogueName">Catalogue Name</Label>
                    <InfoTooltip content="Name of the new catalogue that will receive the imported events." />
                  </div>
                  <Input
                    id="catalogueName"
                    type="text"
                    value={catalogueName}
                    onChange={(e) => setCatalogueName(e.target.value)}
                    placeholder={DEFAULT_CATALOGUE_NAME}
                  />
                </div>
              )}

              {/* Update Existing */}
              <div className="flex items-center space-x-2">
                <Switch
                  id="updateExisting"
                  checked={addingToExisting && updateExisting}
                  onCheckedChange={setUpdateExisting}
                  disabled={!addingToExisting}
                />
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="updateExisting" className="cursor-pointer">
                    Update existing events if data has changed
                  </Label>
                  <InfoTooltip content="When adding to an existing catalogue: events already stored are compared with GeoNet's current solution, and only those GeoNet has revised are rewritten. A new catalogue has nothing to update." />
                </div>
              </div>
            </div>

            {/* Time Range */}
            <div className="space-y-4">
              <div className="flex items-center gap-1.5">
                <Label>Time Range</Label>
                <InfoTooltip content="Choose a rolling window or specify exact start and end times." />
              </div>
              <Select value={timeRange} onValueChange={(value: 'hours' | 'custom') => setTimeRange(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hours">Last N Hours</SelectItem>
                  <SelectItem value="custom">Custom Date Range</SelectItem>
                </SelectContent>
              </Select>

              {timeRange === 'hours' ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="hours">Hours</Label>
                    <InfoTooltip content="Relative lookback window from now." />
                  </div>
                  <Select value={hours} onValueChange={setHours}>
                    <SelectTrigger id="hours">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Last 1 hour</SelectItem>
                      <SelectItem value="6">Last 6 hours</SelectItem>
                      <SelectItem value="12">Last 12 hours</SelectItem>
                      <SelectItem value="24">Last 24 hours</SelectItem>
                      <SelectItem value="48">Last 48 hours</SelectItem>
                      <SelectItem value="168">Last 7 days</SelectItem>
                      <SelectItem value="720">Last 30 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="startDate">Start Date (UTC)</Label>
                      <InfoTooltip content="Earliest event time to include, in UTC." />
                    </div>
                    <Input
                      id="startDate"
                      type="datetime-local"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="endDate">End Date (UTC)</Label>
                      <InfoTooltip content="Latest event time to include, in UTC." />
                    </div>
                    <Input
                      id="endDate"
                      type="datetime-local"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Magnitude Filters */}
            <div className="space-y-4">
              <div className="flex items-center gap-1.5">
                <Label>Magnitude Filters (Optional)</Label>
                <InfoTooltip content="Limit imports by earthquake magnitude range." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="minMagnitude">Minimum Magnitude</Label>
                    <TechnicalTermTooltip term="magnitude" />
                  </div>
                  <Input
                    id="minMagnitude"
                    type="number"
                    step="0.1"
                    placeholder="e.g., 3.0"
                    value={minMagnitude}
                    onChange={(e) => setMinMagnitude(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="maxMagnitude">Maximum Magnitude</Label>
                    <TechnicalTermTooltip term="magnitude" />
                  </div>
                  <Input
                    id="maxMagnitude"
                    type="number"
                    step="0.1"
                    placeholder="e.g., 9.0"
                    value={maxMagnitude}
                    onChange={(e) => setMaxMagnitude(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Depth Filters */}
            <div className="space-y-4">
              <div className="flex items-center gap-1.5">
                <Label>Depth Filters (Optional)</Label>
                <InfoTooltip content="Limit imports by hypocentre depth, in km below sea level." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="minDepth">Minimum Depth (km)</Label>
                  <Input
                    id="minDepth"
                    type="number"
                    step="0.1"
                    placeholder="e.g., 0"
                    value={minDepth}
                    onChange={(e) => setMinDepth(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxDepth">Maximum Depth (km)</Label>
                  <Input
                    id="maxDepth"
                    type="number"
                    step="0.1"
                    placeholder="e.g., 40"
                    value={maxDepth}
                    onChange={(e) => setMaxDepth(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Geographic Filters */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Label>Geographic Bounds (Optional)</Label>
                  <InfoTooltip content="Limit imports to a bounding box in decimal degrees. Leave blank for GeoNet's whole catalogue." />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={fillNzRegion}>
                  Use New Zealand region
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="minLatitude">Minimum Latitude</Label>
                    <InfoTooltip content="Southern boundary (-90 to 90)." />
                  </div>
                  <Input
                    id="minLatitude"
                    type="number"
                    step="0.1"
                    placeholder={`e.g., ${NZ_NATIONAL_BOUNDS.minLatitude.toFixed(1)} (South)`}
                    value={minLatitude}
                    onChange={(e) => setMinLatitude(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="maxLatitude">Maximum Latitude</Label>
                    <InfoTooltip content="Northern boundary (-90 to 90). New Zealand's Kermadec Islands reach 29 S." />
                  </div>
                  <Input
                    id="maxLatitude"
                    type="number"
                    step="0.1"
                    placeholder={`e.g., ${NZ_NATIONAL_BOUNDS.maxLatitude.toFixed(1)} (North)`}
                    value={maxLatitude}
                    onChange={(e) => setMaxLatitude(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="minLongitude">Minimum Longitude</Label>
                    <InfoTooltip content="Western boundary (-180 to 180). For a box across the 180 degree meridian, enter a western edge greater than the eastern edge, e.g. 165 to -175 for New Zealand including the Kermadec and Chatham Islands." />
                  </div>
                  <Input
                    id="minLongitude"
                    type="number"
                    step="0.1"
                    placeholder={`e.g., ${NZ_NATIONAL_BOUNDS.minLongitude.toFixed(1)} (West)`}
                    value={minLongitude}
                    onChange={(e) => setMinLongitude(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="maxLongitude">Maximum Longitude</Label>
                    <InfoTooltip content="Eastern boundary (-180 to 180). East of 180 degrees is negative: the Chatham Islands are near -176.5 and the Kermadec Islands near -178." />
                  </div>
                  <Input
                    id="maxLongitude"
                    type="number"
                    step="0.1"
                    placeholder={`e.g., ${NZ_NATIONAL_BOUNDS.maxLongitude.toFixed(1)} (East, across 180°)`}
                    value={maxLongitude}
                    onChange={(e) => setMaxLongitude(e.target.value)}
                  />
                </div>
              </div>
              {crossesAntimeridian && (
                <p className="text-xs text-muted-foreground">
                  This box crosses the 180° meridian: it runs east from the minimum longitude to the maximum longitude.
                </p>
              )}
            </div>

            {/* Submit Button */}
            <Button type="submit" disabled={readOnly || isImporting} className="w-full">
              {isImporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Start Import
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {result.success ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Import Successful
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-red-600" />
                  Import Completed with Errors
                </>
              )}
            </CardTitle>
            {result.catalogueName && (
              <CardDescription>Catalogue: {result.catalogueName}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Fetched</p>
                <p className="text-2xl font-bold">{result.totalFetched}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">New Events</p>
                <p className="text-2xl font-bold text-green-600">{result.newEvents}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Updated Events</p>
                <p className="text-2xl font-bold text-blue-600">{result.updatedEvents}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Skipped (already stored, unchanged)</p>
                <p className="text-2xl font-bold text-gray-600">{result.skippedEvents}</p>
              </div>
            </div>

            {notImported.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Not imported</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {notImported.map((row) => (
                    <li key={row.label}>
                      {row.label}: <span className="font-semibold text-foreground">{row.value}</span>
                      {row.detail ? ` (${row.detail})` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="text-sm text-muted-foreground">Duration</p>
              <p className="text-lg font-semibold">{(result.duration / 1000).toFixed(2)}s</p>
            </div>

            {result.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  <p className="font-semibold mb-2">{result.errors.length} error(s) occurred:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {result.errors.slice(0, 5).map((err, i) => (
                      <li key={i} className="text-sm">{err}</li>
                    ))}
                    {result.errors.length > 5 && (
                      <li className="text-sm">... and {result.errors.length - 5} more</li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
