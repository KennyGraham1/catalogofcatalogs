'use client';

import { memo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface MapLoadingIndicatorProps {
  /**
   * Current loading message to display
   */
  message?: string;
  /**
   * Loading progress (0-100), shows indeterminate if not provided
   */
  progress?: number;
  /**
   * Number of events being loaded
   */
  eventCount?: number;
  /**
   * Height of the loading container
   */
  height?: string;
  /**
   * Variant of loading indicator
   */
  variant?: 'skeleton' | 'spinner' | 'progress';
}

/**
 * Skeleton loading state for map
 */
const SkeletonLoader = memo(function SkeletonLoader({ height }: { height: string }) {
  return (
    <div className={`${height} w-full relative`}>
      <Skeleton className="h-full w-full rounded-lg" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
          <p className="text-muted-foreground">Loading map...</p>
        </div>
      </div>
    </div>
  );
});

/**
 * Spinner loading state
 */
const SpinnerLoader = memo(function SpinnerLoader({
  height,
  message,
  eventCount,
}: {
  height: string;
  message?: string;
  eventCount?: number;
}) {
  return (
    <div className={`${height} w-full relative flex items-center justify-center bg-muted/20 rounded-lg`}>
      <div className="text-center space-y-4">
        <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
        <div className="space-y-1">
          <p className="text-muted-foreground font-medium">
            {message || 'Loading earthquake data...'}
          </p>
          {eventCount !== undefined && eventCount > 0 && (
            <p className="text-sm text-muted-foreground">
              Processing {eventCount.toLocaleString()} events
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * Progress bar loading state
 */
const ProgressLoader = memo(function ProgressLoader({
  height,
  message,
  progress,
  eventCount,
}: {
  height: string;
  message?: string;
  progress?: number;
  eventCount?: number;
}) {
  return (
    <div className={`${height} w-full relative flex items-center justify-center bg-muted/20 rounded-lg`}>
      <div className="text-center space-y-4 w-64">
        <MapPin className="h-12 w-12 mx-auto text-primary" />
        <div className="space-y-2">
          <p className="text-muted-foreground font-medium">
            {message || 'Loading earthquake data...'}
          </p>
          {eventCount !== undefined && eventCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {eventCount.toLocaleString()} events
            </p>
          )}
          <Progress value={progress ?? 0} className="w-full" />
          {progress !== undefined && (
            <p className="text-xs text-muted-foreground">{Math.round(progress)}%</p>
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * Map Loading Indicator Component
 *
 * Shows appropriate loading state based on the current operation.
 */
export const MapLoadingIndicator = memo(function MapLoadingIndicator({
  message,
  progress,
  eventCount,
  height = 'h-[600px]',
  variant = 'spinner',
}: MapLoadingIndicatorProps) {
  switch (variant) {
    case 'skeleton':
      return <SkeletonLoader height={height} />;
    case 'progress':
      return (
        <ProgressLoader
          height={height}
          message={message}
          progress={progress}
          eventCount={eventCount}
        />
      );
    case 'spinner':
    default:
      return (
        <SpinnerLoader height={height} message={message} eventCount={eventCount} />
      );
  }
});

/**
 * Inline loading indicator for use within the map
 */
export const InlineMapLoader = memo(function InlineMapLoader({
  message = 'Updating...',
}: {
  message?: string;
}) {
  return (
    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[1000]">
      <div className="bg-background/95 backdrop-blur-sm rounded-lg shadow-lg px-4 py-3 flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  );
});

/**
 * Empty state for when no events are found
 */
export const MapEmptyState = memo(function MapEmptyState({
  height = 'h-[600px]',
  title = 'No earthquake events found',
  description = 'Try adjusting your filters or selecting a different catalogue',
}: {
  height?: string;
  title?: string;
  description?: string;
}) {
  return (
    <div className={`${height} w-full relative flex items-center justify-center bg-muted/20 rounded-lg`}>
      <div className="text-center text-muted-foreground">
        <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p className="font-medium">{title}</p>
        <p className="text-sm mt-1">{description}</p>
      </div>
    </div>
  );
});

/**
 * Error state for when map loading fails
 */
export const MapErrorState = memo(function MapErrorState({
  height = 'h-[600px]',
  error,
  onRetry,
}: {
  height?: string;
  error: string;
  onRetry?: () => void;
}) {
  return (
    <div className={`${height} w-full relative flex items-center justify-center bg-muted/20 rounded-lg`}>
      <div className="text-center text-muted-foreground">
        <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50 text-destructive" />
        <p className="font-medium">Failed to load map data</p>
        <p className="text-sm mt-1">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
});

export default MapLoadingIndicator;
