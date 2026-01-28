'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';
import { GeographicBoundsDisplay } from '@/components/catalogues/GeographicBoundsDisplay';
import { CatalogueMetadataForm, CatalogueMetadata } from '@/components/upload/CatalogueMetadataForm';
import { useAuth } from '@/lib/auth/hooks';
import { AuthGateCard } from '@/components/auth/AuthGateCard';
import { UserRole } from '@/lib/auth/types';

interface Catalogue {
  id: string;
  name: string;
  created_at: string;
  source_catalogues: string;
  merge_config: string;
  event_count: number;
  status: string;
  min_latitude?: number | null;
  max_latitude?: number | null;
  min_longitude?: number | null;
  max_longitude?: number | null;

  // Metadata fields
  description?: string;
  data_source?: string;
  provider?: string;
  geographic_region?: string;
  time_period_start?: string;
  time_period_end?: string;
  data_quality?: {
    completeness?: string;
    accuracy?: string;
    reliability?: string;
  };
  quality_notes?: string;
  contact_name?: string;
  contact_email?: string;
  contact_organization?: string;
  license?: string;
  usage_terms?: string;
  citation?: string;
  doi?: string;
  version?: string;
  keywords?: string[];
  reference_links?: string[];
  notes?: string;
}

export default function EditCataloguePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const canEdit = user?.role === UserRole.EDITOR || user?.role === UserRole.ADMIN;
  const isReadOnly = !canEdit;
  const editBlockedMessage = !user
    ? 'Log in to edit catalogues.'
    : 'Editor or Admin access is required to edit catalogues.';
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [name, setName] = useState('');
  const [metadata, setMetadata] = useState<CatalogueMetadata>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canEdit) {
      return;
    }
    fetchCatalogue();
    // fetchCatalogue uses params.id which is already in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, canEdit]);

  const fetchCatalogue = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/catalogues/${params.id}`);
      if (!response.ok) throw new Error('Failed to fetch catalogue');
      const data = await response.json();
      setCatalogue(data);
      setName(data.name);

      // Helper to parse array fields that might be stored as JSON strings
      const parseArrayField = (value: any): string[] => {
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        }
        return [];
      };

      // Helper to parse object fields that might be stored as JSON strings
      const parseObjectField = (value: any, defaultValue: any): any => {
        if (typeof value === 'object' && value !== null) return value;
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            return defaultValue;
          }
        }
        return defaultValue;
      };

      // Pre-populate metadata from catalogue
      setMetadata({
        description: data.description || '',
        data_source: data.data_source || '',
        provider: data.provider || '',
        geographic_region: data.geographic_region || '',
        time_period_start: data.time_period_start || '',
        time_period_end: data.time_period_end || '',
        data_quality: parseObjectField(data.data_quality, { completeness: '', accuracy: '', reliability: '' }),
        quality_notes: data.quality_notes || '',
        contact_name: data.contact_name || '',
        contact_email: data.contact_email || '',
        contact_organization: data.contact_organization || '',
        license: data.license || '',
        usage_terms: data.usage_terms || '',
        citation: data.citation || '',
        doi: data.doi || '',
        version: data.version || '',
        keywords: parseArrayField(data.keywords),
        reference_links: parseArrayField(data.reference_links),
        notes: data.notes || '',
      });
    } catch (error) {
      toast({
        title: "Error loading catalogue",
        description: "Failed to load catalogue details",
        variant: "destructive",
      });
      router.push('/catalogues');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (isReadOnly) {
      toast({
        title: 'Read-only mode',
        description: editBlockedMessage,
        variant: 'destructive',
      });
      return;
    }
    if (!name.trim()) {
      toast({
        title: "Validation error",
        description: "Catalogue name cannot be empty",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`/api/catalogues/${params.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          ...metadata
        }),
      });

      if (!response.ok) throw new Error('Failed to update catalogue');

      toast({
        title: "Success",
        description: "Catalogue updated successfully",
      });

      router.push('/catalogues');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update catalogue",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="container py-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-muted-foreground">Checking access...</p>
        </div>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <AuthGateCard
        title={user ? 'Editor access required' : 'Login required'}
        description={editBlockedMessage}
        requiredRole={UserRole.EDITOR}
        action={
          user
            ? { label: 'Back to Catalogues', href: '/catalogues' }
            : { label: 'Log in', href: '/login' }
        }
        secondaryAction={
          user
            ? { label: 'View Catalogue', href: `/catalogues/${params.id}` }
            : { label: 'Back to Home', href: '/' }
        }
      />
    );
  }

  if (loading) {
    return (
      <div className="container py-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!catalogue) {
    return null;
  }

  return (
    <div className="container py-8">
      <div className="max-w-4xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => router.push('/catalogues')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Catalogues
        </Button>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Edit Catalogue</CardTitle>
            <CardDescription>
              Update the metadata for this catalogue
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Catalogue Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter catalogue name"
                disabled={isReadOnly}
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Event Count</Label>
                <p className="text-sm text-muted-foreground">
                  {catalogue.event_count.toLocaleString()} events
                </p>
              </div>

              <div className="space-y-2">
                <Label>Created</Label>
                <p className="text-sm text-muted-foreground">
                  {new Date(catalogue.created_at).toLocaleString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <p className="text-sm text-muted-foreground capitalize">
                  {catalogue.status}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <GeographicBoundsDisplay
                minLatitude={catalogue.min_latitude}
                maxLatitude={catalogue.max_latitude}
                minLongitude={catalogue.min_longitude}
                maxLongitude={catalogue.max_longitude}
              />
            </div>
          </CardContent>
        </Card>

        <CatalogueMetadataForm
          metadata={metadata}
          onChange={setMetadata}
          readOnly={isReadOnly}
        />

        <div className="flex gap-3 pt-6">
          <Button onClick={handleSave} disabled={saving || isReadOnly}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push('/catalogues')}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
