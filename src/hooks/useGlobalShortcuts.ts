import { useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

export function useGlobalShortcuts() {
  const { toggleTheme } = useTheme();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Ctrl/Cmd + Shift + L toggles light/dark mode globally
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        if (!isTyping) toggleTheme();
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('fmail:open-command-palette'));
      }

      if (!isTyping && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === '/') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('fmail:focus-search'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleTheme]);
}
