'use client';

import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, Loader2, Database, FileCheck, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ProcessingStage = 'idle' | 'mapping' | 'saving' | 'report' | 'complete' | 'error';

export interface ProcessingStep {
  id: ProcessingStage;
  label: string;
  description: string;
  icon: React.ReactNode;
}

export interface ProcessingProgressInfo {
  stage: ProcessingStage;
  progress: number;
  message?: string;
  eventCount?: number;
  eventsProcessed?: number;
}

interface ProcessingProgressIndicatorProps {
  progressInfo: ProcessingProgressInfo;
}

const PROCESSING_STEPS: ProcessingStep[] = [
  {
    id: 'mapping',
    label: 'Applying Mappings',
    description: 'Applying field mappings to events',
    icon: <FileCheck className="h-4 w-4" />,
  },
  {
    id: 'saving',
    label: 'Saving to Database',
    description: 'Creating catalogue and inserting events',
    icon: <Database className="h-4 w-4" />,
  },
  {
    id: 'report',
    label: 'Generating Report',
    description: 'Creating processing summary',
    icon: <ClipboardList className="h-4 w-4" />,
  },
];

export function ProcessingProgressIndicator({
  progressInfo,
}: ProcessingProgressIndicatorProps) {
  const { stage, progress, message, eventCount, eventsProcessed } = progressInfo;

  if (stage === 'idle') {
    return null;
  }

  const getStepStatus = (stepId: ProcessingStage): 'pending' | 'in-progress' | 'complete' | 'error' => {
    const stageOrder: ProcessingStage[] = ['mapping', 'saving', 'report', 'complete'];
    const currentIndex = stageOrder.indexOf(stage);
    const stepIndex = stageOrder.indexOf(stepId);

    if (stage === 'error') {
      return stepIndex <= currentIndex ? 'error' : 'pending';
    }
    if (stage === 'complete' || stepIndex < currentIndex) {
      return 'complete';
    }
    if (stepIndex === currentIndex) {
      return 'in-progress';
    }
    return 'pending';
  };

  const getStepIcon = (step: ProcessingStep, status: 'pending' | 'in-progress' | 'complete' | 'error') => {
    switch (status) {
      case 'pending':
        return <Circle className="h-5 w-5 text-muted-foreground" />;
      case 'in-progress':
        return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
      case 'complete':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'error':
        return <Circle className="h-5 w-5 text-red-600" />;
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="font-medium text-sm">
          {stage === 'complete' ? 'Processing Complete' : 'Processing Catalogue...'}
        </span>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <Progress value={progress} className="h-2" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{message || 'Please wait...'}</span>
          <span className="font-medium">{Math.round(progress)}%</span>
        </div>
        {eventCount && eventsProcessed !== undefined && (
          <p className="text-xs text-muted-foreground">
            {eventsProcessed.toLocaleString()} of {eventCount.toLocaleString()} events
          </p>
        )}
      </div>

      {/* Step indicators */}
      <div className="space-y-2 pt-2">
        {PROCESSING_STEPS.map((step, index) => {
          const status = getStepStatus(step.id);
          return (
            <div
              key={step.id}
              className={cn(
                'flex items-center gap-3 p-2 rounded-md transition-colors',
                status === 'in-progress' && 'bg-primary/5',
                status === 'complete' && 'bg-green-50 dark:bg-green-950/30',
                status === 'error' && 'bg-red-50 dark:bg-red-950/30'
              )}
            >
              {/* Step icon */}
              <div className="flex-shrink-0">
                {getStepIcon(step, status)}
              </div>

              {/* Step content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      status === 'pending' && 'text-muted-foreground',
                      status === 'in-progress' && 'text-primary',
                      status === 'complete' && 'text-green-700 dark:text-green-400',
                      status === 'error' && 'text-red-700 dark:text-red-400'
                    )}
                  >
                    {step.label}
                  </span>
                  {status === 'in-progress' && (
                    <span className="text-xs text-primary font-medium">In Progress</span>
                  )}
                  {status === 'complete' && (
                    <span className="text-xs text-green-600 font-medium">Complete</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>

              {/* Step number */}
              <div className="flex-shrink-0 text-xs text-muted-foreground">
                Step {index + 1}/{PROCESSING_STEPS.length}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
