'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Switch } from '@/components/ui/switch';
import {
  ArrowRight,
  AlertTriangle,
  Loader2,
  Save,
  FolderOpen,
  Trash2,
  Check,
  ChevronsUpDown,
  Info,
  Settings,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  FIELD_ALIASES,
  FIELD_CATEGORIES,
  DO_NOT_MAP,
  getFieldById,
  getFieldsByCategory,
  detectAllFieldMappings,
  describeParserColumns,
  detectFieldMapping,
  isMappableTargetField,
  magnitudeScaleFromColumnName,
  missingRequiredFields,
  resolveParserFieldSources,
  type CustomFieldMapping,
} from '@/lib/field-definitions';
import type { DefaultFieldMappingsConfig, FileFormat } from '@/components/settings/DefaultFieldMappings';

// Flat focal-mechanism columns that are auto-assembled into focal_mechanisms JSON
// by the parser — they don't need individual schema mapping.
const FM_AUTO_COLUMNS = new Set([
  'strike1', 'dip1', 'rake1', 'strike2', 'dip2', 'rake2',
  'Strike1', 'Dip1', 'Rake1', 'Strike2', 'Dip2', 'Rake2',
  'Mxx', 'Mxy', 'Mxz', 'Myy', 'Myz', 'Mzz',
  'mxx', 'mxy', 'mxz', 'myy', 'myz', 'mzz',
  'Tva', 'Tpl', 'Taz', 'Nva', 'Npl', 'Naz', 'Pva', 'Ppl', 'Paz',
  'tva', 'tpl', 'taz', 'nva', 'npl', 'naz', 'pva', 'ppl', 'paz',
  'DC', 'dc', 'VR', 'vr', 'Mo', 'mo',
]);

// Targets a raw column can be mapped to that have no schema definition of their own.
const OTHER_MAPPABLE_TARGETS = Object.keys(FIELD_ALIASES)
  .filter(id => !getFieldById(id) && isMappableTargetField(id));

const MAGNITUDE_CODE_VALUE = /^m[a-z0-9_]{0,5}$/i;

interface EnhancedSchemaMapperProps {
  validationResults: any;
  isProcessing: boolean;
  onSchemaReady: (isReady: boolean) => void;
  /**
   * Explicit changes to the parser's column resolution, column -> target, with ''
   * meaning "do not map". Columns not listed keep what the parser stored for them.
   */
  onMappingsChange?: (mappings: Record<string, string>) => void;
  /**
   * The explicit mapping reported earlier (the tab is unmounted while another step is
   * shown), so returning to this step keeps the user's changes.
   */
  initialMappings?: Record<string, string>;
  /** Overrides the format read from each file's result when choosing Settings rules. */
  fileFormat?: FileFormat;
  readOnly?: boolean;
}

interface MappingTemplate {
  id: string;
  name: string;
  description?: string;
  mappings: Record<string, string>;
  created_at: string;
  updated_at: string;
}

interface MapperFile {
  fileName: string;
  format: FileFormat;
  isQuakeML: boolean;
  fields: string[];
  parserSources: Record<string, string>;
  roles: ReturnType<typeof describeParserColumns>;
  sampleValues: Record<string, string[]>;
}

/** Upload format label ('CSV', 'GEOJSON', 'QML' ...) -> Settings format tab. */
function toFileFormat(format: unknown): FileFormat {
  const value = String(format ?? '').toLowerCase();
  if (value === 'json') return 'json';
  if (value === 'geojson') return 'geojson';
  if (value === 'xml' || value === 'qml' || value === 'quakeml') return 'quakeml';
  return 'csv';
}

function sampleValuesFor(result: any, fields: string[]): Record<string, string[]> {
  const events: any[] = Array.isArray(result?.previewEvents) ? result.previewEvents
    : Array.isArray(result?.events) ? result.events : [];
  const samples: Record<string, string[]> = {};
  for (const field of fields) {
    const values: string[] = [];
    for (const event of events) {
      // The cell as the file wrote it: the parser keeps cells it rewrote in `_raw`.
      const raw = event?._raw && typeof event._raw === 'object' ? event._raw : null;
      const value = raw && Object.prototype.hasOwnProperty.call(raw, field) ? raw[field] : event?.[field];
      if (value === undefined || value === null || value === '' || typeof value === 'object') continue;
      const text = String(value);
      if (!values.includes(text)) values.push(text);
      if (values.length >= 3) break;
    }
    samples[field] = values;
  }
  return samples;
}

