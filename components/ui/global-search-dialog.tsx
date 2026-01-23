'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GlobalSearch } from './global-search';
import { Search } from 'lucide-react';

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearchDialog({ open, onOpenChange }: GlobalSearchDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            <DialogTitle>Search Events</DialogTitle>
          </div>
          <DialogDescription>
            Search events across all catalogues by ID, location, magnitude, depth, or date. Use tokens for precision.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6">
          <GlobalSearch 
            placeholder="Search events (e.g., id:us1234 mag:>=4 region:wellington)"
            onResultSelect={() => onOpenChange(false)}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Tokens: id:, public:, type:, region:, location:, mag:, depth:, date:, catalogue:. Example:
            <span className="font-medium">{' mag:>=4 depth:<10 date:2023-01-01..2023-12-31'}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Date format: YYYY-MM-DD (or YYYY-MM). Ranges use <span className="font-medium">..</span>.
          </p>
        </div>

        <div className="border-t px-6 py-3 text-xs text-muted-foreground bg-muted/30">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="pointer-events-none h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium inline-flex">
                ↑↓
              </kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="pointer-events-none h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium inline-flex">
                ↵
              </kbd>
              Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="pointer-events-none h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium inline-flex">
                ESC
              </kbd>
              Close
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
