'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { InfoTooltip } from '@/components/ui/info-tooltip';

export interface MergeMetadata {
  merge_description?: string;
  merge_use_case?: string;
  merge_methodology?: string;
  merge_quality_assessment?: string;
}

interface MergeMetadataFormProps {
  metadata: MergeMetadata;
  onChange: (metadata: MergeMetadata) => void;
}

export function MergeMetadataForm({ metadata, onChange }: MergeMetadataFormProps) {
  const updateField = (field: keyof MergeMetadata, value: string) => {
    onChange({ ...metadata, [field]: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Merge Documentation</CardTitle>
        <CardDescription>
          Document the purpose and methodology of this merge operation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="merge_description">Merge Description</Label>
            <InfoTooltip content="Summarize which catalogues are merged and the high-level goal." />
          </div>
          <Textarea
            id="merge_description"
            placeholder="Describe what catalogues are being merged and why..."
            value={metadata.merge_description || ''}
            onChange={(e) => updateField('merge_description', e.target.value)}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            Provide a brief overview of this merge operation
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="merge_use_case">Intended Use Case</Label>
            <InfoTooltip content="Describe the analysis or workflow this merged catalogue supports." />
          </div>
          <Textarea
            id="merge_use_case"
            placeholder="What is the intended use of this merged catalogue?"
            value={metadata.merge_use_case || ''}
            onChange={(e) => updateField('merge_use_case', e.target.value)}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            Describe the research or analysis purpose for this merged catalogue
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="merge_methodology">Merge Methodology</Label>
            <InfoTooltip content="Record the strategy, thresholds, and any overrides used for merging." />
          </div>
          <Textarea
            id="merge_methodology"
            placeholder="Describe the merge strategy and parameters used..."
            value={metadata.merge_methodology || ''}
            onChange={(e) => updateField('merge_methodology', e.target.value)}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            Document the merge strategy, thresholds, and any special considerations
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="merge_quality_assessment">Quality Assessment</Label>
            <InfoTooltip content="Note validation steps, caveats, or known limitations of the merged output." />
          </div>
          <Textarea
            id="merge_quality_assessment"
            placeholder="Assess the quality and reliability of the merged result..."
            value={metadata.merge_quality_assessment || ''}
            onChange={(e) => updateField('merge_quality_assessment', e.target.value)}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            Note any quality concerns, limitations, or validation performed
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
