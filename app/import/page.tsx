'use client';

import { useState, useEffect } from 'react';
import { ImportForm } from '@/components/import/ImportForm';
import { ImportHistory } from '@/components/import/ImportHistory';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Database, History, Info } from 'lucide-react';

interface Catalogue {
  id: string;
  name: string;
}

export default function ImportPage() {
  const [catalogues, setCatalogues] = useState<Catalogue[]>([]);
  const [selectedCatalogueId, setSelectedCatalogueId] = useState<string>('');
  const [isLoadingCatalogues, setIsLoadingCatalogues] = useState(true);
  
  useEffect(() => {
    const fetchCatalogues = async () => {
      try {
        const response = await fetch('/api/catalogues');
        if (response.ok) {
          const data = await response.json();
          setCatalogues(data);
          
          // Auto-select GeoNet catalogue if it exists
          const geonetCatalogue = data.find((c: Catalogue) => 
            c.name.includes('GeoNet') || c.name.includes('Automated Import')
          );
          if (geonetCatalogue) {
            setSelectedCatalogueId(geonetCatalogue.id);
          }
        }
      } catch (error) {
        console.error('Failed to fetch catalogues:', error);
      } finally {
        setIsLoadingCatalogues(false);
      }
    };
    
    fetchCatalogues();
  }, []);
  
  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">GeoNet Data Import</h1>
        <p className="text-muted-foreground">
          Automatically import earthquake events from the GeoNet FDSN Event Web Service
        </p>
      </div>
      
      <Tabs defaultValue="import" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="import" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Import
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            History
          </TabsTrigger>
          <TabsTrigger value="info" className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            Information
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="import" className="space-y-6">
          <ImportForm />
        </TabsContent>
        
        <TabsContent value="history" className="space-y-6">
          {!isLoadingCatalogues && catalogues.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Select Catalogue</CardTitle>
                <CardDescription>
                  Choose a catalogue to view its import history
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="catalogue-select">Catalogue</Label>
                  <Select value={selectedCatalogueId} onValueChange={setSelectedCatalogueId}>
                    <SelectTrigger id="catalogue-select">
                      <SelectValue placeholder="Select a catalogue" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalogues.map((catalogue) => (
                        <SelectItem key={catalogue.id} value={catalogue.id}>
                          {catalogue.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}
          
          <ImportHistory catalogueId={selectedCatalogueId} limit={20} />
        </TabsContent>
        
        <TabsContent value="info" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>About GeoNet Import</CardTitle>
              <CardDescription>
                Information about the GeoNet FDSN Event Web Service integration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Data Source</h3>
                <p className="text-sm text-muted-foreground">
                  This feature imports earthquake data from the GeoNet FDSN Event Web Service, 
                  which provides comprehensive seismic event information for New Zealand and 
                  surrounding regions.
                </p>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">API Endpoint</h3>
                <p className="text-sm text-muted-foreground font-mono bg-muted p-2 rounded">
                  https://service.geonet.org.nz/fdsnws/event/1/query
                </p>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">Supported Features</h3>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  <li>Import events by time range (last N hours or custom date range)</li>
                  <li>Filter by magnitude (minimum and maximum)</li>
                  <li>Filter by depth (minimum and maximum)</li>
                  <li>Filter by geographic bounds (latitude/longitude)</li>
                  <li>Automatic duplicate detection by event ID</li>
                  <li>Update existing events with revised data</li>
                  <li>Track import history and statistics</li>
                </ul>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">Imported Fields</h3>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  <li>Event ID (GeoNet public ID)</li>
                  <li>Time (origin time)</li>
                  <li>Location (latitude, longitude, depth)</li>
                  <li>Magnitude (value and type)</li>
                  <li>Event type (earthquake, quarry blast, etc.)</li>
                </ul>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">Best Practices</h3>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  <li>Start with a small time range (e.g., last 24 hours) to test the import</li>
                  <li>Use magnitude filters to reduce the number of events imported</li>
                  <li>Enable "Update existing events" to keep data synchronized with GeoNet</li>
                  <li>Check the import history to monitor for errors or issues</li>
                  <li>Consider setting up scheduled imports for regular data updates</li>
                </ul>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">Rate Limits</h3>
                <p className="text-sm text-muted-foreground">
                  The GeoNet API does not require authentication and has no explicit rate limits. 
                  However, please be respectful of the service and avoid making excessive requests.
                </p>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">Data License</h3>
                <p className="text-sm text-muted-foreground">
                  GeoNet data is provided under the Creative Commons Attribution 4.0 International 
                  License. Please ensure you comply with the license terms when using this data.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

