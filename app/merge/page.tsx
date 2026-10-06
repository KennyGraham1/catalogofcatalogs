'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { MergeActions } from '@/components/merge/MergeActions';
import { MergeMetadataForm, MergeMetadata } from '@/components/merge/MergeMetadataForm';
import { MergeProgressIndicator, MergeStep } from '@/components/merge/MergeProgressIndicator';
import { MergeQcSummaryView } from '@/components/merge/MergeQcSummaryView';
import { isMergeQcSummary } from '@/components/merge/qc-format';
import type { MergeQcSummary } from '@/lib/merge-qc';
import { formatCount } from '@/lib/map-format';
import { useCatalogues } from '@/contexts/CatalogueContext';
import { invalidateCatalogueData } from '@/lib/client-cache';
import { InfoTooltip, LabelWithTooltip } from '@/components/ui/info-tooltip';
import { useDebounce } from '@/hooks/use-debounce';
import { usePagination } from '@/hooks/use-pagination';
import { useAuth } from '@/lib/auth/hooks';
import { AuthGateCard } from '@/components/auth/AuthGateCard';
import { UserRole } from '@/lib/auth/types';
import { loginHref } from '@/lib/auth/login-href';
import { requestAccessHref } from '@/lib/auth/access-request';

// Dynamically import MergePreviewQC to avoid SSR issues with Leaflet
const MergePreviewQC = dynamic(
  () => import('@/components/merge/MergePreviewQC').then(mod => mod.MergePreviewQC),
  { ssr: false }
);
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Layers,
  Settings,
  Tag,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  ArrowRightLeft,
  Save,
  Clock,
  MapPin,
  Loader2,
  FileDown,
  Search,
  Info,
  Calendar,
  Activity,
  Database,
  GitMerge,
  Globe,
  Upload
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
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
import { GeographicSearchPanel, GeographicBounds } from '@/components/catalogues/GeographicSearchPanel';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataPagination } from '@/components/ui/data-pagination';
import { getApiError } from '@/lib/api';
import { loadCatalogueEvents } from '@/lib/catalogue-event-loader';
import { formatLocalDate } from '@/lib/date-format';

type CatalogueStatus = 'all' | 'complete' | 'processing' | 'incomplete';
type SortField = 'name' | 'date' | 'events' | 'sourceType' | 'source';
type SortDirection = 'asc' | 'desc';
type MergeStatus = 'idle' | 'merging' | 'complete' | 'error';
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

// Type that supports API data with optional legacy field names
type CatalogueItem = {
  id: number | string;
  name: string;
  events?: number;      // Legacy field name
  event_count?: number; // API field name
  source?: string;
  created_at?: string;
  status?: string;
  source_catalogues?: string;
  merge_config?: string;
};

// Display names of the merge strategies, as the strategy select labels them.
const MERGE_STRATEGY_LABELS: Record<string, string> = {
  quality: 'Quality-Based',
  priority: 'Source Priority',
  average: 'Average Values',
  newest: 'Most Recent Solution',
  complete: 'Most Complete Record',
  median: 'Median Values',
};

// Per-field resolution rules (lib/validation.ts fieldRules). The defaults reproduce the
// strategy's own behaviour, so a request that only uses defaults omits fieldRules entirely
// and keeps the shape older merges recorded in merge_parameters.
type FieldRuleName = 'depth' | 'magnitude' | 'mechanism';
type FieldRuleChoice = { rule: string; catalogueId: string };
type FieldRuleChoices = Record<FieldRuleName, FieldRuleChoice>;
type ConflictHandling = 'resolve' | 'hold';

const DEFAULT_FIELD_RULE: Record<FieldRuleName, string> = {
  depth: 'strategy',
  magnitude: 'strategy',
  mechanism: 'hierarchy',
};

const DEFAULT_FIELD_RULE_CHOICES: FieldRuleChoices = {
  depth: { rule: 'strategy', catalogueId: '' },
  magnitude: { rule: 'strategy', catalogueId: '' },
  mechanism: { rule: 'hierarchy', catalogueId: '' },
};

// Option labels, as the field-rule selects and the merge summary show them.
const FIELD_RULE_LABELS: Record<FieldRuleName, Record<string, string>> = {
  depth: {
    strategy: 'Follow the strategy',
    'best-constrained': 'Best constrained',
    quality: 'Quality-based',
    authority: 'Network authority',
    newest: 'Most recent solution',
    catalogue: 'A chosen catalogue',
  },
  magnitude: {
    strategy: 'Follow the strategy',
    'type-preference': 'Magnitude type preference',
    quality: 'Quality-based',
    authority: 'Network authority',
    newest: 'Most recent solution',
    catalogue: 'A chosen catalogue',
  },
  mechanism: {
    hierarchy: 'Combine by network authority',
    strategy: 'Follow the strategy',
    catalogue: 'A chosen catalogue',
  },
};

const FIELD_RULE_TITLES: Record<FieldRuleName, string> = {
  depth: 'Depth',
  magnitude: 'Magnitude',
  mechanism: 'Focal mechanism',
};

// The options of each field-rule select with what lib/merge.ts does for each (contract M1),
// and a note that holds for every option of that field.
const FIELD_RULE_OPTIONS: Array<{
  field: FieldRuleName;
  options: Array<{ value: string; help: string }>;
  note: string;
}> = [
  {
    field: 'depth',
    options: [
      { value: 'strategy', help: 'Average and Median Values take the best-constrained depth; every other strategy keeps the depth of the entry it selected.' },
      { value: 'best-constrained', help: 'The depth of the solution with a free (not fixed) depth, the smallest depth uncertainty and the best station coverage; a fixed depth only when no solution has a free depth.' },
      { value: 'quality', help: 'The depth of the entry ranked first by quality score.' },
      { value: 'authority', help: 'The depth of the entry from the highest-ranked network (Settings › Merge authority).' },
      { value: 'newest', help: 'The depth of the most recently determined solution.' },
      { value: 'catalogue', help: 'The depth of the chosen catalogue\'s entry; a group without an entry from it follows the strategy.' },
    ],
    note: 'The published depth always carries that entry\'s own depth uncertainty and depth type. An entry without a depth cannot supply it, and the strategy decides instead.',
  },
  {
    field: 'magnitude',
    options: [
      { value: 'strategy', help: 'Average and Median Values choose by magnitude type; every other strategy keeps the magnitude of the entry it selected.' },
      { value: 'type-preference', help: 'Chooses by magnitude type across every entry in the group: Mw first; below M6.2 local ML ahead of mb, from M6.2 Ms ahead.' },
      { value: 'quality', help: 'The preferred magnitude of the entry ranked first by quality score.' },
      { value: 'authority', help: 'The preferred magnitude of the entry from the highest-ranked network (Settings › Merge authority).' },
      { value: 'newest', help: 'The preferred magnitude of the most recently determined solution.' },
      { value: 'catalogue', help: 'The preferred magnitude of the chosen catalogue\'s entry; a group without an entry from it follows the strategy.' },
    ],
    note: 'The published magnitude carries its own type, uncertainty and preferred magnitude id.',
  },
  {
    field: 'mechanism',
    options: [
      { value: 'hierarchy', help: 'Every entry\'s focal mechanisms are kept together and the preferred one comes from the highest-ranked network (Settings › Merge authority).' },
      { value: 'strategy', help: 'Only the focal mechanisms of the entry the strategy selected, with its own preferred mechanism.' },
      { value: 'catalogue', help: 'Only the focal mechanisms of the chosen catalogue\'s entry; a group without an entry from it combines mechanisms by network authority.' },
    ],
    note: 'When the chosen entry has no focal mechanism, the mechanisms are combined by network authority instead.',
  },
];

// Each strategy and source-priority option: a short summary shown under the select (two
// sentences for a strategy, one for a source priority), and
// the full description (what lib/merge.ts does) in its tooltip and as the select's
// accessible description.
const STRATEGY_TEXT: Record<string, { summary: string; details: string }> = {
  quality: {
    summary: 'Uses the catalogue entry with the best-constrained solution (station count, azimuthal gap, RMS residual, uncertainties). The other entries are stored with the merged event as provenance.',
    details: 'Keeps the best-constrained solution, comparing only the quality metrics every catalogue in the group reports (station count, azimuthal gap, RMS residual, magnitude uncertainty and type, evaluation status). If a catalogue reports none of them, network authority decides.',
  },
  priority: {
    summary: 'Uses the catalogue entry from the agency or catalogue you rank highest (set under Source Priority). The other entries are stored with the merged event as provenance.',
    details: 'Keeps the record from the source you rank highest when the same event appears in more than one catalogue.',
  },
  average: {
    summary: 'Averages the epicentres of all entries, weighted by 1/σ² when every entry reports a location uncertainty. Magnitude and depth are selected, not averaged.',
    details: 'Averages only the epicentre: weighted by inverse variance when every source reports a horizontal uncertainty, equally otherwise. Magnitude and depth are selected, not averaged: magnitude by type (Mw first; below M6.2 local ML ahead of mb, from M6.2 Ms ahead), depth from the best-constrained solution that solved for depth, falling back to a fixed depth only when none did. Time is the earliest reported origin time; one agency\'s origin details (time uncertainty, station counts, agency) are not carried onto the averaged epicentre.',
  },
  median: {
    summary: 'Takes the median epicentre and origin time of all entries, robust to one outlying solution when there are three or more. Magnitude and depth are selected, not averaged.',
    details: 'Takes the median of the reported epicentres, latitude and longitude separately (longitudes unwrapped across the date line), and the median origin time; with two entries the median is their mean. Magnitude and depth are selected, not averaged: magnitude by type (Mw first; below M6.2 local ML ahead of mb, from M6.2 Ms ahead), depth from the best-constrained solution that solved for depth, falling back to a fixed depth only when none did. No single entry\'s origin details (time uncertainty, station counts, agency) are carried onto the median epicentre.',
  },
  newest: {
    summary: 'Uses the latest reported solution creation time, falling back to review status and quality when times are missing. The other entries are stored with the merged event as provenance.',
    details: 'Keeps the most recently determined solution: the one whose origin the agency computed last (QuakeML creation time). When times are missing or tied and every entry states its review status, reviewed or final solutions win over preliminary ones; remaining ties use quality score. A rejected solution is used only if every entry is rejected.',
  },
  complete: {
    summary: 'Uses the catalogue entry with the most populated fields (uncertainties, quality metrics, focal mechanisms). The other entries are stored with the merged event as provenance.',
    details: 'Keeps the record with the most complete information (the most populated fields).',
  },
};

