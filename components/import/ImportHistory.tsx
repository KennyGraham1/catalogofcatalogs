'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ImportHistoryRecord {
  id: string;
  catalogue_id: string;
  start_time: string;
  end_time: string;
  total_fetched: number;
  new_events: number;
  updated_events: number;
  skipped_events: number;
  errors: string | null;
  created_at: string;
}

interface ImportHistoryProps {
  catalogueId?: string;
  limit?: number;
}

export function ImportHistory({ catalogueId, limit = 10 }: ImportHistoryProps) {
  const [history, setHistory] = useState<ImportHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!catalogueId) return;
    
    const fetchHistory = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/import/history?catalogueId=${catalogueId}&limit=${limit}`);
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || data.error || 'Failed to fetch history');
        }
        
        const data = await response.json();
        setHistory(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchHistory();
  }, [catalogueId, limit]);
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };
  
  const formatDuration = (startTime: string, endTime: string) => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const duration = end.getTime() - start.getTime();
    return `${(duration / 1000).toFixed(2)}s`;
  };
  
  if (!catalogueId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import History</CardTitle>
          <CardDescription>
            Select a catalogue to view import history
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Import History</CardTitle>
        <CardDescription>
          Recent imports for this catalogue
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : history.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No import history found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Fetched</TableHead>
                  <TableHead className="text-right">New</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                  <TableHead className="text-right">Skipped</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((record) => {
                  const errors = record.errors ? JSON.parse(record.errors) : [];
                  const hasErrors = errors.length > 0;
                  
                  return (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">
                        {formatDate(record.created_at)}
                      </TableCell>
                      <TableCell>
                        {hasErrors ? (
                          <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                            <XCircle className="h-3 w-3" />
                            {errors.length} error{errors.length > 1 ? 's' : ''}
                          </Badge>
                        ) : (
                          <Badge variant="default" className="flex items-center gap-1 w-fit bg-green-600">
                            <CheckCircle className="h-3 w-3" />
                            Success
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{record.total_fetched}</TableCell>
                      <TableCell className="text-right text-green-600 font-semibold">
                        {record.new_events}
                      </TableCell>
                      <TableCell className="text-right text-blue-600 font-semibold">
                        {record.updated_events}
                      </TableCell>
                      <TableCell className="text-right text-gray-600">
                        {record.skipped_events}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatDuration(record.start_time, record.end_time)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

