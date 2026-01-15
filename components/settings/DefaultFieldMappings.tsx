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
  DialogTrigger
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
  HelpCircle
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
}

export interface FormatMappingConfig {
  enabled: boolean;
  mappings: FieldMappingEntry[];
}

export interface DefaultFieldMappingsConfig {
  autoDetectEnabled: boolean;
  strictValidation: boolean;
  fuzzyMatchThreshold: number;
  formats: Record<FileFormat, FormatMappingConfig>;
  customMappings: FieldMappingEntry[];
  lastUpdated?: string;
}

// Default configuration
const DEFAULT_CONFIG: DefaultFieldMappingsConfig = {
  autoDetectEnabled: true,
  strictValidation: false,
  fuzzyMatchThreshold: 0.6,
  formats: {
    csv: { enabled: true, mappings: [] },
    json: { enabled: true, mappings: [] },
    quakeml: { enabled: true, mappings: [] },
    geojson: { enabled: true, mappings: [] }
  },
  customMappings: []
};

// Generate default mappings from FIELD_ALIASES
function generateDefaultMappings(): FieldMappingEntry[] {
  const mappings: FieldMappingEntry[] = [];
  let id = 0;

  for (const [targetField, aliases] of Object.entries(FIELD_ALIASES)) {
    // Add exact matches as high priority
    for (const exactMatch of aliases.exactMatches) {
      mappings.push({
        id: `default-${id++}`,
        sourcePattern: exactMatch,
        targetField,
        isRegex: false,
        priority: 100
      });
    }
    // Add aliases as lower priority
    for (const alias of aliases.aliases) {
      mappings.push({
        id: `default-${id++}`,
        sourcePattern: alias,
        targetField,
        isRegex: false,
        priority: 50
      });
    }
  }

  return mappings;
}

interface DefaultFieldMappingsProps {
  onSave?: (config: DefaultFieldMappingsConfig) => void;
}

