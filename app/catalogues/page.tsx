'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCatalogues } from '@/contexts/CatalogueContext';
import { usePagination } from '@/hooks/use-pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  Download,
  Share2,
  MoreVertical,
  FileText,
  Map,
  Calendar,
  Trash2,
  Edit,
  RefreshCw,
  GitMerge,
  Upload,
  Globe,
  Info,
  Bug
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { GeographicSearchPanel, GeographicBounds } from '@/components/catalogues/GeographicSearchPanel';
import { useDebounce } from '@/hooks/use-debounce';
import { CatalogueTableSkeleton } from '@/components/ui/skeleton-loaders';
import { TableEmptyState } from '@/components/ui/empty-state';
import { DataPagination } from '@/components/ui/data-pagination';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { Database } from 'lucide-react';
import { CatalogueStatsPopover } from '@/components/catalogues/CatalogueStatsPopover';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useAuth, usePermission } from '@/lib/auth/hooks';
import { Permission, UserRole } from '@/lib/auth/types';
import { ToastAction } from '@/components/ui/toast';
import { getApiError } from '@/lib/api';

interface Catalogue {
  id: string;
  name: string;
  created_at: string;
  source_catalogues: string;
  merge_config: string;
  event_count: number;
  status: string;
  min_latitude?: number | null;
  max_latitude?: number | null;
  min_longitude?: number | null;
  max_longitude?: number | null;
}

type CatalogueStatus = 'all' | 'complete' | 'processing' | 'error';
type SortField = 'name' | 'date' | 'events' | 'sourceType' | 'source';
type SortDirection = 'asc' | 'desc';
type SearchToken = { field?: string; value: string };
type SearchFields = {
  name: string;
  id: string;
  status: string;
  source: string;
  sourceType: string;
  events: string;
  created: string;
};
type CatalogueSourceType = 'merged' | 'imported' | 'uploaded';
type CatalogueMeta = {
  catalogue: Catalogue;
  sourceType: CatalogueSourceType;
  sourceNamesDisplay: string;
  searchFields: SearchFields;
  haystack: string;
  createdTimestamp: number;
  eventCount: number;
  formattedDate: string;
};

