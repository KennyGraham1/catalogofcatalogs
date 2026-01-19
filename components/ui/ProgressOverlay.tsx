'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

export interface ProgressOverlayProps {
    /** Whether the overlay is visible */
    isOpen: boolean;
    /** Title displayed at the top of the overlay */
    title: string;
    /** Progress percentage (0-100) */
    progress: number;
    /** Optional message describing current operation */
    message?: string;
    /** Optional sub-message with additional details */
    subMessage?: string;
    /** Whether the operation can be cancelled */
    cancellable?: boolean;
    /** Callback when cancel is clicked */
    onCancel?: () => void;
    /** Whether the operation is in an indeterminate state */
    indeterminate?: boolean;
}

/**
 * ProgressOverlay Component
 * 
 * A reusable modal overlay that displays progress for long-running operations.
 * Prevents user interaction with the page while an operation is in progress.
 * 
 * @example
 * ```tsx
 * <ProgressOverlay
 *   isOpen={isImporting}
 *   title="Importing Data"
 *   progress={importProgress}
 *   message="Processing events..."
 *   subMessage="2,500 of 5,000 events"
 *   cancellable
 *   onCancel={() => setIsImporting(false)}
 * />
 * ```
 */
export const ProgressOverlay = memo(function ProgressOverlay({
    isOpen,
    title,
    progress,
    message,
    subMessage,
    cancellable = false,
    onCancel,
    indeterminate = false,
}: ProgressOverlayProps) {
    if (!isOpen) return null;

    return (
        <div
            className={cn(
                'fixed inset-0 z-[9999] flex items-center justify-center',
                'bg-background/80 backdrop-blur-sm',
                'transition-opacity duration-200'
            )}
            role="dialog"
            aria-modal="true"
            aria-labelledby="progress-title"
            aria-describedby="progress-message"
        >
            <div
                className={cn(
                    'relative w-full max-w-md mx-4',
                    'bg-card border rounded-lg shadow-lg',
                    'p-6 space-y-4'
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h2
                        id="progress-title"
                        className="text-lg font-semibold flex items-center gap-2"
                    >
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        {title}
                    </h2>
                    {cancellable && onCancel && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onCancel}
                            className="h-8 w-8"
                            aria-label="Cancel operation"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                    {indeterminate ? (
                        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                            <div
                                className={cn(
                                    'h-full bg-primary rounded-full',
                                    'animate-[indeterminate_1.5s_ease-in-out_infinite]'
                                )}
                                style={{ width: '40%' }}
                            />
                        </div>
                    ) : (
                        <Progress value={progress} className="h-2" />
                    )}

                    {!indeterminate && (
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{Math.round(progress)}%</span>
                            <span>{progress >= 100 ? 'Complete' : 'In progress'}</span>
                        </div>
                    )}
                </div>

                {/* Messages */}
                <div id="progress-message" className="space-y-1">
                    {message && (
                        <p className="text-sm text-foreground">{message}</p>
                    )}
                    {subMessage && (
                        <p className="text-xs text-muted-foreground">{subMessage}</p>
                    )}
                </div>

                {/* Cancel Button (mobile-friendly) */}
                {cancellable && onCancel && (
                    <div className="pt-2">
                        <Button
                            variant="outline"
                            onClick={onCancel}
                            className="w-full"
                        >
                            Cancel Operation
                        </Button>
                    </div>
                )}
            </div>

            {/* Custom animation for indeterminate progress */}
            <style jsx global>{`
        @keyframes indeterminate {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(350%);
          }
        }
      `}</style>
        </div>
    );
});

export default ProgressOverlay;
