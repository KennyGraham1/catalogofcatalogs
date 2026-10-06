'use client';

import { FileText, ExternalLink, Layers, CloudOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCatalogues } from '@/contexts/CatalogueContext';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCatalogueSourceType } from '@/lib/catalogue-source-type';
import { formatLocalDate } from '@/lib/date-format';

export function RecentCatalogues() {
  const { catalogues, status } = useCatalogues();
  const router = useRouter();

  // Get the 5 most recent catalogues
  const recentCatalogues = [...catalogues]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map(cat => {
      const isMerged = getCatalogueSourceType(cat) === 'merged';

      return {
        id: cat.id,
        name: cat.name,
        date: formatLocalDate(cat.created_at),
        events: cat.event_count,
        status: cat.status,
        isMerged
      };
    });

  const statusColors: Record<string, string> = {
    complete: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  };

  if (status === 'loading') {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between gap-3 p-3 border rounded-md">
            <div className="flex min-w-0 items-center gap-3 flex-1">
              <Skeleton className="h-5 w-5 shrink-0 rounded" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-full max-w-[12rem] mb-2" />
                <Skeleton className="h-3 w-full max-w-[16rem]" />
              </div>
            </div>
            <div className="flex gap-1">
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <EmptyState
        icon={CloudOff}
        title="Recent catalogues are unavailable"
        description="The catalogue list could not be loaded. Use Retry at the top of the page to try again."
      />
    );
  }

  if (recentCatalogues.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No catalogues yet"
        description="Get started by importing earthquake data from GeoNet or uploading a QuakeML file."
        action={{
          label: "Import from GeoNet",
          onClick: () => router.push('/import')
        }}
        secondaryAction={{
          label: "Upload File",
          onClick: () => router.push('/upload')
        }}
      />
    );
  }

  return (
    <ul className="space-y-4">
      {recentCatalogues.map((catalogue) => (
        <li key={catalogue.id} className="flex items-center justify-between gap-3 p-3 border rounded-md hover:bg-muted/50 transition-colors">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {catalogue.isMerged ? (
              <Layers className="h-5 w-5 shrink-0 text-indigo-500" aria-hidden="true" />
            ) : (
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="font-medium truncate" title={catalogue.name}>{catalogue.name}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground mt-1">
                <span>{catalogue.date}</span>
                <span>•</span>
                <Badge variant="outline" className={statusColors[catalogue.status] || ''}>
                  {catalogue.status}
                </Badge>
                <span>•</span>
                <span>{catalogue.events.toLocaleString()} events</span>
                {catalogue.isMerged && (
                  <>
                    <span>•</span>
                    <span className="text-indigo-700 dark:text-indigo-300">Merged</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <Link href={`/catalogues/${catalogue.id}`} aria-label={`Open ${catalogue.name}`} title={`Open ${catalogue.name}`}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
