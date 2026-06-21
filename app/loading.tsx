import { LoadingSpinner } from '@/components/ui/loading-spinner';

/**
 * Route-level Suspense fallback. Gives every client navigation a consistent,
 * centered loader instead of a blank frame while the page resolves.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <LoadingSpinner size="lg" text="Loading…" />
    </div>
  );
}
