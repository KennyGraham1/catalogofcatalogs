'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Settings, 
  Shield, 
  Database, 
  Sliders, 
  Save,
  Map
} from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="container py-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage application settings and preferences
          </p>
        </div>

        <Tabs defaultValue="general" className="space-y-4">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="schema">Schema Mapping</TabsTrigger>
            <TabsTrigger value="visualization">Visualization</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>
          
          <TabsContent value="general" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  General Settings
                </CardTitle>
                <CardDescription className="text-xs">
                  Configure basic application settings and preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Interface</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="language">Language</Label>
                      <Select defaultValue="en">
                        <SelectTrigger id="language">
                          <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="es">Spanish</SelectItem>
                          <SelectItem value="fr">French</SelectItem>
                          <SelectItem value="ja">Japanese</SelectItem>
                          <SelectItem value="de">German</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Theme</Label>
                      <div className="flex items-center gap-2">
                        <ThemeToggle />
                        <span className="text-sm text-muted-foreground">
                          Select your preferred theme
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="notifications" className="text-base">
                        Email Notifications
                      </Label>
                      <Switch id="notifications" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Receive email notifications for completed catalogue processing
                    </p>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Default File Formats</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="import-format">Default Import Format</Label>
                      <Select defaultValue="csv">
                        <SelectTrigger id="import-format">
                          <SelectValue placeholder="Select format" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="csv">CSV</SelectItem>
                          <SelectItem value="qml">QuakeML</SelectItem>
                          <SelectItem value="json">GeoJSON</SelectItem>
                          <SelectItem value="xml">XML</SelectItem>
                          <SelectItem value="txt">Plain Text</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="export-format">Default Export Format</Label>
                      <Select defaultValue="csv">
                        <SelectTrigger id="export-format">
                          <SelectValue placeholder="Select format" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="csv">CSV</SelectItem>
                          <SelectItem value="qml">QuakeML</SelectItem>
                          <SelectItem value="json">GeoJSON</SelectItem>
                          <SelectItem value="xml">XML</SelectItem>
                          <SelectItem value="kml">KML</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-end">
                  <Button>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Account Settings
                </CardTitle>
                <CardDescription className="text-xs">
                  Manage your account information and security preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input id="email" defaultValue="user@example.com" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" defaultValue="John Doe" />
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Security</h3>
                  
                  <div className="space-y-2">
                    <Button variant="outline">Change Password</Button>
                    <p className="text-sm text-muted-foreground">
                      Last changed 45 days ago
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="2fa" className="text-base">
                        Two-Factor Authentication
                      </Label>
                      <Switch id="2fa" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Enhance your account security with two-factor authentication
                    </p>
                  </div>
                </div>
                
                <div className="flex justify-end">
                  <Button>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="schema" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Schema Mapping Configuration
                </CardTitle>
                <CardDescription className="text-xs">
                  Configure default schema mappings for different file formats
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Default Field Mappings</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure how fields from different formats map to standardized schema
                  </p>
                  
                  <Tabs defaultValue="csv" className="w-full">
                    <TabsList className="w-full justify-start">
                      <TabsTrigger value="csv">CSV</TabsTrigger>
                      <TabsTrigger value="qml">QuakeML</TabsTrigger>
                      <TabsTrigger value="json">GeoJSON</TabsTrigger>
                      <TabsTrigger value="xml">XML</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="csv" className="space-y-4 mt-4">
                      <div className="space-y-4">
                        <div className="grid grid-cols-5 gap-4">
                          <div className="col-span-2">
                            <Label className="text-muted-foreground">Source Field (CSV)</Label>
                          </div>
                          <div className="col-span-1 flex items-center justify-center">
                            <span>→</span>
                          </div>
                          <div className="col-span-2">
                            <Label className="text-muted-foreground">Target Field (Standard)</Label>
                          </div>
                        </div>
                        
                        {[
                          { source: 'time', target: 'time' },
                          { source: 'latitude', target: 'latitude' },
                          { source: 'longitude', target: 'longitude' },
                          { source: 'depth', target: 'depth' },
                          { source: 'magnitude', target: 'magnitude' },
                          { source: 'id', target: 'eventId' },
                        ].map((mapping, i) => (
                          <div key={i} className="grid grid-cols-5 gap-4 items-center">
                            <div className="col-span-2">
                              <Input defaultValue={mapping.source} />
                            </div>
                            <div className="col-span-1 flex items-center justify-center">
                              <span>→</span>
                            </div>
                            <div className="col-span-2">
                              <Select defaultValue={mapping.target}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="time">Time</SelectItem>
                                  <SelectItem value="latitude">Latitude</SelectItem>
                                  <SelectItem value="longitude">Longitude</SelectItem>
                                  <SelectItem value="depth">Depth</SelectItem>
                                  <SelectItem value="magnitude">Magnitude</SelectItem>
                                  <SelectItem value="eventId">Event ID</SelectItem>
                                  <SelectItem value="source">Source</SelectItem>
                                  <SelectItem value="region">Region</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      <Button variant="outline" size="sm">
                        Add Field Mapping
                      </Button>
                    </TabsContent>
                    
                    <TabsContent value="qml" className="space-y-4 mt-4">
                      {/* Similar content for QuakeML mappings */}
                      <div className="text-center text-muted-foreground py-4">
                        QuakeML mapping configuration
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="json" className="space-y-4 mt-4">
                      {/* Similar content for GeoJSON mappings */}
                      <div className="text-center text-muted-foreground py-4">
                        GeoJSON mapping configuration
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="xml" className="space-y-4 mt-4">
                      {/* Similar content for XML mappings */}
                      <div className="text-center text-muted-foreground py-4">
                        XML mapping configuration
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Advanced Schema Settings</h3>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="auto-detect" className="text-base">
                        Auto-detect Field Mappings
                      </Label>
                      <Switch id="auto-detect" defaultChecked />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Automatically detect and map fields based on common naming patterns
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="strict-validation" className="text-base">
                        Strict Schema Validation
                      </Label>
                      <Switch id="strict-validation" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Enforce strict validation for required fields and data types
                    </p>
                  </div>
                </div>
                
                <div className="flex justify-end">
                  <Button>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="visualization" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Map className="h-4 w-4" />
                  Visualization Settings
                </CardTitle>
                <CardDescription className="text-xs">
                  Configure how earthquake data is displayed in maps and charts
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Map Configuration</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="map-provider">Map Provider</Label>
                      <Select defaultValue="leaflet">
                        <SelectTrigger id="map-provider">
                          <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="leaflet">Leaflet (OpenStreetMap)</SelectItem>
                          <SelectItem value="mapbox">Mapbox</SelectItem>
                          <SelectItem value="google">Google Maps</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="default-view">Default Map View</Label>
                      <Select defaultValue="global">
                        <SelectTrigger id="default-view">
                          <SelectValue placeholder="Select view" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="global">Global</SelectItem>
                          <SelectItem value="europe">Europe</SelectItem>
                          <SelectItem value="namerica">North America</SelectItem>
                          <SelectItem value="pacific">Pacific Ring</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="api-key">Map API Key (if applicable)</Label>
                    <Input id="api-key" type="password" placeholder="Enter your API key" />
                    <p className="text-xs text-muted-foreground">
                      Required for some map providers like Mapbox or Google Maps
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="cluster-events" className="text-base">
                        Cluster Nearby Events
                      </Label>
                      <Switch id="cluster-events" defaultChecked />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Group nearby earthquake events when zoomed out
                    </p>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Event Visualization</h3>
                  
                  <div className="space-y-2">
                    <Label>Magnitude Color Scale</Label>
                    <div className="grid grid-cols-5 gap-2 mt-2">
                      <div className="h-8 rounded bg-green-500 flex items-center justify-center text-white text-xs">
                        &lt; 3.0
                      </div>
                      <div className="h-8 rounded bg-yellow-500 flex items-center justify-center text-white text-xs">
                        3.0-4.0
                      </div>
                      <div className="h-8 rounded bg-orange-500 flex items-center justify-center text-white text-xs">
                        4.0-5.0
                      </div>
                      <div className="h-8 rounded bg-red-500 flex items-center justify-center text-white text-xs">
                        5.0-6.0
                      </div>
                      <div className="h-8 rounded bg-purple-500 flex items-center justify-center text-white text-xs">
                        &gt; 6.0
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="depth-scale">Depth Visualization Scale</Label>
                    <Select defaultValue="rainbow">
                      <SelectTrigger id="depth-scale">
                        <SelectValue placeholder="Select scale" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rainbow">Rainbow (Multi-color)</SelectItem>
                        <SelectItem value="redblue">Red to Blue</SelectItem>
                        <SelectItem value="grayscale">Grayscale</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="symbol-size">Symbol Size Based On</Label>
                    <Select defaultValue="magnitude">
                      <SelectTrigger id="symbol-size">
                        <SelectValue placeholder="Select property" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="magnitude">Magnitude</SelectItem>
                        <SelectItem value="depth">Depth</SelectItem>
                        <SelectItem value="fixed">Fixed Size</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="flex justify-end">
                  <Button>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="advanced" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sliders className="h-4 w-4" />
                  Advanced Settings
                </CardTitle>
                <CardDescription className="text-xs">
                  Configure advanced application settings for performance and compatibility
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Performance</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="batch-size">Processing Batch Size</Label>
                    <Select defaultValue="1000">
                      <SelectTrigger id="batch-size">
                        <SelectValue placeholder="Select batch size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="500">500 events</SelectItem>
                        <SelectItem value="1000">1,000 events</SelectItem>
                        <SelectItem value="5000">5,000 events</SelectItem>
                        <SelectItem value="10000">10,000 events</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Number of events processed in each batch
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="cache-limit">Cache Limit</Label>
                    <Select defaultValue="256">
                      <SelectTrigger id="cache-limit">
                        <SelectValue placeholder="Select cache limit" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="128">128 MB</SelectItem>
                        <SelectItem value="256">256 MB</SelectItem>
                        <SelectItem value="512">512 MB</SelectItem>
                        <SelectItem value="1024">1 GB</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Maximum memory used for caching data
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="parallel-processing" className="text-base">
                        Parallel Processing
                      </Label>
                      <Switch id="parallel-processing" defaultChecked />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Enable multi-threaded processing for faster catalogue operations
                    </p>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Integration</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="api-endpoint">API Endpoint URL</Label>
                    <Input 
                      id="api-endpoint" 
                      defaultValue="https://api.example.com/earthquake-service" 
                    />
                    <p className="text-xs text-muted-foreground">
                      URL for the backend API service
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="external-fetch">External Data Fetch Interval</Label>
                    <Select defaultValue="12">
                      <SelectTrigger id="external-fetch">
                        <SelectValue placeholder="Select interval" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 hour</SelectItem>
                        <SelectItem value="6">6 hours</SelectItem>
                        <SelectItem value="12">12 hours</SelectItem>
                        <SelectItem value="24">24 hours</SelectItem>
                        <SelectItem value="0">Manual only</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      How often to fetch updates from external sources
                    </p>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Custom Script</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="custom-script">Post-Processing Script</Label>
                    <Textarea 
                      id="custom-script" 
                      placeholder="Enter custom processing script (Python)"
                      className="font-mono h-32"
                    />
                    <p className="text-xs text-muted-foreground">
                      Custom Python script to run after catalogue processing
                    </p>
                  </div>
                </div>
                
                <div className="flex justify-end">
                  <Button>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}