export default function CataloguesPage() {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const canManageCatalogues = user?.role === UserRole.EDITOR || user?.role === UserRole.ADMIN;
  const canExportCatalogues = usePermission(Permission.CATALOGUE_EXPORT);
  const exportBlockedMessage = user
    ? 'Viewer or higher access is required to export catalogues.'
    : 'Log in to export catalogues.';

  // Use global catalogue context
  const { catalogues: contextCatalogues, loading: contextLoading, refreshCatalogues } = useCatalogues();

  const [catalogues, setCatalogues] = useState<Catalogue[]>(contextCatalogues);
  const [loading, setLoading] = useState(contextLoading);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllResults, setShowAllResults] = useState(false);
  const [statusFilter, setStatusFilter] = useState<CatalogueStatus>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCatalogue, setSelectedCatalogue] = useState<Catalogue | null>(null);
  const [geoSearchActive, setGeoSearchActive] = useState(false);
  const [geoSearching, setGeoSearching] = useState(false);
  const [geoSearchBounds, setGeoSearchBounds] = useState<GeographicBounds | null>(null);
  const [geoSearchRequestId, setGeoSearchRequestId] = useState<string | null>(null);
  const [showGeoDebug, setShowGeoDebug] = useState(false);

  // Debounce search query to avoid filtering on every keystroke
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Page-specific keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: 'f',
        ctrl: true,
        description: 'Focus search input',
        action: () => {
          searchInputRef.current?.focus();
        },
      },
      {
        key: 'r',
        ctrl: true,
        description: 'Refresh catalogues',
        action: () => {
          refreshCatalogues();
          toast({
            title: 'Refreshing catalogues',
            description: 'Fetching latest catalogue data...',
          });
        },
      },
    ],
  });

  // Sync with context catalogues
  useEffect(() => {
    if (!geoSearchActive) {
      setCatalogues(contextCatalogues);
      setLoading(contextLoading);
    }
  }, [contextCatalogues, contextLoading, geoSearchActive]);

  const fetchCatalogues = async () => {
    await refreshCatalogues();
  };

  // Memoized geographic search handler
  const handleGeoSearch = useCallback(async (bounds: GeographicBounds) => {
    try {
      setGeoSearching(true);
      const requestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
      setGeoSearchRequestId(requestId);
      const params = new URLSearchParams({
        minLat: bounds.minLatitude.toString(),
        maxLat: bounds.maxLatitude.toString(),
        minLon: bounds.minLongitude.toString(),
        maxLon: bounds.maxLongitude.toString(),
      });

      const response = await fetch(`/api/catalogues/search/region?${params}`, {
        headers: {
          'X-Request-Id': requestId,
        },
      });
      if (!response.ok) {
        const errorInfo = await getApiError(response, 'Failed to search catalogues');
        setGeoSearchRequestId(errorInfo.requestId ?? requestId);
        throw new Error(errorInfo.message);
      }

      const data = await response.json();
      setCatalogues(data.catalogues);
      setGeoSearchActive(true);
      setGeoSearchBounds(bounds);
      setGeoSearchRequestId(data.requestId ?? requestId);

      toast({
        title: "Search complete",
        description: `Found ${data.count} catalogue(s) in the specified region`,
      });
    } catch (error) {
      toast({
        title: "Search failed",
        description: error instanceof Error ? error.message : "Failed to search catalogues",
        variant: "destructive",
      });
    } finally {
      setGeoSearching(false);
    }
  }, []);

  // Memoized clear handler
  const handleClearGeoSearch = useCallback(() => {
    setGeoSearchActive(false);
    setGeoSearchBounds(null);
    setGeoSearchRequestId(null);
    fetchCatalogues();
    // fetchCatalogues is a wrapper around refreshCatalogues from context
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normalizeSearchValue = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

  const parseSearchTokens = (query: string): SearchToken[] => {
    const tokens: SearchToken[] = [];
    const normalizedQuery = query.replace(/([a-zA-Z][\w-]*):"/g, '$1: "').trim();
    const pattern = /"([^"]+)"|(\S+)/g;
    const rawTokens: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(normalizedQuery)) !== null) {
      const rawToken = (match[1] ?? match[2]).trim();
      if (rawToken) rawTokens.push(rawToken);
    }

    for (let i = 0; i < rawTokens.length; i += 1) {
      const rawToken = rawTokens[i];
      const fieldMatch = rawToken.match(/^([a-zA-Z][\w-]*):(.*)$/);

      if (fieldMatch) {
        const field = fieldMatch[1].toLowerCase();
        let value = fieldMatch[2].trim();

        if (!value && i + 1 < rawTokens.length) {
          const nextToken = rawTokens[i + 1];
          if (!nextToken.includes(':')) {
            value = nextToken;
            i += 1;
          }
        }

        const opTokens = ['>', '<', '=', '>=', '<='];
        if (opTokens.includes(value) && i + 1 < rawTokens.length) {
          const nextToken = rawTokens[i + 1];
        if (field === 'events' && /^\d+(?:\.\d+)?$/.test(nextToken)) {
          value = `${value}${nextToken}`;
          i += 1;
        } else if (
          (field === 'date' || field === 'created' || field === 'created_at' || field === 'createdat') &&
          !nextToken.includes(':')
        ) {
          value = `${value}${nextToken}`;
          i += 1;
        }
      }

      if (
        (field === 'date' || field === 'created' || field === 'created_at' || field === 'createdat') &&
        value.endsWith('..') &&
        i + 1 < rawTokens.length
      ) {
        const nextToken = rawTokens[i + 1];
        if (!nextToken.includes(':')) {
          value = `${value}${nextToken}`;
          i += 1;
        }
      }

      if (
        (field === 'date' || field === 'created' || field === 'created_at' || field === 'createdat') &&
        value === '..' &&
        i + 1 < rawTokens.length
      ) {
        const nextToken = rawTokens[i + 1];
        if (!nextToken.includes(':')) {
          value = `${value}${nextToken}`;
          i += 1;
        }
      }

      if (value) tokens.push({ field, value });
      continue;
    }

      if (rawToken.endsWith(':')) continue;
      tokens.push({ value: rawToken });
    }

    return tokens;
  };

  const statusAliases: Record<string, string> = {
    complete: 'complete',
    completed: 'complete',
    done: 'complete',
    processing: 'processing',
    inprogress: 'processing',
    running: 'processing',
    error: 'error',
    errored: 'error',
    failed: 'error',
    failure: 'error',
  };

  const parseNumericFilter = (value: string): { op: string; amount: number } | null => {
    const match = value.match(/^(>=|<=|>|<|=)?\s*(\d+(?:\.\d+)?)$/);
    if (!match) return null;
    return { op: match[1] ?? '=', amount: Number(match[2]) };
  };

  const compareNumber = (actual: number, op: string, expected: number) => {
    switch (op) {
      case '>':
        return actual > expected;
      case '>=':
        return actual >= expected;
      case '<':
        return actual < expected;
      case '<=':
        return actual <= expected;
      default:
        return actual === expected;
    }
  };

  const parseDateValue = (rawValue: string): { timestamp: number; dayOnly: boolean; normalized: string } | null => {
    const trimmed = rawValue.trim();
    if (!trimmed) return null;

    const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (slashMatch) {
      const day = Number(slashMatch[1]);
      const month = Number(slashMatch[2]);
      let year = Number(slashMatch[3]);
      if (slashMatch[3].length === 2) {
        year += 2000;
      }

      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        const normalized = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const timestamp = Date.parse(normalized);
        if (!Number.isNaN(timestamp)) {
          return { timestamp, dayOnly: true, normalized };
        }
      }
    }

    const normalized = trimmed.replace(/\//g, '-');
    const timestamp = Date.parse(normalized);
    if (Number.isNaN(timestamp)) return null;

    const dayOnly = !/[T\s]\d{2}:\d{2}/.test(normalized) && /^\d{4}-\d{2}-\d{2}$/.test(normalized);
    return { timestamp, dayOnly, normalized };
  };

  const parseDateFilter = (value: string): { op: string; timestamp: number; dayOnly: boolean; normalized: string } | null => {
    const match = value.match(/^(>=|<=|>|<|=)?\s*(.+)$/);
    if (!match) return null;
    const op = match[1] ?? '=';
    const dateValue = parseDateValue(match[2]);
    if (!dateValue) return null;
    return { op, ...dateValue };
  };

  const parseDateRange = (value: string): { start?: { timestamp: number; dayOnly: boolean; normalized: string }; end?: { timestamp: number; dayOnly: boolean; normalized: string } } | null => {
    if (!value.includes('..')) return null;
    const [startRaw, endRaw] = value.split('..');
    const start = parseDateValue(startRaw);
    const end = parseDateValue(endRaw);
    if (!start && !end) return null;
    return { start: start ?? undefined, end: end ?? undefined };
  };

  const compareDate = (
    actualTimestamp: number,
    filter: { op: string; timestamp: number; dayOnly: boolean; normalized: string }
  ) => {
    if (filter.dayOnly && filter.op === '=') {
      const actualDate = new Date(actualTimestamp).toISOString().slice(0, 10);
      return actualDate === filter.normalized;
    }

    switch (filter.op) {
      case '>':
        return actualTimestamp > filter.timestamp;
      case '>=':
        return actualTimestamp >= filter.timestamp;
      case '<':
        return actualTimestamp < filter.timestamp;
      case '<=':
        return actualTimestamp <= filter.timestamp;
      default:
        return actualTimestamp === filter.timestamp;
    }
  };

  const matchesDateRange = (
    actualTimestamp: number,
    range: { start?: { timestamp: number; dayOnly: boolean; normalized: string }; end?: { timestamp: number; dayOnly: boolean; normalized: string } }
  ) => {
    if (!range.start && !range.end) return true;
    const actualDate = new Date(actualTimestamp).toISOString().slice(0, 10);

    if (range.start) {
      if (range.start.dayOnly) {
        if (actualDate < range.start.normalized) return false;
      } else if (actualTimestamp < range.start.timestamp) {
        return false;
      }
    }

    if (range.end) {
      if (range.end.dayOnly) {
        if (actualDate > range.end.normalized) return false;
      } else if (actualTimestamp > range.end.timestamp) {
        return false;
      }
    }

    return true;
  };

  const parseSourceCatalogues = (sourceCatalogues: string): any[] => {
    if (!sourceCatalogues) return [];
    try {
      const sources = JSON.parse(sourceCatalogues);
      return Array.isArray(sources) ? sources : [];
    } catch {
      return [];
    }
  };

  const getSourceNamesForSearch = (sources: any[]): string[] => {
    if (!Array.isArray(sources)) return [];
    return sources.flatMap((source: any) => {
      const entries = [source.source, source.name, source.id];
      return entries.filter(Boolean).map((entry) => String(entry));
    });
  };

  const getSourceNamesDisplay = (sources: any[]): string => {
    if (!Array.isArray(sources) || sources.length === 0) return 'Unknown';
    return sources.map((source: any) => source.source || source.name || 'Unknown').join(', ');
  };

  const getSourceType = (sources: any[], mergeConfigRaw: string): CatalogueSourceType => {
    // Merged catalogues have multiple source entries with 'id' fields (references to other catalogues)
    if (Array.isArray(sources) && sources.length > 1) {
      const hasMultipleSourceCatalogues = sources.some((source: any) => source.id && source.name && source.events !== undefined);
      if (hasMultipleSourceCatalogues) {
        return 'merged';
      }
    }

    // Check for single source type
    if (Array.isArray(sources) && sources.length > 0) {
      const firstSource = sources[0];
      const sourceName = (firstSource.source || '').toLowerCase();

      // Imported catalogues have specific source names like 'GeoNet', 'IRIS', 'FDSN'
      if (sourceName === 'geonet' || sourceName === 'iris fdsn' || sourceName.includes('fdsn') || sourceName.includes('api')) {
        return 'imported';
      }

      // Uploaded catalogues have source: 'upload'
      if (sourceName === 'upload') {
        return 'uploaded';
      }
    }

    // Check merge_config for additional hints
    if (mergeConfigRaw) {
      try {
        const mergeConfig = JSON.parse(mergeConfigRaw);
        if (mergeConfig.mergeStrategy || mergeConfig.timeThreshold !== undefined) {
          return 'merged';
        }
        if (mergeConfig.source === 'GeoNet' || mergeConfig.importDate) {
          return 'imported';
        }
        if (mergeConfig.uploadDate) {
          return 'uploaded';
        }
      } catch {
        // Ignore merge_config parse errors
      }
    }

    // Default to uploaded if we can't determine
    return 'uploaded';
  };

  const fieldAliases: Record<string, keyof SearchFields> = {
    name: 'name',
    id: 'id',
    status: 'status',
    source: 'source',
    sourcetype: 'sourceType',
    type: 'sourceType',
    events: 'events',
    event: 'events',
    count: 'events',
    created: 'created',
    createdat: 'created',
    created_at: 'created',
    date: 'created',
  };

  const cataloguesWithMeta = useMemo(() => {
    return catalogues.map((catalogue) => {
      const sources = parseSourceCatalogues(catalogue.source_catalogues);
      const sourceType = getSourceType(sources, catalogue.merge_config);
      const sourceNamesForSearch = getSourceNamesForSearch(sources);
      const sourceNamesDisplay = getSourceNamesDisplay(sources);
      const eventCount = catalogue.event_count ?? 0;
      const createdAt = catalogue.created_at ?? '';
      const formattedDate = createdAt ? formatDate(createdAt) : '—';
      const createdTimestamp = createdAt ? Date.parse(createdAt) : Number.NaN;
      const searchFields: SearchFields = {
        name: catalogue.name,
        id: String(catalogue.id),
        status: catalogue.status,
        source: sourceNamesForSearch.join(' '),
        sourceType,
        events: `${eventCount} ${eventCount.toLocaleString()}`,
        created: createdAt ? `${createdAt} ${formattedDate}` : '',
      };
      const haystack = normalizeSearchValue(Object.values(searchFields).join(' '));

      return {
        catalogue,
        sourceType,
        sourceNamesDisplay,
        searchFields,
        haystack,
        createdTimestamp,
        eventCount,
        formattedDate,
      };
    });
  }, [catalogues]);

  const matchesSearchQuery = useCallback((catalogueMeta: CatalogueMeta, tokens: SearchToken[]): boolean => {
    if (tokens.length === 0) return true;

    const { searchFields, haystack, createdTimestamp, eventCount } = catalogueMeta;

    return tokens.every((token) => {
      const value = normalizeSearchValue(token.value);
      if (!value) return true;

      if (!token.field) {
        const dateRange = parseDateRange(value);
        const dateFilter = parseDateFilter(value);
        if (!Number.isNaN(createdTimestamp)) {
          if (dateRange) {
            return matchesDateRange(createdTimestamp, dateRange);
          }
          if (dateFilter) {
            return compareDate(createdTimestamp, dateFilter);
          }
        }

        return haystack.includes(value);
      }

      const fieldKey = fieldAliases[token.field];
      if (!fieldKey) {
        return haystack.includes(value);
      }

      if (fieldKey === 'status') {
        const normalizedStatus = statusAliases[value] ?? value;
        return normalizeSearchValue(searchFields.status).includes(normalizedStatus);
      }

      if (fieldKey === 'events') {
        const numericFilter = parseNumericFilter(value);
        if (numericFilter) {
          return compareNumber(eventCount, numericFilter.op, numericFilter.amount);
        }
      }

      if (fieldKey === 'created') {
        const dateRange = parseDateRange(value);
        const dateFilter = parseDateFilter(value);
        if (!Number.isNaN(createdTimestamp)) {
          if (dateRange) {
            return matchesDateRange(createdTimestamp, dateRange);
          }
          if (dateFilter) {
            return compareDate(createdTimestamp, dateFilter);
          }
        }
      }

      return normalizeSearchValue(searchFields[fieldKey]).includes(value);
    });
  }, []);

  const searchTokens = useMemo(
    () => parseSearchTokens(debouncedSearchQuery),
    [debouncedSearchQuery]
  );

  // Memoized filtered catalogues (using debounced search query)
  const filteredCatalogues = useMemo(() => {
    return cataloguesWithMeta.filter((catalogueMeta) => {
      const matchesStatus = statusFilter === 'all' || catalogueMeta.catalogue.status === statusFilter;
      const matchesSearch = matchesSearchQuery(catalogueMeta, searchTokens);

      return matchesSearch && matchesStatus;
    });
  }, [cataloguesWithMeta, matchesSearchQuery, searchTokens, statusFilter]);

  // Memoized sorted catalogues
  const sortedCatalogues = useMemo(() => {
    return [...filteredCatalogues].sort((a, b) => {
      let comparison = 0;

      if (sortField === 'name') {
        comparison = a.catalogue.name.localeCompare(b.catalogue.name);
      } else if (sortField === 'date') {
        const aTimestamp = Number.isNaN(a.createdTimestamp) ? 0 : a.createdTimestamp;
        const bTimestamp = Number.isNaN(b.createdTimestamp) ? 0 : b.createdTimestamp;
        comparison = aTimestamp - bTimestamp;
      } else if (sortField === 'events') {
        comparison = a.eventCount - b.eventCount;
      } else if (sortField === 'sourceType') {
        comparison = a.sourceType.localeCompare(b.sourceType);
      } else if (sortField === 'source') {
        comparison = a.sourceNamesDisplay.localeCompare(b.sourceNamesDisplay);
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredCatalogues, sortField, sortDirection]);

  const {
    currentPage,
    pageSize,
    totalPages,
    totalItems,
    paginatedData,
    goToPage,
    setPageSize
  } = usePagination(sortedCatalogues, { pageSize: 10 });

  const pageSizeOptions = useMemo(() => {
    const baseOptions = [10, 25, 50, 100];
    const options: Array<number | { value: number; label: string }> = baseOptions.filter(
      (size) => size !== totalItems
    );

    if (totalItems > 0) {
      options.push({ value: totalItems, label: 'Show All' });
    }

    return options;
  }, [totalItems]);

  useEffect(() => {
    if (!showAllResults || totalItems === 0) return;
    if (pageSize !== totalItems) {
      setPageSize(totalItems);
    }
  }, [showAllResults, totalItems, pageSize, setPageSize]);

  const handlePageSizeChange = (size: number) => {
    setShowAllResults(size === totalItems && totalItems > 0);
    setPageSize(size);
  };

  const paginatedCatalogues = paginatedData;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'complete':
        return <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">Complete</Badge>;
      case 'processing':
        return <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">Processing</Badge>;
      case 'error':
        return <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">Error</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSourceTypeBadge = (sourceType: CatalogueSourceType) => {
    const badgeConfig = {
      merged: {
        icon: <GitMerge className="h-3 w-3" />,
        label: 'Merged',
        tooltip: 'Created by merging multiple source catalogues',
        className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 border-purple-300 dark:border-purple-700',
      },
      imported: {
        icon: <Globe className="h-3 w-3" />,
        label: 'Imported',
        tooltip: 'Imported from external API (e.g., GeoNet FDSN)',
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 border-blue-300 dark:border-blue-700',
      },
      uploaded: {
        icon: <Upload className="h-3 w-3" />,
        label: 'Uploaded',
        tooltip: 'Created by uploading a data file (CSV, JSON, QuakeML, etc.)',
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-300 dark:border-gray-600',
      },
    };

    const config = badgeConfig[sourceType];

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={`gap-1 cursor-help ${config.className}`}>
              {config.icon}
              {config.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{config.tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  function formatDate(dateString: string): string {
    try {
      return new Date(dateString).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return dateString;
    }
  }

  const handleViewMap = (catalogue: Catalogue) => {
    router.push(`/catalogues/${catalogue.id}/map`);
  };

  const handleExport = async (catalogue: Catalogue, format: 'csv' | 'json' | 'geojson' | 'kml' | 'quakeml') => {
    try {
      if (!canExportCatalogues) {
        toast({
          title: user ? 'Insufficient permissions' : 'Login required',
          description: exportBlockedMessage,
          variant: 'destructive',
          action: (
            <ToastAction
              altText={user ? 'View role' : 'Log in'}
              onClick={() => router.push(user ? '/profile' : '/login')}
            >
              {user ? 'View role' : 'Log in'}
            </ToastAction>
          ),
        });
        return;
      }

      const formatLabels = {
        csv: 'CSV',
        json: 'JSON',
        geojson: 'GeoJSON',
        kml: 'KML (Google Earth)',
        quakeml: 'QuakeML'
      };

      // Show loading toast
      toast({
        title: `Exporting ${formatLabels[format]}`,
        description: "Preparing catalogue data...",
      });

      // Fetch the file using unified export endpoint
      const response = await fetch(`/api/catalogues/${catalogue.id}/export?format=${format}`);
      if (!response.ok) {
        const errorInfo = await getApiError(response, 'Export failed');
        throw new Error(errorInfo.message);
      }

      // Get filename from Content-Disposition header or generate one
      const contentDisposition = response.headers.get('Content-Disposition');
      const extension = format === 'quakeml' ? 'xml' : format;
      let filename = `${catalogue.name}.${extension}`;

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }

      // Get the content
      const blob = await response.blob();

      // Create and trigger download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Export successful",
        description: `${catalogue.name} exported as ${formatLabels[format]}`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "There was an error exporting the catalogue",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (catalogue: Catalogue) => {
    if (!canManageCatalogues) {
      toast({
        title: user ? 'Insufficient permissions' : 'Login required',
        description: user
          ? 'You need Editor or Admin access to edit catalogues.'
          : 'Log in to edit catalogues.',
        variant: 'destructive',
        action: (
          <ToastAction
            altText={user ? 'View role' : 'Log in'}
            onClick={() => router.push(user ? '/profile' : '/login')}
          >
            {user ? 'View role' : 'Log in'}
          </ToastAction>
        ),
      });
      return;
    }
    router.push(`/catalogues/${catalogue.id}/edit`);
  };

  const handleShare = async (catalogue: Catalogue) => {
    try {
      const shareUrl = `${window.location.origin}/catalogues/${catalogue.id}`;
      await navigator.clipboard.writeText(shareUrl);
      
      toast({
        title: "Link copied",
        description: "Catalogue link copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Could not copy the link to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (catalogue: Catalogue) => {
    if (!canManageCatalogues) {
      toast({
        title: user ? 'Insufficient permissions' : 'Login required',
        description: user
          ? 'You need Editor or Admin access to delete catalogues.'
          : 'Log in to delete catalogues.',
        variant: 'destructive',
        action: (
          <ToastAction
            altText={user ? 'View role' : 'Log in'}
            onClick={() => router.push(user ? '/profile' : '/login')}
          >
            {user ? 'View role' : 'Log in'}
          </ToastAction>
        ),
      });
      return;
    }
    setSelectedCatalogue(catalogue);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!canManageCatalogues) {
      toast({
        title: user ? 'Insufficient permissions' : 'Login required',
        description: user
          ? 'You need Editor or Admin access to delete catalogues.'
          : 'Log in to delete catalogues.',
        variant: 'destructive',
        action: (
          <ToastAction
            altText={user ? 'View role' : 'Log in'}
            onClick={() => router.push(user ? '/profile' : '/login')}
          >
            {user ? 'View role' : 'Log in'}
          </ToastAction>
        ),
      });
      setDeleteDialogOpen(false);
      setSelectedCatalogue(null);
      return;
    }
    if (!selectedCatalogue) return;

    try {
      const response = await fetch(`/api/catalogues/${selectedCatalogue.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          toast({
            title: response.status === 401 ? 'Login required' : 'Insufficient permissions',
            description:
              response.status === 401
                ? 'Log in to delete catalogues.'
                : 'You need Editor or Admin access to delete catalogues.',
            variant: 'destructive',
            action: (
              <ToastAction
                altText={response.status === 401 ? 'Log in' : 'View role'}
                onClick={() => router.push(response.status === 401 ? '/login' : '/profile')}
              >
                {response.status === 401 ? 'Log in' : 'View role'}
              </ToastAction>
            ),
          });
          setDeleteDialogOpen(false);
          setSelectedCatalogue(null);
          return;
        }
        const errorInfo = await getApiError(response, 'Delete failed');
        throw new Error(errorInfo.message);
      }

      toast({
        title: "Catalogue deleted",
        description: `${selectedCatalogue.name} has been deleted`,
      });

      setDeleteDialogOpen(false);
      setSelectedCatalogue(null);

      // Refresh the catalogue list
      fetchCatalogues();
    } catch (error) {
      toast({
        title: "Delete failed",
        description: "Failed to delete the catalogue",
        variant: "destructive",
      });
    }
  };

  const renderCatalogueTable = (catalogues: CatalogueMeta[]) => (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" onClick={() => handleSort('name')} className="p-0 h-auto font-medium">
                  Name{renderSortIndicator('name')}
                </Button>
                <InfoTooltip content="The catalogue name as defined during upload, import, or merge." />
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" onClick={() => handleSort('date')} className="p-0 h-auto font-medium">
                  Date{renderSortIndicator('date')}
                </Button>
                <InfoTooltip content="The creation date of the catalogue record." />
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" onClick={() => handleSort('sourceType')} className="p-0 h-auto font-medium">
                  Source Type{renderSortIndicator('sourceType')}
                </Button>
                <InfoTooltip content="How the catalogue was created: imported, uploaded, or merged." />
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" onClick={() => handleSort('events')} className="p-0 h-auto font-medium">
                  Events{renderSortIndicator('events')}
                </Button>
                <InfoTooltip content="Total number of events in the catalogue." />
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" onClick={() => handleSort('source')} className="p-0 h-auto font-medium">
                  Source{renderSortIndicator('source')}
                </Button>
                <InfoTooltip content="Original data sources used to build this catalogue." />
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center gap-1.5">
                <span>Status</span>
                <InfoTooltip content="Current processing state: complete, processing, or error." />
              </div>
            </TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <CatalogueTableSkeleton rows={5} />
          ) : catalogues.length === 0 ? (
            <TableEmptyState
              colSpan={8}
              icon={Database}
              title="No catalogues found"
              description={
                searchQuery || geoSearchActive
                  ? "Try adjusting your search or filters to find catalogues."
                  : "Get started by uploading a QuakeML file or importing from GeoNet."
              }
              action={
                !searchQuery && !geoSearchActive
                  ? {
                      label: "Import from GeoNet",
                      onClick: () => router.push('/import')
                    }
                  : undefined
              }
            />
          ) : (
            catalogues.map((catalogueMeta) => {
              const { catalogue, sourceType, sourceNamesDisplay, eventCount, formattedDate } = catalogueMeta;
              return (
                <TableRow key={catalogue.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>{catalogue.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{formattedDate}</span>
                  </div>
                </TableCell>
                <TableCell>{getSourceTypeBadge(sourceType)}</TableCell>
                <TableCell>{eventCount.toLocaleString()}</TableCell>
                <TableCell>{sourceNamesDisplay}</TableCell>
                <TableCell>{getStatusBadge(catalogue.status)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <CatalogueStatsPopover
                      catalogueId={catalogue.id}
                      catalogueName={catalogue.name}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleViewMap(catalogue)}
                    >
                      <Map className="h-4 w-4" />
                    </Button>
                    {canExportCatalogues ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Download className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem onClick={() => handleExport(catalogue, 'csv')}>
                            <FileText className="h-4 w-4 mr-2" />
                            CSV (Spreadsheet)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleExport(catalogue, 'json')}>
                            <FileText className="h-4 w-4 mr-2" />
                            JSON (Structured)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleExport(catalogue, 'geojson')}>
                            <FileText className="h-4 w-4 mr-2" />
                            GeoJSON (Geographic)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleExport(catalogue, 'kml')}>
                            <FileText className="h-4 w-4 mr-2" />
                            KML (Google Earth)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleExport(catalogue, 'quakeml')}>
                            <FileText className="h-4 w-4 mr-2" />
                            QuakeML (Seismology)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                              <Download className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{exportBlockedMessage}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canManageCatalogues ? (
                          <DropdownMenuItem onClick={() => handleEdit(catalogue)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Metadata
                          </DropdownMenuItem>
                        ) : (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex w-full cursor-not-allowed">
                                  <DropdownMenuItem disabled className="pointer-events-none text-muted-foreground">
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit Metadata
                                  </DropdownMenuItem>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {user ? 'Editor or Admin access required.' : 'Log in to edit catalogues.'}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <DropdownMenuItem onClick={() => handleShare(catalogue)}>
                          <Share2 className="h-4 w-4 mr-2" />
                          Share
                        </DropdownMenuItem>
                        {canManageCatalogues ? (
                          <DropdownMenuItem
                            onClick={() => handleDelete(catalogue)}
                            className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        ) : (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex w-full cursor-not-allowed">
                                  <DropdownMenuItem
                                    disabled
                                    className="pointer-events-none text-red-400/70 dark:text-red-400/60"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {user ? 'Editor or Admin access required.' : 'Log in to delete catalogues.'}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <>
      <div className="container py-6 max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">Catalogues</h1>
              <p className="text-sm text-muted-foreground">
                Manage your earthquake catalogues and datasets
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshCatalogues}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Geographic Search Panel */}
          <GeographicSearchPanel
            onSearch={handleGeoSearch}
            onClear={handleClearGeoSearch}
            isSearching={geoSearching}
          />

          {geoSearchActive && geoSearchBounds && (
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Map className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Showing catalogues in region: Lat {geoSearchBounds.minLatitude.toFixed(2)}° to {geoSearchBounds.maxLatitude.toFixed(2)}°,
                    Lon {geoSearchBounds.minLongitude.toFixed(2)}° to {geoSearchBounds.maxLongitude.toFixed(2)}°
                    {geoSearchBounds.minLongitude > geoSearchBounds.maxLongitude ? ' (crosses date line)' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowGeoDebug((prev) => !prev)}
                    className="gap-1"
                  >
                    <Bug className="h-3.5 w-3.5" />
                    {showGeoDebug ? 'Hide Debug' : 'Show Debug'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleClearGeoSearch}>
                    Clear Filter
                  </Button>
                </div>
              </div>
              {showGeoDebug && (
                <div className="mt-2 text-xs text-blue-700 dark:text-blue-300 space-y-1">
                  <div>
                    Debug bounds: minLat={geoSearchBounds.minLatitude}, maxLat={geoSearchBounds.maxLatitude}, minLon={geoSearchBounds.minLongitude}, maxLon={geoSearchBounds.maxLongitude}
                  </div>
                  {geoSearchRequestId && (
                    <div>Request ID: {geoSearchRequestId}</div>
                  )}
                </div>
              )}
            </div>
          )}

          <Tabs defaultValue="all" value={statusFilter} onValueChange={(value) => setStatusFilter(value as CatalogueStatus)}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <TabsList>
                <TabsTrigger value="all">All Catalogues</TabsTrigger>
                <TabsTrigger value="complete">Complete</TabsTrigger>
                <TabsTrigger value="processing">Processing</TabsTrigger>
                <TabsTrigger value="error">Error</TabsTrigger>
              </TabsList>

              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      ref={searchInputRef}
                      type="search"
                      placeholder="Search catalogues... (Ctrl+F)"
                      className="pl-8 w-full sm:w-[250px]"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Info className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">
                          Field tokens: name:, id:, status:, source:, type:, events:, date:. You can also type a date alone.
                          <span className="font-medium"> status:complete date:2023-01-01..2023-12-31</span>
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </div>

            <TabsContent value="all" className="m-0">
              <Card>
                <CardContent className="p-0">
                  {renderCatalogueTable(paginatedCatalogues)}
                  {totalItems > 0 && (
                    <DataPagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      totalItems={totalItems}
                      pageSize={pageSize}
                      onPageChange={goToPage}
                      onPageSizeChange={handlePageSizeChange}
                      pageSizeOptions={pageSizeOptions}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="complete" className="m-0">
              <Card>
                <CardContent className="p-0">
                  {renderCatalogueTable(paginatedCatalogues)}
                  {totalItems > 0 && (
                    <DataPagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      totalItems={totalItems}
                      pageSize={pageSize}
                      onPageChange={goToPage}
                      onPageSizeChange={handlePageSizeChange}
                      pageSizeOptions={pageSizeOptions}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="processing" className="m-0">
              <Card>
                <CardContent className="p-0">
                  {renderCatalogueTable(paginatedCatalogues)}
                  {totalItems > 0 && (
                    <DataPagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      totalItems={totalItems}
                      pageSize={pageSize}
                      onPageChange={goToPage}
                      onPageSizeChange={handlePageSizeChange}
                      pageSizeOptions={pageSizeOptions}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="error" className="m-0">
              <Card>
                <CardContent className="p-0">
                  {renderCatalogueTable(paginatedCatalogues)}
                  {totalItems > 0 && (
                    <DataPagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      totalItems={totalItems}
                      pageSize={pageSize}
                      onPageChange={goToPage}
                      onPageSizeChange={handlePageSizeChange}
                      pageSizeOptions={pageSizeOptions}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the catalogue &quot;{selectedCatalogue?.name}&quot; and all its associated data.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 dark:bg-red-900 dark:hover:bg-red-800"
              disabled={!canManageCatalogues}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
