import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  return (
    <div className="mx-5 mb-4 glass p-4 flex items-center gap-3 shadow-card animate-fade-in-up border border-primary/20">
      <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0">
        <Download className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-body text-foreground font-display">Install HabTastic</p>
        <p className="text-caption text-muted-foreground">Add to home screen for quick access</p>
      </div>
      <button onClick={handleInstall} className="px-3 py-1.5 rounded-btn gradient-primary text-white text-caption font-semibold flex-shrink-0">
        Install
      </button>
      <button onClick={() => setDismissed(true)} className="text-muted-foreground p-1">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
