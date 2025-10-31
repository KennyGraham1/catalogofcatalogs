'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Search,
  FileText,
  Upload,
  Download,
  Map,
  BarChart3,
  Settings,
  Home,
  Database,
  Layers,
  Activity,
  SearchCode
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCatalogues } from '@/contexts/CatalogueContext';

interface Command {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const { catalogues } = useCatalogues();

  // Define available commands
  const commands = useMemo<Command[]>(() => {
    const baseCommands: Command[] = [
      {
        id: 'home',
        label: 'Go to Dashboard',
        description: 'View dashboard overview',
        icon: Home,
        action: () => {
          router.push('/dashboard');
          onOpenChange(false);
        },
        keywords: ['dashboard', 'home', 'overview']
      },
      {
        id: 'catalogues',
        label: 'View All Catalogues',
        description: 'Browse all earthquake catalogues',
        icon: Database,
        action: () => {
          router.push('/catalogues');
          onOpenChange(false);
        },
        keywords: ['catalogues', 'list', 'browse']
      },
      {
        id: 'import',
        label: 'Import from GeoNet',
        description: 'Import earthquake data from GeoNet',
        icon: Download,
        action: () => {
          router.push('/import');
          onOpenChange(false);
        },
        keywords: ['import', 'geonet', 'download', 'fetch']
      },
      {
        id: 'upload',
        label: 'Upload QuakeML File',
        description: 'Upload a QuakeML file',
        icon: Upload,
        action: () => {
          router.push('/upload');
          onOpenChange(false);
        },
        keywords: ['upload', 'quakeml', 'file', 'xml']
      },
      {
        id: 'merge',
        label: 'Merge Catalogues',
        description: 'Merge multiple catalogues',
        icon: Layers,
        action: () => {
          router.push('/merge');
          onOpenChange(false);
        },
        keywords: ['merge', 'combine', 'join']
      },
      {
        id: 'analytics',
        label: 'View Analytics',
        description: 'Explore earthquake analytics',
        icon: BarChart3,
        action: () => {
          router.push('/analytics');
          onOpenChange(false);
        },
        keywords: ['analytics', 'charts', 'statistics', 'analysis']
      },
    ];

    // Add commands for each catalogue
    const catalogueCommands: Command[] = catalogues.slice(0, 10).map(cat => ({
      id: `catalogue-${cat.id}`,
      label: `Open: ${cat.name}`,
      description: `${cat.event_count.toLocaleString()} events`,
      icon: FileText,
      action: () => {
        router.push(`/catalogues/${cat.id}`);
        onOpenChange(false);
      },
      keywords: ['catalogue', 'open', cat.name.toLowerCase()]
    }));

    // Add map view commands for catalogues
    const mapCommands: Command[] = catalogues.slice(0, 5).map(cat => ({
      id: `map-${cat.id}`,
      label: `Map: ${cat.name}`,
      description: 'View on interactive map',
      icon: Map,
      action: () => {
        router.push(`/catalogues/${cat.id}/map`);
        onOpenChange(false);
      },
      keywords: ['map', 'view', 'visualize', cat.name.toLowerCase()]
    }));

    return [...baseCommands, ...catalogueCommands, ...mapCommands];
  }, [catalogues, router, onOpenChange]);

  // Filter commands based on search
  const filteredCommands = useMemo(() => {
    if (!search) return commands;

    const searchLower = search.toLowerCase();
    return commands.filter(cmd => {
      const labelMatch = cmd.label.toLowerCase().includes(searchLower);
      const descMatch = cmd.description?.toLowerCase().includes(searchLower);
      const keywordMatch = cmd.keywords?.some(kw => kw.includes(searchLower));
      return labelMatch || descMatch || keywordMatch;
    });
  }, [commands, search]);

  // Reset selected index when filtered commands change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands]);

  // Reset search when dialog closes
  useEffect(() => {
    if (!open) {
      setSearch('');
      setSelectedIndex(0);
    }
  }, [open]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < filteredCommands.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, filteredCommands, selectedIndex]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-2xl">
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground mr-2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type a command or search..."
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-12"
            autoFocus
          />
          <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
            <span className="text-xs">ESC</span>
          </kbd>
        </div>

        <div className="max-h-[400px] overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No commands found
            </div>
          ) : (
            <div className="space-y-1">
              {filteredCommands.map((command, index) => {
                const Icon = command.icon;
                return (
                  <button
                    key={command.id}
                    onClick={command.action}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors',
                      index === selectedIndex
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-accent/50'
                    )}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {command.label}
                      </div>
                      {command.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {command.description}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="pointer-events-none h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium inline-flex">
                ↑↓
              </kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="pointer-events-none h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium inline-flex">
                ↵
              </kbd>
              Select
            </span>
          </div>
          <span className="text-muted-foreground/60">
            {filteredCommands.length} {filteredCommands.length === 1 ? 'command' : 'commands'}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

