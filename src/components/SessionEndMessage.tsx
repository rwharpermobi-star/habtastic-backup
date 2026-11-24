import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

export function useSessionEndMessage() {
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && !shownRef.current) {
        shownRef.current = true;
        // Will show when they come back
        sessionStorage.setItem('habtastic_comeback', 'true');
      }
      if (document.visibilityState === 'visible') {
        const shouldShow = sessionStorage.getItem('habtastic_comeback');
        if (shouldShow) {
          sessionStorage.removeItem('habtastic_comeback');
          toast('Welcome back to HabTastic! 🔥⚡', {
            description: 'Keep your streak alive — your progress is waiting',
            duration: 4000,
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);
}
