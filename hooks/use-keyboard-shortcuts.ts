'use client';

import { useEffect, useCallback } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  description: string;
  action: () => void;
  preventDefault?: boolean;
}

interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
}

/**
 * Hook to register keyboard shortcuts
 * @param options - Configuration object with shortcuts array and enabled flag
 * 
 * @example
 * useKeyboardShortcuts({
 *   shortcuts: [
 *     { key: 'k', ctrl: true, description: 'Open search', action: () => setSearchOpen(true) },
 *     { key: 'Escape', description: 'Close modal', action: () => setModalOpen(false) }
 *   ]
 * });
 */
export function useKeyboardShortcuts({ shortcuts, enabled = true }: UseKeyboardShortcutsOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger shortcuts when typing in input fields
      const target = event.target as HTMLElement;
      const isInputField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      for (const shortcut of shortcuts) {
        // Guard against undefined event.key
        if (!event.key) continue;
        const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatches = shortcut.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey;
        const shiftMatches = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatches = shortcut.alt ? event.altKey : !event.altKey;

        if (keyMatches && ctrlMatches && shiftMatches && altMatches) {
          // Allow Escape key even in input fields
          if (isInputField && shortcut.key !== 'Escape') {
            continue;
          }

          if (shortcut.preventDefault !== false) {
            event.preventDefault();
          }

          shortcut.action();
          break;
        }
      }
    },
    [shortcuts, enabled]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);
}

/**
 * Format keyboard shortcut for display
 * @param shortcut - Keyboard shortcut configuration
 * @returns Formatted string like "Ctrl+K" or "Shift+F"
 */
export function formatShortcut(shortcut: Omit<KeyboardShortcut, 'action' | 'description'>): string {
  const parts: string[] = [];

  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  if (shortcut.ctrl || shortcut.meta) {
    parts.push(isMac ? '⌘' : 'Ctrl');
  }
  if (shortcut.shift) {
    parts.push(isMac ? '⇧' : 'Shift');
  }
  if (shortcut.alt) {
    parts.push(isMac ? '⌥' : 'Alt');
  }

  // Capitalize first letter of key
  const key = shortcut.key.charAt(0).toUpperCase() + shortcut.key.slice(1);
  parts.push(key);

  return parts.join('+');
}

