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
}

export default function EditCataloguePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCatalogue();
  }, [params.id]);

  const fetchCatalogue = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/catalogues/${params.id}`);
      if (!response.ok) throw new Error('Failed to fetch catalogue');
      const data = await response.json();
      setCatalogue(data);
      setName(data.name);
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
        body: JSON.stringify({ name }),
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

  if (loading) {
    return (
      <div className="container py-8">
        <div className="max-w-2xl mx-auto">
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
      <div className="max-w-2xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => router.push('/catalogues')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Catalogues
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Edit Catalogue</CardTitle>
            <CardDescription>
              Update the metadata for this catalogue
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Catalogue Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter catalogue name"
              />
            </div>

            <div className="space-y-2">
              <Label>Event Count</Label>
              <p className="text-sm text-muted-foreground">
                {catalogue.event_count.toLocaleString()} events
              </p>
            </div>

            <div className="space-y-2">
              <Label>Created</Label>
              <p className="text-sm text-muted-foreground">
                {new Date(catalogue.created_at).toLocaleString()}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <p className="text-sm text-muted-foreground capitalize">
                {catalogue.status}
              </p>
            </div>

            <div className="space-y-2">
              <GeographicBoundsDisplay
                minLatitude={catalogue.min_latitude}
                maxLatitude={catalogue.max_latitude}
                minLongitude={catalogue.min_longitude}
                maxLongitude={catalogue.max_longitude}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button onClick={handleSave} disabled={saving}>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

