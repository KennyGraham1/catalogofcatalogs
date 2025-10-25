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
import { ArrowRight, AlertTriangle, Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';

interface SchemaMapperProps {
  validationResults: any;
  isProcessing: boolean;
  onSchemaReady: (isReady: boolean) => void;
}

// Standard schema field definitions
const standardFields = [
  { id: 'eventId', name: 'Event ID', description: 'Unique identifier for the event', required: true },
  { id: 'time', name: 'Time', description: 'Date and time of the event', required: true },
  { id: 'latitude', name: 'Latitude', description: 'Geographical latitude', required: true },
  { id: 'longitude', name: 'Longitude', description: 'Geographical longitude', required: true },
  { id: 'depth', name: 'Depth', description: 'Depth in kilometers', required: false },
  { id: 'magnitude', name: 'Magnitude', description: 'Event magnitude', required: true },
  { id: 'magnitudeType', name: 'Magnitude Type', description: 'Type of magnitude (ML, Mw, etc.)', required: false },
  { id: 'source', name: 'Source', description: 'Data source or agency', required: false },
  { id: 'region', name: 'Region', description: 'Geographical region description', required: false },
  { id: 'status', name: 'Status', description: 'Event status (reviewed, automatic)', required: false },
];

export function SchemaMapper({ validationResults, isProcessing, onSchemaReady }: SchemaMapperProps) {
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});
  const [autoMapping, setAutoMapping] = useState(true);
  const [selectFields, setSelectFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Simulate loading field data
  useEffect(() => {
    const timer = setTimeout(() => {
      if (validationResults && validationResults.length > 0) {
        // Auto-detect common field names
        const detectedMappings: Record<string, string> = {};
        
        // Get all fields from the first validation result
        const sampleFields = validationResults[0].fields || [];
        
        // Perform simple auto-mapping based on common field names
        sampleFields.forEach((field: string) => {
          const lowerField = field.toLowerCase();
          
          // Simple mapping logic
          if (lowerField.includes('id') || lowerField === 'eventid') detectedMappings[field] = 'eventId';
          else if (lowerField.includes('time') || lowerField === 'date') detectedMappings[field] = 'time';
          else if (lowerField.includes('lat')) detectedMappings[field] = 'latitude';
          else if (lowerField.includes('lon')) detectedMappings[field] = 'longitude';
          else if (lowerField.includes('dep')) detectedMappings[field] = 'depth';
          else if (lowerField.includes('mag') && !lowerField.includes('type')) detectedMappings[field] = 'magnitude';
          else if (lowerField.includes('magtype') || lowerField.includes('mag_type')) detectedMappings[field] = 'magnitudeType';
          else if (lowerField.includes('source') || lowerField.includes('agency')) detectedMappings[field] = 'source';
          else if (lowerField.includes('region') || lowerField.includes('location')) detectedMappings[field] = 'region';
          else if (lowerField.includes('status')) detectedMappings[field] = 'status';
        });
        
        setFieldMappings(detectedMappings);
        
        // Set all fields as selected initially
        setSelectFields(standardFields.map(f => f.id));
      }
      
      setLoading(false);
      
      // Check if required fields are mapped
      checkRequiredFields();
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [validationResults]);
  
  // Check if required fields are mapped correctly
  const checkRequiredFields = () => {
    const isMappingComplete = standardFields
      .filter(field => field.required)
      .every(field => {
        return Object.values(fieldMappings).includes(field.id);
      });
    
    onSchemaReady(isMappingComplete);
  };
  
  // Update field mapping
  const updateMapping = (sourceField: string, targetField: string) => {
    setFieldMappings(prev => {
      const updated = { ...prev, [sourceField]: targetField };
      return updated;
    });
    
    // Re-check required fields
    setTimeout(checkRequiredFields, 0);
  };
  
  // Toggle field selection
  const toggleFieldSelection = (fieldId: string) => {
    setSelectFields(prev => {
      if (prev.includes(fieldId)) {
        return prev.filter(id => id !== fieldId);
      } else {
        return [...prev, fieldId];
      }
    });
  };
  
  // Get source fields from validation results
  const getSourceFields = () => {
    if (!validationResults || validationResults.length === 0) return [];
    return validationResults[0].fields || [];
  };
  
  // Determine if a required field is unmapped
  const isRequiredFieldUnmapped = (fieldId: string) => {
    if (!standardFields.find(f => f.id === fieldId)?.required) return false;
    return !Object.values(fieldMappings).includes(fieldId);
  };
  
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Analyzing catalogue structure...</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Schema Mapping</h3>
          <p className="text-sm text-muted-foreground">
            Map fields from your catalogue to standardized schema fields
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id="auto-mapping"
            checked={autoMapping}
            onCheckedChange={setAutoMapping}
          />
          <Label htmlFor="auto-mapping">Auto-mapping</Label>
        </div>
      </div>
      
      <div className="space-y-4">
        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3 rounded-md">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Please ensure all required fields are correctly mapped for proper data integration.
          </p>
        </div>
        
        <div className="border rounded-md overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 text-sm font-medium">
            Field Mapping
          </div>
          <div className="p-4 space-y-4">
            {getSourceFields().map((sourceField: string) => (
              <div key={sourceField} className="grid grid-cols-5 gap-4 items-center">
                <div className="col-span-2">
                  <Label>{sourceField}</Label>
                  <p className="text-xs text-muted-foreground">Source field</p>
                </div>
                <div className="flex items-center justify-center">
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="col-span-2">
                  <Select
                    value={fieldMappings[sourceField] || 'unmapped'}
                    onValueChange={(value) => updateMapping(sourceField, value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a field" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unmapped">Do not map</SelectItem>
                      {standardFields.map((field) => (
                        <SelectItem key={field.id} value={field.id}>
                          {field.name} {field.required ? '*' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="border rounded-md overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 text-sm font-medium flex items-center justify-between">
            <span>Fields to Include</span>
            <span className="text-xs text-muted-foreground">
              {selectFields.length} of {standardFields.length} selected
            </span>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {standardFields.map((field) => (
                <div key={field.id} className="flex items-start space-x-2">
                  <Checkbox 
                    id={`select-${field.id}`}
                    checked={selectFields.includes(field.id)}
                    onCheckedChange={() => toggleFieldSelection(field.id)}
                    disabled={field.required}
                  />
                  <div className="grid gap-1">
                    <Label 
                      htmlFor={`select-${field.id}`}
                      className="font-medium flex items-center"
                    >
                      {field.name}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                      {isRequiredFieldUnmapped(field.id) && (
                        <AlertTriangle className="h-4 w-4 text-amber-500 ml-2" />
                      )}
                    </Label>
                    <p className="text-xs text-muted-foreground">{field.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {isProcessing && (
        <div className="flex items-center justify-center mt-6">
          <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
          <span>Processing your catalogues...</span>
        </div>
      )}
    </div>
  );
}