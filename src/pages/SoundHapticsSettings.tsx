import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Volume2 } from 'lucide-react';
import { motion } from 'framer-motion';
import SoundSettings from '@/components/SoundSettings';

export default function SoundHapticsSettings() {
  const navigate = useNavigate();
  return (
    <motion.main className="min-h-screen px-5 pt-14 pb-24 bg-background" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground mb-6 hover:text-foreground transition-colors">
        <ArrowLeft className="w-5 h-5" />
        <span className="text-body font-medium">Back</span>
      </button>
      <div className="flex items-center gap-3 mb-2">
        <Volume2 className="w-7 h-7 text-primary" />
        <h1 className="text-h1 text-foreground">Sound & Haptics</h1>
      </div>
      <p className="text-body text-muted-foreground mb-6">Control HabTastic sound effects, volume and haptic feedback.</p>
      <SoundSettings />
    </motion.main>
  );
}
