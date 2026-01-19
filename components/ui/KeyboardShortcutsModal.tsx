'use client';

import { memo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Keyboard } from 'lucide-react';
import { formatShortcut } from '@/hooks/use-keyboard-shortcuts';

interface ShortcutItem {
    key: string;
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    description: string;
}

interface KeyboardShortcutsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// Global shortcuts available throughout the app
const globalShortcuts: ShortcutItem[] = [
    { key: '/', description: 'Open search' },
    { key: '/', ctrl: true, description: 'Show keyboard shortcuts' },
    { key: 'Escape', description: 'Close modal/dialog' },
];

// Page-specific shortcuts
const pageShortcuts: { page: string; shortcuts: ShortcutItem[] }[] = [
    {
        page: 'Catalogues',
        shortcuts: [
            { key: 'f', ctrl: true, description: 'Focus search input' },
            { key: 'r', ctrl: true, description: 'Refresh catalogues' },
        ],
    },
    {
        page: 'Analytics',
        shortcuts: [
            { key: 'f', ctrl: true, description: 'Focus filter panel' },
            { key: 'm', ctrl: true, description: 'Toggle map view' },
        ],
    },
];

export const KeyboardShortcutsModal = memo(function KeyboardShortcutsModal({
    open,
    onOpenChange,
}: KeyboardShortcutsModalProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Keyboard className="h-5 w-5" />
                        Keyboard Shortcuts
                    </DialogTitle>
                    <DialogDescription>
                        Use these shortcuts to navigate quickly
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Global Shortcuts */}
                    <div>
                        <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                            Global
                        </h3>
                        <div className="space-y-2">
                            {globalShortcuts.map((shortcut, index) => (
                                <ShortcutRow key={index} shortcut={shortcut} />
                            ))}
                        </div>
                    </div>

                    {/* Page-specific Shortcuts */}
                    {pageShortcuts.map((section) => (
                        <div key={section.page}>
                            <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                                {section.page}
                            </h3>
                            <div className="space-y-2">
                                {section.shortcuts.map((shortcut, index) => (
                                    <ShortcutRow key={index} shortcut={shortcut} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
});

function ShortcutRow({ shortcut }: { shortcut: ShortcutItem }) {
    return (
        <div className="flex items-center justify-between text-sm">
            <span className="text-foreground">{shortcut.description}</span>
            <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
                {formatShortcut(shortcut)}
            </kbd>
        </div>
    );
}

export default KeyboardShortcutsModal;