/** Settings rules that apply to one file's format (custom rules rank above format rules). */
function settingsRulesFor(config: DefaultFieldMappingsConfig | null, format: FileFormat): CustomFieldMapping[] {
  if (!config) return [];
  const rules: CustomFieldMapping[] = [];
  const custom = Array.isArray(config.customMappings) ? config.customMappings : [];
  for (const mapping of custom) {
    rules.push({ ...mapping, priority: (Number(mapping?.priority) || 0) + 100 });
  }
  const formatConfig = config.formats?.[format];
  if (formatConfig?.enabled && Array.isArray(formatConfig.mappings)) {
    for (const mapping of formatConfig.mappings) {
      rules.push({ ...mapping, priority: Number(mapping?.priority) || 0 });
    }
  }
  return rules;
}

export function EnhancedSchemaMapper({
  validationResults,
  isProcessing,
  onSchemaReady,
  onMappingsChange,
  initialMappings,
  fileFormat,
  readOnly = false
}: EnhancedSchemaMapperProps) {
  // Explicit edits made on this screen (column -> target, '' = do not map)
  const [userMappings, setUserMappings] = useState<Record<string, string>>(() => ({ ...(initialMappings ?? {}) }));
  // Explicit Settings rules and exact alias matches for columns the parser left unmapped
  const [autoMappings, setAutoMappings] = useState<Record<string, string>>({});
  const [autoMappingSources, setAutoMappingSources] = useState<Record<string, 'settings' | 'alias'>>({});
  // Similarity guesses: shown to the user, never applied without a click
  const [suggestions, setSuggestions] = useState<Record<string, { target: string; confidence: number }>>({});
  const [autoMapping, setAutoMapping] = useState(true);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [templates, setTemplates] = useState<MappingTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['basic']);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  const [mappingDropdownOpen, setMappingDropdownOpen] = useState<string | null>(null);
  const [mappingSearch, setMappingSearch] = useState('');
  const [savedMappingConfig, setSavedMappingConfig] = useState<DefaultFieldMappingsConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Load saved field mapping configuration
  useEffect(() => {
    loadSavedMappingConfig();
    loadTemplates();
  }, []);

  const loadSavedMappingConfig = async () => {
    try {
      const response = await fetch('/api/settings/field-mappings');
      if (response.ok) {
        const config = await response.json();
        if (config && typeof config === 'object') setSavedMappingConfig(config);
      }
    } catch (error) {
      console.error('Failed to load saved mapping config:', error);
    } finally {
      setConfigLoaded(true);
    }
  };

  // Every uploaded file, with the parser's own column resolution. QuakeML files carry
  // the standard QuakeML structure and have no columns to map.
  const files: MapperFile[] = useMemo(() => {
    if (!Array.isArray(validationResults)) return [];
    return validationResults.map((result: any) => {
      const fields: string[] = Array.isArray(result?.fields)
        ? result.fields.filter((field: unknown): field is string => typeof field === 'string')
        : [];
      const format = fileFormat ?? toFileFormat(result?.format);
      const parserSources = resolveParserFieldSources(fields, result?.resolvedFieldSources);
      return {
        fileName: String(result?.fileName ?? ''),
        format,
        isQuakeML: toFileFormat(result?.format) === 'quakeml',
        fields,
        parserSources,
        roles: describeParserColumns(fields, parserSources),
        sampleValues: sampleValuesFor(result, fields),
      };
    });
  }, [validationResults, fileFormat]);

  const mappableFiles = useMemo(() => files.filter(file => !file.isQuakeML), [files]);

  // Columns of every mappable file, in first-seen order
  const sourceFields: string[] = useMemo(() => {
    const seen: string[] = [];
    for (const file of mappableFiles) {
      for (const field of file.fields) if (!seen.includes(field)) seen.push(field);
    }
    return seen;
  }, [mappableFiles]);

  // What the parser did with each column (first file that resolves it)
  const parserMapping: Record<string, string> = useMemo(() => {
    const mapping: Record<string, string> = {};
    for (const file of mappableFiles) {
      for (const [column, target] of Object.entries(file.roles.mapped)) {
        if (!(column in mapping)) mapping[column] = target;
      }
    }
    return mapping;
  }, [mappableFiles]);

  // Everything else the parser did, across files: fields it filled (from one column,
  // derived or assembled), columns it read, columns it combined into one field, and
  // magnitude columns it kept as alternatives. Automatic mappings keep away from all of it.
  const parserRoles = useMemo(() => {
    const targets = new Set<string>();
    const consumed = new Set<string>();
    const assembled: Record<string, string> = {};
    const alternatives = new Set<string>();
    for (const file of mappableFiles) {
      file.roles.targets.forEach(target => targets.add(target));
      file.roles.consumed.forEach(column => consumed.add(column));
      file.roles.alternatives.forEach(column => alternatives.add(column));
      for (const [column, target] of Object.entries(file.roles.assembled)) {
        if (!(column in assembled)) assembled[column] = target;
      }
    }
    return { targets, consumed, assembled, alternatives };
  }, [mappableFiles]);

  const strictValidation = savedMappingConfig?.strictValidation === true;
  const autoDetectEnabled = savedMappingConfig?.autoDetectEnabled ?? true;
  const threshold = Number.isFinite(savedMappingConfig?.fuzzyMatchThreshold)
    ? Number(savedMappingConfig!.fuzzyMatchThreshold)
    : 0.6;

  // Explicit Settings rules, exact alias matches and suggestions for columns the parser
  // did not use. Nothing here may take a target the parser already filled.
  useEffect(() => {
    if (!configLoaded) return;
    const timer = setTimeout(() => {
      const nextAuto: Record<string, string> = {};
      const nextSources: Record<string, 'settings' | 'alias'> = {};
      const nextSuggestions: Record<string, { target: string; confidence: number }> = {};
      try {
        if (autoMapping && autoDetectEnabled) {
          for (const file of mappableFiles) {
            const rules = settingsRulesFor(savedMappingConfig, file.format);
            if (rules.length === 0) continue;
            const ruled = detectAllFieldMappings(file.fields, threshold, {
              customMappings: rules,
              useBuiltInAliases: false,
              minConfidence: threshold,
            });
            for (const [column, target] of Object.entries(ruled)) {
              // A rule only maps a column the parser did not read, onto a field it did not
              // fill in any way (a derived magnitude type or an assembled date+time
              // included): re-reading such a column would replace the parser's per-row value.
              if (column in nextAuto || parserRoles.consumed.has(column) || parserRoles.targets.has(target) ||
                  !isMappableTargetField(target)) {
                continue;
              }
              nextAuto[column] = target;
              nextSources[column] = 'settings';
            }
          }

          const claimed = new Set([...Array.from(parserRoles.targets), ...Object.values(nextAuto)]);
          for (const column of sourceFields) {
            if (parserRoles.consumed.has(column) || column in nextAuto || FM_AUTO_COLUMNS.has(column)) continue;
            const detected = detectFieldMapping(column);
            if (!detected.targetField || !isMappableTargetField(detected.targetField) ||
                claimed.has(detected.targetField)) {
              continue;
            }
            if (detected.matchType === 'fuzzy') {
              if (detected.confidence >= threshold) {
                nextSuggestions[column] = { target: detected.targetField, confidence: detected.confidence };
              }
            } else {
              nextAuto[column] = detected.targetField;
              nextSources[column] = 'alias';
              claimed.add(detected.targetField);
            }
          }
        }
      } catch (error) {
        // A malformed saved rule must not stall the schema step: the parser's
        // resolution still stands on its own.
        console.error('Field mapping detection failed; using the parser resolution only:', error);
      } finally {
        setAutoMappings(nextAuto);
        setAutoMappingSources(nextSources);
        setSuggestions(nextSuggestions);
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [configLoaded, autoMapping, autoDetectEnabled, threshold, savedMappingConfig, mappableFiles, parserRoles, sourceFields]);

  // Explicit mapping: user edits win over automatic ones
  const explicitMappings: Record<string, string> = useMemo(
    () => ({ ...autoMappings, ...userMappings }),
    [autoMappings, userMappings],
  );

  // The mapping as displayed: explicit where given, else the parser's
  const displayedMapping: Record<string, string> = useMemo(() => {
    const mapping: Record<string, string> = { ...parserMapping };
    for (const [column, target] of Object.entries(explicitMappings)) {
      if (target === DO_NOT_MAP) delete mapping[column];
      else mapping[column] = target;
    }
    return mapping;
  }, [parserMapping, explicitMappings]);

  // Required fields each file would lack after the explicit changes
  const missingByFile = useMemo(() => mappableFiles
    .map(file => ({
      fileName: file.fileName,
      missing: missingRequiredFields(file.fields, file.parserSources, explicitMappings, strictValidation),
    }))
    .filter(entry => entry.missing.length > 0),
  [mappableFiles, explicitMappings, strictValidation]);

  const missingEventId = useMemo(() => !strictValidation && mappableFiles.some(file =>
    missingRequiredFields(file.fields, file.parserSources, explicitMappings, true).includes('id')),
  [mappableFiles, explicitMappings, strictValidation]);

  // Propagate readiness and the explicit mapping once detection has settled
  useEffect(() => {
    if (loading) return;
    onSchemaReady(missingByFile.length === 0);
    onMappingsChange?.(explicitMappings);
  }, [loading, missingByFile, explicitMappings, onMappingsChange, onSchemaReady]);

  // Map a column explicitly. A target held by another column moves to this one only in
  // files that have both columns; elsewhere that column keeps it.
  const updateMapping = (sourceField: string, targetField: string) => {
    setUserMappings(prev => ({
      ...prev,
      [sourceField]: targetField === 'unmapped' ? DO_NOT_MAP : targetField,
    }));
  };

  // Columns whose target another explicitly mapped column has taken over
  const supersededBy = (column: string): string | undefined => {
    if (column in explicitMappings) return undefined;
    const target = parserMapping[column];
    if (!target) return undefined;
    return Object.entries(explicitMappings)
      .find(([other, otherTarget]) => other !== column && otherTarget === target)?.[0];
  };

  // Get mapped source field(s) for a target field.
  const getMappedSourceField = (targetFieldId: string): string | undefined => {
    const sources = Object.entries(displayedMapping)
      .filter(([source, t]) => t === targetFieldId && !supersededBy(source))
      .map(([src]) => src);
    const parserSynthesized = mappableFiles.some(file => {
      const source = file.parserSources[targetFieldId];
      return source && !file.fields.includes(source);
    });
    if (sources.length === 0) return parserSynthesized ? 'assembled by the parser' : undefined;
    if (sources.length === 1) return sources[0];
    return `${sources.length} columns (per file)`;
  };

  // Load templates from API
  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const response = await fetch('/api/mapping-templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Save current mapping as template
  const saveTemplate = async () => {
    if (readOnly) {
      toast({
        title: 'Read-only mode',
        description: 'Log in to save mapping templates.',
        variant: 'destructive'
      });
      return;
    }
    if (!templateName.trim()) {
      toast({
        title: 'Template name required',
        description: 'Please enter a name for the template',
        variant: 'destructive'
      });
      return;
    }

    try {
      const response = await fetch('/api/mapping-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateName,
          description: templateDescription,
          mappings: Object.entries(displayedMapping).map(([sourceField, targetField]) => ({
            sourceField,
            targetField
          }))
        })
      });

      if (response.ok) {
        toast({
          title: 'Template saved',
          description: `Mapping template "${templateName}" has been saved successfully`
        });
        setSaveDialogOpen(false);
        setTemplateName('');
        setTemplateDescription('');
        loadTemplates();
      } else {
        throw new Error('Failed to save template');
      }
    } catch (error) {
      toast({
        title: 'Save failed',
        description: 'Failed to save mapping template',
        variant: 'destructive'
      });
    }
  };

  // Load a template: its mappings become explicit choices for the columns this upload has
  const loadTemplate = (template: MappingTemplate) => {
    const mappings: Record<string, string> = {};
    if (Array.isArray(template.mappings)) {
      template.mappings.forEach((m: any) => {
        if (typeof m?.sourceField !== 'string' || !sourceFields.includes(m.sourceField)) return;
        if (m.targetField === DO_NOT_MAP || isMappableTargetField(m.targetField)) {
          mappings[m.sourceField] = m.targetField;
        }
      });
    }
    setUserMappings(prev => ({ ...prev, ...mappings }));
    setLoadDialogOpen(false);
    toast({
      title: 'Template loaded',
      description: `Loaded mapping template "${template.name}"`
    });
  };

  // Delete a template
  const confirmDeleteTemplate = async () => {
    if (!templateToDelete) return;
    if (readOnly) {
      toast({
        title: 'Read-only mode',
        description: 'Log in to delete mapping templates.',
        variant: 'destructive'
      });
      return;
    }

    try {
      const response = await fetch(`/api/mapping-templates/${templateToDelete}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast({
          title: 'Template deleted',
          description: 'Mapping template has been deleted'
        });
        loadTemplates();
      }
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: 'Failed to delete mapping template',
        variant: 'destructive'
      });
    } finally {
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
    }
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplateToDelete(id);
    setDeleteDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Analyzing catalogue structure...</p>
      </div>
    );
  }

  const quakemlFiles = files.filter(file => file.isQuakeML);
  // Columns the parser combines into one field (date + time, or year ... second)
  const splitTimeColumns = sourceFields.filter(field =>
    parserRoles.assembled[field] === 'time' && !(field in explicitMappings));
  const magnitudeCandidates = parserRoles.alternatives;

  // Settings rules consulted for this upload, per format
  const formatsInUpload = Array.from(new Set(mappableFiles.map(file => file.format)));
  const configMappingCount = savedMappingConfig
    ? formatsInUpload.reduce((sum, format) => sum + settingsRulesFor(savedMappingConfig, format).length, 0)
    : 0;

  const describeTarget = (target: string | undefined) => {
    if (!target) return undefined;
    return getFieldById(target)?.name ?? target;
  };

  const renderTargetOptions = (sourceField: string, targetField: string | undefined) => (
    <>
      {FIELD_CATEGORIES.map(category => {
        const fields = getFieldsByCategory(category.id).filter(field => isMappableTargetField(field.id));
        if (fields.length === 0) return null;
        return (
          <CommandGroup key={category.id} heading={category.name}>
            {fields.map(field => (
              <CommandItem
                key={field.id}
                value={`${field.name} ${field.id}`}
                keywords={[field.name, field.id, field.description || '', field.unit || '']}
                onSelect={() => {
                  updateMapping(sourceField, field.id);
                  setMappingDropdownOpen(null);
                }}
                className="flex items-center gap-2"
              >
                <Check className={`h-4 w-4 ${field.id === targetField ? 'opacity-100' : 'opacity-0'}`} />
                <div className="flex flex-wrap items-center gap-2">
                  <span>{field.name}</span>
                  {field.required && (
                    <Badge variant="destructive" className="text-xs px-1">Required</Badge>
                  )}
                  {field.unit && (
                    <span className="text-xs text-muted-foreground">({field.unit})</span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        );
      })}
      {OTHER_MAPPABLE_TARGETS.length > 0 && (
        <CommandGroup heading="Other stored fields">
          {OTHER_MAPPABLE_TARGETS.map(id => (
            <CommandItem
              key={id}
              value={id}
              onSelect={() => {
                updateMapping(sourceField, id);
                setMappingDropdownOpen(null);
              }}
              className="flex items-center gap-2"
            >
              <Check className={`h-4 w-4 ${id === targetField ? 'opacity-100' : 'opacity-0'}`} />
              <span>{id}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
    </>
  );

  return (
    <TooltipProvider>
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Schema Mapping Configuration</h3>
          <p className="text-sm text-muted-foreground">
            The parser has already mapped the columns it recognises. Change a mapping only where it is wrong.
          </p>
          {savedMappingConfig && (
            <div className="flex items-center gap-2 mt-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground cursor-help">
                    <Settings className="h-3 w-3" />
                    <span>
                      Using {configMappingCount} saved mappings ({formatsInUpload.map(format => format.toUpperCase()).join(', ') || 'none'})
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Explicit mappings from Settings are applied to columns they match.</p>
                  <p className="text-xs text-muted-foreground">
                    Fuzzy suggestion threshold: {(threshold * 100).toFixed(0)}%
                    {strictValidation ? ' · strict validation on' : ''}
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={loadDialogOpen} onOpenChange={setLoadDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <FolderOpen className="h-4 w-4 mr-2" />
                Load Template
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Load Mapping Template</DialogTitle>
                <DialogDescription>
                  Select a saved mapping template to apply
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {loadingTemplates ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : templates.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No saved templates found
                  </p>
                ) : (
                  templates.map(template => (
                    <div key={template.id} className="border rounded-lg p-3 hover:bg-muted/50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium">{template.name}</h4>
                          {template.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {template.description}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-2">
                            Created: {new Date(template.created_at).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => loadTemplate(template)}
                          >
                            Load
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteTemplate(template.id)}
                            disabled={readOnly}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={readOnly}>
                <Save className="h-4 w-4 mr-2" />
                Save Template
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save Mapping Template</DialogTitle>
                <DialogDescription>
                  Save the current field mappings as a reusable template
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="template-name">Template Name *</Label>
                  <Input
                    id="template-name"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g., GeoNet Standard Mapping"
                  />
                </div>
                <div>
                  <Label htmlFor="template-description">Description</Label>
                  <Textarea
                    id="template-description"
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="Optional description of this mapping template"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={saveTemplate} disabled={readOnly}>
                  Save Template
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Required fields a file would be left without */}
      {missingByFile.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3 rounded-md">
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Required fields not mapped
            </p>
            {missingByFile.map(entry => (
              <p key={entry.fileName} className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                {mappableFiles.length > 1 ? `${entry.fileName}: ` : ''}
                {entry.missing.map(id => describeTarget(id)).join(', ')}
              </p>
            ))}
          </div>
        </div>
      )}

      {missingEventId && (
        <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3 rounded-md">
          <Info className="h-5 w-5 text-blue-500 mt-0.5" />
          <p className="text-xs text-blue-700 dark:text-blue-400">
            No event ID column is mapped{mappableFiles.length > 1 ? ' in every file' : ''}. Events are stored without a
            source ID, so repeated events cannot be recognised as duplicates.
          </p>
        </div>
      )}

      {quakemlFiles.length > 0 && (
        <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3 rounded-md">
          <Info className="h-5 w-5 text-blue-500 mt-0.5" />
          <p className="text-xs text-blue-700 dark:text-blue-400">
            {quakemlFiles.map(file => file.fileName).join(', ')}: QuakeML files are stored from their standard
            QuakeML structure; no column mapping applies to them.
          </p>
        </div>
      )}

      {/* Info notice for split timestamp synthesis */}
      {splitTimeColumns.length > 0 && (
        <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3 rounded-md">
          <Info className="h-5 w-5 text-blue-500 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
              Origin time is assembled from date and time columns
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
              {splitTimeColumns.join(', ')} are combined into one UTC timestamp by the parser; they are not mapped individually.
            </p>
          </div>
        </div>
      )}

      {/* Mapping interface */}
      <Tabs defaultValue="mapping" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="mapping">Field Mapping</TabsTrigger>
          <TabsTrigger value="preview">Preview & Validation</TabsTrigger>
        </TabsList>

        <TabsContent value="mapping" className="space-y-4 mt-4">
          {/* Auto-mapping toggle and search */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="auto-mapping"
                aria-labelledby="auto-mapping-label"
                checked={autoMapping}
                onCheckedChange={setAutoMapping}
              />
              <div className="flex items-center gap-1.5">
                <Label id="auto-mapping-label" htmlFor="auto-mapping">Apply saved mappings and suggestions</Label>
                <InfoTooltip content="Applies explicit Settings mappings and exact alias matches to columns the parser did not map, and suggests likely targets for the rest. The parser's own mappings always apply." />
              </div>
            </div>
            <Input
              placeholder="Search fields..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xs"
            />
          </div>

          {/* Source fields mapping */}
          <div className="border rounded-md overflow-hidden">
            <div className="bg-muted/50 px-4 py-2 text-sm font-medium flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span>Source Fields → Target Schema</span>
                <InfoTooltip content="Columns of every uploaded file. Values are stored as the parser read them unless you change the mapping here." />
              </div>
              <Badge variant="secondary">
                {sourceFields.filter(field => displayedMapping[field] && !supersededBy(field)).length} / {sourceFields.length} mapped
              </Badge>
            </div>
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              {sourceFields.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  No source fields detected
                </p>
              ) : (
                sourceFields
                  .filter((field: string) =>
                    searchTerm === '' ||
                    field.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map((sourceField: string) => {
                    const isFmAuto = FM_AUTO_COLUMNS.has(sourceField);
                    const assembledInto = !(sourceField in explicitMappings) ? parserRoles.assembled[sourceField] : undefined;
                    const targetField = displayedMapping[sourceField];
                    const targetDef = targetField ? getFieldById(targetField) : null;
                    const replacedBy = supersededBy(sourceField);
                    const isUnmapped = !targetField || Boolean(replacedBy);
                    const scale = magnitudeScaleFromColumnName(sourceField);
                    const isMagnitudeAlternative = !targetField && !(sourceField in explicitMappings) &&
                      magnitudeCandidates.has(sourceField);
                    const samples = mappableFiles.flatMap(file => file.sampleValues[sourceField] ?? []).slice(0, 3);
                    const scaleCodesInType = targetField === 'event_type' && samples.length > 0 &&
                      samples.every(value => MAGNITUDE_CODE_VALUE.test(value.trim()));
                    const origin = sourceField in userMappings
                      ? 'your choice'
                      : autoMappingSources[sourceField] === 'settings'
                        ? 'Settings rule'
                        : autoMappingSources[sourceField] === 'alias'
                          ? 'alias match'
                          : parserMapping[sourceField] ? 'mapped by the parser' : undefined;
                    const suggestion = suggestions[sourceField];

                    if (isFmAuto || assembledInto) {
                      return (
                        <div key={sourceField} className="grid grid-cols-12 gap-3 items-center opacity-70">
                          <div className="col-span-5">
                            <Label className="font-medium text-muted-foreground">{sourceField}</Label>
                          </div>
                          <div className="col-span-1 flex items-center justify-center">
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="col-span-6">
                            <Badge variant="secondary" className="text-xs font-normal">
                              {isFmAuto
                                ? 'focal_mechanisms (auto-assembled)'
                                : `${describeTarget(assembledInto)} (assembled by the parser)`}
                            </Badge>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={sourceField} className="grid grid-cols-12 gap-3 items-start">
                        <div className="col-span-5">
                          <Label className="font-medium">{sourceField}</Label>
                          <p className="text-xs text-muted-foreground truncate">
                            {samples.length > 0 ? `e.g. ${samples.join(', ')}` : 'Source field'}
                          </p>
                        </div>
                        <div className="col-span-1 flex items-center justify-center pt-2">
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="col-span-6">
                          <Popover
                            open={mappingDropdownOpen === sourceField}
                            onOpenChange={(open) => {
                              setMappingDropdownOpen(open ? sourceField : null);
                              if (open) {
                                setMappingSearch('');
                              }
                            }}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={mappingDropdownOpen === sourceField}
                                aria-label={`Mapping for ${sourceField}`}
                                className="w-full justify-between"
                                disabled={readOnly}
                              >
                                <span className={isUnmapped ? 'truncate text-muted-foreground' : 'truncate'}>
                                  {replacedBy
                                    ? `Replaced by ${replacedBy}`
                                    : isMagnitudeAlternative
                                      ? `Alternative magnitude${scale ? ` (${scale})` : ''}`
                                      : targetField
                                        ? `${describeTarget(targetField)}${targetField === 'magnitude' && scale ? ` (${scale})` : ''}`
                                        : 'Do not map'}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                              <Command>
                                <CommandInput
                                  placeholder="Search fields..."
                                  value={mappingSearch}
                                  onValueChange={setMappingSearch}
                                />
                                <CommandList>
                                  <CommandEmpty>No fields found.</CommandEmpty>
                                  <CommandGroup heading="Unmapped">
                                    <CommandItem
                                      value="unmapped do not map ignore skip"
                                      onSelect={() => {
                                        updateMapping(sourceField, 'unmapped');
                                        setMappingDropdownOpen(null);
                                      }}
                                      className="flex items-center gap-2"
                                    >
                                      <Check className={`h-4 w-4 ${isUnmapped ? 'opacity-100' : 'opacity-0'}`} />
                                      <span className="text-muted-foreground">Do not map</span>
                                    </CommandItem>
                                  </CommandGroup>
                                  {renderTargetOptions(sourceField, replacedBy ? undefined : targetField)}
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          <div className="mt-1 space-y-1">
                            {origin && !isUnmapped && (
                              <span className="text-xs text-muted-foreground">{origin}</span>
                            )}
                            {targetDef?.required && !isUnmapped && (
                              <Badge variant="destructive" className="text-xs ml-1">Required</Badge>
                            )}
                            {isMagnitudeAlternative && (
                              <p className="text-xs text-muted-foreground">
                                Kept with the event as an alternative magnitude; the parser chose another column as the preferred magnitude.
                              </p>
                            )}
                            {targetField === 'magnitude' && scale && (sourceField in explicitMappings) && (
                              <p className="text-xs text-muted-foreground">
                                The magnitude type is stored as {scale}; the parser&apos;s choice is kept as an alternative.
                              </p>
                            )}
                            {scaleCodesInType && (
                              <p className="text-xs text-muted-foreground">
                                These values are magnitude scale codes; they are stored as the magnitude type, not the event type.
                              </p>
                            )}
                            {suggestion && !targetField && (
                              <button
                                type="button"
                                className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                                disabled={readOnly}
                                onClick={() => updateMapping(sourceField, suggestion.target)}
                              >
                                <Sparkles className="h-3 w-3" />
                                Suggested: {describeTarget(suggestion.target)} ({Math.round(suggestion.confidence * 100)}%) — apply
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="preview" className="space-y-4 mt-4">
          <div className="border rounded-md">
            <div className="bg-muted/50 px-4 py-2 text-sm font-medium">
              Mapping Summary by Category
            </div>
            <div className="p-4">
              <Accordion type="multiple" value={expandedCategories} onValueChange={setExpandedCategories} className="w-full">
                {FIELD_CATEGORIES.map(category => {
                  const categoryFields = getFieldsByCategory(category.id);
                  const mappedCount = categoryFields.filter(f => getMappedSourceField(f.id)).length;
                  const unmappedRequired = categoryFields.filter(f =>
                    f.required && (strictValidation || ['time', 'latitude', 'longitude', 'magnitude'].includes(f.id)) &&
                    !getMappedSourceField(f.id)
                  ).length;

                  return (
                    <AccordionItem key={category.id} value={category.id}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center justify-between w-full pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{category.name}</span>
                            <Badge variant="secondary" className="text-xs">
                              {mappedCount} / {categoryFields.length}
                            </Badge>
                            {unmappedRequired > 0 && (
                              <Badge variant="destructive" className="text-xs">
                                {unmappedRequired} required unmapped
                              </Badge>
                            )}
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pt-2">
                          {categoryFields.map(field => {
                            const sourceField = getMappedSourceField(field.id);
                            const isMapped = !!sourceField;

                            return (
                              <div
                                key={field.id}
                                className={`p-3 rounded-md border ${
                                  field.required && !isMapped
                                    ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'
                                    : isMapped
                                    ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
                                    : 'border-border'
                                }`}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{field.name}</span>
                                      {field.required && (
                                        <Badge variant="destructive" className="text-xs">Required</Badge>
                                      )}
                                      {field.unit && (
                                        <span className="text-xs text-muted-foreground">({field.unit})</span>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {field.description}
                                    </p>
                                    {field.example && (
                                      <p className="text-xs text-muted-foreground mt-1">
                                        Example: <code className="bg-muted px-1 rounded">{field.example}</code>
                                      </p>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    {isMapped ? (
                                      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                        <span className="text-xs font-medium">Mapped</span>
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">Not mapped</span>
                                    )}
                                    {sourceField && (
                                      <p className="text-xs text-muted-foreground mt-1">
                                        from: <code className="bg-muted px-1 rounded">{sourceField}</code>
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {isProcessing && (
        <div className="flex items-center justify-center mt-6">
          <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
          <span>Processing your catalogues...</span>
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete mapping template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this mapping template. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteTemplate}
              className="bg-red-600 hover:bg-red-700 dark:bg-red-900 dark:hover:bg-red-800"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}
