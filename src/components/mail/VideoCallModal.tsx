import { Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { logFeatureInterest } from '@/services/api';

interface VideoCallModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export default function VideoCallModal({ open, onOpenChange }: VideoCallModalProps) {
  const { staffUser } = useAuth();

  const handleNotify = async () => {
    if (staffUser) {
      await logFeatureInterest(staffUser.id, 'video_calls');
    }
    toast.success("You're on the list! We'll notify you when Video Calls launch.");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm text-center">
        <DialogHeader>
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <Video className="w-7 h-7 text-primary" />
          </div>
          <DialogTitle className="text-xl">Video Calls — Coming Soon</DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            One-click video calls directly from your inbox are on the roadmap. Stay tuned!
          </p>
          <div className="bg-muted rounded-lg p-3 text-xs text-muted-foreground">
            Planned: HD video · screen sharing · calendar integration · no downloads required
          </div>
        </div>
        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={handleNotify}>Notify me when it's ready</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Maybe later</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
