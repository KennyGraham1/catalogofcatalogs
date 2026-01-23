'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, X } from 'lucide-react';
import { InfoTooltip } from '@/components/ui/info-tooltip';

export interface CatalogueMetadata {
  // Basic metadata
  description?: string;
  data_source?: string;
  provider?: string;
  geographic_region?: string;
  
  // Time period
  time_period_start?: string;
  time_period_end?: string;
  
  // Quality
  data_quality?: {
    completeness?: string;
    accuracy?: string;
    reliability?: string;
  };
  quality_notes?: string;
  
  // Contact
  contact_name?: string;
  contact_email?: string;
  contact_organization?: string;
  
  // License
  license?: string;
  usage_terms?: string;
  citation?: string;
  
  // Additional
  doi?: string;
  version?: string;
  keywords?: string[];
  reference_links?: string[];
  notes?: string;
}

interface CatalogueMetadataFormProps {
  metadata: CatalogueMetadata;
  onChange: (metadata: CatalogueMetadata) => void;
  showMergeFields?: boolean;
  readOnly?: boolean;
}

export function CatalogueMetadataForm({ metadata, onChange, showMergeFields = false, readOnly = false }: CatalogueMetadataFormProps) {
  const [newKeyword, setNewKeyword] = useState('');
  const [newReference, setNewReference] = useState('');

  const updateField = (field: keyof CatalogueMetadata, value: any) => {
    if (readOnly) return;
    onChange({ ...metadata, [field]: value });
  };

  const updateQualityField = (field: string, value: string) => {
    if (readOnly) return;
    onChange({
      ...metadata,
      data_quality: {
        ...metadata.data_quality,
        [field]: value
      }
    });
  };

  const addKeyword = () => {
    if (readOnly) return;
    if (newKeyword.trim()) {
      const keywords = metadata.keywords || [];
      onChange({ ...metadata, keywords: [...keywords, newKeyword.trim()] });
      setNewKeyword('');
    }
  };

  const removeKeyword = (index: number) => {
    if (readOnly) return;
    const keywords = metadata.keywords || [];
    onChange({ ...metadata, keywords: keywords.filter((_, i) => i !== index) });
  };

  const addReference = () => {
    if (readOnly) return;
    if (newReference.trim()) {
      const references = metadata.reference_links || [];
      onChange({ ...metadata, reference_links: [...references, newReference.trim()] });
      setNewReference('');
    }
  };

  const removeReference = (index: number) => {
    if (readOnly) return;
    const references = metadata.reference_links || [];
    onChange({ ...metadata, reference_links: references.filter((_, i) => i !== index) });
  };

  return (
    <Tabs defaultValue="basic" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="basic">Basic Info</TabsTrigger>
        <TabsTrigger value="quality">Quality & Coverage</TabsTrigger>
        <TabsTrigger value="contact">Contact & License</TabsTrigger>
        <TabsTrigger value="additional">Additional</TabsTrigger>
      </TabsList>

      <TabsContent value="basic" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Provide essential details about this catalogue</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe the catalogue, its purpose, and contents..."
                value={metadata.description || ''}
                onChange={(e) => updateField('description', e.target.value)}
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="data_source">Data Source</Label>
                <Input
                  id="data_source"
                  placeholder="e.g., GeoNet, ISC, Local Network"
                  value={metadata.data_source || ''}
                  onChange={(e) => updateField('data_source', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="provider">Provider/Organization</Label>
                <Input
                  id="provider"
                  placeholder="e.g., GNS Science, University"
                  value={metadata.provider || ''}
                  onChange={(e) => updateField('provider', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="geographic_region">Geographic Region</Label>
              <Input
                id="geographic_region"
                placeholder="e.g., New Zealand, Pacific Ring of Fire"
                value={metadata.geographic_region || ''}
                onChange={(e) => updateField('geographic_region', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                placeholder="e.g., 1.0, 2024.1"
                value={metadata.version || ''}
                onChange={(e) => updateField('version', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="quality" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Data Quality & Coverage</CardTitle>
            <CardDescription>Specify quality metrics and temporal coverage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="time_period_start">Time Period Start</Label>
                  <InfoTooltip content="Earliest event time covered by this catalogue." />
                </div>
                <Input
                  id="time_period_start"
                  type="datetime-local"
                  value={metadata.time_period_start || ''}
                  onChange={(e) => updateField('time_period_start', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="time_period_end">Time Period End</Label>
                  <InfoTooltip content="Latest event time covered by this catalogue." />
                </div>
                <Input
                  id="time_period_end"
                  type="datetime-local"
                  value={metadata.time_period_end || ''}
                  onChange={(e) => updateField('time_period_end', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>Data Quality Assessment</Label>
                <InfoTooltip content="Subjective quality ratings to document known strengths or gaps." />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="completeness" className="text-sm text-muted-foreground">Completeness</Label>
                    <InfoTooltip content="How fully fields are populated across events." />
                  </div>
                  <Select
                    value={metadata.data_quality?.completeness || ''}
                    onValueChange={(value) => updateQualityField('completeness', value)}
                  >
                    <SelectTrigger id="completeness">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="moderate">Moderate</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="accuracy" className="text-sm text-muted-foreground">Accuracy</Label>
                    <InfoTooltip content="Confidence in event locations and magnitudes." />
                  </div>
                  <Select
                    value={metadata.data_quality?.accuracy || ''}
                    onValueChange={(value) => updateQualityField('accuracy', value)}
                  >
                    <SelectTrigger id="accuracy">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="moderate">Moderate</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="reliability" className="text-sm text-muted-foreground">Reliability</Label>
                    <InfoTooltip content="Consistency of the data over time or across sources." />
                  </div>
                  <Select
                    value={metadata.data_quality?.reliability || ''}
                    onValueChange={(value) => updateQualityField('reliability', value)}
                  >
                    <SelectTrigger id="reliability">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="moderate">Moderate</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quality_notes">Quality Notes</Label>
              <Textarea
                id="quality_notes"
                placeholder="Additional notes about data quality, limitations, or known issues..."
                value={metadata.quality_notes || ''}
                onChange={(e) => updateField('quality_notes', e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="contact" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
            <CardDescription>Provide contact details for inquiries</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contact_name">Contact Name</Label>
              <Input
                id="contact_name"
                placeholder="Full name"
                value={metadata.contact_name || ''}
                onChange={(e) => updateField('contact_name', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_email">Contact Email</Label>
              <Input
                id="contact_email"
                type="email"
                placeholder="email@example.com"
                value={metadata.contact_email || ''}
                onChange={(e) => updateField('contact_email', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_organization">Organization</Label>
              <Input
                id="contact_organization"
                placeholder="Organization name"
                value={metadata.contact_organization || ''}
                onChange={(e) => updateField('contact_organization', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>License & Usage</CardTitle>
            <CardDescription>Specify licensing and usage terms</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="license">License</Label>
              <Select
                value={metadata.license || ''}
                onValueChange={(value) => updateField('license', value)}
              >
                <SelectTrigger id="license">
                  <SelectValue placeholder="Select a license..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CC0">CC0 (Public Domain)</SelectItem>
                  <SelectItem value="CC-BY-4.0">CC BY 4.0</SelectItem>
                  <SelectItem value="CC-BY-SA-4.0">CC BY-SA 4.0</SelectItem>
                  <SelectItem value="CC-BY-NC-4.0">CC BY-NC 4.0</SelectItem>
                  <SelectItem value="ODbL">Open Database License (ODbL)</SelectItem>
                  <SelectItem value="proprietary">Proprietary</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="usage_terms">Usage Terms</Label>
              <Textarea
                id="usage_terms"
                placeholder="Specify any usage restrictions or requirements..."
                value={metadata.usage_terms || ''}
                onChange={(e) => updateField('usage_terms', e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="citation">Preferred Citation</Label>
              <Textarea
                id="citation"
                placeholder="How should this catalogue be cited?"
                value={metadata.citation || ''}
                onChange={(e) => updateField('citation', e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="doi">DOI (Digital Object Identifier)</Label>
              <Input
                id="doi"
                placeholder="10.xxxx/xxxxx"
                value={metadata.doi || ''}
                onChange={(e) => updateField('doi', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="additional" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Keywords</CardTitle>
            <CardDescription>Add keywords to help categorize this catalogue</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Add a keyword..."
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                disabled={readOnly}
              />
              <Button type="button" onClick={addKeyword} size="sm" disabled={readOnly}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(metadata.keywords || []).map((keyword, index) => (
                <Badge key={index} variant="secondary" className="gap-1">
                  {keyword}
                  <button
                    type="button"
                    onClick={() => removeKeyword(index)}
                    className="ml-1 hover:text-destructive disabled:opacity-50"
                    disabled={readOnly}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reference Links</CardTitle>
            <CardDescription>Add links to related publications or resources</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="https://..."
                value={newReference}
                onChange={(e) => setNewReference(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addReference())}
                disabled={readOnly}
              />
              <Button type="button" onClick={addReference} size="sm" disabled={readOnly}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              {(metadata.reference_links || []).map((link, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                  <a href={link} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm text-blue-600 hover:underline truncate">
                    {link}
                  </a>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeReference(index)}
                    disabled={readOnly}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Additional Notes</CardTitle>
            <CardDescription>Any other relevant information</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Additional notes, comments, or information..."
              value={metadata.notes || ''}
              onChange={(e) => updateField('notes', e.target.value)}
              rows={4}
            />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
