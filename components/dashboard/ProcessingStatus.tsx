'use client';

import { AlertTriangle, Clock, CheckCircle } from 'lucide-react';
import { useCatalogues } from '@/contexts/CatalogueContext';
import { Skeleton } from '@/components/ui/skeleton';

export function ProcessingStatus() {
  const { catalogues, loading } = useCatalogues();

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
          color: 'text-green-500',
          label: 'Complete'
        };
      case 'processing':
        return {
          icon: Clock,
          color: 'text-amber-500',
          label: 'Processing'
        };
      case 'error':
        return {
          icon: AlertTriangle,
          color: 'text-red-500',
          label: 'Error'
        };
      default:
        return {
          icon: Clock,
          color: 'text-gray-500',
          label: status
        };
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between p-3 border rounded-md">
            <div className="flex items-center gap-3 flex-1">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (recentCatalogues.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No catalogues found</p>
        <p className="text-sm mt-1">Upload or import catalogues to see their processing status</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {recentCatalogues.map((catalogue) => {
        const statusConfig = getStatusConfig(catalogue.status);
        const StatusIcon = statusConfig.icon;

        return (
          <div key={catalogue.id} className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              <StatusIcon className={`h-5 w-5 ${statusConfig.color}`} />
              <span className="truncate max-w-[250px]">{catalogue.name}</span>
            </div>
            <span className="capitalize text-sm text-muted-foreground">
              {statusConfig.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

