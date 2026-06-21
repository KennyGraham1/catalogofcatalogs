'use client';

import Link from 'next/link';
import { Activity } from 'lucide-react';

/**
 * Site footer: attribution, data-source credit, and primary links. Sits at the
 * bottom of the app shell (the layout wrapper is min-h-screen flex-col with a
 * flex-1 main, so the footer is pinned below the fold on short pages).
 */
export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t bg-background/60">
      <div className="container flex flex-col gap-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>
            Earthquake Catalogue Platform &copy; {year}
          </span>
        </div>

        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Footer">
          <Link href="/catalogues" className="transition-colors hover:text-foreground">
            Catalogues
          </Link>
          <Link href="/analytics" className="transition-colors hover:text-foreground">
            Analytics
          </Link>
          <a
            href="https://www.geonet.org.nz"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            Data: GeoNet / GNS Science
          </a>
        </nav>
      </div>
    </footer>
  );
}