// Nothing falls back to quality alone: a missing preferred agency falls back to network
// authority, then quality (lib/merge.ts mergeByPriority).
const SOURCE_PRIORITY_TEXT: Record<string, { summary: string; details: string }> = {
  quality: {
    summary: 'Best quality score wins.',
    details: 'The record with the best quality score is kept, comparing only the metrics every catalogue in the group reports; network authority decides when a catalogue reports none.',
  },
  newest: {
    summary: 'Most recently computed solution wins.',
    details: 'The most recently determined solution is kept (the latest origin creation time the agencies report); when times are missing or tied and every entry states its review status, reviewed or final solutions win over preliminary ones; remaining ties use quality score. A rejected solution is used only if every entry is rejected.',
  },
  geonet: {
    summary: 'GeoNet\'s entry is used; otherwise network authority decides.',
    details: 'The GeoNet record (GNS operates GeoNet) is kept when the group has one. It is recognised by its agency code (such as WEL) or the catalogue\'s provider or import source, not by words in a catalogue name. Otherwise the network-authority ranking configured in Settings › Merge authority decides (by default GeoNet, GCMT, ISC, USGS, then other agencies), and quality score breaks ties.',
  },
  custom: {
    summary: 'Your ranking below decides.',
    details: 'Your ranking below decides: the record from the highest-ranked catalogue is kept, and quality score breaks any remaining tie.',
  },
};
SOURCE_PRIORITY_TEXT.gns = SOURCE_PRIORITY_TEXT.geonet;

// What the published depth or magnitude will be under the current strategy and rule, in one
// line under the rule's select. Average and Median Values select both by the rules
// selectBestDepth / selectBestMagnitude apply (lib/merge.ts); every other strategy publishes
// the chosen report's own value, as reported: magnitudes are never converted to Mw.
function fieldRuleHint(field: FieldRuleName, rule: string, strategy: string): string | null {
  const computed = strategy === 'average' || strategy === 'median';
  if (field === 'magnitude') {
    return rule === 'type-preference' || (rule === 'strategy' && computed)
      ? 'Chosen by type: Mw first; among other scales, ML leads below M6.2 and Ms from M6.2.'
      : 'Kept as reported, not converted to Mw, so ML, mb and Mw can mix.';
  }
  if (field === 'depth') {
    if (rule === 'best-constrained' || (rule === 'strategy' && computed)) {
      return 'Best-constrained depth; a fixed depth only when no solution has a free depth.';
    }
    return rule === 'strategy' ? 'From the entry the strategy picks.' : null;
  }
  return null;
}

const CONFLICT_LABELS: Record<ConflictHandling, string> = {
  resolve: 'Resolve with the strategy',
  hold: 'Hold for review',
};

// Status labels for merge status
const statusLabels: Record<MergeStatus, string> = {
  idle: 'Ready',
  merging: 'Merging...',
  complete: 'Complete',
  error: 'Error'
};

// Helper function to get status color: 700 shades, so the badge's white text keeps 4.5:1
const getStatusColor = (status: MergeStatus): string => {
  switch (status) {
    case 'idle':
      return 'bg-blue-700 text-white hover:bg-blue-700';
    case 'merging':
      return 'bg-amber-700 text-white hover:bg-amber-700';
    case 'complete':
      return 'bg-green-700 text-white hover:bg-green-700';
    case 'error':
      return 'bg-red-700 text-white hover:bg-red-700';
    default:
      return 'bg-gray-700 text-white hover:bg-gray-700';
  }
};

