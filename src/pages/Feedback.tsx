import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Headphones, CreditCard, UserCog, BookOpen, Sparkles, Rocket, AlertCircle, ChevronRight, Inbox } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const categories = [
  { label: 'Technical Support', icon: Headphones },
  { label: 'Subscriptions & Billing', icon: CreditCard },
  { label: 'Account Management', icon: UserCog },
  { label: 'How to Use', icon: BookOpen },
  { label: 'Features & Programs', icon: Sparkles },
  { label: 'Getting Started', icon: Rocket },
  { label: 'About Alarms', icon: AlertCircle },
];

const articles = [
  'Why was I automatically charged?',
  'How to request a refund',
  'How to cancel my subscription',
  'How do streaks work?',
];

interface FeedbackRow {
  id: string;
  category: string | null;
  message: string | null;
  created_at: string;
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function Feedback() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [history, setHistory] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from('feedback')
        .select('id, category, message, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (!active) return;
      if (!error && data) setHistory(data as FeedbackRow[]);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const openCategory = (label: string) => {
    navigate(`/settings/feedback/submit?category=${encodeURIComponent(label)}`);
  };

  return (
    <motion.div
      className="min-h-screen pb-24 px-5 pt-14 bg-background"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-muted-foreground mb-6 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        <span className="text-body font-medium">Back</span>
      </button>

      {/* Hero Banner */}
      <div className="rounded-card overflow-hidden mb-8 gradient-primary p-8 text-center">
        <h1 className="text-h1 text-primary-foreground mb-2">Feedback</h1>
        <p className="text-caption text-primary-foreground/80">How can we help you?</p>
      </div>

      {/* Categories */}
      <h3 className="font-semibold text-body-lg text-foreground mb-3">Choose a topic</h3>
      <div className="space-y-3 mb-8">
        {categories.map(({ label, icon: Icon }) => (
          <button
            key={label}
            onClick={() => openCategory(label)}
            className="w-full glass rounded-card p-4 flex items-center gap-3 hover:bg-secondary/50 transition-colors text-left border border-primary/10"
          >
            <Icon className="w-5 h-5 text-primary" strokeWidth={1.5} />
            <span className="text-body font-medium text-foreground flex-1">{label}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        ))}
      </div>

      {/* My Feedback history */}
      <h3 className="font-semibold text-body-lg text-foreground mb-3 flex items-center gap-2">
        <Inbox className="w-4 h-4 text-primary" />
        My Feedback
      </h3>

      {loading ? (
        <div className="glass rounded-card p-6 text-center text-caption text-muted-foreground border border-primary/10 mb-8">
          Loading…
        </div>
      ) : history.length === 0 ? (
        <div className="glass rounded-card p-6 text-center border border-primary/10 mb-8">
          <p className="text-body font-medium text-foreground mb-1">No feedback yet</p>
          <p className="text-caption text-muted-foreground">
            Pick a topic above to send your first message 💌
          </p>
        </div>
      ) : (
        <div className="space-y-3 mb-8">
          {history.map((row) => (
            <div
              key={row.id}
              className="glass rounded-card p-4 border border-primary/10"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-caption font-semibold text-primary">
                  {row.category || 'General'}
                </span>
                <span className="text-caption text-muted-foreground">
                  {formatDate(row.created_at)}
                </span>
              </div>
              <p className="text-body text-foreground whitespace-pre-wrap break-words line-clamp-4">
                {row.message}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Promoted Articles — clicking opens the submit form prefilled with the topic */}
      <h3 className="font-semibold text-h3 mb-3">Promoted articles</h3>
      <div className="glass rounded-card overflow-hidden shadow-card">
        {articles.map((article, i) => (
          <button
            key={article}
            type="button"
            onClick={() =>
              navigate(
                `/settings/feedback/submit?category=${encodeURIComponent('How to Use')}&topic=${encodeURIComponent(article)}`,
              )
            }
            className={`w-full p-4 text-left text-body text-primary hover:bg-secondary/30 transition-colors ${i < articles.length - 1 ? 'border-b border-border/40' : ''}`}
          >
            {article}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
