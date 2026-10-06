'use client';

import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatLastSuccess, type CatalogueLoadStatus } from '@/contexts/catalogue-load-status';

interface CatalogueLoadNoticeProps {
  status: CatalogueLoadStatus;
  /** Why the most recent request failed (CatalogueContext `error`). */
  error?: string | null;
  /** When the list last loaded successfully (CatalogueContext `lastSuccessAt`). */
  lastSuccessAt?: Date | null;
  onRetry: () => void;
  /** A retry or refresh is in flight. */
  retrying?: boolean;
  /** What a failure leaves unavailable on this page, e.g. "The catalogue list and totals". */
  unavailable?: string;
  className?: string;
}

/**
 * The failed and stale states of the shared catalogue list, each with a Retry action.
 * Renders nothing for loading, loaded and empty, which each page shows in its own way.
 */
export function CatalogueLoadNotice({
  status,
  error,
  lastSuccessAt,
  onRetry,
  retrying = false,
  unavailable = 'The catalogue list and its totals',
  className,
}: CatalogueLoadNoticeProps) {
  if (status !== 'failed' && status !== 'stale') return null;

  const failed = status === 'failed';
  const Icon = failed ? WifiOff : AlertTriangle;

  return (
    <div
      role={failed ? 'alert' : 'status'}
      data-catalogue-load-state={status}
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-4 text-sm sm:flex-row sm:items-start sm:justify-between',
        failed
          ? 'border-destructive/50 bg-destructive/5 text-foreground'
          : 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100',
        className
      )}
    >
      <div className="flex min-w-0 gap-3">
        <Icon
          className={cn('mt-0.5 h-5 w-5 shrink-0', failed ? 'text-destructive' : 'text-amber-600 dark:text-amber-400')}
          aria-hidden="true"
        />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">
            {failed ? 'Catalogues could not be loaded' : 'Showing earlier catalogue data'}
          </p>
          {failed ? (
            <p>
              {unavailable} are unavailable because the request to the server failed. This does not mean that
              no catalogues exist.
            </p>
          ) : (
            <p>
              {lastSuccessAt
                ? `This information was loaded at ${formatLastSuccess(lastSuccessAt)}. `
                : ''}
              The latest refresh failed, so it may be out of date.
            </p>
          )}
          {error && <p className="break-words">Details: {error}</p>}
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 gap-2 self-start bg-background"
        onClick={() => onRetry()}
        disabled={retrying}
      >
        <RefreshCw className={cn('h-4 w-4', retrying && 'animate-spin')} aria-hidden="true" />
        {retrying ? 'Retrying…' : 'Retry'}
      </Button>
    </div>
  );
}

/**
 * A total whose value is unknown because the list failed to load: shown as "—", read out
 * as "unavailable".
 */
export function UnavailableValue({ className }: { className?: string }) {
  return (
    <span className={className} title="Unavailable">
      <span aria-hidden="true">—</span>
      <span className="sr-only">Unavailable</span>
    </span>
  );
}