export default function MergePage() {
  const { user, isAuthenticated } = useAuth();
  const canMerge = user?.role === UserRole.EDITOR || user?.role === UserRole.ADMIN;
  const isReadOnly = !canMerge;
  const mergeBlockedMessage = !user
    ? 'Log in to merge catalogues.'
    : 'Editor or Admin access is required to merge catalogues.';
  // Use global catalogue context
  const { catalogues: realCatalogues, loading: cataloguesLoading } = useCatalogues();

  const [activeTab, setActiveTab] = useState('select');
  const [selectedCatalogues, setSelectedCatalogues] = useState<(number | string)[]>([]);
  const [mergedName, setMergedName] = useState('Merged NZ Catalogue');
  const [timeThreshold, setTimeThreshold] = useState(60);
  const [distanceThreshold, setDistanceThreshold] = useState(10);
  const [priority, setPriority] = useState('newest');
  // Custom Order ranking (catalogue ids, highest priority first). Only the selected
  // catalogues are ranked; see rankedCatalogues.
  const [priorityOrder, setPriorityOrder] = useState<string[]>([]);
  const [priorityOrderAnnouncement, setPriorityOrderAnnouncement] = useState('');
  const [mergeStrategy, setMergeStrategy] = useState('priority');
  // Per-field rules on top of the strategy (M1). A 'catalogue' rule keeps its own catalogue
  // id so switching rules back and forth does not lose the pick.
  const [fieldRuleChoices, setFieldRuleChoices] = useState<FieldRuleChoices>(DEFAULT_FIELD_RULE_CHOICES);
  // What happens to a duplicate group the preview would flag: publish the strategy's answer
  // or hold the row for review on the catalogue page (M1 onConflict).
  const [onConflict, setOnConflict] = useState<ConflictHandling>('resolve');
  const [mergeStatus, setMergeStatus] = useState<MergeStatus>('idle');
  // Rows the saved merge held for review (the merge route's heldForReviewCount; 0 when the
  // server predates the field).
  const [heldForReviewCount, setHeldForReviewCount] = useState(0);
  const [mergedEvents, setMergedEvents] = useState<any[]>([]);
  // Id of the saved merged catalogue (null for export-only merges); MergeActions exports it
  // through the server route so downloads are never limited to the events held here.
  const [mergedCatalogueId, setMergedCatalogueId] = useState<string | null>(null);
  // The config and source catalogues sent with the merge behind the current result. Browser-
  // built downloads record these, not the live form, which can be edited after the merge.
  const [completedMerge, setCompletedMerge] = useState<{
    config: Record<string, unknown>;
    sourceCatalogues: Array<{ id: number | string; name: string; events: number; source: string }>;
  } | null>(null);
  const [geoSearchActive, setGeoSearchActive] = useState(false);
  const [geoSearching, setGeoSearching] = useState(false);
  const [geoSearchBounds, setGeoSearchBounds] = useState<GeographicBounds | null>(null);
  const [filteredCatalogues, setFilteredCatalogues] = useState<CatalogueItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showAllResults, setShowAllResults] = useState(false);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // New state for metadata and export-only mode
  const [mergeMetadata, setMergeMetadata] = useState<MergeMetadata>({});
  const [exportOnly, setExportOnly] = useState(false);
  const [mergeProgress, setMergeProgress] = useState(0);
  const [mergeSteps, setMergeSteps] = useState<MergeStep[]>([
    { id: 'fetch-1', label: 'Fetching first catalogue events', status: 'pending' },
    { id: 'fetch-2', label: 'Fetching second catalogue events', status: 'pending' },
    { id: 'match', label: 'Matching duplicate events', status: 'pending' },
    { id: 'merge', label: 'Merging events', status: 'pending' },
    { id: 'bounds', label: 'Calculating geographic bounds', status: 'pending' },
    { id: 'save', label: 'Saving merged catalogue', status: 'pending' }
  ]);
  const [previewData, setPreviewData] = useState<any>(null);
  // The selection and config the shown preview was generated for. Start Merge is enabled
  // only while they equal the current ones, so a merge always follows a preview of exactly
  // what it will do (the effects below also clear the preview when the settings change).
  const [previewConfigKey, setPreviewConfigKey] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  // The QC summary the merge route returned for the merge just run (null for an older server).
  const [completedQc, setCompletedQc] = useState<MergeQcSummary | null>(null);
  const [confirmMergeOpen, setConfirmMergeOpen] = useState(false);

  // Ref to track progress interval for cleanup
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Guards against re-entrant / concurrent merge submissions (a double-click on Start Merge
  // or on the confirmation).
  const mergeInFlightRef = useRef(false);
  // Monotonic request id so a slow in-flight preview response can't overwrite state that
  // belongs to a newer request (config/selection changed while a preview was loading).
  const previewRequestIdRef = useRef(0);
  // Cancels loading the merged catalogue's events if the page unmounts mid-load.
  const mergedEventsAbortRef = useRef<AbortController | null>(null);

  // Initialize filtered catalogues with real data from context
  useEffect(() => {
    if (!geoSearchActive && realCatalogues.length > 0) {
      setFilteredCatalogues(realCatalogues);
    }
  }, [realCatalogues, geoSearchActive]);

  // Clear preview data when configuration changes (prevents stale preview). Bump the
  // request id so any in-flight preview response is discarded instead of repopulating state.
  useEffect(() => {
    previewRequestIdRef.current++;
    setPreviewData(null);
    setPreviewConfigKey(null);
  }, [timeThreshold, distanceThreshold, mergeStrategy, priority, priorityOrder, fieldRuleChoices, onConflict]);

  // Clear preview data when selected catalogues change (same in-flight invalidation).
  useEffect(() => {
    previewRequestIdRef.current++;
    setPreviewData(null);
    setPreviewConfigKey(null);
  }, [selectedCatalogues]);

  // Cleanup progress interval and any in-flight merged-event load on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      mergedEventsAbortRef.current?.abort();
    };
  }, []);

  // The catalogue a 'catalogue' field rule names, as the request sends it: the pick when it is
  // still selected, else the first selected catalogue (the schema requires an id from the
  // request's own sources, and a stale pick from a deselected catalogue must not fail it).
  const fieldRuleCatalogueId = (field: FieldRuleName): string | null => {
    const chosen = fieldRuleChoices[field].catalogueId;
    if (chosen && getSelectedCatalogues.some(catalogue => String(catalogue.id) === chosen)) return chosen;
    return getSelectedCatalogues.length > 0 ? String(getSelectedCatalogues[0].id) : null;
  };

  // Only the rules that differ from the strategy's own behaviour, so a default form sends no
  // fieldRules at all and the request keeps the shape earlier merges recorded.
  const buildFieldRules = (): Record<string, { rule: string; catalogueId?: string }> | null => {
    const rules: Record<string, { rule: string; catalogueId?: string }> = {};
    (Object.keys(fieldRuleChoices) as FieldRuleName[]).forEach(field => {
      const { rule } = fieldRuleChoices[field];
      if (rule === DEFAULT_FIELD_RULE[field]) return;
      if (rule === 'catalogue') {
        const catalogueId = fieldRuleCatalogueId(field);
        if (!catalogueId) return;
        rules[field] = { rule, catalogueId };
      } else {
        rules[field] = { rule };
      }
    });
    return Object.keys(rules).length > 0 ? rules : null;
  };

  // What a preview was generated for: the selected catalogues (in order) and the config.
  const previewKeyOf = (catalogues: ReadonlyArray<{ id: number | string }>, config: Record<string, unknown>): string =>
    JSON.stringify({ sources: catalogues.map(catalogue => String(catalogue.id)), config });

  // One config builder for the preview and merge requests so the two cannot drift apart.
  const buildMergeConfig = (): Record<string, unknown> => {
    const fieldRules = buildFieldRules();
    return {
      timeThreshold,
      distanceThreshold,
      mergeStrategy,
      priority,
      // Only a Custom Order merge carries a ranking, so every other request keeps its shape.
      ...(mergeStrategy === 'priority' && priority === 'custom'
        ? { priorityOrder: rankedCatalogues.map(catalogue => String(catalogue.id)) }
        : {}),
      ...(fieldRules ? { fieldRules } : {}),
      // 'resolve' is the server default; sending it would only change recorded parameters.
      ...(onConflict === 'hold' ? { onConflict } : {}),
    };
  };

  const setFieldRule = (field: FieldRuleName, rule: string) => {
    setFieldRuleChoices(prev => ({ ...prev, [field]: { ...prev[field], rule } }));
  };

  const setFieldRuleCatalogue = (field: FieldRuleName, catalogueId: string) => {
    setFieldRuleChoices(prev => ({ ...prev, [field]: { ...prev[field], catalogueId } }));
  };

  // The field rules as the merge summary lists them, one line per field.
  const describeFieldRule = (field: FieldRuleName): string => {
    const { rule } = fieldRuleChoices[field];
    const label = FIELD_RULE_LABELS[field][rule] ?? rule;
    if (rule !== 'catalogue') return label;
    const catalogueId = fieldRuleCatalogueId(field);
    const catalogue = getSelectedCatalogues.find(item => String(item.id) === catalogueId);
    return catalogue ? `${label} (${catalogue.name})` : label;
  };

  // Memoized catalogue selection handler
  const handleCatalogueSelect = useCallback((id: number | string) => {
    setSelectedCatalogues(prev => {
      if (prev.includes(id)) {
        return prev.filter(catalogueId => catalogueId !== id);
      } else {
        return [...prev, id];
      }
    });
  }, []);

  // Memoized navigation handlers
  const handleNextStep = useCallback(() => {
    if (activeTab === 'select') {
      setActiveTab('configure');
    } else if (activeTab === 'configure') {
      // Validate merged catalogue name before proceeding to preview
      if (!mergedName.trim()) {
        toast({
          title: "Name Required",
          description: "Please enter a name for the merged catalogue.",
          variant: "destructive"
        });
        return;
      }
      setActiveTab('preview');
    }
  }, [activeTab, mergedName]);

  const handlePreviousStep = useCallback(() => {
    if (activeTab === 'configure') {
      setActiveTab('select');
    } else if (activeTab === 'preview') {
      setActiveTab('configure');
    }
  }, [activeTab]);

  const handleGeneratePreview = async () => {
    if (isReadOnly) {
      toast({
        title: 'Read-only mode',
        description: 'Log in to generate merge previews.',
        variant: 'destructive'
      });
      return;
    }
    if (getSelectedCatalogues.length < 2) {
      toast({
        title: "Not enough catalogues selected",
        description: "Please select at least two available catalogues to merge.",
        variant: "destructive"
      });
      return;
    }

    // Tag this request so a stale (slower) response can't clobber newer state.
    const requestId = ++previewRequestIdRef.current;
    setIsLoadingPreview(true);

    try {
      const selectedCatalogueData = getSelectedCatalogues;

      // Transform catalogue data to match validation schema
      // Keep this in sync with the payload used for the real /api/merge call
      const sourceCatalogues = selectedCatalogueData.map(cat => ({
        id: cat.id,
        name: cat.name,
        // Prefer exact events count if available, fall back to event_count
        events: (cat as any).events || (cat as any).event_count || 0,
        source: (cat as any).source || cat.name || 'unknown',
      }));

      const config = buildMergeConfig();
      const requestKey = previewKeyOf(selectedCatalogueData, config);
      const requestBody = {
        // Validation schema requires a "name" field, even for preview
        name: mergedName || 'Preview Only',
        sourceCatalogues,
        config,
      };

      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log('Sending preview request:', requestBody);
      }

      const response = await fetch('/api/merge/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorInfo = await getApiError(response, 'Failed to generate preview');
        console.error('Preview API error:', errorInfo);
        throw new Error(errorInfo.message);
      }

      const result = await response.json();

      // Drop the response if a newer preview request has since started (or a merge began),
      // so we never repopulate previewData with results for stale config/selection.
      if (requestId !== previewRequestIdRef.current) {
        return;
      }
      setPreviewData(result);
      setPreviewConfigKey(requestKey);

      const matched = Number(result?.statistics?.duplicateGroupsCount) || 0;
      const flagged = Number(result?.statistics?.suspiciousGroupsCount) || 0;
      toast({
        title: 'QC preview ready',
        description: `${formatCount(matched)} matched ${matched === 1 ? 'group' : 'groups'}, ${formatCount(flagged)} flagged.`,
      });
    } catch (error) {
      if (requestId !== previewRequestIdRef.current) {
        return; // superseded — suppress stale error too
      }
      console.error('Preview generation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: "Preview Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      // Only clear the loading flag if this is still the latest request.
      if (requestId === previewRequestIdRef.current) {
        setIsLoadingPreview(false);
      }
    }
  };

  const handleStartMerge = async () => {
    if (isReadOnly) {
      toast({
        title: 'Read-only mode',
        description: 'Log in to merge catalogues.',
        variant: 'destructive'
      });
      return;
    }
    // Block re-entry while a merge is running or already finished. Prevents
    // duplicate/concurrent writes.
    if (mergeStatus === 'merging' || mergeStatus === 'complete' || mergeInFlightRef.current) {
      return;
    }
    // A merge only follows a QC preview of exactly these settings (the button is disabled
    // otherwise; this also covers a call that bypasses it).
    if (!previewIsCurrent) {
      toast({
        title: 'Generate the QC preview first',
        description: 'The merge starts from a QC preview of the current selection and settings.',
        variant: 'destructive'
      });
      return;
    }
    // Guard against selection drifting out of sync with the catalogues actually available.
    if (getSelectedCatalogues.length < 2) {
      toast({
        title: "Not enough catalogues selected",
        description: "Please select at least two available catalogues to merge.",
        variant: "destructive"
      });
      return;
    }

    // Validate merged catalogue name
    if (!mergedName.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter a name for the merged catalogue.",
        variant: "destructive"
      });
      return;
    }

    // All preconditions pass — confirm before the irreversible write.
    setConfirmMergeOpen(true);
  };

  const executeMerge = async () => {
    // Hard guard against concurrent execution regardless of React state batching.
    if (mergeInFlightRef.current) {
      return;
    }
    mergeInFlightRef.current = true;

    setMergeStatus('merging');
    setMergeProgress(0);
    setMergedCatalogueId(null);
    setCompletedMerge(null);
    setCompletedQc(null);
    setHeldForReviewCount(0);
    // Discard any preview still loading. The shown preview is kept (hidden while the merge
    // runs), so after a failed merge it can be retried without generating it again.
    previewRequestIdRef.current++;

    // Reset all steps to pending
    setMergeSteps(steps => steps.map(s => ({ ...s, status: 'pending' as const })));

    // Clear any existing progress interval
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    // Simulate progress updates using ref for proper cleanup
    progressIntervalRef.current = setInterval(() => {
      setMergeProgress(prev => {
        if (prev >= 95) {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          return prev;
        }
        return prev + 5;
      });
    }, 300);

    try {
      const selectedCatalogueData = getSelectedCatalogues;

      // Transform catalogue data to match validation schema
      // Keep this in sync with the payload used for preview (handleGeneratePreview)
      const sourceCatalogues = selectedCatalogueData.map(cat => ({
        id: cat.id,
        name: cat.name,
        // Prefer exact events count if available, fall back to event_count
        events: (cat as any).events || cat.event_count || 0,
        source: (cat as any).source || cat.name || 'unknown',
      }));

      const config = buildMergeConfig();

      // Update step 1
      setMergeSteps(steps => steps.map(s =>
        s.id === 'fetch-1' ? { ...s, status: 'in-progress' as const } : s
      ));

      const response = await fetch('/api/merge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: mergedName,
          sourceCatalogues,
          config,
          metadata: mergeMetadata,
          exportOnly
        }),
      });

      if (!response.ok) {
        const errorInfo = await getApiError(response, 'Failed to merge catalogues');
        throw new Error(errorInfo.message);
      }

      const result = await response.json();
      setCompletedMerge({ config, sourceCatalogues });
      // Held rows exist only in a saved catalogue (export-only has nowhere to review them).
      // A server without the field reports nothing held.
      const held = Number(result.heldForReviewCount);
      setHeldForReviewCount(!exportOnly && Number.isFinite(held) && held > 0 ? held : 0);
      // The QC summary of the merge as run; an older server sends none.
      setCompletedQc(isMergeQcSummary(result.qc) ? result.qc : null);

      // Server accepted and returned the merge result — only now mark the
      // fetch/match/merge/bounds steps complete (they previously flipped green
      // right after the POST resolved, before the response was validated).
      setMergeSteps(steps => steps.map(s =>
        s.id.startsWith('fetch') || s.id === 'match' || s.id === 'merge' || s.id === 'bounds'
          ? { ...s, status: 'complete' as const }
          : s
      ));
      setMergeProgress(prev => Math.max(prev, 80));

      // Update save step
      if (!exportOnly) {
        setMergeSteps(steps => steps.map(s =>
          s.id === 'save' ? { ...s, status: 'in-progress' as const } : s
        ));
      }

      // Fetch the actual merged events from the newly created catalogue
      if (result.catalogueId && !exportOnly) {
        // Page through the summary view until the server reports no more pages. The
        // parameter-less events read is capped by UNPAGINATED_EVENTS_LIMIT and says nothing
        // when it truncates, so a large merge showed (and exported) only its newest events.
        // Downloads are served by the export route, which pages past that cap itself.
        const controller = new AbortController();
        mergedEventsAbortRef.current = controller;
        try {
          const events = await loadCatalogueEvents(
            [{ id: String(result.catalogueId), name: mergedName, event_count: result.eventCount }],
            { signal: controller.signal }
          );
          setMergedEvents(events);
        } catch (error) {
          console.error('Error fetching merged events:', error);
          setMergedEvents([]);
          if (!controller.signal.aborted) {
            toast({
              title: "Merged events could not be loaded",
              description: "The merged catalogue was saved, but its events could not be shown here. Exports still contain every saved event.",
              variant: "destructive"
            });
          }
        } finally {
          if (mergedEventsAbortRef.current === controller) mergedEventsAbortRef.current = null;
        }
        setMergedCatalogueId(String(result.catalogueId));
      } else if (result.events && exportOnly) {
        // For export-only mode, use the returned events
        setMergedEvents(result.events);
      } else {
        setMergedEvents([]);
      }

      // Mark all steps as complete
      setMergeSteps(steps => steps.map(s => ({ ...s, status: 'complete' as const })));
      setMergeProgress(100);

      // Clear progress interval using ref
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }

      // A saved merge created a catalogue: clear every client cache of catalogue data and
      // refresh the catalogue list on all pages (contract C5). Export-only writes nothing.
      if (!exportOnly) {
        invalidateCatalogueData();
      }

      const mergedCount = getSelectedCatalogues.length;
      setMergeStatus('complete');
      toast({
        title: exportOnly ? "Merge Complete (Export Only)" : "Merge Complete",
        description: exportOnly
          ? `Successfully merged ${mergedCount} catalogues. Ready for export.`
          : `Successfully merged ${mergedCount} catalogues into "${mergedName}"`,
      });
    } catch (error) {
      // Clear progress interval using ref on error
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }

      setMergeStatus('error');
      setMergeSteps(steps => steps.map(s =>
        s.status === 'in-progress' ? { ...s, status: 'error' as const } : s
      ));
      const errorMessage = error instanceof Error
        ? error.message
        : "An error occurred while merging the catalogues.";
      toast({
        title: "Merge Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      // Release the re-entrancy guard so a fresh merge can be started (via Start New Merge,
      // or a retry after an error).
      mergeInFlightRef.current = false;
    }
  };

  // Memoized selected catalogues
  const getSelectedCatalogues = useMemo(() => {
    return realCatalogues.filter(catalogue => selectedCatalogues.includes(catalogue.id));
  }, [selectedCatalogues, realCatalogues]);

  // The Custom Order ranking over the current selection: ranked catalogues keep their place,
  // newly selected ones join at the bottom, and deselected ones drop out.
  const rankedCatalogues = useMemo(() => {
    const ranked = priorityOrder
      .map(id => getSelectedCatalogues.find(catalogue => String(catalogue.id) === id))
      .filter((catalogue): catalogue is (typeof getSelectedCatalogues)[number] => catalogue !== undefined);
    return ranked.concat(getSelectedCatalogues.filter(catalogue => !ranked.includes(catalogue)));
  }, [priorityOrder, getSelectedCatalogues]);

  // Swap a catalogue with its neighbour. The buttons stay enabled at the ends of the list
  // (a no-op there) so keyboard focus is never dropped onto the page.
  const moveInPriorityOrder = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= rankedCatalogues.length) return;
    const ids = rankedCatalogues.map(catalogue => String(catalogue.id));
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setPriorityOrder(ids);
    setPriorityOrderAnnouncement(
      `${rankedCatalogues[index].name} moved to position ${target + 1} of ${ids.length}.`
    );
  };

  // Memoized total events calculation
  const getTotalSelectedEvents = useMemo(() => {
    return getSelectedCatalogues.reduce((total, catalogue) => {
      const eventCount = catalogue.event_count || 0;
      return total + eventCount;
    }, 0);
  }, [getSelectedCatalogues]);

  // Memoized estimated merged events calculation
  const estimatedMergedEvents = useMemo(() => {
    const selected = getSelectedCatalogues;
    if (selected.length === 0) return 0;
    if (selected.length === 1) {
      const eventCount = selected[0].event_count || 0;
      return eventCount;
    }

    const totalEvents = getTotalSelectedEvents;
    const overlapFactor = Math.min(0.9, Math.max(0, 0.15 * (selected.length - 1)));
    return Math.round(totalEvents * (1 - overlapFactor));
  }, [getSelectedCatalogues, getTotalSelectedEvents]);

  // Memoized geographic search handler
  const handleGeoSearch = useCallback(async (bounds: GeographicBounds) => {
    try {
      setGeoSearching(true);
      setGeoSearchBounds(bounds);

      const params = new URLSearchParams({
        minLat: bounds.minLatitude.toString(),
        maxLat: bounds.maxLatitude.toString(),
        minLon: bounds.minLongitude.toString(),
        maxLon: bounds.maxLongitude.toString(),
      });

      const response = await fetch(`/api/catalogues/search/region?${params}`);

      if (!response.ok) {
        const errorInfo = await getApiError(response, 'Failed to search catalogues by region');
        throw new Error(errorInfo.message);
      }

      const data = await response.json();
      setFilteredCatalogues(data.catalogues);
      setGeoSearchActive(true);

      toast({
        title: 'Region Search Complete',
        description: `Found ${data.count} catalogue(s) in the selected region`,
      });
    } catch (error) {
      console.error('Geographic search error:', error);
      const errorMessage = error instanceof Error
        ? error.message
        : 'Failed to search catalogues by region. Please try again.';
      toast({
        title: 'Search Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setGeoSearching(false);
    }
  }, []);

  // Memoized clear handler
  const handleGeoClear = useCallback(() => {
    setGeoSearchActive(false);
    setGeoSearchBounds(null);
    setFilteredCatalogues(realCatalogues);
  }, [realCatalogues]);

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
    incomplete: 'incomplete',
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

  const getEventCount = (catalogue: CatalogueItem): number => {
    return catalogue.event_count ?? catalogue.events ?? 0;
  };

  // Parse each catalogue's source_catalogues JSON at most once per unique string. Sorting
  // and filtering call getSourceType/getSourceNamesForSearch many times per catalogue per
  // render; without this cache the same JSON was re-parsed O(n log n)+ times.
  const sourceCataloguesCacheRef = useRef<Map<string, any[]>>(new Map());
  const parseSourceCatalogues = useCallback((raw: string | null | undefined): any[] => {
    const key = raw || '[]';
    const cache = sourceCataloguesCacheRef.current;
    const cached = cache.get(key);
    if (cached) return cached;
    let parsed: any[] = [];
    try {
      const value = JSON.parse(key);
      parsed = Array.isArray(value) ? value : [];
    } catch {
      parsed = [];
    }
    cache.set(key, parsed);
    return parsed;
  }, []);

  const getSourceNamesForSearch = useCallback((catalogue: CatalogueItem): string[] => {
    const sources: string[] = [];
    if (catalogue.source) sources.push(catalogue.source);

    const sourceCatalogues = parseSourceCatalogues(catalogue.source_catalogues);
    {
      sourceCatalogues.forEach((source: any) => {
        const entries = [source.source, source.name, source.id];
        entries.filter(Boolean).forEach((entry) => sources.push(String(entry)));
      });
    }

    return sources;
  }, [parseSourceCatalogues]);

  const getSourceType = useCallback((catalogue: CatalogueItem): 'merged' | 'imported' | 'uploaded' => {
    try {
      const sources = parseSourceCatalogues(catalogue.source_catalogues);

      if (Array.isArray(sources) && sources.length > 1) {
        const hasMultipleSourceCatalogues = sources.some((s: any) => s.id && s.name && s.events !== undefined);
        if (hasMultipleSourceCatalogues) {
          return 'merged';
        }
      }

      if (Array.isArray(sources) && sources.length > 0) {
        const firstSource = sources[0];
        const sourceName = (firstSource.source || '').toLowerCase();

        if (sourceName === 'geonet' || sourceName === 'iris fdsn' || sourceName.includes('fdsn') || sourceName.includes('api')) {
          return 'imported';
        }

        if (sourceName === 'upload') {
          return 'uploaded';
        }
      }

      if (catalogue.merge_config) {
        try {
          const mergeConfig = JSON.parse(catalogue.merge_config);
          if (mergeConfig && mergeConfig.sourceCatalogues && mergeConfig.sourceCatalogues.length > 1) {
            return 'merged';
          }
        } catch {
          // ignore invalid merge config
        }
      }

      return 'uploaded';
    } catch {
      return 'uploaded';
    }
  }, [parseSourceCatalogues]);

  const getSourceNamesForSort = useCallback((catalogue: CatalogueItem): string => {
    const sourceNames = getSourceNamesForSearch(catalogue);
    return sourceNames.length > 0 ? sourceNames.join(', ') : 'Unknown';
  }, [getSourceNamesForSearch]);

  const getSourceTypeBadge = (catalogue: CatalogueItem) => {
    const sourceType = getSourceType(catalogue);

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

  function formatDate(dateString: string | undefined): string {
    if (!dateString) return '—';
    try {
      return formatLocalDate(dateString);
    } catch {
      return dateString;
    }
  }

  const buildSearchFields = (catalogue: CatalogueItem): SearchFields => {
    const eventCount = getEventCount(catalogue);
    const createdAt = catalogue.created_at || '';
    const sourceNames = getSourceNamesForSearch(catalogue);

    return {
      name: catalogue.name,
      id: String(catalogue.id),
      status: catalogue.status || 'unknown',
      source: sourceNames.join(' '),
      sourceType: getSourceType(catalogue),
      events: `${eventCount} ${eventCount.toLocaleString()}`,
      created: createdAt ? `${createdAt} ${formatDate(createdAt)}` : '',
    };
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

  const matchesSearchQuery = useCallback((catalogue: CatalogueItem, tokens: SearchToken[]): boolean => {
    if (tokens.length === 0) return true;

    const fields = buildSearchFields(catalogue);
    const haystack = normalizeSearchValue(Object.values(fields).join(' '));

    return tokens.every((token) => {
      const value = normalizeSearchValue(token.value);
      if (!value) return true;

      if (!token.field) {
        const dateRange = parseDateRange(value);
        const dateFilter = parseDateFilter(value);
        const actualTimestamp = Date.parse(catalogue.created_at || '');

        if (!Number.isNaN(actualTimestamp)) {
          if (dateRange) {
            return matchesDateRange(actualTimestamp, dateRange);
          }
          if (dateFilter) {
            return compareDate(actualTimestamp, dateFilter);
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
        return normalizeSearchValue(fields.status).includes(normalizedStatus);
      }

      if (fieldKey === 'events') {
        const numericFilter = parseNumericFilter(value);
        if (numericFilter) {
          return compareNumber(getEventCount(catalogue), numericFilter.op, numericFilter.amount);
        }
      }

      if (fieldKey === 'created') {
        const dateRange = parseDateRange(value);
        const dateFilter = parseDateFilter(value);
        const actualTimestamp = Date.parse(catalogue.created_at || '');
        if (!Number.isNaN(actualTimestamp)) {
          if (dateRange) {
            return matchesDateRange(actualTimestamp, dateRange);
          }
          if (dateFilter) {
            return compareDate(actualTimestamp, dateFilter);
          }
        }
      }

      return normalizeSearchValue(fields[fieldKey]).includes(value);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const baseCatalogues = filteredCatalogues;

  const searchTokens = useMemo(
    () => parseSearchTokens(debouncedSearchQuery),
    [debouncedSearchQuery]
  );

  const searchedCatalogues = useMemo(() => {
    return baseCatalogues.filter((catalogue) => matchesSearchQuery(catalogue, searchTokens));
  }, [baseCatalogues, matchesSearchQuery, searchTokens]);

  const sortedCatalogues = useMemo(() => {
    return [...searchedCatalogues].sort((a, b) => {
      let comparison = 0;

      if (sortField === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortField === 'date') {
        comparison = Date.parse(a.created_at || '') - Date.parse(b.created_at || '');
      } else if (sortField === 'events') {
        comparison = getEventCount(a) - getEventCount(b);
      } else if (sortField === 'sourceType') {
        comparison = getSourceType(a).localeCompare(getSourceType(b));
      } else if (sortField === 'source') {
        comparison = getSourceNamesForSort(a).localeCompare(getSourceNamesForSort(b));
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [getSourceNamesForSort, getSourceType, searchedCatalogues, sortField, sortDirection]);

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

  useEffect(() => {
    goToPage(1);
  }, [debouncedSearchQuery, geoSearchActive, geoSearchBounds, goToPage]);

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

  // Start Merge is enabled only while a QC preview of exactly the current selection and
  // settings is shown.
  const currentPreviewKey = previewKeyOf(getSelectedCatalogues, buildMergeConfig());
  const previewIsCurrent = previewData != null && previewConfigKey === currentPreviewKey;
  const mergeNeedsPreview = !isReadOnly && (mergeStatus === 'idle' || mergeStatus === 'error') && !previewIsCurrent;
  const previewStatistics = previewIsCurrent ? previewData?.statistics : null;

  const renderMergeButton = () => {
    if (mergeStatus === 'merging') {
      return (
        <Button disabled>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Merging Catalogues...
        </Button>
      );
    }

    if (mergeStatus === 'complete') {
      return (
        <Button onClick={() => {
          setActiveTab('select');
          setMergeStatus('idle');
          setSelectedCatalogues([]);
          // Reset the rest of the merge state so no stale preview/results/progress carry over.
          previewRequestIdRef.current++;
          setPreviewData(null);
          setPreviewConfigKey(null);
          setMergedEvents([]);
          setMergedCatalogueId(null);
          setCompletedMerge(null);
          setCompletedQc(null);
          setHeldForReviewCount(0);
          setMergeProgress(0);
          setMergeSteps(steps => steps.map(s => ({ ...s, status: 'pending' as const })));
        }}>
          Start New Merge
        </Button>
      );
    }

    // Read-only visitors get a way forward rather than a dead button: sign-in (back to
    // this page) for a guest, the Editor access request for a signed-in viewer.
    if (isReadOnly) {
      return isAuthenticated ? (
        <Button asChild variant="outline">
          <Link href={requestAccessHref(true)}>Request Editor access</Link>
        </Button>
      ) : (
        <Button asChild>
          <Link href={loginHref('/merge')}>Sign in to merge</Link>
        </Button>
      );
    }

    return (
      <Button
        onClick={handleStartMerge}
        disabled={!previewIsCurrent}
        aria-describedby={mergeNeedsPreview ? 'start-merge-hint' : undefined}
      >
        <Save className="mr-2 h-4 w-4" />
        Start Merge
      </Button>
    );
  };

  if (!canMerge) {
    return (
      <AuthGateCard
        title={isAuthenticated ? 'Editor access required' : 'Login required'}
        description={mergeBlockedMessage}
        requiredRole={UserRole.EDITOR}
        action={
          isAuthenticated
            ? { label: 'Back to Dashboard', href: '/dashboard' }
            : { label: 'Log in', href: '/login' }
        }
        secondaryAction={
          isAuthenticated
            ? { label: 'View Catalogues', href: '/catalogues' }
            : { label: 'Back to Home', href: '/' }
        }
      />
    );
  }

  return (
    <div className="container py-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Merge Catalogues</h1>
          <p className="text-sm text-muted-foreground">
            Combine multiple earthquake catalogues into a unified dataset
          </p>
        </div>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Catalogue Merging Wizard</CardTitle>
                <CardDescription className="text-xs">
                  Merge multiple earthquake catalogues using configurable rules for matching events
                </CardDescription>
              </div>
              <Badge className={getStatusColor(mergeStatus)}>
                {statusLabels[mergeStatus]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="select" value={activeTab} onValueChange={setActiveTab}>
              {/* Below sm the three steps stack (side by side their labels overlapped at
                  390 px); the step number is visual only, the tab's name is its label. A step
                  not yet available shows its number in a dashed ring. */}
              <TabsList className="grid h-auto w-full grid-cols-1 gap-1 sm:h-10 sm:grid-cols-3 sm:gap-0">
                <TabsTrigger value="select" className="justify-start gap-2 sm:justify-center [&:disabled>span]:border-dashed">
                  <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs">1</span>
                  Select Catalogues
                </TabsTrigger>
                <TabsTrigger
                  value="configure"
                  disabled={selectedCatalogues.length < 2}
                  className="justify-start gap-2 sm:justify-center [&:disabled>span]:border-dashed"
                >
                  <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs">2</span>
                  Configure Merge
                </TabsTrigger>
                <TabsTrigger
                  value="preview"
                  // Also require a non-empty name here so tab-header navigation enforces the
                  // same rule as the footer "Preview Merge" button (handleNextStep).
                  disabled={selectedCatalogues.length < 2 || activeTab === 'select' || !mergedName.trim()}
                  className="justify-start gap-2 sm:justify-center [&:disabled>span]:border-dashed"
                >
                  <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs">3</span>
                  Preview & Merge
                </TabsTrigger>
              </TabsList>

              <TabsContent value="select" className="pt-6">
                <div className="flex items-center gap-2 bg-muted p-3 rounded-md">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <p className="text-sm">
                    Select at least two catalogues to merge. Catalogues should cover overlapping time periods or regions.
                  </p>
                </div>

                {/* Geographic Search Panel */}
                <div className="mt-4">
                  <GeographicSearchPanel
                    onSearch={handleGeoSearch}
                    onClear={handleGeoClear}
                    isSearching={geoSearching}
                  />
                </div>

                {/* Active Filter Indicator */}
                {geoSearchActive && geoSearchBounds && (
                  <div className="mt-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          Filtered by geographic region
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleGeoClear}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        Clear Filter
                      </Button>
                    </div>
                  </div>
                )}

                <div className="border rounded-lg overflow-hidden mt-4">
                  <div className="bg-muted/50 px-4 py-3 text-sm font-medium space-y-2">
                    <div className="flex items-center justify-between">
                      <span>Available Catalogues</span>
                      {(geoSearchActive || searchQuery) && (
                        <span className="text-xs text-muted-foreground">
                          Showing {sortedCatalogues.length} of {baseCatalogues.length} catalogues
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="search"
                          placeholder="Search catalogues..."
                          className="pl-8"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                      <InfoTooltip
                        content={
                          <div className="space-y-1 text-xs">
                            <p>Field tokens: name:, id:, status:, source:, type:, events:, date:.</p>
                            <p>Example: <span className="font-medium">status:complete events:&gt;10000 &quot;New Zealand&quot;</span></p>
                          </div>
                        }
                      >
                        <button type="button" className="inline-flex items-center justify-center h-9 w-9 text-muted-foreground hover:text-foreground">
                          <Info className="h-4 w-4" />
                          <span className="sr-only">Search help</span>
                        </button>
                      </InfoTooltip>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <div className="divide-y min-w-[720px]">
                      <div className="px-4 py-2 text-xs font-semibold text-muted-foreground">
                        <div className="grid grid-cols-[auto_minmax(0,2fr)_120px_120px_120px_minmax(0,1fr)] items-center gap-3">
                          <div className="w-4" aria-hidden="true" />
                          <button
                            type="button"
                            className="flex items-center justify-start gap-1.5 text-left w-full"
                            onClick={() => handleSort('name')}
                          >
                            <Layers className="h-3.5 w-3.5" />
                            Name{renderSortIndicator('name')}
                          </button>
                          <button
                            type="button"
                            className="flex items-center justify-start gap-1.5 text-left w-full"
                            onClick={() => handleSort('date')}
                          >
                            <Calendar className="h-3.5 w-3.5" />
                            Date{renderSortIndicator('date')}
                          </button>
                          <button
                            type="button"
                            className="flex items-center justify-start gap-1.5 text-left w-full"
                            onClick={() => handleSort('events')}
                          >
                            <Activity className="h-3.5 w-3.5" />
                            Events{renderSortIndicator('events')}
                          </button>
                          <button
                            type="button"
                            className="flex items-center justify-start gap-1.5 text-left w-full"
                            onClick={() => handleSort('sourceType')}
                          >
                            <GitMerge className="h-3.5 w-3.5" />
                            Source Type{renderSortIndicator('sourceType')}
                          </button>
                          <button
                            type="button"
                            className="flex items-center justify-start gap-1.5 text-left w-full"
                            onClick={() => handleSort('source')}
                          >
                            <Database className="h-3.5 w-3.5" />
                            Source{renderSortIndicator('source')}
                          </button>
                        </div>
                      </div>
                      {cataloguesLoading ? (
                        <div className="p-8 text-center text-muted-foreground">
                          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                          <p>Loading catalogues...</p>
                        </div>
                      ) : sortedCatalogues.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                          <Layers className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p>{searchQuery ? 'No catalogues match your search' : 'No catalogues available'}</p>
                          <p className="text-sm mt-1">
                            {searchQuery ? 'Try adjusting your search terms.' : 'Import or create catalogues to merge them.'}
                          </p>
                        </div>
                      ) : (
                        paginatedCatalogues.map(catalogue => (
                          <div key={catalogue.id} className="px-4 py-3">
                            <div className="grid grid-cols-[auto_minmax(0,2fr)_120px_120px_120px_minmax(0,1fr)] items-center gap-3">
                              <Checkbox
                                id={`catalogue-${catalogue.id}`}
                                aria-labelledby={`catalogue-${catalogue.id}-label`}
                                checked={selectedCatalogues.includes(catalogue.id)}
                                onCheckedChange={() => handleCatalogueSelect(catalogue.id)}
                              />
                              <div className="min-w-0">
                                <Label
                                  id={`catalogue-${catalogue.id}-label`}
                                  htmlFor={`catalogue-${catalogue.id}`}
                                  className="text-sm font-medium flex items-center gap-1.5"
                                >
                                  <Layers className="h-4 w-4 text-muted-foreground" />
                                  <span className="truncate">{catalogue.name}</span>
                                </Label>
                              </div>
                              <span className="text-sm text-muted-foreground">
                                {formatDate(catalogue.created_at)}
                              </span>
                              <span className="text-sm text-muted-foreground tabular-nums">
                                {getEventCount(catalogue).toLocaleString()}
                              </span>
                              <div className="text-sm text-muted-foreground">
                                {getSourceTypeBadge(catalogue)}
                              </div>
                              <span className="text-sm text-muted-foreground truncate" title={getSourceNamesForSort(catalogue)}>
                                {getSourceNamesForSort(catalogue)}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
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
                </div>

                {selectedCatalogues.length > 0 && (
                  <div className="bg-muted/30 p-4 rounded-md mt-4">
                    <h3 className="font-medium mb-2">Selection Summary</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Catalogues</p>
                        <p className="text-xl font-semibold">{getSelectedCatalogues.length}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Events</p>
                        <p className="text-xl font-semibold">{getTotalSelectedEvents.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Est. Merged Events</p>
                        <p className="text-xl font-semibold">{estimatedMergedEvents.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="configure" className="pt-6">
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="merged-name" className="text-base font-medium">
                        Merged Catalogue Name
                      </Label>
                      <InfoTooltip content="Name used when saving or exporting the merged catalogue." />
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <Input
                        id="merged-name"
                        value={mergedName}
                        onChange={e => setMergedName(e.target.value)}
                        placeholder="Enter a name for the merged catalogue"
                      />
                    </div>
                  </div>

                  <Separator className="my-6" />

                  <div>
                    <h3 className="text-base font-medium mb-1">Event Matching Criteria</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Define how to identify the same event across different catalogues
                    </p>

                    <div className="space-y-6">
                      {/* Info Alert about Adaptive Thresholds */}
                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                        <div className="flex gap-3">
                          <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <h4 className="text-sm font-medium text-blue-900 mb-1">
                              Adaptive Thresholds Active
                            </h4>
                            {/* Derived from the engine's actual multipliers (lib/merge.ts):
                                time 1.0/1.5/2.0/3.0 and distance 1.0/1.5/2.5/4.0 across the
                                M<4 / 4-5.5 / 5.5-7 / >=7 bands, with a further 1.2x (100-300 km)
                                or 1.5x (>300 km) on distance. Hard-coding example windows here
                                let the text drift out of step with the configured baselines. */}
                            <p className="text-xs text-blue-800 leading-relaxed">
                              The merge algorithm automatically widens the matching thresholds for larger and deeper events.
                              Your configured values ({timeThreshold}s, {distanceThreshold} km) apply as-is below M4.0
                              and are scaled up with magnitude, reaching {timeThreshold * 3}s and {distanceThreshold * 4} km
                              at M7.0 and above. Events deeper than 300 km get a further 1.5× on distance
                              (1.2× between 100 and 300 km).
                            </p>
                            <p className="mt-1 text-xs text-blue-800 leading-relaxed">
                              Events either side of 180° are matched, and entries that cannot be one earthquake
                              (e.g. M4.0 with M7.0) are never merged.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <LabelWithTooltip label="Time Window (seconds)" term="timeWindow" />
                          </div>
                          <span className="text-sm font-medium">{timeThreshold}s</span>
                        </div>
                        <Slider
                          value={[timeThreshold]}
                          min={0}
                          max={300}
                          step={5}
                          onValueChange={values => setTimeThreshold(values[0])}
                          aria-label="Time window in seconds"
                          aria-valuetext={`${timeThreshold} seconds`}
                        />
                        <p className="text-xs text-muted-foreground">
                          Events within {timeThreshold} seconds of each other may be considered the same event. Automatically adjusted by magnitude.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <LabelWithTooltip label="Distance Threshold (km)" term="distanceThreshold" />
                          </div>
                          <span className="text-sm font-medium">{distanceThreshold} km</span>
                        </div>
                        <Slider
                          value={[distanceThreshold]}
                          min={0}
                          max={100}
                          step={1}
                          onValueChange={values => setDistanceThreshold(values[0])}
                          aria-label="Distance threshold in kilometres"
                          aria-valuetext={`${distanceThreshold} kilometres`}
                        />
                        <p className="text-xs text-muted-foreground">
                          Events within {distanceThreshold} km of each other may be considered the same event. Automatically adjusted by magnitude and depth.
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator className="my-6" />

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-base font-medium mb-1">Conflict Resolution</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Choose how to handle conflicting data for the same event
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5">
                            <Label htmlFor="merge-strategy">Merge Strategy</Label>
                            <InfoTooltip content={STRATEGY_TEXT[mergeStrategy]?.details} />
                          </div>
                          <Select
                            value={mergeStrategy}
                            onValueChange={value => setMergeStrategy(value)}
                          >
                            <SelectTrigger id="merge-strategy" aria-describedby="merge-strategy-help">
                              <SelectValue placeholder="Select strategy" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="quality">Quality-Based (Recommended)</SelectItem>
                              <SelectItem value="priority">Source Priority</SelectItem>
                              <SelectItem value="average">Average Values</SelectItem>
                              <SelectItem value="median">Median Values</SelectItem>
                              <SelectItem value="newest">Most Recent Solution</SelectItem>
                              <SelectItem value="complete">Most Complete Record</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">{STRATEGY_TEXT[mergeStrategy]?.summary}</p>
                          <p id="merge-strategy-help" className="sr-only">{STRATEGY_TEXT[mergeStrategy]?.details}</p>
                        </div>

                        {mergeStrategy === 'priority' && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5">
                              <Label htmlFor="source-priority">Source Priority</Label>
                              <InfoTooltip content={SOURCE_PRIORITY_TEXT[priority]?.details} />
                            </div>
                            <Select
                              value={priority}
                              onValueChange={value => setPriority(value)}
                            >
                              <SelectTrigger id="source-priority" aria-describedby="source-priority-help">
                                <SelectValue placeholder="Select priority" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="quality">Quality-Based</SelectItem>
                                <SelectItem value="newest">Most Recent Solution</SelectItem>
                                <SelectItem value="geonet">GeoNet &gt; Others</SelectItem>
                                <SelectItem value="gns">GNS &gt; Others</SelectItem>
                                <SelectItem value="custom">Custom Order</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">{SOURCE_PRIORITY_TEXT[priority]?.summary}</p>
                            <p id="source-priority-help" className="sr-only">
                              Choose whose record is kept when the same event appears in more than one catalogue.{' '}
                              {SOURCE_PRIORITY_TEXT[priority]?.details}
                            </p>
                            {priority === 'custom' && (
                              <div className="space-y-1.5">
                                <p id="priority-order-hint" className="text-xs font-medium">
                                  Catalogue ranking (highest priority first)
                                </p>
                                <ol
                                  aria-label="Catalogue priority order"
                                  aria-describedby="priority-order-hint"
                                  className="divide-y rounded-md border"
                                >
                                  {rankedCatalogues.map((catalogue, index) => (
                                    <li key={catalogue.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                                      <span className="w-5 text-xs text-muted-foreground tabular-nums">{index + 1}.</span>
                                      <span className="flex-1 truncate" title={catalogue.name}>{catalogue.name}</span>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 aria-disabled:opacity-40"
                                        aria-label={`Move ${catalogue.name} up`}
                                        aria-disabled={index === 0}
                                        onClick={() => moveInPriorityOrder(index, -1)}
                                      >
                                        <ArrowUp className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 aria-disabled:opacity-40"
                                        aria-label={`Move ${catalogue.name} down`}
                                        aria-disabled={index === rankedCatalogues.length - 1}
                                        onClick={() => moveInPriorityOrder(index, 1)}
                                      >
                                        <ArrowDown className="h-4 w-4" />
                                      </Button>
                                    </li>
                                  ))}
                                </ol>
                                <p aria-live="polite" className="sr-only">{priorityOrderAnnouncement}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Per-field rules (M1). Each help text states what lib/merge.ts does for
                          that rule; the defaults are the strategy's own behaviour. */}
                      <div className="mt-6 space-y-3">
                        <div>
                          <h4 className="text-sm font-medium">Field rules</h4>
                          <p className="text-xs text-muted-foreground">
                            Optionally take these from a different entry than the strategy picks.
                          </p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {FIELD_RULE_OPTIONS.map(({ field, options, note }) => {
                            const { rule } = fieldRuleChoices[field];
                            const selectId = `field-rule-${field}`;
                            const helpId = `${selectId}-help`;
                            return (
                              <div key={field} className="space-y-2">
                                <div className="flex items-center gap-1.5">
                                  <Label htmlFor={selectId}>{FIELD_RULE_TITLES[field]}</Label>
                                  <InfoTooltip content={`${options.find(option => option.value === rule)?.help} ${note}`} />
                                </div>
                                <Select value={rule} onValueChange={value => setFieldRule(field, value)}>
                                  <SelectTrigger id={selectId} aria-describedby={helpId}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {options.map(option => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {FIELD_RULE_LABELS[field][option.value]}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {fieldRuleHint(field, rule, mergeStrategy) && (
                                  <p className="text-xs text-muted-foreground">{fieldRuleHint(field, rule, mergeStrategy)}</p>
                                )}
                                <p id={helpId} className="sr-only">
                                  {options.find(option => option.value === rule)?.help} {note}
                                </p>
                                {rule === 'catalogue' && (
                                  <div className="space-y-1">
                                    <Label htmlFor={`${selectId}-catalogue`} className="text-xs">
                                      {FIELD_RULE_TITLES[field]} from catalogue
                                    </Label>
                                    <Select
                                      value={fieldRuleCatalogueId(field) ?? ''}
                                      onValueChange={value => setFieldRuleCatalogue(field, value)}
                                    >
                                      <SelectTrigger id={`${selectId}-catalogue`}>
                                        <SelectValue placeholder="Select a catalogue" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {getSelectedCatalogues.map(catalogue => (
                                          <SelectItem key={catalogue.id} value={String(catalogue.id)}>
                                            {catalogue.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Flagged groups (M1 onConflict). Holding never drops an entry: the row is
                          still written with the strategy's provisional solution. */}
                      <div className="mt-6 space-y-3">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 id="on-conflict-label" className="text-sm font-medium">Flagged groups</h4>
                            <InfoTooltip content="The preview flags groups that were regrouped, are ambiguous, fail validation, or disagree on magnitude or depth, and entries that were matched but kept apart because their group failed the consistency checks (Kept apart). Holding never drops an entry: the row is written with the strategy's provisional solution and a reviewer keeps it or publishes one entry's solution instead." />
                          </div>
                        </div>
                        <RadioGroup
                          aria-labelledby="on-conflict-label"
                          value={onConflict}
                          onValueChange={value => setOnConflict(value === 'hold' ? 'hold' : 'resolve')}
                        >
                          <div className="flex items-start gap-2">
                            <RadioGroupItem id="on-conflict-resolve" value="resolve" className="mt-0.5" />
                            <div className="grid gap-0.5 leading-tight">
                              <Label htmlFor="on-conflict-resolve" className="text-sm font-medium">
                                {CONFLICT_LABELS.resolve}
                              </Label>
                              <p className="text-xs text-muted-foreground">Merge them like any other group.</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <RadioGroupItem id="on-conflict-hold" value="hold" className="mt-0.5" />
                            <div className="grid gap-0.5 leading-tight">
                              <Label htmlFor="on-conflict-hold" className="text-sm font-medium">
                                {CONFLICT_LABELS.hold}
                              </Label>
                              <p className="text-xs text-muted-foreground">Merge provisionally and list them for review on the catalogue page.</p>
                            </div>
                          </div>
                        </RadioGroup>
                      </div>
                    </div>
                  </div>

                  <Separator className="my-6" />

                  {/* Merge Metadata Section */}
                  <div className="space-y-4">
                    <MergeMetadataForm
                      metadata={mergeMetadata}
                      onChange={setMergeMetadata}
                    />
                  </div>

                  <Separator className="my-6" />

                  {/* Export-Only Mode */}
                  <div className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle as="h3" className="flex items-center gap-2">
                          <FileDown className="h-5 w-5" />
                          Export Options
                        </CardTitle>
                        <CardDescription>
                          Choose whether to save the merged catalogue or export only
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="export-only"
                            checked={exportOnly}
                            onCheckedChange={(checked) => setExportOnly(checked as boolean)}
                          />
                          <div className="grid gap-1.5 leading-none">
                            <Label
                              htmlFor="export-only"
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              Export only (don&apos;t save to database)
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Perform the merge in memory and prepare for export without saving to the database.
                              Useful for one-time analysis or testing merge parameters.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="pt-6">
                {(mergeStatus === 'idle' || mergeStatus === 'error') && (
                !previewData ? (
                  <div className="space-y-4">
                    <div className="bg-muted/30 p-4 rounded-md">
                      <h3 className="font-medium mb-3">Merge Summary</h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                        <div>
                          <p className="text-sm text-muted-foreground">Merged Catalogue Name</p>
                          <p className="font-medium">{mergedName}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Estimated Events</p>
                          <p className="font-medium">{estimatedMergedEvents.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Selected Catalogues</p>
                          <p className="font-medium">{getSelectedCatalogues.length}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Merge Strategy</p>
                          <p className="font-medium">{MERGE_STRATEGY_LABELS[mergeStrategy] ?? mergeStrategy}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Time Threshold</p>
                          <p className="font-medium">{timeThreshold} seconds</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Distance Threshold</p>
                          <p className="font-medium">{distanceThreshold} km</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Field Rules</p>
                          <p className="font-medium" data-testid="summary-field-rules">
                            {(Object.keys(FIELD_RULE_TITLES) as FieldRuleName[])
                              .map(field => `${FIELD_RULE_TITLES[field]}: ${describeFieldRule(field)}`)
                              .join(' · ')}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Flagged Groups</p>
                          <p className="font-medium" data-testid="summary-on-conflict">{CONFLICT_LABELS[onConflict]}</p>
                        </div>
                      </div>
                    </div>

                    <div className="border rounded-md overflow-hidden">
                      <div className="bg-muted/50 px-4 py-2 text-sm font-medium">
                        Catalogues to be Merged
                      </div>
                      <div className="divide-y">
                        {getSelectedCatalogues.map((catalogue, index) => (
                          <div key={catalogue.id} className="flex items-center p-4">
                            <div className="flex-1">
                              <p className="font-medium">{catalogue.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {catalogue.event_count?.toLocaleString() || 0} events
                              </p>
                            </div>
                            {index < getSelectedCatalogues.length - 1 && (
                              <ArrowRightLeft className="h-5 w-5 text-muted-foreground mx-4" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Generate Preview Button */}
                    <div className="rounded-lg border bg-muted/30 p-6 text-center">
                      <h3 className="mb-2 font-medium">Quality-control preview</h3>
                      <p className="mb-4 text-sm text-muted-foreground">
                        Generate the QC preview to check the matched, flagged and kept-apart groups before merging.
                        The merge can be started once the preview is shown.
                      </p>
                      <Button
                        onClick={handleGeneratePreview}
                        disabled={isLoadingPreview || isReadOnly}
                        size="lg"
                      >
                        {isLoadingPreview ? 'Generating Preview...' : 'Generate QC Preview'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <MergePreviewQC
                    previewData={previewData}
                    holdForReview={onConflict === 'hold'}
                    strategy={mergeStrategy}
                    priority={priority}
                  />
                ))}

                {/* Progress Indicator — also kept mounted on error so the failed step stays visible */}
                {(mergeStatus === 'merging' || mergeStatus === 'error') && (
                  <MergeProgressIndicator
                    steps={mergeSteps}
                    currentStep={mergeSteps.findIndex(s => s.status === 'in-progress')}
                    progress={mergeProgress}
                    estimatedTimeRemaining={mergeStatus === 'merging' && mergeProgress < 100 ? ((100 - mergeProgress) / 5) * 0.3 : 0}
                  />
                )}

                {/* Held rows live in the saved catalogue; the review queue on its page resolves them. */}
                {mergeStatus === 'complete' && mergedCatalogueId && heldForReviewCount > 0 && (
                  <Alert className="mb-4 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <AlertTitle className="text-amber-900 dark:text-amber-200">
                      {heldForReviewCount.toLocaleString()} {heldForReviewCount === 1 ? 'event was' : 'events were'} held for review
                    </AlertTitle>
                    <AlertDescription className="text-amber-800 dark:text-amber-300">
                      Each holds a provisional solution until a reviewer keeps it or publishes one entry&apos;s solution instead.{' '}
                      <Link href={`/catalogues/${mergedCatalogueId}`} className="font-medium underline underline-offset-2">
                        Review {heldForReviewCount.toLocaleString()} held {heldForReviewCount === 1 ? 'event' : 'events'}
                      </Link>
                    </AlertDescription>
                  </Alert>
                )}

                {/* The QC summary of the merge as run (the stored one, for a saved catalogue). */}
                {mergeStatus === 'complete' && completedQc && (
                  <Card className="mb-4" data-testid="completed-merge-qc">
                    <CardHeader>
                      <CardTitle as="h3">Merge QC summary</CardTitle>
                      <CardDescription>
                        {mergedCatalogueId
                          ? 'Kept with the merged catalogue and shown on its page.'
                          : 'Export-only merge: download the summary now, it is not stored.'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <MergeQcSummaryView
                        summary={completedQc}
                        catalogueId={mergedCatalogueId}
                        fileBaseName={mergedName.trim() || 'merged_catalogue'}
                      />
                    </CardContent>
                  </Card>
                )}

                {mergeStatus === 'complete' && (
                  <MergeActions
                    events={mergedEvents}
                    onDownload={() => { }}
                    catalogueId={mergedCatalogueId}
                    catalogueMetadata={{
                      name: mergedName,
                      ...mergeMetadata,
                      merge_config: completedMerge?.config,
                      source_catalogues: completedMerge?.sourceCatalogues
                    }}
                  />
                )}

                {(mergeStatus === 'merging' || (mergeStatus !== 'complete' && !previewData)) && (
                  <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3 rounded-md">
                    <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                      Merging multiple catalogues may take several minutes depending on the size of the datasets.
                      The process cannot be interrupted once started.
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter className="flex justify-between border-t bg-muted/20 px-6 py-4">
            <Button
              variant="ghost"
              onClick={handlePreviousStep}
              disabled={activeTab === 'select' || mergeStatus === 'merging'}
            >
              Back
            </Button>
            <div className="flex gap-2">
              {activeTab === 'select' && (
                <Button
                  onClick={handleNextStep}
                  disabled={selectedCatalogues.length < 2}
                >
                  Configure Merge
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
              {activeTab === 'configure' && (
                <Button
                  onClick={handleNextStep}
                >
                  Preview Merge
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
              {activeTab === 'preview' && (
                <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                  {mergeNeedsPreview && (
                    <p id="start-merge-hint" className="text-sm text-muted-foreground">
                      {isLoadingPreview ? 'Generating the QC preview…' : 'Generate the QC preview first'}
                    </p>
                  )}
                  {renderMergeButton()}
                </div>
              )}
            </div>
          </CardFooter>
        </Card>

        <AlertDialog open={confirmMergeOpen} onOpenChange={setConfirmMergeOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Merge {getSelectedCatalogues.length} catalogues?</AlertDialogTitle>
              <AlertDialogDescription>
                This creates a new catalogue{mergedName.trim() ? <> named <strong>{mergedName.trim()}</strong></> : ''} from{' '}
                {getSelectedCatalogues.length} sources
                {previewStatistics
                  ? ` (${formatCount(previewStatistics.totalEventsAfter)} events, as in the QC preview).`
                  : ` (~${estimatedMergedEvents.toLocaleString()} events after combining matched entries).`}
                {previewStatistics && previewStatistics.suspiciousGroupsCount > 0 && (
                  // Held rows exist only in a saved catalogue; an export-only merge holds nothing.
                  onConflict === 'hold' && !exportOnly
                    ? ` ${formatCount(previewStatistics.suspiciousGroupsCount)} flagged ${previewStatistics.suspiciousGroupsCount === 1 ? 'group is' : 'groups are'} held for review.`
                    : ` ${formatCount(previewStatistics.suspiciousGroupsCount)} flagged ${previewStatistics.suspiciousGroupsCount === 1 ? 'group is' : 'groups are'} published with the strategy's solution.`
                )}
                {exportOnly
                  ? ' Export-only mode: nothing is written to the database.'
                  : ' The merged catalogue is written to the database and cannot be undone from here.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setConfirmMergeOpen(false);
                  executeMerge();
                }}
              >
                {exportOnly ? 'Merge for export' : 'Merge catalogues'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
