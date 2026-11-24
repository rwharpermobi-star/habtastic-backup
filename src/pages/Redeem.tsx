import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Gift } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function Redeem() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleActivate = async () => {
    if (!code.trim() || code.trim().length < 6) {
      toast.error('Please enter a valid code');
      return;
    }
    setLoading(true);
    // Simulate activation
    setTimeout(() => {
      setLoading(false);
      toast.error('Invalid or expired code');
    }, 1500);
  };

  return (
    <motion.div
      className="min-h-screen pb-24 px-5 pt-14 bg-background"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground mb-6 hover:text-foreground transition-colors">
        <ArrowLeft className="w-5 h-5" />
        <span className="text-body font-medium">Back</span>
      </button>
      <h1 className="text-h1 text-foreground mb-8">Redeem</h1>

      {/* Code Input Card */}
      <div className="border-2 border-dashed border-primary/30 rounded-card p-6 mb-8 bg-primary/5">
        <div className="flex items-center gap-2 mb-4">
          <Gift className="w-5 h-5 text-primary" />
          <p className="text-body font-medium text-foreground">Type your code here</p>
        </div>
        <Input
          placeholder="XXXX XXXX XXXX"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          maxLength={14}
          className="bg-background border-border rounded-input text-center tracking-[0.2em] text-lg font-mono mb-2"
        />
      </div>

      <Button
        onClick={handleActivate}
        disabled={loading || code.trim().length < 6}
        className="w-full gradient-primary text-primary-foreground rounded-full py-6 text-body font-semibold"
      >
        {loading ? 'Activating...' : 'Activate'}
      </Button>

      {/* Info */}
      <div className="mt-8 space-y-3">
        <h3 className="font-semibold text-body text-foreground">Heads up:</h3>
        <ol className="space-y-2 text-caption text-muted-foreground list-decimal list-inside">
          <li>Your gift code will remain valid for a week.</li>
          <li>The final interpretation authority rests solely with HabTastic.</li>
          <li>HabTastic will not be responsible for any redemption issues arising from users sharing their Gift Codes.</li>
          <li>Your subscription status will automatically expire upon uninstalling HabTastic.</li>
        </ol>
      </div>
    </motion.div>
  );
}
