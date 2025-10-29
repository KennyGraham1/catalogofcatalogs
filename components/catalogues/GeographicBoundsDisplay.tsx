'use client';

import { MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface GeographicBoundsDisplayProps {
  minLatitude?: number | null;
  maxLatitude?: number | null;
  minLongitude?: number | null;
  maxLongitude?: number | null;
  compact?: boolean;
}

export function GeographicBoundsDisplay({
  minLatitude,
  maxLatitude,
  minLongitude,
  maxLongitude,
  compact = false,
}: GeographicBoundsDisplayProps) {
  // Check if bounds are available
  const hasBounds = 
    minLatitude !== null && 
    minLatitude !== undefined &&
    maxLatitude !== null && 
    maxLatitude !== undefined &&
    minLongitude !== null && 
    minLongitude !== undefined &&
    maxLongitude !== null && 
    maxLongitude !== undefined;

  if (!hasBounds) {
    return (
      <Badge variant="secondary" className="text-xs">
        <MapPin className="h-3 w-3 mr-1" />
        No geo data
      </Badge>
    );
  }

  const formatCoord = (value: number, isLat: boolean): string => {
    const abs = Math.abs(value);
    const dir = isLat
      ? value >= 0 ? 'N' : 'S'
      : value >= 0 ? 'E' : 'W';
    return `${abs.toFixed(2)}°${dir}`;
  };

  const shortFormat = `${formatCoord(minLatitude, true)} - ${formatCoord(maxLatitude, true)}`;
  const fullFormat = `Lat: ${formatCoord(minLatitude, true)} to ${formatCoord(maxLatitude, true)}, Lon: ${formatCoord(minLongitude, false)} to ${formatCoord(maxLongitude, false)}`;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-xs cursor-help">
              <MapPin className="h-3 w-3 mr-1" />
              {shortFormat}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{fullFormat}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex items-start gap-2 text-sm">
      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
      <div className="space-y-1">
        <div className="font-medium">Geographic Bounds</div>
        <div className="text-muted-foreground text-xs">
          <div>Latitude: {formatCoord(minLatitude, true)} to {formatCoord(maxLatitude, true)}</div>
          <div>Longitude: {formatCoord(minLongitude, false)} to {formatCoord(maxLongitude, false)}</div>
        </div>
      </div>
    </div>
  );
}

