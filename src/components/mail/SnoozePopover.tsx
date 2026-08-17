import { useState } from 'react';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { useMail } from '@/contexts/MailContext';
import { addHours, addDays, nextMonday, setHours, setMinutes, format } from 'date-fns';

interface SnoozePopoverProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  threadId: string;
}

export default function SnoozePopover({ open, onOpenChange, threadId }: SnoozePopoverProps) {
  const { snoozeThread } = useMail();

  const options = [
    { label: 'In 1 hour', value: addHours(new Date(), 1) },
    { label: 'Tonight (8 PM)', value: setMinutes(setHours(new Date(), 20), 0) },
    { label: 'Tomorrow morning (9 AM)', value: setMinutes(setHours(addDays(new Date(), 1), 9), 0) },
    { label: 'This weekend (Sat 9 AM)', value: setMinutes(setHours(addDays(new Date(), (6 - new Date().getDay() + 7) % 7 || 7), 9), 0) },
    { label: 'Next Monday', value: setMinutes(setHours(nextMonday(new Date()), 9), 0) },
  ];

  const handleSnooze = async (date: Date) => {
    await snoozeThread(threadId, date);
    toast.success(`Snoozed until ${format(date, 'EEE, dd MMM HH:mm')}`);
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Snooze">
          <Clock className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <p className="text-xs font-semibold text-muted-foreground px-2 pb-2">Snooze until…</p>
        {options.map(opt => (
          <button
            key={opt.label}
            onClick={() => handleSnooze(opt.value)}
            className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors flex items-baseline justify-between gap-2"
          >
            <span>{opt.label}</span>
            <span className="text-xs text-muted-foreground shrink-0">{format(opt.value, 'EEE HH:mm')}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
