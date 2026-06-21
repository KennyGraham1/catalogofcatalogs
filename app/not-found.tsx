import Link from 'next/link';
import { Compass, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Branded 404 that stays inside the app shell, replacing Next's unstyled default.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Compass className="h-7 w-7" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">404 — Page not found</h1>
        <p className="max-w-md text-muted-foreground">
          The page you are looking for doesn&apos;t exist or may have been moved.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/">
            <Home className="mr-2 h-4 w-4" aria-hidden="true" />
            Back to Home
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Go to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
