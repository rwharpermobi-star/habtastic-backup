import { useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

const KIND_ICON: Record<string, string> = {
  comment: '💬', challenge: '🏆', badge: '🎖️', crown: '👑',
  friend: '🤝', mention: '@', streak: '🔥', premium: '✨',
};

export default function NotificationBell() {
  const { items, unread, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-full hover:bg-secondary/50">
          <Bell className="w-5 h-5 text-foreground" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-xs text-primary flex items-center gap-1">
              <Check className="w-3 h-3" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">You're all caught up 🎉</p>
          )}
          {items.map(n => (
            <div key={n.id}
              className={cn('p-3 border-b border-border/50 flex gap-2.5',
                !n.read_at && 'bg-primary/5')}>
              <span className="text-lg">{KIND_ICON[n.kind] || '🔔'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">{n.title}</p>
                {n.body && <p className="text-[11px] text-muted-foreground line-clamp-2">{n.body}</p>}
                <p className="text-[10px] text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
