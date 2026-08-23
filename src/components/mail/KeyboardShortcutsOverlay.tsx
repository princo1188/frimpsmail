import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { group: 'Navigation', items: [
    { keys: ['c'], label: 'Compose new email' },
    { keys: ['Ctrl', 'k'], label: 'Open command palette' },
    { keys: ['/'], label: 'Focus search' },
    { keys: ['j'], label: 'Next thread' },
    { keys: ['k'], label: 'Previous thread' },
    { keys: ['?'], label: 'Show keyboard shortcuts' },
  ]},
  { group: 'Thread Actions', items: [
    { keys: ['r'], label: 'Reply' },
    { keys: ['a'], label: 'Reply all' },
    { keys: ['f'], label: 'Forward' },
    { keys: ['e'], label: 'Archive thread' },
    { keys: ['#'], label: 'Delete thread' },
    { keys: ['s'], label: 'Star / unstar thread' },
  ]},
  { group: 'Selection', items: [
    { keys: ['x'], label: 'Select thread' },
    { keys: ['Shift', 'a'], label: 'Select all visible' },
    { keys: ['Esc'], label: 'Clear selection' },
  ]},
  { group: 'Compose', items: [
    { keys: ['Ctrl', 'Enter'], label: 'Send message' },
    { keys: ['Ctrl', 'Shift', 'c'], label: 'Add CC' },
    { keys: ['Ctrl', 'Shift', 'b'], label: 'Add BCC' },
    { keys: ['Ctrl', 'k'], label: 'Insert link' },
    { keys: ['Ctrl', 'b'], label: 'Bold' },
    { keys: ['Ctrl', 'i'], label: 'Italic' },
  ]},
];

export default function KeyboardShortcutsOverlay({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
          {SHORTCUTS.map(group => (
            <div key={group.group}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{group.group}</p>
              <div className="space-y-2">
                {group.items.map(item => (
                  <div key={item.label} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-foreground">{item.label}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <Kbd>{k}</Kbd>
                          {i < item.keys.length - 1 && <span className="text-xs text-muted-foreground">+</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
