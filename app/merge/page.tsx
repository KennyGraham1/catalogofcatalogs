'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { MergeActions } from '@/components/merge/MergeActions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { 
  Layers, 
  Settings, 
  Tag, 
  ArrowRight,
  AlertTriangle,
  ArrowRightLeft,
  Save,
  Clock,
  MapPin,
  Loader2
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

// Mock data for New Zealand earthquakes
const mockEvents = [
  { id: 1, latitude: -41.2865, longitude: 174.7762, magnitude: 4.5, depth: 25, time: "2023-09-01T10:30:00Z", region: "Wellington" },
  { id: 2, latitude: -36.8485, longitude: 174.7633, magnitude: 3.2, depth: 12, time: "2023-09-02T15:45:00Z", region: "Auckland" },
  { id: 3, latitude: -43.5321, longitude: 172.6362, magnitude: 4.8, depth: 15, time: "2023-09-03T08:15:00Z", region: "Christchurch" },
  { id: 4, latitude: -45.0312, longitude: 168.6626, magnitude: 3.7, depth: 8, time: "2023-09-04T12:00:00Z", region: "Queenstown" },
  { id: 5, latitude: -39.0556, longitude: 174.0752, magnitude: 5.2, depth: 30, time: "2023-09-05T22:30:00Z", region: "New Plymouth" }
];

const mockCatalogues = [
  { id: 1, name: 'GeoNet New Zealand Data 2023 Q1', events: 1298, source: 'GeoNet' },
  { id: 2, name: 'Wellington Region Network Data', events: 645, source: 'VUW' },
  { id: 3, name: 'Canterbury Seismic Network', events: 789, source: 'CSN' },
  { id: 4, name: 'Alpine Fault Monitoring Data', events: 432, source: 'GNS' },
  { id: 5, name: 'Northland Seismic Records', events: 234, source: 'GNS' },
  { id: 6, name: 'Otago Regional Network', events: 567, source: 'ORC' },
  { id: 7, name: 'Hawke\'s Bay Seismic Data', events: 345, source: 'GeoNet' }
];

type CatalogueStatus = 'all' | 'complete' | 'processing' | 'incomplete';
type SortField = 'name' | 'date' | 'events' | 'source';
type SortDirection = 'asc' | 'desc';
type MergeStatus = 'idle' | 'merging' | 'complete' | 'error';

// Status labels for merge status
const statusLabels: Record<MergeStatus, string> = {
  idle: 'Ready',
  merging: 'Merging...',
  complete: 'Complete',
  error: 'Error'
};

// Helper function to get status color
const getStatusColor = (status: MergeStatus): string => {
  switch (status) {
    case 'idle':
      return 'bg-blue-500';
    case 'merging':
      return 'bg-yellow-500';
    case 'complete':
      return 'bg-green-500';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
};

export default function MergePage() {
  const [activeTab, setActiveTab] = useState('select');
  const [selectedCatalogues, setSelectedCatalogues] = useState<number[]>([]);
  const [mergedName, setMergedName] = useState('Merged NZ Catalogue');
  const [timeThreshold, setTimeThreshold] = useState(60);
  const [distanceThreshold, setDistanceThreshold] = useState(10);
  const [priority, setPriority] = useState('newest');
  const [mergeStrategy, setMergeStrategy] = useState('priority');
  const [mergeStatus, setMergeStatus] = useState<MergeStatus>('idle');
  const [mergedEvents, setMergedEvents] = useState(mockEvents);

  const handleCatalogueSelect = (id: number) => {
    setSelectedCatalogues(prev => {
      if (prev.includes(id)) {
        return prev.filter(catalogueId => catalogueId !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleNextStep = () => {
    if (activeTab === 'select') {
      setActiveTab('configure');
    } else if (activeTab === 'configure') {
      setActiveTab('preview');
    }
  };

  const handlePreviousStep = () => {
    if (activeTab === 'configure') {
      setActiveTab('select');
    } else if (activeTab === 'preview') {
      setActiveTab('configure');
    }
  };

  const handleStartMerge = async () => {
    if (selectedCatalogues.length < 2) {
      toast({
        title: "Not enough catalogues selected",
        description: "Please select at least two catalogues to merge.",
        variant: "destructive"
      });
      return;
    }

    setMergeStatus('merging');

    try {
      const selectedCatalogueData = getSelectedCatalogues();
      
      const response = await fetch('/api/merge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: mergedName,
          sourceCatalogues: selectedCatalogueData,
          config: {
            timeThreshold,
            distanceThreshold,
            mergeStrategy,
            priority
          }
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to merge catalogues');
      }

      const result = await response.json();

      // Set mock merged events for now
      setMergedEvents(mockEvents);
      
      setMergeStatus('complete');
      toast({
        title: "Merge Complete",
        description: `Successfully merged ${selectedCatalogues.length} catalogues into "${mergedName}"`,
      });
    } catch (error) {
      setMergeStatus('error');
      toast({
        title: "Merge Failed",
        description: "An error occurred while merging the catalogues. Please try again.",
        variant: "destructive"
      });
    }
  };

  const getSelectedCatalogues = () => {
    return mockCatalogues.filter(catalogue => selectedCatalogues.includes(catalogue.id));
  };

  const getTotalSelectedEvents = () => {
    return getSelectedCatalogues().reduce((total, catalogue) => total + catalogue.events, 0);
  };

  const getEstimatedMergedEvents = () => {
    const selected = getSelectedCatalogues();
    if (selected.length === 0) return 0;
    if (selected.length === 1) return selected[0].events;
    
    const totalEvents = getTotalSelectedEvents();
    const overlapFactor = 0.15 * (selected.length - 1);
    return Math.round(totalEvents * (1 - overlapFactor));
  };

  const renderMergeButton = () => {
    if (mergeStatus === 'merging') {
      return (
        <Button disabled>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Merging Catalogues...
        </Button>
      );
    }

    if (mergeStatus === 'complete') {
      return (
        <Button onClick={() => {
          setActiveTab('select');
          setMergeStatus('idle');
          setSelectedCatalogues([]);
        }}>
          Start New Merge
        </Button>
      );
    }

    return (
      <Button onClick={handleStartMerge}>
        <Save className="mr-2 h-4 w-4" />
        Start Merge
      </Button>
    );
  };

  return (
    <div className="container py-8">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Merge Catalogues</h1>
          <p className="text-muted-foreground">
            Combine multiple earthquake catalogues into a unified dataset
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Catalogue Merging Wizard</CardTitle>
                <CardDescription>
                  Merge multiple earthquake catalogues using configurable rules for matching events
                </CardDescription>
              </div>
              <Badge className={getStatusColor(mergeStatus)}>
                {statusLabels[mergeStatus]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="select" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="select">Select Catalogues</TabsTrigger>
                <TabsTrigger 
                  value="configure" 
                  disabled={selectedCatalogues.length < 2}
                >
                  Configure Merge
                </TabsTrigger>
                <TabsTrigger 
                  value="preview" 
                  disabled={selectedCatalogues.length < 2 || activeTab === 'select'}
                >
                  Preview & Merge
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="select" className="pt-6">
                <div className="flex items-center gap-2 bg-muted p-3 rounded-md">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <p className="text-sm">
                    Select at least two catalogues to merge. Catalogues should cover overlapping time periods or regions.
                  </p>
                </div>
                
                <div className="border rounded-lg overflow-hidden mt-4">
                  <div className="bg-muted/50 px-4 py-2 text-sm font-medium">
                    Available Catalogues
                  </div>
                  <div className="divide-y">
                    {mockCatalogues.map(catalogue => (
                      <div key={catalogue.id} className="flex items-center space-x-2 p-4">
                        <Checkbox
                          id={`catalogue-${catalogue.id}`}
                          checked={selectedCatalogues.includes(catalogue.id)}
                          onCheckedChange={() => handleCatalogueSelect(catalogue.id)}
                        />
                        <div className="grid gap-1.5 leading-none">
                          <Label
                            htmlFor={`catalogue-${catalogue.id}`}
                            className="text-base font-medium flex items-center gap-1.5"
                          >
                            <Layers className="h-4 w-4 text-muted-foreground" />
                            {catalogue.name}
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            {catalogue.events.toLocaleString()} events • Source: {catalogue.source}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {selectedCatalogues.length > 0 && (
                  <div className="bg-muted/30 p-4 rounded-md mt-4">
                    <h3 className="font-medium mb-2">Selection Summary</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Catalogues</p>
                        <p className="text-xl font-semibold">{selectedCatalogues.length}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Events</p>
                        <p className="text-xl font-semibold">{getTotalSelectedEvents().toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Est. Merged Events</p>
                        <p className="text-xl font-semibold">{getEstimatedMergedEvents().toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="configure" className="pt-6">
                <div className="space-y-6">
                  <div>
                    <Label htmlFor="merged-name" className="text-base font-medium">
                      Merged Catalogue Name
                    </Label>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <Input
                        id="merged-name"
                        value={mergedName}
                        onChange={e => setMergedName(e.target.value)}
                        placeholder="Enter a name for the merged catalogue"
                      />
                    </div>
                  </div>
                  
                  <Separator className="my-6" />
                  
                  <div>
                    <h3 className="text-base font-medium mb-1">Event Matching Criteria</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Define how to identify the same event across different catalogues
                    </p>
                    
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <Label>Time Window (seconds)</Label>
                          </div>
                          <span className="text-sm font-medium">{timeThreshold}s</span>
                        </div>
                        <Slider
                          value={[timeThreshold]}
                          min={0}
                          max={300}
                          step={5}
                          onValueChange={values => setTimeThreshold(values[0])}
                        />
                        <p className="text-xs text-muted-foreground">
                          Events within {timeThreshold} seconds of each other may be considered the same event.
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <Label>Distance Threshold (km)</Label>
                          </div>
                          <span className="text-sm font-medium">{distanceThreshold} km</span>
                        </div>
                        <Slider
                          value={[distanceThreshold]}
                          min={0}
                          max={100}
                          step={1}
                          onValueChange={values => setDistanceThreshold(values[0])}
                        />
                        <p className="text-xs text-muted-foreground">
                          Events within {distanceThreshold} km of each other may be considered the same event.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <Separator className="my-6" />
                  
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-base font-medium mb-1">Conflict Resolution</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Choose how to handle conflicting data for the same event
                      </p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="merge-strategy">Merge Strategy</Label>
                          <Select
                            value={mergeStrategy}
                            onValueChange={value => setMergeStrategy(value)}
                          >
                            <SelectTrigger id="merge-strategy">
                              <SelectValue placeholder="Select strategy" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="priority">Source Priority</SelectItem>
                              <SelectItem value="average">Average Values</SelectItem>
                              <SelectItem value="newest">Newest Data</SelectItem>
                              <SelectItem value="complete">Most Complete Record</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {mergeStrategy === 'priority' && 'Use data from higher priority sources when conflicts occur.'}
                            {mergeStrategy === 'average' && 'Average numerical values (magnitude, depth) from all sources.'}
                            {mergeStrategy === 'newest' && 'Prefer the most recently updated event data.'}
                            {mergeStrategy === 'complete' && 'Use the record with the most complete information.'}
                          </p>
                        </div>
                        
                        {mergeStrategy === 'priority' && (
                          <div className="space-y-2">
                            <Label htmlFor="source-priority">Source Priority</Label>
                            <Select
                              value={priority}
                              onValueChange={value => setPriority(value)}
                            >
                              <SelectTrigger id="source-priority">
                                <SelectValue placeholder="Select priority" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="newest">Newest First</SelectItem>
                                <SelectItem value="geonet">GeoNet > Others</SelectItem>
                                <SelectItem value="gns">GNS > Others</SelectItem>
                                <SelectItem value="custom">Custom Order</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Define which sources should take precedence when conflicts occur.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="preview" className="pt-6">
                <div className="space-y-4">
                  <div className="bg-muted/30 p-4 rounded-md">
                    <h3 className="font-medium mb-3">Merge Summary</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                      <div>
                        <p className="text-sm text-muted-foreground">Merged Catalogue Name</p>
                        <p className="font-medium">{mergedName}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Estimated Events</p>
                        <p className="font-medium">{getEstimatedMergedEvents().toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Selected Catalogues</p>
                        <p className="font-medium">{selectedCatalogues.length}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Merge Strategy</p>
                        <p className="font-medium capitalize">{mergeStrategy}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Time Threshold</p>
                        <p className="font-medium">{timeThreshold} seconds</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Distance Threshold</p>
                        <p className="font-medium">{distanceThreshold} km</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="border rounded-md overflow-hidden">
                    <div className="bg-muted/50 px-4 py-2 text-sm font-medium">
                      Catalogues to be Merged
                    </div>
                    <div className="divide-y">
                      {getSelectedCatalogues().map((catalogue, index) => (
                        <div key={catalogue.id} className="flex items-center p-4">
                          <div className="flex-1">
                            <p className="font-medium">{catalogue.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {catalogue.events.toLocaleString()} events • Source: {catalogue.source}
                            </p>
                          </div>
                          {index < getSelectedCatalogues().length - 1 && (
                            <ArrowRightLeft className="h-5 w-5 text-muted-foreground mx-4" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {mergeStatus === 'complete' && (
                    <MergeActions events={mergedEvents} onDownload={() => {}} />
                  )}
                  
                  {mergeStatus !== 'complete' && (
                    <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3 rounded-md">
                      <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                      <p className="text-sm text-amber-800 dark:text-amber-300">
                        Merging multiple catalogues may take several minutes depending on the size of the datasets.
                        The process cannot be interrupted once started.
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter className="flex justify-between border-t bg-muted/20 px-6 py-4">
            <Button 
              variant="ghost" 
              onClick={handlePreviousStep}
              disabled={activeTab === 'select' || mergeStatus === 'merging'}
            >
              Back
            </Button>
            <div className="flex gap-2">
              {activeTab === 'select' && (
                <Button 
                  onClick={handleNextStep}
                  disabled={selectedCatalogues.length < 2}
                >
                  Configure Merge
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
              {activeTab === 'configure' && (
                <Button 
                  onClick={handleNextStep}
                >
                  Preview Merge
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
              {activeTab === 'preview' && renderMergeButton()}
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}