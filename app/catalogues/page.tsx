'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCatalogues } from '@/contexts/CatalogueContext';
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
  RefreshCw
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
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { GeographicSearchPanel, GeographicBounds } from '@/components/catalogues/GeographicSearchPanel';
import { useDebounce } from '@/hooks/use-debounce';
import { CatalogueTableSkeleton } from '@/components/ui/skeleton-loaders';
import { TableEmptyState } from '@/components/ui/empty-state';
import { Database } from 'lucide-react';
import { CatalogueStatsPopover } from '@/components/catalogues/CatalogueStatsPopover';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useRef } from 'react';

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
type SortField = 'name' | 'date' | 'events';
type SortDirection = 'asc' | 'desc';

export default function CataloguesPage() {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Use global catalogue context
  const { catalogues: contextCatalogues, loading: contextLoading, refreshCatalogues } = useCatalogues();

  const [catalogues, setCatalogues] = useState<Catalogue[]>(contextCatalogues);
  const [loading, setLoading] = useState(contextLoading);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CatalogueStatus>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCatalogue, setSelectedCatalogue] = useState<Catalogue | null>(null);
  const [geoSearchActive, setGeoSearchActive] = useState(false);
  const [geoSearching, setGeoSearching] = useState(false);
  const [geoSearchBounds, setGeoSearchBounds] = useState<GeographicBounds | null>(null);

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
      const params = new URLSearchParams({
        minLat: bounds.minLatitude.toString(),
        maxLat: bounds.maxLatitude.toString(),
        minLon: bounds.minLongitude.toString(),
        maxLon: bounds.maxLongitude.toString(),
      });

      const response = await fetch(`/api/catalogues/search/region?${params}`);
      if (!response.ok) throw new Error('Failed to search catalogues');

      const data = await response.json();
      setCatalogues(data.catalogues);
      setGeoSearchActive(true);
      setGeoSearchBounds(bounds);

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
    fetchCatalogues();
  }, []);

  // Memoized filtered catalogues (using debounced search query)
  const filteredCatalogues = useMemo(() => {
    return catalogues.filter(catalogue => {
      const matchesSearch = catalogue.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || catalogue.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [catalogues, debouncedSearchQuery, statusFilter]);

  // Memoized sorted catalogues
  const sortedCatalogues = useMemo(() => {
    return [...filteredCatalogues].sort((a, b) => {
      let comparison = 0;

      if (sortField === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortField === 'date') {
        comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortField === 'events') {
        comparison = a.event_count - b.event_count;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredCatalogues, sortField, sortDirection]);

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

  const getSourceNames = (catalogue: Catalogue): string => {
    try {
      const sources = JSON.parse(catalogue.source_catalogues);
      if (Array.isArray(sources) && sources.length > 0) {
        return sources.map((s: any) => s.source || s.name || 'Unknown').join(', ');
      }
      return 'Unknown';
    } catch {
      return 'Unknown';
    }
  };

  const formatDate = (dateString: string): string => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const handleViewMap = (catalogue: Catalogue) => {
    router.push(`/catalogues/${catalogue.id}/map`);
  };

  const handleExportQuakeML = async (catalogue: Catalogue) => {
    try {
      // Show loading toast
      toast({
        title: "Exporting QuakeML",
        description: "Generating QuakeML 1.2 document...",
      });

      // Fetch the QuakeML file
      const response = await fetch(`/api/catalogues/${catalogue.id}/export-quakeml`);
      if (!response.ok) throw new Error('Export failed');

      // Get the QuakeML content
      const quakemlContent = await response.text();

      // Get filename from Content-Disposition header or generate one
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `quakeml_${catalogue.name.replace(/[^a-z0-9]/gi, '_')}.xml`;

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }

      // Create and trigger download
      const blob = new Blob([quakemlContent], { type: 'application/xml' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export successful",
        description: "QuakeML file has been downloaded",
      });
    } catch (error) {
      console.error('Error exporting QuakeML:', error);
      toast({
        title: "Export failed",
        description: "Failed to export catalogue as QuakeML",
        variant: "destructive",
      });
    }
  };

  const handleDownload = async (catalogue: Catalogue) => {
    try {
      // Show loading toast
      toast({
        title: "Starting download",
        description: "Preparing catalogue data...",
      });

      // Fetch the CSV file
      const response = await fetch(`/api/catalogues/${catalogue.id}/download`);
      if (!response.ok) throw new Error('Download failed');

      // Get filename from Content-Disposition header or generate one
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `${catalogue.name}.csv`;

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }

      // Get the CSV content
      const csvContent = await response.text();

      // Create and trigger download
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Download complete",
        description: `${catalogue.name} has been downloaded`,
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "There was an error downloading the catalogue",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (catalogue: Catalogue) => {
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
    setSelectedCatalogue(catalogue);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedCatalogue) return;

    try {
      const response = await fetch(`/api/catalogues/${selectedCatalogue.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Delete failed');

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

  const renderCatalogueTable = (catalogues: Catalogue[]) => (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">
              <Button variant="ghost" onClick={() => handleSort('name')} className="p-0 h-auto font-medium">
                Name{renderSortIndicator('name')}
              </Button>
            </TableHead>
            <TableHead>
              <Button variant="ghost" onClick={() => handleSort('date')} className="p-0 h-auto font-medium">
                Date{renderSortIndicator('date')}
              </Button>
            </TableHead>
            <TableHead>Format</TableHead>
            <TableHead>
              <Button variant="ghost" onClick={() => handleSort('events')} className="p-0 h-auto font-medium">
                Events{renderSortIndicator('events')}
              </Button>
            </TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Status</TableHead>
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
            catalogues.map((catalogue) => (
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
                    <span>{formatDate(catalogue.created_at)}</span>
                  </div>
                </TableCell>
                <TableCell>CSV</TableCell>
                <TableCell>{catalogue.event_count.toLocaleString()}</TableCell>
                <TableCell>{getSourceNames(catalogue)}</TableCell>
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Download className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleDownload(catalogue)}>
                          <FileText className="h-4 w-4 mr-2" />
                          Download as CSV
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExportQuakeML(catalogue)}>
                          <FileText className="h-4 w-4 mr-2" />
                          Download as QuakeML
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(catalogue)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Metadata
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleShare(catalogue)}>
                          <Share2 className="h-4 w-4 mr-2" />
                          Share
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(catalogue)}
                          className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <>
      <div className="container py-8">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Catalogues</h1>
              <p className="text-muted-foreground">
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
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={handleClearGeoSearch}>
                  Clear Filter
                </Button>
              </div>
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
              </div>
            </div>

            <TabsContent value="all" className="m-0">
              <Card>
                <CardContent className="p-0">
                  {renderCatalogueTable(sortedCatalogues)}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="complete" className="m-0">
              <Card>
                <CardContent className="p-0">
                  {renderCatalogueTable(sortedCatalogues.filter(cat => cat.status === 'complete'))}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="processing" className="m-0">
              <Card>
                <CardContent className="p-0">
                  {renderCatalogueTable(sortedCatalogues.filter(cat => cat.status === 'processing'))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="error" className="m-0">
              <Card>
                <CardContent className="p-0">
                  {renderCatalogueTable(sortedCatalogues.filter(cat => cat.status === 'error'))}
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
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}