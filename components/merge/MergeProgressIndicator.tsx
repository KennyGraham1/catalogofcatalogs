'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MergeStep {
  id: string;
  label: string;
  status: 'pending' | 'in-progress' | 'complete' | 'error';
  message?: string;
}

interface MergeProgressIndicatorProps {
  steps: MergeStep[];
  /** When the merge started (ms since the epoch); the card shows the time elapsed since. */
  startedAt?: number | null;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${seconds % 60} s`;
}

/**
 * The stages of a running merge and the time elapsed. The server reports no progress within
 * its request, so there is no percentage or time estimate: the stages change only when the
 * request returns.
 */
export function MergeProgressIndicator({ steps, startedAt }: MergeProgressIndicatorProps) {
  const running = steps.some(step => step.status === 'in-progress');
  const failed = steps.some(step => step.status === 'error');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const elapsed = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Merge progress</CardTitle>
        <CardDescription>
          {failed ? 'The merge failed.' : running ? 'Merging.' : 'Merge complete.'}
          {running && elapsed !== null && ` Elapsed: ${formatElapsed(elapsed)}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3" role="status" aria-live="polite">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={cn(
              'flex items-start gap-3 p-3 rounded-lg transition-colors',
              step.status === 'in-progress' && 'bg-blue-50 dark:bg-blue-950',
              step.status === 'complete' && 'bg-green-50 dark:bg-green-950',
              step.status === 'error' && 'bg-red-50 dark:bg-red-950'
            )}
          >
            <div className="mt-0.5">
              {step.status === 'pending' && <Circle className="h-5 w-5 text-muted-foreground" />}
              {step.status === 'in-progress' && <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />}
              {step.status === 'complete' && <CheckCircle2 className="h-5 w-5 text-green-600" />}
              {step.status === 'error' && <Circle className="h-5 w-5 text-red-600" />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Step {index + 1} of {steps.length}
                </span>
                {step.status === 'in-progress' && (
                  <span className="text-xs text-blue-600 font-medium">In progress</span>
                )}
                {step.status === 'complete' && (
                  <span className="text-xs text-green-600 font-medium">Complete</span>
                )}
                {step.status === 'error' && (
                  <span className="text-xs text-red-600 font-medium">Failed</span>
                )}
              </div>
              <p className="text-sm font-medium mt-1">{step.label}</p>
              {step.message && (
                <p className="text-xs text-muted-foreground mt-1">{step.message}</p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
