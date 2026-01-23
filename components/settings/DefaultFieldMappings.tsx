'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  Plus,
  Trash2,
  RotateCcw,
  Save,
  Search,
  ArrowRight,
  AlertTriangle,
  FileType,
  Database,
  HelpCircle,
  Download,
  Upload,
  Copy,
  Check,
  FileText,
  FileJson,
  Globe,
  Pencil,
} from 'lucide-react';
import {
  FIELD_DEFINITIONS,
  FIELD_CATEGORIES,
  FIELD_ALIASES,
  getFieldsByCategory,
  type FieldDefinition
} from '@/lib/field-definitions';

// Types for field mappings
export type FileFormat = 'csv' | 'json' | 'quakeml' | 'geojson';

export interface FieldMappingEntry {
  id: string;
  sourcePattern: string;
  targetField: string;
  isRegex: boolean;
  priority: number;
  description?: string;
}

export interface FormatMappingConfig {
  enabled: boolean;
  mappings: FieldMappingEntry[];
  description?: string;
}

export interface DefaultFieldMappingsConfig {
  autoDetectEnabled: boolean;
  strictValidation: boolean;
  fuzzyMatchThreshold: number;
  formats: Record<FileFormat, FormatMappingConfig>;
  customMappings: FieldMappingEntry[];
  lastUpdated?: string;
}

