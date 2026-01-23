'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Save, Trash2, Download, Plus, Filter } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SavedFilter {
  id: string;
  name: string;
  description: string | null;
  filter_config: string;
  filterConfig?: any;
  created_at: string;
  updated_at: string;
}

interface SavedFiltersDialogProps {
  currentFilters: any;
  onLoadFilter: (filterConfig: any) => void;
}

export function SavedFiltersDialog({ currentFilters, onLoadFilter }: SavedFiltersDialogProps) {
  const [open, setOpen] = useState(false);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [filterToDelete, setFilterToDelete] = useState<string | null>(null);
  const [newFilterName, setNewFilterName] = useState('');
  const [newFilterDescription, setNewFilterDescription] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchSavedFilters();
    }
  }, [open]);

  const fetchSavedFilters = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/saved-filters');
      if (!response.ok) throw new Error('Failed to fetch saved filters');
      
      const data = await response.json();
      // Parse filter_config for each filter
      const parsedData = data.map((filter: SavedFilter) => ({
        ...filter,
        filterConfig: JSON.parse(filter.filter_config),
      }));
      setSavedFilters(parsedData);
    } catch (error) {
      console.error('Error fetching saved filters:', error);
      toast({
        title: 'Error',
        description: 'Failed to load saved filters',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFilter = async () => {
    if (!newFilterName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a filter name',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch('/api/saved-filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFilterName,
          description: newFilterDescription || null,
          filterConfig: currentFilters,
        }),
      });

      if (!response.ok) throw new Error('Failed to save filter');

      toast({
        title: 'Success',
        description: 'Filter saved successfully',
      });

      setNewFilterName('');
      setNewFilterDescription('');
      setShowSaveDialog(false);
      fetchSavedFilters();
    } catch (error) {
      console.error('Error saving filter:', error);
      toast({
        title: 'Error',
        description: 'Failed to save filter',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteFilter = async () => {
    if (!filterToDelete) return;

    try {
      const response = await fetch(`/api/saved-filters/${filterToDelete}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete filter');

      toast({
        title: 'Success',
        description: 'Filter deleted successfully',
      });

      setFilterToDelete(null);
      setShowDeleteDialog(false);
      fetchSavedFilters();
    } catch (error) {
      console.error('Error deleting filter:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete filter',
        variant: 'destructive',
      });
    }
  };

  const handleLoadFilter = (filter: SavedFilter) => {
    onLoadFilter(filter.filterConfig);
    setOpen(false);
    toast({
      title: 'Success',
      description: `Loaded filter: ${filter.name}`,
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const getFilterSummary = (filterConfig: any) => {
    const parts: string[] = [];
    
    if (filterConfig.magnitude) {
      parts.push(`Mag: ${filterConfig.magnitude[0]}-${filterConfig.magnitude[1]}`);
    }
    if (filterConfig.depth) {
      parts.push(`Depth: ${filterConfig.depth[0]}-${filterConfig.depth[1]}km`);
    }
    if (filterConfig.dateRange && (filterConfig.dateRange[0] || filterConfig.dateRange[1])) {
      parts.push('Date range');
    }
    if (filterConfig.eventType && filterConfig.eventType !== 'all') {
      parts.push(`Type: ${filterConfig.eventType}`);
    }

    return parts.length > 0 ? parts.join(' • ') : 'No filters';
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Filter className="mr-2 h-4 w-4" />
            Saved Filters
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Saved Filters</DialogTitle>
            <DialogDescription>
              Save and load filter configurations for quick access
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Button
              onClick={() => setShowSaveDialog(true)}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              Save Current Filters
            </Button>

            <ScrollArea className="h-[400px] pr-4">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading saved filters...
                </div>
              ) : savedFilters.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Filter className="mx-auto h-12 w-12 mb-2 opacity-50" />
                  <p>No saved filters yet</p>
                  <p className="text-sm">Save your current filters to reuse them later</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedFilters.map((filter) => (
                    <div
                      key={filter.id}
                      className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h4 className="font-medium">{filter.name}</h4>
                          {filter.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {filter.description}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleLoadFilter(filter)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setFilterToDelete(filter.id);
                              setShowDeleteDialog(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="text-xs">
                          {getFilterSummary(filter.filterConfig)}
                        </Badge>
                        <span>•</span>
                        <span>Saved {formatDate(filter.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save Filter Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Filter Configuration</DialogTitle>
            <DialogDescription>
              Give your filter configuration a name and description
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="filter-name">Filter Name *</Label>
              <Input
                id="filter-name"
                placeholder="e.g., Large earthquakes in NZ"
                value={newFilterName}
                onChange={(e) => setNewFilterName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-description">Description (optional)</Label>
              <Textarea
                id="filter-description"
                placeholder="Describe what this filter is for..."
                value={newFilterDescription}
                onChange={(e) => setNewFilterDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveFilter}>
                <Save className="mr-2 h-4 w-4" />
                Save Filter
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved filter?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this saved filter. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setFilterToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFilter}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
