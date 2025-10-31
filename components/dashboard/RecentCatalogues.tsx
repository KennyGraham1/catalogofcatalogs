'use client';

import { FileText, Download, ExternalLink, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCatalogues } from '@/contexts/CatalogueContext';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function RecentCatalogues() {
  const { catalogues, loading } = useCatalogues();
  const router = useRouter();

  // Get the 5 most recent catalogues
  const recentCatalogues = [...catalogues]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map(cat => {
      // Determine if it's a merged catalogue
      let isMerged = false;
      try {
        const sources = JSON.parse(cat.source_catalogues || '[]');
        isMerged = Array.isArray(sources) && sources.length > 0;
      } catch {
        isMerged = false;
      }

      return {
        id: cat.id,
        name: cat.name,
        date: new Date(cat.created_at).toLocaleDateString(),
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

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between p-3 border rounded-md">
            <div className="flex items-center gap-3 flex-1">
              <Skeleton className="h-5 w-5 rounded" />
              <div className="flex-1">
                <Skeleton className="h-4 w-48 mb-2" />
                <Skeleton className="h-3 w-64" />
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
    <div className="space-y-4">
      {recentCatalogues.map((catalogue) => (
        <div key={catalogue.id} className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-3">
            {catalogue.isMerged ? (
              <Layers className="h-5 w-5 text-indigo-500" />
            ) : (
              <FileText className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <p className="font-medium truncate max-w-[180px] sm:max-w-xs">{catalogue.name}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
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
                    <span className="text-indigo-500">Merged</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <Link href={`/catalogues/${catalogue.id}`}>
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}