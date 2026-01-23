'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, MapPin, Calendar, Activity } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';

interface SearchResult {
  id: string;
  catalogueId: string;
  catalogueName: string;
  publicId: string;
  time: string;
  latitude: number;
  longitude: number;
  depth: number | null;
  magnitude: number | null;
  magnitudeType?: string | null;
  locationName?: string | null;
  region?: string | null;
  eventType?: string | null;
  label: string;
  description: string;
}

interface GlobalSearchProps {
  placeholder?: string;
  catalogueId?: string;
  onResultSelect?: (result: SearchResult) => void;
  className?: string;
}

export function GlobalSearch({ 
  placeholder = 'Search events (e.g., id:us1234 mag:>=4 region:wellington)', 
  catalogueId,
  onResultSelect,
  className 
}: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const debouncedQuery = useDebounce(query, 300);

  // Search for events
  useEffect(() => {
    const searchEvents = async () => {
      if (debouncedQuery.trim().length < 2) {
        setResults([]);
        setShowResults(false);
        return;
      }

      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: debouncedQuery,
          limit: '10',
        });

        if (catalogueId) {
          params.append('catalogueId', catalogueId);
        }

        const response = await fetch(`/api/events/search?${params}`);
        if (!response.ok) throw new Error('Search failed');

        const data = await response.json();
        setResults(data.results || []);
        setShowResults(true);
        setSelectedIndex(0);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    searchEvents();
  }, [debouncedQuery, catalogueId]);

  // Handle click outside to close results
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showResults || results.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < results.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results[selectedIndex]) {
          handleResultClick(results[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        setShowResults(false);
      }
    };

    if (showResults) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [showResults, results, selectedIndex]);

  const handleResultClick = (result: SearchResult) => {
    if (onResultSelect) {
      onResultSelect(result);
    } else {
      // Default behavior: navigate to catalogue with event highlighted
      router.push(`/catalogues/${result.catalogueId}?eventId=${result.id}`);
    }
    setShowResults(false);
    setQuery('');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  return (
    <div ref={searchRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="search"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0) {
              setShowResults(true);
            }
          }}
          className="pl-9 pr-9"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {/* Search Results Dropdown */}
      {showResults && results.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-popover border rounded-md shadow-lg max-h-[400px] overflow-y-auto">
          <div className="p-2">
            <div className="text-xs text-muted-foreground px-2 py-1 mb-1">
              {results.length} {results.length === 1 ? 'result' : 'results'} found
            </div>
            {results.map((result, index) => (
              <button
                key={result.id}
                onClick={() => handleResultClick(result)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={cn(
                  'w-full text-left px-3 py-2.5 rounded-md transition-colors',
                  index === selectedIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50'
                )}
              >
                <div className="flex items-start gap-3">
                  <Activity className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {result.label}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {result.description}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {result.latitude.toFixed(3)}, {result.longitude.toFixed(3)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(result.time)}
                      </span>
                      {result.depth !== null && result.depth !== undefined && (
                        <span>
                          Depth: {result.depth.toFixed(1)} km
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No Results Message */}
      {showResults && !loading && query.trim().length >= 2 && results.length === 0 && (
        <div className="absolute z-50 w-full mt-2 bg-popover border rounded-md shadow-lg p-4">
          <div className="text-center text-sm text-muted-foreground">
            No events found for "{query}"
          </div>
        </div>
      )}
    </div>
  );
}
