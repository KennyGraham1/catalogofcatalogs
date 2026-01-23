import { useState, useMemo, useEffect, useCallback } from 'react';

export interface PaginationOptions {
  initialPage?: number;
  pageSize?: number;
}

export interface PaginationResult<T> {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  paginatedData: T[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  goToPage: (page: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  setPageSize: (size: number) => void;
}

/**
 * Hook for client-side pagination
 */
export function usePagination<T>(
  data: T[],
  options: PaginationOptions = {}
): PaginationResult<T> {
  const { initialPage = 1, pageSize: initialPageSize = 10 } = options;
  
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalItems = data.length;
  const totalPages = Math.ceil(totalItems / pageSize);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return data.slice(startIndex, endIndex);
  }, [data, currentPage, pageSize]);

  const hasNextPage = currentPage < totalPages;
  const hasPreviousPage = currentPage > 1;

  useEffect(() => {
    if (totalPages === 0 && currentPage !== 1) {
      setCurrentPage(1);
      return;
    }
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const goToPage = useCallback(
    (page: number) => {
      const validPage = Math.max(1, Math.min(page, totalPages || 1));
      setCurrentPage(validPage);
    },
    [totalPages]
  );

  const nextPage = useCallback(() => {
    if (hasNextPage) {
      setCurrentPage(prev => prev + 1);
    }
  }, [hasNextPage]);

  const previousPage = useCallback(() => {
    if (hasPreviousPage) {
      setCurrentPage(prev => prev - 1);
    }
  }, [hasPreviousPage]);

  const handleSetPageSize = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1); // Reset to first page when changing page size
  }, []);

  return {
    currentPage,
    pageSize,
    totalPages,
    totalItems,
    paginatedData,
    hasNextPage,
    hasPreviousPage,
    goToPage,
    nextPage,
    previousPage,
    setPageSize: handleSetPageSize
  };
}

/**
 * Generate page numbers for pagination UI
 */
export function generatePageNumbers(
  currentPage: number,
  totalPages: number,
  maxVisible: number = 5
): (number | 'ellipsis')[] {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | 'ellipsis')[] = [];
  const halfVisible = Math.floor(maxVisible / 2);

  // Always show first page
  pages.push(1);

  let startPage = Math.max(2, currentPage - halfVisible);
  let endPage = Math.min(totalPages - 1, currentPage + halfVisible);

  // Adjust if we're near the start
  if (currentPage <= halfVisible + 1) {
    endPage = maxVisible - 1;
  }

  // Adjust if we're near the end
  if (currentPage >= totalPages - halfVisible) {
    startPage = totalPages - maxVisible + 2;
  }

  // Add ellipsis after first page if needed
  if (startPage > 2) {
    pages.push('ellipsis');
  }

  // Add middle pages
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  // Add ellipsis before last page if needed
  if (endPage < totalPages - 1) {
    pages.push('ellipsis');
  }

  // Always show last page
  if (totalPages > 1) {
    pages.push(totalPages);
  }

  return pages;
}