// Format-specific default mappings
const FORMAT_DEFAULT_MAPPINGS: Record<FileFormat, FieldMappingEntry[]> = {
  csv: [
    { id: 'csv-lat-1', sourcePattern: 'lat', targetField: 'latitude', isRegex: false, priority: 100, description: 'Standard latitude abbreviation' },
    { id: 'csv-lat-2', sourcePattern: 'Lat', targetField: 'latitude', isRegex: false, priority: 100, description: 'Capitalized latitude' },
    { id: 'csv-lat-3', sourcePattern: 'LATITUDE', targetField: 'latitude', isRegex: false, priority: 100, description: 'Uppercase latitude' },
    { id: 'csv-lat-4', sourcePattern: 'evla', targetField: 'latitude', isRegex: false, priority: 90, description: 'Event latitude (ISC format)' },
    { id: 'csv-lon-1', sourcePattern: 'lon', targetField: 'longitude', isRegex: false, priority: 100, description: 'Standard longitude abbreviation' },
    { id: 'csv-lon-2', sourcePattern: 'Lon', targetField: 'longitude', isRegex: false, priority: 100, description: 'Capitalized longitude' },
    { id: 'csv-lon-3', sourcePattern: 'lng', targetField: 'longitude', isRegex: false, priority: 100, description: 'Alternative longitude abbreviation' },
    { id: 'csv-lon-4', sourcePattern: 'long', targetField: 'longitude', isRegex: false, priority: 95, description: 'Long form abbreviation' },
    { id: 'csv-lon-5', sourcePattern: 'LONGITUDE', targetField: 'longitude', isRegex: false, priority: 100, description: 'Uppercase longitude' },
    { id: 'csv-lon-6', sourcePattern: 'evlo', targetField: 'longitude', isRegex: false, priority: 90, description: 'Event longitude (ISC format)' },
    { id: 'csv-dep-1', sourcePattern: 'dep', targetField: 'depth', isRegex: false, priority: 100, description: 'Standard depth abbreviation' },
    { id: 'csv-dep-2', sourcePattern: 'Depth', targetField: 'depth', isRegex: false, priority: 100, description: 'Capitalized depth' },
    { id: 'csv-dep-3', sourcePattern: 'depth_km', targetField: 'depth', isRegex: false, priority: 95, description: 'Depth with unit suffix' },
    { id: 'csv-dep-4', sourcePattern: 'evdp', targetField: 'depth', isRegex: false, priority: 90, description: 'Event depth (ISC format)' },
    { id: 'csv-mag-1', sourcePattern: 'mag', targetField: 'magnitude', isRegex: false, priority: 100, description: 'Standard magnitude abbreviation' },
    { id: 'csv-mag-2', sourcePattern: 'Mag', targetField: 'magnitude', isRegex: false, priority: 100, description: 'Capitalized magnitude' },
    { id: 'csv-mag-3', sourcePattern: 'MAGNITUDE', targetField: 'magnitude', isRegex: false, priority: 100, description: 'Uppercase magnitude' },
    { id: 'csv-mag-4', sourcePattern: 'prefmag', targetField: 'magnitude', isRegex: false, priority: 95, description: 'Preferred magnitude' },
    { id: 'csv-time-1', sourcePattern: 'time', targetField: 'time', isRegex: false, priority: 100, description: 'Standard time field' },
    { id: 'csv-time-2', sourcePattern: 'datetime', targetField: 'time', isRegex: false, priority: 100, description: 'DateTime field' },
    { id: 'csv-time-3', sourcePattern: 'origin_time', targetField: 'time', isRegex: false, priority: 95, description: 'Origin time field' },
    { id: 'csv-time-4', sourcePattern: 'origintime', targetField: 'time', isRegex: false, priority: 95, description: 'Concatenated origin time' },
    { id: 'csv-id-1', sourcePattern: 'eventid', targetField: 'id', isRegex: false, priority: 100, description: 'Event ID field' },
    { id: 'csv-id-2', sourcePattern: 'event_id', targetField: 'id', isRegex: false, priority: 100, description: 'Event ID with underscore' },
    { id: 'csv-id-3', sourcePattern: 'evid', targetField: 'id', isRegex: false, priority: 95, description: 'Event ID abbreviation' },
    { id: 'csv-id-4', sourcePattern: 'publicid', targetField: 'id', isRegex: false, priority: 90, description: 'Public ID field' },
    { id: 'csv-magtype-1', sourcePattern: 'magtype', targetField: 'magnitude_type', isRegex: false, priority: 100, description: 'Magnitude type field' },
    { id: 'csv-magtype-2', sourcePattern: 'mag_type', targetField: 'magnitude_type', isRegex: false, priority: 100, description: 'Magnitude type with underscore' },
    { id: 'csv-rms-1', sourcePattern: 'rms', targetField: 'standard_error', isRegex: false, priority: 100, description: 'RMS error field' },
    { id: 'csv-gap-1', sourcePattern: 'gap', targetField: 'azimuthal_gap', isRegex: false, priority: 100, description: 'Azimuthal gap field' },
    { id: 'csv-gap-2', sourcePattern: 'azgap', targetField: 'azimuthal_gap', isRegex: false, priority: 95, description: 'Azimuthal gap abbreviation' },
    { id: 'csv-nst-1', sourcePattern: 'nst', targetField: 'used_station_count', isRegex: false, priority: 100, description: 'Station count (USGS format)' },
    { id: 'csv-nph-1', sourcePattern: 'nph', targetField: 'used_phase_count', isRegex: false, priority: 100, description: 'Phase count field' },
    { id: 'csv-ndef-1', sourcePattern: 'ndef', targetField: 'used_phase_count', isRegex: false, priority: 95, description: 'Number of defining phases (ISC)' },
  ],
  json: [
    { id: 'json-lat-1', sourcePattern: 'lat', targetField: 'latitude', isRegex: false, priority: 100, description: 'Latitude in JSON' },
    { id: 'json-lat-2', sourcePattern: 'latitude', targetField: 'latitude', isRegex: false, priority: 100, description: 'Full latitude field' },
    { id: 'json-lon-1', sourcePattern: 'lon', targetField: 'longitude', isRegex: false, priority: 100, description: 'Longitude in JSON' },
    { id: 'json-lon-2', sourcePattern: 'longitude', targetField: 'longitude', isRegex: false, priority: 100, description: 'Full longitude field' },
    { id: 'json-lon-3', sourcePattern: 'lng', targetField: 'longitude', isRegex: false, priority: 95, description: 'Alternative longitude' },
    { id: 'json-dep-1', sourcePattern: 'depth', targetField: 'depth', isRegex: false, priority: 100, description: 'Depth field' },
    { id: 'json-mag-1', sourcePattern: 'mag', targetField: 'magnitude', isRegex: false, priority: 100, description: 'Magnitude field' },
    { id: 'json-mag-2', sourcePattern: 'magnitude', targetField: 'magnitude', isRegex: false, priority: 100, description: 'Full magnitude field' },
    { id: 'json-time-1', sourcePattern: 'time', targetField: 'time', isRegex: false, priority: 100, description: 'Time field' },
    { id: 'json-time-2', sourcePattern: 'originTime', targetField: 'time', isRegex: false, priority: 95, description: 'Origin time (camelCase)' },
    { id: 'json-time-3', sourcePattern: 'origin_time', targetField: 'time', isRegex: false, priority: 95, description: 'Origin time (snake_case)' },
    { id: 'json-id-1', sourcePattern: 'id', targetField: 'id', isRegex: false, priority: 100, description: 'ID field' },
    { id: 'json-id-2', sourcePattern: 'eventId', targetField: 'id', isRegex: false, priority: 95, description: 'Event ID (camelCase)' },
    { id: 'json-id-3', sourcePattern: 'publicID', targetField: 'id', isRegex: false, priority: 90, description: 'Public ID field' },
    { id: 'json-type-1', sourcePattern: 'type', targetField: 'event_type', isRegex: false, priority: 80, description: 'Event type field' },
    { id: 'json-type-2', sourcePattern: 'eventType', targetField: 'event_type', isRegex: false, priority: 95, description: 'Event type (camelCase)' },
    { id: 'json-magtype-1', sourcePattern: 'magType', targetField: 'magnitude_type', isRegex: false, priority: 100, description: 'Magnitude type (camelCase)' },
    { id: 'json-region-1', sourcePattern: 'place', targetField: 'region', isRegex: false, priority: 90, description: 'Place/region field' },
    { id: 'json-region-2', sourcePattern: 'region', targetField: 'region', isRegex: false, priority: 100, description: 'Region field' },
  ],
  quakeml: [
    { id: 'qml-lat-1', sourcePattern: 'origin.latitude.value', targetField: 'latitude', isRegex: false, priority: 100, description: 'QuakeML latitude path' },
    { id: 'qml-lon-1', sourcePattern: 'origin.longitude.value', targetField: 'longitude', isRegex: false, priority: 100, description: 'QuakeML longitude path' },
    { id: 'qml-dep-1', sourcePattern: 'origin.depth.value', targetField: 'depth', isRegex: false, priority: 100, description: 'QuakeML depth path' },
    { id: 'qml-time-1', sourcePattern: 'origin.time.value', targetField: 'time', isRegex: false, priority: 100, description: 'QuakeML time path' },
    { id: 'qml-mag-1', sourcePattern: 'magnitude.mag.value', targetField: 'magnitude', isRegex: false, priority: 100, description: 'QuakeML magnitude path' },
    { id: 'qml-id-1', sourcePattern: 'publicID', targetField: 'id', isRegex: false, priority: 100, description: 'QuakeML event public ID' },
    { id: 'qml-type-1', sourcePattern: 'type', targetField: 'event_type', isRegex: false, priority: 95, description: 'QuakeML event type' },
    { id: 'qml-magtype-1', sourcePattern: 'magnitude.type', targetField: 'magnitude_type', isRegex: false, priority: 100, description: 'QuakeML magnitude type' },
    { id: 'qml-laterr-1', sourcePattern: 'origin.latitude.uncertainty', targetField: 'latitude_uncertainty', isRegex: false, priority: 100, description: 'QuakeML latitude uncertainty' },
    { id: 'qml-lonerr-1', sourcePattern: 'origin.longitude.uncertainty', targetField: 'longitude_uncertainty', isRegex: false, priority: 100, description: 'QuakeML longitude uncertainty' },
    { id: 'qml-deperr-1', sourcePattern: 'origin.depth.uncertainty', targetField: 'depth_uncertainty', isRegex: false, priority: 100, description: 'QuakeML depth uncertainty' },
    { id: 'qml-timerr-1', sourcePattern: 'origin.time.uncertainty', targetField: 'time_uncertainty', isRegex: false, priority: 100, description: 'QuakeML time uncertainty' },
    { id: 'qml-gap-1', sourcePattern: 'origin.quality.azimuthalGap', targetField: 'azimuthal_gap', isRegex: false, priority: 100, description: 'QuakeML azimuthal gap' },
    { id: 'qml-rms-1', sourcePattern: 'origin.quality.standardError', targetField: 'standard_error', isRegex: false, priority: 100, description: 'QuakeML standard error' },
    { id: 'qml-nst-1', sourcePattern: 'origin.quality.usedStationCount', targetField: 'used_station_count', isRegex: false, priority: 100, description: 'QuakeML station count' },
    { id: 'qml-nph-1', sourcePattern: 'origin.quality.usedPhaseCount', targetField: 'used_phase_count', isRegex: false, priority: 100, description: 'QuakeML phase count' },
    { id: 'qml-evalmode-1', sourcePattern: 'origin.evaluationMode', targetField: 'evaluation_mode', isRegex: false, priority: 100, description: 'QuakeML evaluation mode' },
    { id: 'qml-evalstat-1', sourcePattern: 'origin.evaluationStatus', targetField: 'evaluation_status', isRegex: false, priority: 100, description: 'QuakeML evaluation status' },
  ],
  geojson: [
    { id: 'geo-lat-1', sourcePattern: 'geometry.coordinates[1]', targetField: 'latitude', isRegex: false, priority: 100, description: 'GeoJSON coordinate latitude' },
    { id: 'geo-lon-1', sourcePattern: 'geometry.coordinates[0]', targetField: 'longitude', isRegex: false, priority: 100, description: 'GeoJSON coordinate longitude' },
    { id: 'geo-dep-1', sourcePattern: 'geometry.coordinates[2]', targetField: 'depth', isRegex: false, priority: 100, description: 'GeoJSON coordinate depth' },
    { id: 'geo-dep-2', sourcePattern: 'properties.depth', targetField: 'depth', isRegex: false, priority: 95, description: 'GeoJSON properties depth' },
    { id: 'geo-mag-1', sourcePattern: 'properties.mag', targetField: 'magnitude', isRegex: false, priority: 100, description: 'GeoJSON properties magnitude' },
    { id: 'geo-time-1', sourcePattern: 'properties.time', targetField: 'time', isRegex: false, priority: 100, description: 'GeoJSON properties time' },
    { id: 'geo-id-1', sourcePattern: 'id', targetField: 'id', isRegex: false, priority: 100, description: 'GeoJSON feature ID' },
    { id: 'geo-id-2', sourcePattern: 'properties.id', targetField: 'id', isRegex: false, priority: 95, description: 'GeoJSON properties ID' },
    { id: 'geo-id-3', sourcePattern: 'properties.publicID', targetField: 'id', isRegex: false, priority: 90, description: 'GeoJSON public ID' },
    { id: 'geo-place-1', sourcePattern: 'properties.place', targetField: 'region', isRegex: false, priority: 100, description: 'GeoJSON place name' },
    { id: 'geo-type-1', sourcePattern: 'properties.type', targetField: 'event_type', isRegex: false, priority: 95, description: 'GeoJSON event type' },
    { id: 'geo-magtype-1', sourcePattern: 'properties.magType', targetField: 'magnitude_type', isRegex: false, priority: 100, description: 'GeoJSON magnitude type' },
    { id: 'geo-rms-1', sourcePattern: 'properties.rms', targetField: 'standard_error', isRegex: false, priority: 100, description: 'GeoJSON RMS error' },
    { id: 'geo-gap-1', sourcePattern: 'properties.gap', targetField: 'azimuthal_gap', isRegex: false, priority: 100, description: 'GeoJSON azimuthal gap' },
    { id: 'geo-nst-1', sourcePattern: 'properties.nst', targetField: 'used_station_count', isRegex: false, priority: 100, description: 'GeoJSON station count' },
    { id: 'geo-dmin-1', sourcePattern: 'properties.dmin', targetField: 'minimum_distance', isRegex: false, priority: 100, description: 'GeoJSON minimum distance' },
    { id: 'geo-status-1', sourcePattern: 'properties.status', targetField: 'evaluation_status', isRegex: false, priority: 90, description: 'GeoJSON review status' },
  ]
};

