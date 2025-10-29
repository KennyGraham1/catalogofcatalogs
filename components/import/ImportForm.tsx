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

interface ImportResult {
  success: boolean;
  catalogueId: string;
  catalogueName: string;
  totalFetched: number;
  newEvents: number;
  updatedEvents: number;
  skippedEvents: number;
  errors: string[];
  startTime: string;
  endTime: string;
  duration: number;
}

export function ImportForm() {
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [timeRange, setTimeRange] = useState<'hours' | 'custom'>('hours');
  const [hours, setHours] = useState('24');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minMagnitude, setMinMagnitude] = useState('');
  const [maxMagnitude, setMaxMagnitude] = useState('');
  const [minLatitude, setMinLatitude] = useState('');
  const [maxLatitude, setMaxLatitude] = useState('');
  const [minLongitude, setMinLongitude] = useState('');
  const [maxLongitude, setMaxLongitude] = useState('');
  const [updateExisting, setUpdateExisting] = useState(false);
  const [catalogueName, setCatalogueName] = useState('GeoNet - Automated Import');
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsImporting(true);
    setResult(null);
    setError(null);
    
    try {
      const body: any = {
        updateExisting,
        catalogueName,
      };
      
      // Add time range
      if (timeRange === 'hours') {
        body.hours = parseInt(hours, 10);
      } else {
        body.startDate = startDate;
        body.endDate = endDate;
      }
      
      // Add magnitude filters
      if (minMagnitude) {
        body.minMagnitude = parseFloat(minMagnitude);
      }
      if (maxMagnitude) {
        body.maxMagnitude = parseFloat(maxMagnitude);
      }

      // Add geographic filters
      if (minLatitude) {
        body.minLatitude = parseFloat(minLatitude);
      }
      if (maxLatitude) {
        body.maxLatitude = parseFloat(maxLatitude);
      }
      if (minLongitude) {
        body.minLongitude = parseFloat(minLongitude);
      }
      if (maxLongitude) {
        body.maxLongitude = parseFloat(maxLongitude);
      }
      
      const response = await fetch('/api/import/geonet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Import failed');
      }
      
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsImporting(false);
    }
  };
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Import from GeoNet</CardTitle>
          <CardDescription>
            Automatically import earthquake events from the GeoNet FDSN Event Web Service
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Time Range */}
            <div className="space-y-4">
              <Label>Time Range</Label>
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
                  <Label htmlFor="hours">Hours</Label>
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
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      type="datetime-local"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">End Date</Label>
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
              <Label>Magnitude Filters (Optional)</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="minMagnitude">Minimum Magnitude</Label>
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
                  <Label htmlFor="maxMagnitude">Maximum Magnitude</Label>
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

            {/* Geographic Filters */}
            <div className="space-y-4">
              <Label>Geographic Bounds (Optional)</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="minLatitude">Minimum Latitude</Label>
                  <Input
                    id="minLatitude"
                    type="number"
                    step="0.1"
                    placeholder="e.g., -47.5 (South)"
                    value={minLatitude}
                    onChange={(e) => setMinLatitude(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxLatitude">Maximum Latitude</Label>
                  <Input
                    id="maxLatitude"
                    type="number"
                    step="0.1"
                    placeholder="e.g., -34.0 (North)"
                    value={maxLatitude}
                    onChange={(e) => setMaxLatitude(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="minLongitude">Minimum Longitude</Label>
                  <Input
                    id="minLongitude"
                    type="number"
                    step="0.1"
                    placeholder="e.g., 165.0 (West)"
                    value={minLongitude}
                    onChange={(e) => setMinLongitude(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxLongitude">Maximum Longitude</Label>
                  <Input
                    id="maxLongitude"
                    type="number"
                    step="0.1"
                    placeholder="e.g., 179.0 (East)"
                    value={maxLongitude}
                    onChange={(e) => setMaxLongitude(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Catalogue Name */}
            <div className="space-y-2">
              <Label htmlFor="catalogueName">Catalogue Name</Label>
              <Input
                id="catalogueName"
                type="text"
                value={catalogueName}
                onChange={(e) => setCatalogueName(e.target.value)}
                placeholder="GeoNet - Automated Import"
              />
            </div>
            
            {/* Update Existing */}
            <div className="flex items-center space-x-2">
              <Switch
                id="updateExisting"
                checked={updateExisting}
                onCheckedChange={setUpdateExisting}
              />
              <Label htmlFor="updateExisting" className="cursor-pointer">
                Update existing events if data has changed
              </Label>
            </div>
            
            {/* Submit Button */}
            <Button type="submit" disabled={isImporting} className="w-full">
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
                <p className="text-sm text-muted-foreground">Skipped Events</p>
                <p className="text-2xl font-bold text-gray-600">{result.skippedEvents}</p>
              </div>
            </div>
            
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