export function DefaultFieldMappings({ onSave }: DefaultFieldMappingsProps) {
  const [config, setConfig] = useState<DefaultFieldMappingsConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFormat, setActiveFormat] = useState<FileFormat>('csv');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [addMappingDialogOpen, setAddMappingDialogOpen] = useState(false);
  const [newMapping, setNewMapping] = useState<Partial<FieldMappingEntry>>({
    sourcePattern: '',
    targetField: '',
    isRegex: false,
    priority: 75
  });

  // Load saved configuration
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/settings/field-mappings');
      if (response.ok) {
        const data = await response.json();
        setConfig(data);
      } else if (response.status === 404) {
        // No saved config, use default with generated mappings
        const defaultMappings = generateDefaultMappings();
        setConfig({
          ...DEFAULT_CONFIG,
          customMappings: defaultMappings.slice(0, 20) // Start with top 20
        });
      }
    } catch (error) {
      console.error('Failed to load field mappings config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
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
    const defaultMappings = generateDefaultMappings();
    setConfig({
      ...DEFAULT_CONFIG,
      customMappings: defaultMappings.slice(0, 20)
    });
    setHasChanges(true);
    toast({ title: 'Reset complete', description: 'Settings have been reset to defaults' });
  };

  const addCustomMapping = () => {
    if (!newMapping.sourcePattern || !newMapping.targetField) {
      toast({ title: 'Error', description: 'Source pattern and target field are required', variant: 'destructive' });
      return;
    }

    // Check for duplicate target field
    const existingMapping = config.customMappings.find(
      m => m.sourcePattern.toLowerCase() === newMapping.sourcePattern?.toLowerCase()
    );
    if (existingMapping) {
      toast({
        title: 'Duplicate mapping',
        description: `A mapping for "${newMapping.sourcePattern}" already exists`,
        variant: 'destructive'
      });
      return;
    }

    const mapping: FieldMappingEntry = {
      id: `custom-${Date.now()}`,
      sourcePattern: newMapping.sourcePattern!,
      targetField: newMapping.targetField!,
      isRegex: newMapping.isRegex || false,
      priority: newMapping.priority || 75
    };

    setConfig(prev => ({
      ...prev,
      customMappings: [...prev.customMappings, mapping]
    }));
    setNewMapping({ sourcePattern: '', targetField: '', isRegex: false, priority: 75 });
    setAddMappingDialogOpen(false);
    setHasChanges(true);
  };

  const removeMapping = (id: string) => {
    setConfig(prev => ({
      ...prev,
      customMappings: prev.customMappings.filter(m => m.id !== id)
    }));
    setHasChanges(true);
  };

  const updateMapping = (id: string, updates: Partial<FieldMappingEntry>) => {
    setConfig(prev => ({
      ...prev,
      customMappings: prev.customMappings.map(m =>
        m.id === id ? { ...m, ...updates } : m
      )
    }));
    setHasChanges(true);
  };

  // Filter fields by category and search
  const getFilteredFields = useCallback(() => {
    let fields = activeCategory === 'all'
      ? FIELD_DEFINITIONS
      : getFieldsByCategory(activeCategory);

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

  // Check if there are duplicate target fields
  const getDuplicateTargets = () => {
    const targetCounts: Record<string, number> = {};
    for (const mapping of config.customMappings) {
      targetCounts[mapping.targetField] = (targetCounts[mapping.targetField] || 0) + 1;
    }
    return Object.entries(targetCounts)
      .filter(([_, count]) => count > 1)
      .map(([target]) => target);
  };

  const duplicateTargets = getDuplicateTargets();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header with save button */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium">Default Field Mappings</h3>
            <p className="text-sm text-muted-foreground">
              Configure how fields from different formats automatically map to the standardized schema
            </p>
          </div>
          <div className="flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset to Defaults
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset to default mappings?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will replace all your custom mappings with the default field aliases.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReset}>Reset</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button onClick={handleSave} disabled={saving || !hasChanges}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>

        {hasChanges && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-sm text-amber-700 dark:text-amber-400">
              You have unsaved changes
            </span>
          </div>
        )}

        {duplicateTargets.length > 0 && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span className="text-sm text-red-700 dark:text-red-400">
              Warning: Duplicate target field assignments: {duplicateTargets.join(', ')}
            </span>
          </div>
        )}

        {/* Global settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="auto-detect" className="text-base">Auto-detect Field Mappings</Label>
              <p className="text-sm text-muted-foreground">
                Automatically detect and suggest field mappings during upload
              </p>
            </div>
            <Switch
              id="auto-detect"
              checked={config.autoDetectEnabled}
              onCheckedChange={(checked) => {
                setConfig(prev => ({ ...prev, autoDetectEnabled: checked }));
                setHasChanges(true);
              }}
            />
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="strict-validation" className="text-base">Strict Schema Validation</Label>
              <p className="text-sm text-muted-foreground">
                Enforce strict validation for required fields
              </p>
            </div>
            <Switch
              id="strict-validation"
              checked={config.strictValidation}
              onCheckedChange={(checked) => {
                setConfig(prev => ({ ...prev, strictValidation: checked }));
                setHasChanges(true);
              }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Fuzzy Match Threshold</Label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0.4"
              max="1.0"
              step="0.05"
              value={config.fuzzyMatchThreshold}
              onChange={(e) => {
                setConfig(prev => ({ ...prev, fuzzyMatchThreshold: parseFloat(e.target.value) }));
                setHasChanges(true);
              }}
              className="flex-1"
            />
            <span className="text-sm font-mono w-12">{(config.fuzzyMatchThreshold * 100).toFixed(0)}%</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Minimum similarity score required for fuzzy field name matching
          </p>
        </div>

        <Separator />

        {/* Format-specific mapping tabs */}
        <Tabs value={activeFormat} onValueChange={(v) => setActiveFormat(v as FileFormat)}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="csv" className="flex items-center gap-2">
                <FileType className="h-4 w-4" />
                CSV/TXT
              </TabsTrigger>
              <TabsTrigger value="json" className="flex items-center gap-2">
                <FileType className="h-4 w-4" />
                JSON
              </TabsTrigger>
              <TabsTrigger value="quakeml" className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                QuakeML
              </TabsTrigger>
              <TabsTrigger value="geojson" className="flex items-center gap-2">
                <FileType className="h-4 w-4" />
                GeoJSON
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search fields..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-[200px]"
                />
              </div>
              <Dialog open={addMappingDialogOpen} onOpenChange={setAddMappingDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Mapping
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Field Mapping</DialogTitle>
                    <DialogDescription>
                      Create a new mapping from a source field name to a target schema field
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Source Field Pattern</Label>
                      <Input
                        placeholder="e.g., lat, latitude, Lat"
                        value={newMapping.sourcePattern || ''}
                        onChange={(e) => setNewMapping(prev => ({ ...prev, sourcePattern: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">
                        The field name pattern to match in uploaded files
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Target Field</Label>
                      <Select
                        value={newMapping.targetField || ''}
                        onValueChange={(value) => setNewMapping(prev => ({ ...prev, targetField: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select target field" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {FIELD_CATEGORIES.map(category => (
                            <SelectGroup key={category.id}>
                              <SelectLabel>{category.name}</SelectLabel>
                              {getFieldsByCategory(category.id).map(field => (
                                <SelectItem key={field.id} value={field.id}>
                                  <div className="flex items-center gap-2">
                                    <span>{field.name}</span>
                                    {field.required && (
                                      <Badge variant="destructive" className="text-[10px] px-1 py-0">Required</Badge>
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="is-regex"
                          checked={newMapping.isRegex || false}
                          onCheckedChange={(checked) => setNewMapping(prev => ({ ...prev, isRegex: checked }))}
                        />
                        <Label htmlFor="is-regex">Use regex pattern</Label>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Priority (1-100)</Label>
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        value={newMapping.priority || 75}
                        onChange={(e) => setNewMapping(prev => ({ ...prev, priority: parseInt(e.target.value) }))}
                      />
                      <p className="text-xs text-muted-foreground">
                        Higher priority mappings are checked first
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAddMappingDialogOpen(false)}>Cancel</Button>
                    <Button onClick={addCustomMapping}>Add Mapping</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Category filter */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <Button
              size="sm"
              variant={activeCategory === 'all' ? 'default' : 'outline'}
              onClick={() => setActiveCategory('all')}
            >
              All Fields
            </Button>
            {FIELD_CATEGORIES.map(category => (
              <Button
                key={category.id}
                size="sm"
                variant={activeCategory === category.id ? 'default' : 'outline'}
                onClick={() => setActiveCategory(category.id)}
              >
                {category.name}
              </Button>
            ))}
          </div>

          {/* Field mappings list for each format */}
          {(['csv', 'json', 'quakeml', 'geojson'] as FileFormat[]).map(format => (
            <TabsContent key={format} value={format} className="mt-4">
              <FieldMappingsList
                fields={getFilteredFields()}
                mappings={config.customMappings}
                onRemove={removeMapping}
                onUpdate={updateMapping}
                duplicateTargets={duplicateTargets}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </TooltipProvider>
  );
}

// Subcomponent for displaying field mappings organized by target field
interface FieldMappingsListProps {
  fields: FieldDefinition[];
  mappings: FieldMappingEntry[];
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<FieldMappingEntry>) => void;
  duplicateTargets: string[];
}

function FieldMappingsList({
  fields,
  mappings,
  onRemove,
  onUpdate,
  duplicateTargets
}: FieldMappingsListProps) {
  const getMappingsForField = (fieldId: string) => {
    return mappings.filter(m => m.targetField === fieldId);
  };

  if (fields.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No fields match your search criteria
      </div>
    );
  }

  // Group fields by category
  const groupedFields = fields.reduce((acc, field) => {
    const category = field.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push(field);
    return acc;
  }, {} as Record<string, FieldDefinition[]>);

  return (
    <ScrollArea className="h-[500px] pr-4">
      <Accordion type="multiple" defaultValue={Object.keys(groupedFields)} className="space-y-2">
        {Object.entries(groupedFields).map(([category, categoryFields]) => {
          const categoryInfo = FIELD_CATEGORIES.find(c => c.id === category);
          return (
            <AccordionItem key={category} value={category} className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{categoryInfo?.name || category}</span>
                  <Badge variant="secondary">{categoryFields.length} fields</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  {categoryFields.map(field => {
                    const fieldMappings = getMappingsForField(field.id);
                    const hasDuplicate = duplicateTargets.includes(field.id);

                    return (
                      <div
                        key={field.id}
                        className={`border rounded-lg p-4 ${hasDuplicate ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20' : ''}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{field.name}</span>
                              {field.required && (
                                <Badge variant="destructive" className="text-[10px]">Required</Badge>
                              )}
                              <Badge variant="outline" className="text-[10px]">{field.type}</Badge>
                              {hasDuplicate && (
                                <Badge variant="destructive" className="text-[10px]">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Duplicate
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{field.description}</p>
                            {field.example && (
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium">Example:</span> {field.example}
                              </p>
                            )}
                            {field.unit && (
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium">Unit:</span> {field.unit}
                              </p>
                            )}
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <HelpCircle className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs">
                              <div className="space-y-1">
                                <p className="font-medium">Field ID: {field.id}</p>
                                {field.quakemlPath && (
                                  <p className="text-xs">QuakeML Path: {field.quakemlPath}</p>
                                )}
                                {field.validation && (
                                  <div className="text-xs">
                                    {field.validation.min !== undefined && (
                                      <span>Min: {field.validation.min} </span>
                                    )}
                                    {field.validation.max !== undefined && (
                                      <span>Max: {field.validation.max}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </div>

                        {/* Source mappings for this field */}
                        <div className="space-y-2 mt-3">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <ArrowRight className="h-4 w-4" />
                            <span>Source field mappings:</span>
                          </div>

                          {fieldMappings.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic pl-6">
                              No custom mappings defined (using default aliases)
                            </p>
                          ) : (
                            <div className="space-y-2 pl-6">
                              {fieldMappings.map(mapping => (
                                <div
                                  key={mapping.id}
                                  className="flex items-center gap-2 bg-muted/50 rounded-md p-2"
                                >
                                  <Input
                                    value={mapping.sourcePattern}
                                    onChange={(e) => onUpdate(mapping.id, { sourcePattern: e.target.value })}
                                    className="flex-1 h-8"
                                    placeholder="Source field pattern"
                                  />
                                  <Badge variant={mapping.isRegex ? 'default' : 'outline'} className="text-xs">
                                    {mapping.isRegex ? 'Regex' : 'Exact'}
                                  </Badge>
                                  <Badge variant="secondary" className="text-xs">
                                    P:{mapping.priority}
                                  </Badge>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={() => onRemove(mapping.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Default aliases preview */}
                        {FIELD_ALIASES[field.id] && (
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-xs text-muted-foreground mb-2">
                              Default aliases (built-in):
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {[...FIELD_ALIASES[field.id].exactMatches, ...FIELD_ALIASES[field.id].aliases].slice(0, 8).map((alias, idx) => (
                                <Badge key={idx} variant="outline" className="text-[10px]">
                                  {alias}
                                </Badge>
                              ))}
                              {([...FIELD_ALIASES[field.id].exactMatches, ...FIELD_ALIASES[field.id].aliases].length > 8) && (
                                <Badge variant="outline" className="text-[10px]">
                                  +{[...FIELD_ALIASES[field.id].exactMatches, ...FIELD_ALIASES[field.id].aliases].length - 8} more
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </ScrollArea>
  );
}

