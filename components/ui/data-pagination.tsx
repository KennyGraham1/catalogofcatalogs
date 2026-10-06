'use client';

import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from '@/components/ui/pagination';
import { generatePageNumbers } from '@/hooks/use-pagination';

interface DataPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: Array<number | { value: number; label: string }>;
  showPageSize?: boolean;
}

/**
 * Results summary, rows-per-page selector and page controls.
 *
 * Every control is a native button, so Tab reaches it and Enter or Space activates it.
 * Below sm the parts stack, the buttons are 32 px, and Previous/Next shrink to their
 * chevrons (their text stays their accessible name), so up to seven page entries fit a
 * 306 px container (the merge table's card at a 390 px viewport) on one row; a longer
 * list wraps rather than overflowing.
 */
export function DataPagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  showPageSize = true
}: DataPaginationProps) {
  const pages = generatePageNumbers(currentPage, totalPages);
  const listRef = useRef<HTMLUListElement>(null);
  // Previous/Next disable themselves on the first/last page. When the user reached that
  // page with the button, focus would be left on a disabled control (and browsers drop
  // it to the page body), so it moves to the current page's button instead.
  const steppedWith = useRef<'previous' | 'next' | null>(null);

  useEffect(() => {
    const via = steppedWith.current;
    steppedWith.current = null;
    if (!via) return;
    const list = listRef.current;
    if (!list) return;
    const stepButton = list.querySelector<HTMLButtonElement>(`[data-pagination-step="${via}"]`);
    if (!stepButton?.disabled) return;
    const active = document.activeElement;
    if (active === stepButton || active === document.body || active === null) {
      list.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus();
    }
  }, [currentPage]);

  const normalizedOptions = pageSizeOptions.map((option) =>
    typeof option === 'number'
      ? { value: option, label: option.toString() }
      : option
  );

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = totalItems === 0 ? 0 : Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex min-w-0 flex-col items-center justify-between gap-3 px-2 py-4 sm:flex-row sm:flex-wrap sm:gap-4">
      <div className="text-center text-sm text-muted-foreground" aria-live="polite">
        Showing {startItem} to {endItem} of {totalItems} results
      </div>

      <div className="flex min-w-0 max-w-full flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-x-6">
        {showPageSize && onPageSizeChange && (
          <div className="flex items-center gap-2">
            {/* The trigger is named by aria-label: its own text is the selected value. */}
            <span className="text-sm text-muted-foreground whitespace-nowrap" aria-hidden="true">
              Rows per page:
            </span>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => onPageSizeChange(parseInt(value))}
            >
              <SelectTrigger className="w-[100px]" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {normalizedOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value.toString()}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Pagination className="mx-0 w-auto max-w-full">
          <PaginationContent ref={listRef} className="flex-wrap justify-center">
            <PaginationItem>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 px-0 sm:h-9 sm:w-auto sm:px-3"
                data-pagination-step="previous"
                onClick={() => {
                  steppedWith.current = 'previous';
                  onPageChange(currentPage - 1);
                }}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-4 w-4 sm:-ml-1 sm:mr-1" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Previous</span>
              </Button>
            </PaginationItem>

            {pages.map((page, index) => {
              if (page === 'ellipsis') {
                return (
                  <PaginationItem key={`ellipsis-${index}`}>
                    <PaginationEllipsis className="h-8 w-6 sm:h-9 sm:w-9" />
                  </PaginationItem>
                );
              }

              const isCurrent = currentPage === page;
              return (
                <PaginationItem key={page}>
                  <Button
                    type="button"
                    onClick={() => onPageChange(page)}
                    variant={isCurrent ? 'outline' : 'ghost'}
                    size="icon"
                    className="h-8 w-8 sm:h-9 sm:w-9"
                    aria-current={isCurrent ? 'page' : undefined}
                    aria-label={`Go to page ${page}`}
                  >
                    {page}
                  </Button>
                </PaginationItem>
              );
            })}

            <PaginationItem>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 px-0 sm:h-9 sm:w-auto sm:px-3"
                data-pagination-step="next"
                onClick={() => {
                  steppedWith.current = 'next';
                  onPageChange(currentPage + 1);
                }}
                disabled={currentPage >= totalPages}
              >
                <span className="sr-only sm:not-sr-only">Next</span>
                <ChevronRight className="h-4 w-4 sm:-mr-1 sm:ml-1" aria-hidden="true" />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