// Format descriptions
const FORMAT_INFO: Record<FileFormat, { name: string; description: string; icon: typeof FileText }> = {
  csv: { name: 'CSV/TXT', description: 'Comma-separated values and text files', icon: FileText },
  json: { name: 'JSON', description: 'JavaScript Object Notation files', icon: FileJson },
  quakeml: { name: 'QuakeML', description: 'QuakeML 1.2 XML standard format', icon: Database },
  geojson: { name: 'GeoJSON', description: 'Geographic JSON format (USGS/GeoNet)', icon: Globe }
};

// Default configuration
const DEFAULT_CONFIG: DefaultFieldMappingsConfig = {
  autoDetectEnabled: true,
  strictValidation: false,
  fuzzyMatchThreshold: 0.6,
  formats: {
    csv: { enabled: true, mappings: FORMAT_DEFAULT_MAPPINGS.csv, description: 'CSV/TXT file mappings' },
    json: { enabled: true, mappings: FORMAT_DEFAULT_MAPPINGS.json, description: 'JSON file mappings' },
    quakeml: { enabled: true, mappings: FORMAT_DEFAULT_MAPPINGS.quakeml, description: 'QuakeML 1.2 mappings' },
    geojson: { enabled: true, mappings: FORMAT_DEFAULT_MAPPINGS.geojson, description: 'GeoJSON file mappings' }
  },
  customMappings: []
};

