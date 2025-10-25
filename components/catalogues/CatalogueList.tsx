'use client';

import { useFetch } from '@/hooks/use-async';
import { LoadingCard } from '@/components/ui/loading-spinner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle } from 'lucide-react';
import type { MergedCatalogue } from '@/lib/db';

export function CatalogueList() {
  const { data: catalogues, loading, error } = useFetch<MergedCatalogue[]>('/api/catalogues');

  if (loading) {
    return <LoadingCard text="Loading catalogues..." />;
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <p>Failed to load catalogues: {error.message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!catalogues || catalogues.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">No catalogues found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {catalogues.map((catalogue) => (
        <Card key={catalogue.id}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <CardTitle className="text-lg">{catalogue.name}</CardTitle>
              <Badge
                variant={
                  catalogue.status === 'complete'
                    ? 'default'
                    : catalogue.status === 'error'
                    ? 'destructive'
                    : 'secondary'
                }
              >
                {catalogue.status}
              </Badge>
            </div>
            <CardDescription>
              {new Date(catalogue.created_at).toLocaleDateString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              <p className="text-muted-foreground">
                Events: <span className="font-medium text-foreground">{catalogue.event_count}</span>
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

