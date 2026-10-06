'use client';

import {
  Upload,
  Copy,
  AlertTriangle,
  CheckCircle,
  FileText,
  Activity as ActivityIcon,
  CloudOff
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCatalogues } from '@/contexts/CatalogueContext';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useRouter } from 'next/navigation';
import { getCatalogueSourceType } from '@/lib/catalogue-source-type';
import { formatLocalDate } from '@/lib/date-format';

/** Entries in a catalogue's source list; 0 when it is missing or unreadable. */
function countSourceCatalogues(raw: string | null | undefined): number {
  try {
    const sources = JSON.parse(raw || '[]');
    return Array.isArray(sources) ? sources.length : 0;
  } catch {
    return 0;
  }
}

type ActivityType = 'upload' | 'merge' | 'error' | 'complete';

interface Activity {
  type: ActivityType;
  title: string;
  description: string;
  time: string;
  catalogueId?: string;
}

const activityIcons: Record<ActivityType, React.ElementType> = {
  upload: Upload,
  merge: Copy,
  error: AlertTriangle,
  complete: CheckCircle
};

const activityColors: Record<ActivityType, string> = {
  upload: 'text-blue-700 bg-blue-100 dark:bg-blue-900 dark:text-blue-300',
  merge: 'text-indigo-700 bg-indigo-100 dark:bg-indigo-900 dark:text-indigo-300',
  error: 'text-red-700 bg-red-100 dark:bg-red-900 dark:text-red-300',
  complete: 'text-green-700 bg-green-100 dark:bg-green-900 dark:text-green-300'
};

export function ActivityFeed() {
  const { catalogues, status } = useCatalogues();
  const router = useRouter();

  // Generate activities from real catalogue data. Sorted on a copy: the provider's
  // array is shared state and must not be reordered in place.
  const activities: Activity[] = [...catalogues]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10)
    .map(catalogue => {
      const isMerged = getCatalogueSourceType(catalogue) === 'merged';
      // A merge recognised by its merge_config alone may carry no readable source list.
      const sourceCount = isMerged ? countSourceCatalogues(catalogue.source_catalogues) : 0;

      // Calculate time ago
      const createdDate = new Date(catalogue.created_at);
      const now = new Date();
      const diffMs = now.getTime() - createdDate.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      let timeAgo: string;
      if (diffMins < 1) {
        timeAgo = 'Just now';
      } else if (diffMins < 60) {
        timeAgo = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
      } else if (diffHours < 24) {
        timeAgo = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      } else if (diffDays < 30) {
        timeAgo = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      } else {
        timeAgo = formatLocalDate(createdDate);
      }

      // Determine activity type and description
      let type: ActivityType;
      let title: string;
      let description: string;

      if (catalogue.status === 'error') {
        type = 'error';
        title = 'Processing error';
        description = `Failed to process ${catalogue.name}`;
      } else if (isMerged) {
        type = 'merge';
        title = 'Catalogues merged';
        description = sourceCount > 0
          ? `${catalogue.name} created from ${sourceCount} source catalogue${sourceCount > 1 ? 's' : ''}`
          : `${catalogue.name} created by merging catalogues`;
      } else if (catalogue.status === 'complete') {
        type = 'complete';
        title = 'Catalogue created';
        description = `${catalogue.name} with ${catalogue.event_count.toLocaleString()} events`;
      } else {
        type = 'upload';
        title = 'Catalogue processing';
        description = `${catalogue.name} is being processed`;
      }

      return {
        type,
        title,
        description,
        time: timeAgo,
        catalogueId: catalogue.id
      };
    });

  if (status === 'loading') {
    return (
      <div className="space-y-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="flex-shrink-0 h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
              <Skeleton className="h-3 w-24" />
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
        title="Activity is unavailable"
        description="The catalogue list could not be loaded. Use Retry at the top of the page to try again."
      />
    );
  }

  if (activities.length === 0) {
    return (
      <EmptyState
        icon={ActivityIcon}
        title="No activity yet"
        description="Your recent catalogue uploads, imports, and merges will appear here."
        action={{
          label: "Import from GeoNet",
          onClick: () => router.push('/import')
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {activities.map((activity, i) => {
        const Icon = activityIcons[activity.type];
        const colorClass = activityColors[activity.type];

        return (
          <div key={i} className="flex gap-4">
            <div className={cn(
              "flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center",
              colorClass
            )}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium leading-none">{activity.title}</p>
              <p className="text-sm text-muted-foreground break-words">{activity.description}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <span>{activity.time}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
