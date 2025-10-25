'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { DatePicker } from '@/components/ui/date-picker';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { 
  Search,
  Filter,
  Save,
  Trash2,
  MapPin,
  Ruler,
  Calendar,
  Activity
} from 'lucide-react';

interface FilterPanelProps {
  onFiltersChange: (filters: any) => void;
  onSaveFilter: () => void;
  onClearFilters: () => void;
}

export function FilterPanel({ onFiltersChange, onSaveFilter, onClearFilters }: FilterPanelProps) {
  const [magnitudeRange, setMagnitudeRange] = useState([0, 10]);
  const [depthRange, setDepthRange] = useState([0, 700]);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [eventType, setEventType] = useState('all');
  const [useMapBounds, setUseMapBounds] = useState(true);

  const handleFiltersChange = () => {
    onFiltersChange({
      magnitude: magnitudeRange,
      depth: depthRange,
      dateRange: [startDate, endDate],
      eventType,
      useMapBounds
    });
  };

  return (
    <div className="space-y-6 p-4">
      <div>
        <h3 className="text-lg font-medium mb-2">Search Filters</h3>
        <p className="text-sm text-muted-foreground">
          Refine earthquake events by magnitude, location, time, and other attributes
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Magnitude Range
            </Label>
            <span className="text-sm">
              {magnitudeRange[0]} - {magnitudeRange[1]}
            </span>
          </div>
          <Slider
            value={magnitudeRange}
            min={0}
            max={10}
            step={0.1}
            onValueChange={setMagnitudeRange}
            className="mt-2"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Ruler className="h-4 w-4" />
              Depth Range (km)
            </Label>
            <span className="text-sm">
              {depthRange[0]} - {depthRange[1]} km
            </span>
          </div>
          <Slider
            value={depthRange}
            min={0}
            max={700}
            step={10}
            onValueChange={setDepthRange}
            className="mt-2"
          />
        </div>

        <Separator />

        <div className="space-y-4">
          <Label className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Time Range
          </Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Start Date</Label>
              <DatePicker date={startDate} setDate={setStartDate} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">End Date</Label>
              <DatePicker date={endDate} setDate={setEndDate} />
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="event-type" className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Event Type
          </Label>
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger>
              <SelectValue placeholder="Select event type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              <SelectItem value="earthquake">Earthquake</SelectItem>
              <SelectItem value="quarry">Quarry Blast</SelectItem>
              <SelectItem value="nuclear">Nuclear Explosion</SelectItem>
              <SelectItem value="other">Other Event</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="map-bounds" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Use Map Bounds
            </Label>
            <Switch
              id="map-bounds"
              checked={useMapBounds}
              onCheckedChange={setUseMapBounds}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Filter events to the current map view
          </p>
        </div>

        <Separator />

        <div className="flex items-center gap-2">
          <Button
            className="flex-1"
            onClick={handleFiltersChange}
          >
            <Search className="mr-2 h-4 w-4" />
            Apply Filters
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={onSaveFilter}
          >
            <Save className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={onClearFilters}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}