interface DefaultFieldMappingsProps {
  onSave?: (config: DefaultFieldMappingsConfig) => void;
  readOnly?: boolean;
}

export function DefaultFieldMappings({ onSave, readOnly = false }: DefaultFieldMappingsProps) {
  const [config, setConfig] = useState<DefaultFieldMappingsConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFormat, setActiveFormat] = useState<FileFormat>('csv');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<string>('format-mappings');
  const [addMappingDialogOpen, setAddMappingDialogOpen] = useState(false);
  const [editMappingDialogOpen, setEditMappingDialogOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<FieldMappingEntry | null>(null);
  const [mappingContext, setMappingContext] = useState<'format' | 'custom'>('custom');
  const [newMapping, setNewMapping] = useState<Partial<FieldMappingEntry>>({
    sourcePattern: '',
    targetField: '',
    isRegex: false,
    priority: 75,
    description: ''
  });
  const [importExportDialogOpen, setImportExportDialogOpen] = useState(false);
  const [importExportMode, setImportExportMode] = useState<'import' | 'export'>('export');
  const [importData, setImportData] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/settings/field-mappings');
      if (response.ok) {
        const data = await response.json();
        setConfig({
          ...DEFAULT_CONFIG,
          ...data,
          formats: {
            ...DEFAULT_CONFIG.formats,
            ...(data.formats || {})
          }
        });
      } else if (response.status === 404) {
        setConfig(DEFAULT_CONFIG);
      }
    } catch (error) {
      console.error('Failed to load field mappings config:', error);
      setConfig(DEFAULT_CONFIG);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (readOnly) {
      toast({
        title: 'Admin access required',
        description: 'Log in with an Admin account to save settings.',
        variant: 'destructive'
      });
      return;
    }
    try {
      setSaving(true);
      const response = await fetch('/api/settings/field-mappings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, lastUpdated: new Date().toISOString() })
      });

      if (!response.ok) throw new Error('Failed to save');

      toast({ title: 'Settings saved', description: 'Field mapping configuration saved successfully' });
      setHasChanges(false);
      onSave?.(config);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save settings', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG);
    setHasChanges(true);
    toast({ title: 'Reset complete', description: 'Settings have been reset to defaults' });
  };

  const handleResetFormat = (format: FileFormat) => {
    setConfig(prev => ({
      ...prev,
      formats: {
        ...prev.formats,
        [format]: {
          ...prev.formats[format],
          mappings: FORMAT_DEFAULT_MAPPINGS[format]
        }
      }
    }));
    setHasChanges(true);
    toast({ title: 'Format reset', description: `${FORMAT_INFO[format].name} mappings reset to defaults` });
  };

  const addMapping = (context: 'format' | 'custom', format?: FileFormat) => {
    if (!newMapping.sourcePattern || !newMapping.targetField) {
      toast({ title: 'Error', description: 'Source pattern and target field are required', variant: 'destructive' });
      return;
    }

    const mapping: FieldMappingEntry = {
      id: `${context}-${Date.now()}`,
      sourcePattern: newMapping.sourcePattern!,
      targetField: newMapping.targetField!,
      isRegex: newMapping.isRegex || false,
      priority: newMapping.priority || 75,
      description: newMapping.description || ''
    };

    if (context === 'format' && format) {
      const existingMapping = config.formats[format].mappings.find(
        m => m.sourcePattern.toLowerCase() === newMapping.sourcePattern?.toLowerCase()
      );
      if (existingMapping) {
        toast({ title: 'Duplicate mapping', description: `A mapping for "${newMapping.sourcePattern}" already exists`, variant: 'destructive' });
        return;
      }

      setConfig(prev => ({
        ...prev,
        formats: {
          ...prev.formats,
          [format]: {
            ...prev.formats[format],
            mappings: [...prev.formats[format].mappings, mapping]
          }
        }
      }));
    } else {
      const existingMapping = config.customMappings.find(
        m => m.sourcePattern.toLowerCase() === newMapping.sourcePattern?.toLowerCase()
      );
      if (existingMapping) {
        toast({ title: 'Duplicate mapping', description: `A mapping for "${newMapping.sourcePattern}" already exists`, variant: 'destructive' });
        return;
      }

      setConfig(prev => ({
        ...prev,
        customMappings: [...prev.customMappings, mapping]
      }));
    }

    setNewMapping({ sourcePattern: '', targetField: '', isRegex: false, priority: 75, description: '' });
    setAddMappingDialogOpen(false);
    setHasChanges(true);
  };

  const removeMapping = (id: string, context: 'format' | 'custom', format?: FileFormat) => {
    if (context === 'format' && format) {
      setConfig(prev => ({
        ...prev,
        formats: {
          ...prev.formats,
          [format]: {
            ...prev.formats[format],
            mappings: prev.formats[format].mappings.filter(m => m.id !== id)
          }
        }
      }));
    } else {
      setConfig(prev => ({
        ...prev,
        customMappings: prev.customMappings.filter(m => m.id !== id)
      }));
    }
    setHasChanges(true);
  };

  const updateMapping = (id: string, updates: Partial<FieldMappingEntry>, context: 'format' | 'custom', format?: FileFormat) => {
    if (context === 'format' && format) {
      setConfig(prev => ({
        ...prev,
        formats: {
          ...prev.formats,
          [format]: {
            ...prev.formats[format],
            mappings: prev.formats[format].mappings.map(m =>
              m.id === id ? { ...m, ...updates } : m
            )
          }
        }
      }));
    } else {
      setConfig(prev => ({
        ...prev,
        customMappings: prev.customMappings.map(m =>
          m.id === id ? { ...m, ...updates } : m
        )
      }));
    }
    setHasChanges(true);
  };

  const openEditDialog = (mapping: FieldMappingEntry, context: 'format' | 'custom') => {
    setEditingMapping({ ...mapping });
    setMappingContext(context);
    setEditMappingDialogOpen(true);
  };

  const saveEditedMapping = () => {
    if (!editingMapping) return;
    if (mappingContext === 'format') {
      updateMapping(editingMapping.id, editingMapping, 'format', activeFormat);
    } else {
      updateMapping(editingMapping.id, editingMapping, 'custom');
    }
    setEditMappingDialogOpen(false);
    setEditingMapping(null);
  };

  const getFilteredFields = useCallback(() => {
    let fields = activeCategory === 'all' ? FIELD_DEFINITIONS : getFieldsByCategory(activeCategory);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      fields = fields.filter(f =>
        f.id.toLowerCase().includes(term) ||
        f.name.toLowerCase().includes(term) ||
        f.description.toLowerCase().includes(term)
      );
    }
    return fields;
  }, [activeCategory, searchTerm]);

  const getFilteredMappings = useCallback((mappings: FieldMappingEntry[]) => {
    if (!searchTerm) return mappings;
    const term = searchTerm.toLowerCase();
    return mappings.filter(m =>
      m.sourcePattern.toLowerCase().includes(term) ||
      m.targetField.toLowerCase().includes(term) ||
      (m.description?.toLowerCase().includes(term))
    );
  }, [searchTerm]);

  const getDuplicateTargets = useCallback(() => {
    const targetCounts: Record<string, number> = {};
    for (const format of Object.keys(config.formats) as FileFormat[]) {
      if (config.formats[format].enabled) {
        for (const mapping of config.formats[format].mappings) {
          targetCounts[mapping.targetField] = (targetCounts[mapping.targetField] || 0) + 1;
        }
      }
    }
    for (const mapping of config.customMappings) {
      targetCounts[mapping.targetField] = (targetCounts[mapping.targetField] || 0) + 1;
    }
    return Object.entries(targetCounts).filter(([_, count]) => count > 1).map(([target]) => target);
  }, [config]);

  const duplicateTargets = getDuplicateTargets();

  const handleExport = () => {
    const exportData = JSON.stringify(config, null, 2);
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `field-mappings-config-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'Export complete', description: 'Configuration exported successfully' });
  };

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: 'Copied', description: 'Configuration copied to clipboard' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to copy to clipboard', variant: 'destructive' });
    }
  };

  const handleImport = () => {
    try {
      const imported = JSON.parse(importData);
      if (typeof imported.autoDetectEnabled !== 'boolean') {
        throw new Error('Invalid configuration: missing autoDetectEnabled');
      }
      setConfig({
        ...DEFAULT_CONFIG,
        ...imported,
        formats: { ...DEFAULT_CONFIG.formats, ...imported.formats }
      });
      setImportExportDialogOpen(false);
      setImportData('');
      setHasChanges(true);
      toast({ title: 'Import successful', description: 'Configuration imported successfully' });
    } catch (error) {
      toast({ title: 'Import failed', description: 'Invalid configuration format', variant: 'destructive' });
    }
  };

  const getMappingsForField = useCallback((fieldId: string) => {
    const mappings: { source: string; format: FileFormat | 'custom'; priority: number }[] = [];
    for (const format of Object.keys(config.formats) as FileFormat[]) {
      if (config.formats[format].enabled) {
        for (const mapping of config.formats[format].mappings) {
          if (mapping.targetField === fieldId) {
            mappings.push({ source: mapping.sourcePattern, format, priority: mapping.priority });
          }
        }
      }
    }
    for (const mapping of config.customMappings) {
      if (mapping.targetField === fieldId) {
        mappings.push({ source: mapping.sourcePattern, format: 'custom', priority: mapping.priority });
      }
    }
    return mappings.sort((a, b) => b.priority - a.priority);
  }, [config]);

  const getFormatStats = (format: FileFormat) => {
    const mappings = config.formats[format].mappings;
    const targetFields = new Set(mappings.map(m => m.targetField));
    const requiredFields = FIELD_DEFINITIONS.filter(f => f.required);
    const mappedRequired = requiredFields.filter(f => targetFields.has(f.id));
    return {
      total: mappings.length,
      uniqueTargets: targetFields.size,
      mappedRequired: mappedRequired.length,
      totalRequired: requiredFields.length
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const wrapWithReadOnlyTooltip = (action: JSX.Element) => {
    if (!readOnly) return action;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{action}</span>
        </TooltipTrigger>
        <TooltipContent>Admin access required to modify settings.</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium">Default Field Mappings</h3>
            <p className="text-sm text-muted-foreground">
              Configure how fields from different formats map to the standardized schema
            </p>
          </div>
          <div className="flex items-center gap-2">
            {wrapWithReadOnlyTooltip(
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setImportExportMode('export'); setImportExportDialogOpen(true); }}
                disabled={readOnly}
              >
                <Download className="h-4 w-4 mr-2" />Export
              </Button>
            )}
            {wrapWithReadOnlyTooltip(
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setImportExportMode('import'); setImportExportDialogOpen(true); }}
                disabled={readOnly}
              >
                <Upload className="h-4 w-4 mr-2" />Import
              </Button>
            )}
            {wrapWithReadOnlyTooltip(
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={readOnly}>
                    <RotateCcw className="h-4 w-4 mr-2" />Reset All
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset to default mappings?</AlertDialogTitle>
                    <AlertDialogDescription>This will replace all your custom mappings with the defaults.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleReset}>Reset</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {wrapWithReadOnlyTooltip(
              <Button onClick={handleSave} disabled={readOnly || saving || !hasChanges}>
                <Save className="h-4 w-4 mr-2" />{saving ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
          </div>
        </div>

        <div className={readOnly ? 'pointer-events-none opacity-60 space-y-6' : 'space-y-6'}>
        {hasChanges && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-sm text-amber-700 dark:text-amber-400">You have unsaved changes</span>
          </div>
        )}

        {duplicateTargets.length > 0 && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span className="text-sm text-red-700 dark:text-red-400">
              Warning: Multiple mappings to same target: {duplicateTargets.join(', ')}
            </span>
          </div>
        )}

        {/* Global settings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Global Settings</CardTitle>
            <CardDescription>Configure auto-detection behavior for all file formats</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-detect" className="text-base">Auto-detect Field Mappings</Label>
                  <p className="text-sm text-muted-foreground">Automatically detect and suggest field mappings during upload</p>
                </div>
                <Switch
                  id="auto-detect"
                  checked={config.autoDetectEnabled}
                  onCheckedChange={(checked) => { setConfig(prev => ({ ...prev, autoDetectEnabled: checked })); setHasChanges(true); }}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <Label htmlFor="strict-validation" className="text-base">Strict Schema Validation</Label>
                  <p className="text-sm text-muted-foreground">Enforce strict validation for required fields</p>
                </div>
                <Switch
                  id="strict-validation"
                  checked={config.strictValidation}
                  onCheckedChange={(checked) => { setConfig(prev => ({ ...prev, strictValidation: checked })); setHasChanges(true); }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Fuzzy Match Threshold</Label>
                <span className="text-sm font-mono bg-muted px-2 py-1 rounded">{(config.fuzzyMatchThreshold * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.4"
                max="1.0"
                step="0.05"
                value={config.fuzzyMatchThreshold}
                onChange={(e) => { setConfig(prev => ({ ...prev, fuzzyMatchThreshold: parseFloat(e.target.value) })); setHasChanges(true); }}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">Minimum similarity for fuzzy matching (higher = stricter)</p>
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* Main tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="format-mappings">Format-Specific Mappings</TabsTrigger>
            <TabsTrigger value="field-overview">Field Overview</TabsTrigger>
            <TabsTrigger value="custom-mappings">Custom Mappings</TabsTrigger>
          </TabsList>

          {/* Format-specific mappings */}
          <TabsContent value="format-mappings" className="mt-4 space-y-4">
            <Tabs value={activeFormat} onValueChange={(v) => setActiveFormat(v as FileFormat)}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <TabsList>
                  {(Object.keys(FORMAT_INFO) as FileFormat[]).map(format => {
                    const FormatIcon = FORMAT_INFO[format].icon;
                    return (
                      <TabsTrigger key={format} value={format} className="flex items-center gap-2">
                        <FormatIcon className="h-4 w-4" />{FORMAT_INFO[format].name}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-[200px]" />
                  </div>
                  <Button size="sm" onClick={() => { setMappingContext('format'); setAddMappingDialogOpen(true); }}>
                    <Plus className="h-4 w-4 mr-2" />Add Mapping
                  </Button>
                </div>
              </div>

              {(Object.keys(FORMAT_INFO) as FileFormat[]).map(format => {
                const stats = getFormatStats(format);
                const FormatIcon = FORMAT_INFO[format].icon;

                return (
                  <TabsContent key={format} value={format} className="mt-4">
                    <Card className="mb-4">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-lg"><FormatIcon className="h-5 w-5 text-primary" /></div>
                            <div>
                              <CardTitle className="text-base">{FORMAT_INFO[format].name}</CardTitle>
                              <CardDescription>{FORMAT_INFO[format].description}</CardDescription>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={config.formats[format].enabled}
                              onCheckedChange={(checked) => {
                                setConfig(prev => ({
                                  ...prev,
                                  formats: { ...prev.formats, [format]: { ...prev.formats[format], enabled: checked } }
                                }));
                                setHasChanges(true);
                              }}
                            />
                            <span className="text-sm text-muted-foreground">{config.formats[format].enabled ? 'Enabled' : 'Disabled'}</span>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-4 text-sm">
                          <Badge variant="secondary">{stats.total} mappings</Badge>
                          <Badge variant="secondary">{stats.uniqueTargets} target fields</Badge>
                          <Badge variant={stats.mappedRequired === stats.totalRequired ? 'default' : 'destructive'}>
                            {stats.mappedRequired}/{stats.totalRequired} required fields
                          </Badge>
                          <div className="flex-1" />
                          <Button variant="ghost" size="sm" onClick={() => handleResetFormat(format)}>
                            <RotateCcw className="h-4 w-4 mr-2" />Reset
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {!config.formats[format].enabled ? (
                      <div className="text-center py-8 text-muted-foreground border rounded-lg">
                        <FileType className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>Format disabled. Enable it to configure mappings.</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[400px] border rounded-lg">
                        <div className="p-4 space-y-2">
                          {getFilteredMappings(config.formats[format].mappings).length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                              {searchTerm ? 'No mappings match your search' : 'No mappings configured'}
                            </div>
                          ) : (
                            getFilteredMappings(config.formats[format].mappings).map(mapping => {
                              const targetField = FIELD_DEFINITIONS.find(f => f.id === mapping.targetField);
                              const isDuplicate = duplicateTargets.includes(mapping.targetField);

                              return (
                                <div
                                  key={mapping.id}
                                  className={`flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 ${isDuplicate ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20' : ''}`}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded truncate max-w-[200px]">{mapping.sourcePattern}</code>
                                      <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                      <span className="font-medium truncate">{targetField?.name || mapping.targetField}</span>
                                      {targetField?.required && <Badge variant="destructive" className="text-[10px] flex-shrink-0">Required</Badge>}
                                    </div>
                                    {mapping.description && <p className="text-xs text-muted-foreground mt-1 truncate">{mapping.description}</p>}
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <Badge variant={mapping.isRegex ? 'default' : 'outline'} className="text-xs">{mapping.isRegex ? 'Regex' : 'Exact'}</Badge>
                                    <Badge variant="secondary" className="text-xs">P:{mapping.priority}</Badge>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(mapping, 'format')}>
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Edit</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeMapping(mapping.id, 'format', format)}>
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Remove</TooltipContent>
                                    </Tooltip>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </ScrollArea>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          </TabsContent>

          {/* Field overview */}
          <TabsContent value="field-overview" className="mt-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search fields..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant={activeCategory === 'all' ? 'default' : 'outline'} onClick={() => setActiveCategory('all')}>All</Button>
                {FIELD_CATEGORIES.map(category => (
                  <Button key={category.id} size="sm" variant={activeCategory === category.id ? 'default' : 'outline'} onClick={() => setActiveCategory(category.id)}>
                    {category.name}
                  </Button>
                ))}
              </div>
            </div>

            <ScrollArea className="h-[500px] pr-4">
              <Accordion type="multiple" defaultValue={FIELD_CATEGORIES.map(c => c.id)} className="space-y-2">
                {FIELD_CATEGORIES.map(category => {
                  const categoryFields = getFilteredFields().filter(f => f.category === category.id);
                  if (categoryFields.length === 0) return null;

                  return (
                    <AccordionItem key={category.id} value={category.id} className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{category.name}</span>
                          <Badge variant="secondary">{categoryFields.length} fields</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3 pt-2">
                          {categoryFields.map(field => {
                            const fieldMappings = getMappingsForField(field.id);
                            const aliases = FIELD_ALIASES[field.id];

                            return (
                              <Card key={field.id}>
                                <CardHeader className="pb-2">
                                  <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <CardTitle className="text-base">{field.name}</CardTitle>
                                        {field.required && <Badge variant="destructive" className="text-[10px]">Required</Badge>}
                                        <Badge variant="outline" className="text-[10px]">{field.type}</Badge>
                                        {field.unit && <Badge variant="secondary" className="text-[10px]">{field.unit}</Badge>}
                                      </div>
                                      <CardDescription>{field.description}</CardDescription>
                                    </div>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8"><HelpCircle className="h-4 w-4" /></Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="left" className="max-w-xs">
                                        <div className="space-y-2">
                                          <p className="font-medium">Field ID: {field.id}</p>
                                          {field.quakemlPath && <p className="text-xs">QuakeML: {field.quakemlPath}</p>}
                                          {field.validation && (
                                            <div className="text-xs">
                                              {field.validation.min !== undefined && <p>Min: {field.validation.min}</p>}
                                              {field.validation.max !== undefined && <p>Max: {field.validation.max}</p>}
                                              {field.validation.enum && <p>Values: {field.validation.enum.slice(0, 5).join(', ')}...</p>}
                                            </div>
                                          )}
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                  {field.example && (
                                    <div className="flex items-center gap-2 text-sm">
                                      <span className="text-muted-foreground">Example:</span>
                                      <code className="bg-muted px-2 py-0.5 rounded text-xs">{field.example}</code>
                                    </div>
                                  )}

                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                      <ArrowRight className="h-4 w-4" />
                                      <span>Active mappings ({fieldMappings.length}):</span>
                                    </div>
                                    {fieldMappings.length === 0 ? (
                                      <p className="text-sm text-muted-foreground italic pl-6">No mappings configured</p>
                                    ) : (
                                      <div className="flex flex-wrap gap-1 pl-6">
                                        {fieldMappings.slice(0, 10).map((m, idx) => (
                                          <Badge key={idx} variant="outline" className="text-xs">
                                            {m.source} <span className="text-muted-foreground ml-1">({m.format === 'custom' ? 'custom' : m.format.toUpperCase()})</span>
                                          </Badge>
                                        ))}
                                        {fieldMappings.length > 10 && <Badge variant="outline" className="text-xs">+{fieldMappings.length - 10} more</Badge>}
                                      </div>
                                    )}
                                  </div>

                                  {aliases && (
                                    <div className="space-y-2 pt-2 border-t">
                                      <p className="text-xs text-muted-foreground">Built-in aliases (auto-detection):</p>
                                      <div className="flex flex-wrap gap-1">
                                        {[...aliases.exactMatches, ...aliases.aliases].slice(0, 12).map((alias, idx) => (
                                          <Badge key={idx} variant="secondary" className="text-[10px]">{alias}</Badge>
                                        ))}
                                        {([...aliases.exactMatches, ...aliases.aliases].length > 12) && (
                                          <Badge variant="secondary" className="text-[10px]">+{[...aliases.exactMatches, ...aliases.aliases].length - 12} more</Badge>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </ScrollArea>
          </TabsContent>

          {/* Custom mappings */}
          <TabsContent value="custom-mappings" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Custom Field Mappings</CardTitle>
                    <CardDescription>Add custom mappings that apply across all formats with highest priority</CardDescription>
                  </div>
                  <Button onClick={() => { setMappingContext('custom'); setAddMappingDialogOpen(true); }}>
                    <Plus className="h-4 w-4 mr-2" />Add Custom Mapping
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {config.customMappings.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
                    <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="mb-2">No custom mappings configured</p>
                    <p className="text-xs">Custom mappings take precedence over format-specific defaults</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {config.customMappings.map(mapping => {
                        const targetField = FIELD_DEFINITIONS.find(f => f.id === mapping.targetField);
                        return (
                          <div key={mapping.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded truncate max-w-[200px]">{mapping.sourcePattern}</code>
                                <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <span className="font-medium truncate">{targetField?.name || mapping.targetField}</span>
                                {targetField?.required && <Badge variant="destructive" className="text-[10px] flex-shrink-0">Required</Badge>}
                              </div>
                              {mapping.description && <p className="text-xs text-muted-foreground mt-1 truncate">{mapping.description}</p>}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Badge variant={mapping.isRegex ? 'default' : 'outline'} className="text-xs">{mapping.isRegex ? 'Regex' : 'Exact'}</Badge>
                              <Badge variant="secondary" className="text-xs">P:{mapping.priority}</Badge>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(mapping, 'custom')}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeMapping(mapping.id, 'custom')}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Remove</TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add Mapping Dialog */}
        <Dialog open={addMappingDialogOpen} onOpenChange={setAddMappingDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Field Mapping</DialogTitle>
              <DialogDescription>
                Create a new mapping from a source field to a target schema field
                {mappingContext === 'format' && ` for ${FORMAT_INFO[activeFormat].name} files`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Source Field Pattern</Label>
                <Input placeholder="e.g., lat, latitude, Lat" value={newMapping.sourcePattern || ''} onChange={(e) => setNewMapping(prev => ({ ...prev, sourcePattern: e.target.value }))} />
                <p className="text-xs text-muted-foreground">The field name pattern to match in uploaded files</p>
              </div>
              <div className="space-y-2">
                <Label>Target Field</Label>
                <Select value={newMapping.targetField || ''} onValueChange={(value) => setNewMapping(prev => ({ ...prev, targetField: value }))}>
                  <SelectTrigger><SelectValue placeholder="Select target field" /></SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {FIELD_CATEGORIES.map(category => (
                      <SelectGroup key={category.id}>
                        <SelectLabel>{category.name}</SelectLabel>
                        {getFieldsByCategory(category.id).map(field => (
                          <SelectItem key={field.id} value={field.id}>
                            <div className="flex items-center gap-2">
                              <span>{field.name}</span>
                              {field.required && <Badge variant="destructive" className="text-[10px] px-1 py-0">Required</Badge>}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Input placeholder="Brief description" value={newMapping.description || ''} onChange={(e) => setNewMapping(prev => ({ ...prev, description: e.target.value }))} />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch id="is-regex" checked={newMapping.isRegex || false} onCheckedChange={(checked) => setNewMapping(prev => ({ ...prev, isRegex: checked }))} />
                  <Label htmlFor="is-regex">Use regex pattern</Label>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Priority (1-100)</Label>
                <Input type="number" min="1" max="100" value={newMapping.priority || 75} onChange={(e) => setNewMapping(prev => ({ ...prev, priority: parseInt(e.target.value) }))} />
                <p className="text-xs text-muted-foreground">Higher priority mappings are checked first (100 = highest)</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddMappingDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => addMapping(mappingContext, mappingContext === 'format' ? activeFormat : undefined)}>Add Mapping</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Mapping Dialog */}
        <Dialog open={editMappingDialogOpen} onOpenChange={setEditMappingDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Field Mapping</DialogTitle>
              <DialogDescription>Modify the mapping configuration</DialogDescription>
            </DialogHeader>
            {editingMapping && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Source Field Pattern</Label>
                  <Input value={editingMapping.sourcePattern} onChange={(e) => setEditingMapping(prev => prev ? { ...prev, sourcePattern: e.target.value } : null)} />
                </div>
                <div className="space-y-2">
                  <Label>Target Field</Label>
                  <Select value={editingMapping.targetField} onValueChange={(value) => setEditingMapping(prev => prev ? { ...prev, targetField: value } : null)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {FIELD_CATEGORIES.map(category => (
                        <SelectGroup key={category.id}>
                          <SelectLabel>{category.name}</SelectLabel>
                          {getFieldsByCategory(category.id).map(field => (
                            <SelectItem key={field.id} value={field.id}>
                              <div className="flex items-center gap-2">
                                <span>{field.name}</span>
                                {field.required && <Badge variant="destructive" className="text-[10px] px-1 py-0">Required</Badge>}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input value={editingMapping.description || ''} onChange={(e) => setEditingMapping(prev => prev ? { ...prev, description: e.target.value } : null)} />
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={editingMapping.isRegex} onCheckedChange={(checked) => setEditingMapping(prev => prev ? { ...prev, isRegex: checked } : null)} />
                    <Label>Use regex pattern</Label>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Priority (1-100)</Label>
                  <Input type="number" min="1" max="100" value={editingMapping.priority} onChange={(e) => setEditingMapping(prev => prev ? { ...prev, priority: parseInt(e.target.value) } : null)} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditMappingDialogOpen(false)}>Cancel</Button>
              <Button onClick={saveEditedMapping}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Import/Export Dialog */}
        <Dialog open={importExportDialogOpen} onOpenChange={setImportExportDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{importExportMode === 'export' ? 'Export' : 'Import'} Configuration</DialogTitle>
              <DialogDescription>
                {importExportMode === 'export' ? 'Download or copy your field mapping configuration' : 'Paste a configuration JSON to import'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {importExportMode === 'export' ? (
                <>
                  <Textarea value={JSON.stringify(config, null, 2)} readOnly className="font-mono text-xs h-[300px]" />
                  <div className="flex gap-2">
                    <Button onClick={handleExport} className="flex-1"><Download className="h-4 w-4 mr-2" />Download</Button>
                    <Button variant="outline" onClick={handleCopyToClipboard} className="flex-1">
                      {copied ? <><Check className="h-4 w-4 mr-2" />Copied!</> : <><Copy className="h-4 w-4 mr-2" />Copy</>}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Textarea value={importData} onChange={(e) => setImportData(e.target.value)} placeholder="Paste configuration JSON here..." className="font-mono text-xs h-[300px]" />
                  <Button onClick={handleImport} disabled={!importData.trim()}><Upload className="h-4 w-4 mr-2" />Import Configuration</Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>
    </TooltipProvider>
  );
}
