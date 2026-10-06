'use client';

import { AlertTriangle, Clock, CheckCircle, CloudOff } from 'lucide-react';
import { useCatalogues } from '@/contexts/CatalogueContext';
import { Skeleton } from '@/components/ui/skeleton';

export function ProcessingStatus() {
  const { catalogues, status } = useCatalogues();

  // Get the most recent catalogues (up to 5) sorted by creation date
  const recentCatalogues = [...catalogues]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  // Map status to icon and color
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'complete':
        return {
          icon: CheckCircle,
          color: 'text-green-700 dark:text-green-400',
          label: 'Complete'
        };
      case 'processing':
        return {
          icon: Clock,
          color: 'text-amber-700 dark:text-amber-400',
          label: 'Processing'
        };
      case 'error':
        return {
          icon: AlertTriangle,
          color: 'text-red-700 dark:text-red-400',
          label: 'Error'
        };
      default:
        return {
          icon: Clock,
          color: 'text-muted-foreground',
          label: status
        };
    }
  };

  if (status === 'loading') {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between gap-3 p-3 border rounded-md">
            <div className="flex min-w-0 items-center gap-3 flex-1">
              <Skeleton className="h-5 w-5 shrink-0 rounded" />
              <Skeleton className="h-4 w-full max-w-[16rem]" />
            </div>
            <Skeleton className="h-4 w-20 shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <CloudOff className="h-12 w-12 mx-auto mb-2 opacity-50" aria-hidden="true" />
        <p>Processing status is unavailable</p>
        <p className="text-sm mt-1">The catalogue list could not be loaded.</p>
      </div>
    );
  }

  if (recentCatalogues.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" aria-hidden="true" />
        <p>No catalogues yet</p>
        <p className="text-sm mt-1">Upload or import catalogues to see their processing status</p>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {recentCatalogues.map((catalogue) => {
        const statusConfig = getStatusConfig(catalogue.status);
        const StatusIcon = statusConfig.icon;

        return (
          <li key={catalogue.id} className="flex items-center justify-between gap-3 p-3 border rounded-md hover:bg-muted/50 transition-colors">
            {/* min-w-0 lets the name shrink and truncate so the status stays inside the card. */}
            <div className="flex min-w-0 flex-1 items-center gap-3" data-testid="processing-status-name">
              <StatusIcon className={`h-5 w-5 shrink-0 ${statusConfig.color}`} aria-hidden="true" />
              <span className="min-w-0 truncate" title={catalogue.name}>{catalogue.name}</span>
            </div>
            <span className="shrink-0 whitespace-nowrap capitalize text-sm text-muted-foreground">
              {statusConfig.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

