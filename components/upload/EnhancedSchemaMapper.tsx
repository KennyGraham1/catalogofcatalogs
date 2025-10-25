'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { 
  ArrowRight, 
  AlertTriangle, 
  Loader2, 
  Save, 
  FolderOpen, 
  Eye, 
  Download,
  Trash2,
  Plus,
  ChevronDown,
  ChevronRight,
  Info
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { FIELD_DEFINITIONS, FIELD_CATEGORIES, getFieldById, getFieldsByCategory } from '@/lib/field-definitions';

interface EnhancedSchemaMapperProps {
  validationResults: any;
  isProcessing: boolean;
  onSchemaReady: (isReady: boolean) => void;
  onMappingsChange?: (mappings: Record<string, string>) => void;
}

interface MappingTemplate {
  id: string;
  name: string;
  description?: string;
  mappings: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export function EnhancedSchemaMapper({ 
  validationResults, 
  isProcessing, 
  onSchemaReady,
  onMappingsChange 
}: EnhancedSchemaMapperProps) {
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});
  const [autoMapping, setAutoMapping] = useState(true);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [templates, setTemplates] = useState<MappingTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['basic']);
  
  // Load templates on mount
  useEffect(() => {
    loadTemplates();
  }, []);
  
  // Auto-detect field mappings
  useEffect(() => {
    const timer = setTimeout(() => {
      if (validationResults && validationResults.length > 0 && autoMapping) {
        const detectedMappings: Record<string, string> = {};
        const sampleFields = validationResults[0].fields || [];
        
        sampleFields.forEach((field: string) => {
          const lowerField = field.toLowerCase().replace(/[_\s-]/g, '');
          
          // Enhanced auto-mapping logic for all QuakeML fields
          if (lowerField.includes('eventid') || lowerField === 'id') {
            detectedMappings[field] = 'id';
          } else if (lowerField.includes('time') || lowerField.includes('date') || lowerField === 'origintime') {
            detectedMappings[field] = 'time';
          } else if (lowerField.includes('lat') && !lowerField.includes('uncertainty')) {
            detectedMappings[field] = 'latitude';
          } else if (lowerField.includes('lon') && !lowerField.includes('uncertainty')) {
            detectedMappings[field] = 'longitude';
          } else if (lowerField.includes('dep') && !lowerField.includes('uncertainty')) {
            detectedMappings[field] = 'depth';
          } else if ((lowerField.includes('mag') || lowerField === 'm') && !lowerField.includes('type') && !lowerField.includes('uncertainty')) {
            detectedMappings[field] = 'magnitude';
          } else if (lowerField.includes('magtype') || lowerField.includes('magnitudetype')) {
            detectedMappings[field] = 'magnitude_type';
          } else if (lowerField.includes('source') || lowerField.includes('agency')) {
            detectedMappings[field] = 'source';
          } else if (lowerField.includes('region') || lowerField.includes('location')) {
            detectedMappings[field] = 'region';
          } else if (lowerField.includes('eventtype')) {
            detectedMappings[field] = 'event_type';
          } else if (lowerField.includes('publicid')) {
            detectedMappings[field] = 'event_public_id';
          } else if (lowerField.includes('timeuncertainty') || lowerField.includes('timeerror')) {
            detectedMappings[field] = 'time_uncertainty';
          } else if (lowerField.includes('latuncertainty') || lowerField.includes('laterror')) {
            detectedMappings[field] = 'latitude_uncertainty';
          } else if (lowerField.includes('lonuncertainty') || lowerField.includes('lonerror')) {
            detectedMappings[field] = 'longitude_uncertainty';
          } else if (lowerField.includes('depthuncertainty') || lowerField.includes('deptherror')) {
            detectedMappings[field] = 'depth_uncertainty';
          } else if (lowerField.includes('maguncertainty') || lowerField.includes('magerror')) {
            detectedMappings[field] = 'magnitude_uncertainty';
          } else if (lowerField.includes('stationcount') && lowerField.includes('mag')) {
            detectedMappings[field] = 'magnitude_station_count';
          } else if (lowerField.includes('azimuthalgap') || lowerField === 'gap') {
            detectedMappings[field] = 'azimuthal_gap';
          } else if (lowerField.includes('phasecount') || lowerField.includes('nph')) {
            detectedMappings[field] = 'used_phase_count';
          } else if (lowerField.includes('stationcount') || lowerField.includes('nst')) {
            detectedMappings[field] = 'used_station_count';
          } else if (lowerField.includes('standarderror') || lowerField === 'rms') {
            detectedMappings[field] = 'standard_error';
          } else if (lowerField.includes('evaluationmode')) {
            detectedMappings[field] = 'evaluation_mode';
          } else if (lowerField.includes('evaluationstatus') || lowerField.includes('status')) {
            detectedMappings[field] = 'evaluation_status';
          }
        });
        
        setFieldMappings(detectedMappings);
      }
      
      setLoading(false);
      checkRequiredFields();
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [validationResults, autoMapping]);
  
  // Check if required fields are mapped
  const checkRequiredFields = () => {
    const requiredFields = FIELD_DEFINITIONS.filter(f => f.required);
    const isMappingComplete = requiredFields.every(field => {
      return Object.values(fieldMappings).includes(field.id);
    });
    
    onSchemaReady(isMappingComplete);
  };
  
  // Update field mapping
  const updateMapping = (sourceField: string, targetField: string) => {
    setFieldMappings(prev => {
      const updated = { ...prev };
      if (targetField === 'unmapped') {
        delete updated[sourceField];
      } else {
        updated[sourceField] = targetField;
      }
      return updated;
    });
    
    setTimeout(() => {
      checkRequiredFields();
      if (onMappingsChange) {
        onMappingsChange(fieldMappings);
      }
    }, 0);
  };
  
  // Get source fields from validation results
  const getSourceFields = () => {
    if (!validationResults || validationResults.length === 0) return [];
    return validationResults[0].fields || [];
  };
  
  // Check if a required field is unmapped
  const isRequiredFieldUnmapped = (fieldId: string) => {
    const field = getFieldById(fieldId);
    if (!field?.required) return false;
    return !Object.values(fieldMappings).includes(fieldId);
  };
  
  // Get mapped source field for a target field
  const getMappedSourceField = (targetFieldId: string): string | undefined => {
    return Object.entries(fieldMappings).find(([_, target]) => target === targetFieldId)?.[0];
  };
  
  // Load templates from API
  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const response = await fetch('/api/mapping-templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoadingTemplates(false);
    }
  };
  
  // Save current mapping as template
  const saveTemplate = async () => {
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
          mappings: Object.entries(fieldMappings).map(([sourceField, targetField]) => ({
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
  
  // Load a template
  const loadTemplate = (template: MappingTemplate) => {
    const mappings: Record<string, string> = {};
    if (Array.isArray(template.mappings)) {
      template.mappings.forEach((m: any) => {
        mappings[m.sourceField] = m.targetField;
      });
    }
    setFieldMappings(mappings);
    setLoadDialogOpen(false);
    toast({
      title: 'Template loaded',
      description: `Loaded mapping template "${template.name}"`
    });
    setTimeout(checkRequiredFields, 0);
  };
  
  // Delete a template
  const deleteTemplate = async (id: string) => {
    try {
      const response = await fetch(`/api/mapping-templates/${id}`, {
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
    }
  };
  
  // Toggle category expansion
  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => 
      prev.includes(categoryId) 
        ? prev.filter(c => c !== categoryId)
        : [...prev, categoryId]
    );
  };
  
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Analyzing catalogue structure...</p>
      </div>
    );
  }
  
  const sourceFields = getSourceFields();
  const unmappedRequiredFields = FIELD_DEFINITIONS.filter(f => f.required && isRequiredFieldUnmapped(f.id));
  
  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Schema Mapping Configuration</h3>
          <p className="text-sm text-muted-foreground">
            Map fields from your catalogue to the QuakeML 1.2 database schema
          </p>
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
                            Created: {new Date(template.created_at).toLocaleDateString()}
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
                            onClick={() => deleteTemplate(template.id)}
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
              <Button variant="outline" size="sm">
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
                <Button onClick={saveTemplate}>
                  Save Template
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      
      {/* Warning for unmapped required fields */}
      {unmappedRequiredFields.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3 rounded-md">
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              {unmappedRequiredFields.length} required field{unmappedRequiredFields.length > 1 ? 's' : ''} not mapped
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
              {unmappedRequiredFields.map(f => f.name).join(', ')}
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
                checked={autoMapping}
                onCheckedChange={setAutoMapping}
              />
              <Label htmlFor="auto-mapping">Auto-detect field mappings</Label>
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
              <span>Source Fields → Target Schema</span>
              <Badge variant="secondary">
                {Object.keys(fieldMappings).length} / {sourceFields.length} mapped
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
                    const targetField = fieldMappings[sourceField];
                    const targetDef = targetField ? getFieldById(targetField) : null;
                    
                    return (
                      <div key={sourceField} className="grid grid-cols-12 gap-3 items-start">
                        <div className="col-span-5">
                          <Label className="font-medium">{sourceField}</Label>
                          <p className="text-xs text-muted-foreground">Source field</p>
                        </div>
                        <div className="col-span-1 flex items-center justify-center pt-2">
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="col-span-6">
                          <Select
                            value={fieldMappings[sourceField] || 'unmapped'}
                            onValueChange={(value) => updateMapping(sourceField, value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select target field" />
                            </SelectTrigger>
                            <SelectContent className="max-h-96">
                              <SelectItem value="unmapped">
                                <span className="text-muted-foreground">Do not map</span>
                              </SelectItem>
                              {FIELD_CATEGORIES.map(category => (
                                <div key={category.id}>
                                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">
                                    {category.name}
                                  </div>
                                  {getFieldsByCategory(category.id).map(field => (
                                    <SelectItem key={field.id} value={field.id}>
                                      <div className="flex items-center gap-2">
                                        <span>{field.name}</span>
                                        {field.required && (
                                          <Badge variant="destructive" className="text-xs px-1">Required</Badge>
                                        )}
                                        {field.unit && (
                                          <span className="text-xs text-muted-foreground">({field.unit})</span>
                                        )}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </div>
                              ))}
                            </SelectContent>
                          </Select>
                          {targetDef && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {targetDef.description}
                            </p>
                          )}
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
              <Accordion type="multiple" value={expandedCategories} className="w-full">
                {FIELD_CATEGORIES.map(category => {
                  const categoryFields = getFieldsByCategory(category.id);
                  const mappedCount = categoryFields.filter(f => 
                    Object.values(fieldMappings).includes(f.id)
                  ).length;
                  const requiredCount = categoryFields.filter(f => f.required).length;
                  const unmappedRequired = categoryFields.filter(f => 
                    f.required && !Object.values(fieldMappings).includes(f.id)
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
    </div>
  );
}

