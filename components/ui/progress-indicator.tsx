'use client';

import { Progress } from './progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ProgressStep {
  id: string;
  label: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'complete' | 'error';
  error?: string;
}

interface ProgressIndicatorProps {
  steps: ProgressStep[];
  currentStep?: number;
  className?: string;
}

/**
 * Multi-step progress indicator for long-running operations
 */
export function ProgressIndicator({ steps, currentStep, className }: ProgressIndicatorProps) {
  const completedSteps = steps.filter(s => s.status === 'complete').length;
  const progressPercentage = (completedSteps / steps.length) * 100;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Step {currentStep !== undefined ? currentStep + 1 : completedSteps} of {steps.length}
          </span>
          <span className="font-medium">{Math.round(progressPercentage)}%</span>
        </div>
        <Progress value={progressPercentage} className="h-2" />
      </div>

      <div className="space-y-3">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={cn(
              'flex items-start gap-3 p-3 rounded-lg transition-colors',
              step.status === 'in-progress' && 'bg-primary/5 border border-primary/20',
              step.status === 'error' && 'bg-destructive/5 border border-destructive/20'
            )}
          >
            <div className="flex-shrink-0 mt-0.5">
              {step.status === 'complete' && (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              )}
              {step.status === 'in-progress' && (
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
              )}
              {step.status === 'error' && (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              {step.status === 'pending' && (
                <Circle className="h-5 w-5 text-muted-foreground/40" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={cn(
                  'font-medium text-sm',
                  step.status === 'pending' && 'text-muted-foreground',
                  step.status === 'complete' && 'text-foreground',
                  step.status === 'in-progress' && 'text-primary',
                  step.status === 'error' && 'text-destructive'
                )}>
                  {step.label}
                </p>
              </div>
              {step.description && (
                <p className="text-xs text-muted-foreground mt-1">
                  {step.description}
                </p>
              )}
              {step.error && (
                <p className="text-xs text-destructive mt-1">
                  {step.error}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ProgressCardProps {
  title: string;
  description?: string;
  steps: ProgressStep[];
  currentStep?: number;
}

/**
 * Progress indicator wrapped in a card
 */
export function ProgressCard({ title, description, steps, currentStep }: ProgressCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ProgressIndicator steps={steps} currentStep={currentStep} />
      </CardContent>
    </Card>
  );
}

interface SimpleProgressProps {
  value: number;
  label?: string;
  showPercentage?: boolean;
  className?: string;
}

/**
 * Simple progress bar with label
 */
export function SimpleProgress({ value, label, showPercentage = true, className }: SimpleProgressProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {(label || showPercentage) && (
        <div className="flex items-center justify-between text-sm">
          {label && <span className="text-muted-foreground">{label}</span>}
          {showPercentage && <span className="font-medium">{Math.round(value)}%</span>}
        </div>
      )}
      <Progress value={value} className="h-2" />
    </div>
  );
}

interface IndeterminateProgressProps {
  label?: string;
  className?: string;
}

/**
 * Indeterminate progress indicator for unknown duration tasks
 */
export function IndeterminateProgress({ label, className }: IndeterminateProgressProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{label}</span>
        </div>
      )}
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary animate-pulse" style={{ width: '40%' }} />
      </div>
    </div>
  );
}

