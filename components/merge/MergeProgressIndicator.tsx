'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
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
  currentStep: number;
  progress: number;
  estimatedTimeRemaining?: number;
}

export function MergeProgressIndicator({
  steps,
  currentStep,
  progress,
  estimatedTimeRemaining
}: MergeProgressIndicatorProps) {
  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${minutes}m ${secs}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Merge Progress</CardTitle>
        <CardDescription>
          {progress < 100 ? 'Processing merge operation...' : 'Merge complete!'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Overall Progress</span>
            <span className="text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
          {estimatedTimeRemaining !== undefined && estimatedTimeRemaining > 0 && (
            <p className="text-xs text-muted-foreground">
              Estimated time remaining: {formatTime(estimatedTimeRemaining)}
            </p>
          )}
        </div>

        {/* Step-by-Step Progress */}
        <div className="space-y-3">
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
              {/* Status Icon */}
              <div className="mt-0.5">
                {step.status === 'pending' && (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
                {step.status === 'in-progress' && (
                  <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                )}
                {step.status === 'complete' && (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                )}
                {step.status === 'error' && (
                  <Circle className="h-5 w-5 text-red-600" />
                )}
              </div>

              {/* Step Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Step {index + 1}/{steps.length}
                  </span>
                  {step.status === 'in-progress' && (
                    <span className="text-xs text-blue-600 font-medium">In Progress</span>
                  )}
                  {step.status === 'complete' && (
                    <span className="text-xs text-green-600 font-medium">Complete</span>
                  )}
                  {step.status === 'error' && (
                    <span className="text-xs text-red-600 font-medium">Error</span>
                  )}
                </div>
                <p className="text-sm font-medium mt-1">{step.label}</p>
                {step.message && (
                  <p className="text-xs text-muted-foreground mt-1">{step.message}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

