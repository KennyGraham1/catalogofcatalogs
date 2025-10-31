'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatShortcut } from '@/hooks/use-keyboard-shortcuts';
import { Keyboard } from 'lucide-react';

interface ShortcutGroup {
  title: string;
  shortcuts: {
    keys: string;
    description: string;
  }[];
}

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsHelp({ open, onOpenChange }: KeyboardShortcutsHelpProps) {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const ctrlKey = isMac ? '⌘' : 'Ctrl';

  const shortcutGroups: ShortcutGroup[] = [
    {
      title: 'Global',
      shortcuts: [
        { keys: `${ctrlKey}+K`, description: 'Open command palette' },
        { keys: '/', description: 'Open global search' },
        { keys: `${ctrlKey}+/`, description: 'Show keyboard shortcuts' },
        { keys: 'Escape', description: 'Close dialogs and modals' },
      ]
    },
    {
      title: 'Navigation',
      shortcuts: [
        { keys: `${ctrlKey}+H`, description: 'Go to dashboard' },
        { keys: `${ctrlKey}+L`, description: 'Go to catalogues list' },
        { keys: `${ctrlKey}+I`, description: 'Go to import page' },
        { keys: `${ctrlKey}+U`, description: 'Go to upload page' },
        { keys: `${ctrlKey}+M`, description: 'Go to merge page' },
      ]
    },
    {
      title: 'Catalogues Page',
      shortcuts: [
        { keys: `${ctrlKey}+F`, description: 'Focus search input' },
        { keys: `${ctrlKey}+R`, description: 'Refresh catalogues' },
      ]
    },
    {
      title: 'Map View',
      shortcuts: [
        { keys: '+', description: 'Zoom in' },
        { keys: '-', description: 'Zoom out' },
        { keys: 'Arrow keys', description: 'Pan map' },
      ]
    },
    {
      title: 'Command Palette',
      shortcuts: [
        { keys: '↑↓', description: 'Navigate commands' },
        { keys: 'Enter', description: 'Execute selected command' },
        { keys: 'Escape', description: 'Close palette' },
      ]
    }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" />
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
          </div>
          <DialogDescription>
            Use these keyboard shortcuts to navigate and interact with the application more efficiently.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {shortcutGroups.map((group) => (
            <div key={group.title}>
              <h3 className="font-semibold text-sm mb-3 text-foreground">
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-sm text-muted-foreground">
                      {shortcut.description}
                    </span>
                    <kbd className="pointer-events-none inline-flex h-6 select-none items-center gap-1 rounded border bg-muted px-2 font-mono text-xs font-medium text-muted-foreground">
                      {shortcut.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t text-xs text-muted-foreground">
          <p>
            Press <kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono">Escape</kbd> to close this dialog
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

