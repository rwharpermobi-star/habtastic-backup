import { motion } from 'framer-motion';
import { Facebook, ChevronRight } from 'lucide-react';
import {
  openFacebookCommunity,
  FACEBOOK_COMMUNITY_URL,
  FACEBOOK_COMMUNITY_LABEL,
  FACEBOOK_BRAND_BLUE as FB_BLUE,
} from '@/lib/facebookCommunity';

// Re-export for backwards-compatible imports across the app. The canonical
// source of truth lives in `@/lib/facebookCommunity`.
export { openFacebookCommunity, FACEBOOK_COMMUNITY_URL, FACEBOOK_COMMUNITY_LABEL };

export default function CommunityCard() {
  return (
    <div className="glass rounded-card overflow-hidden shadow-card mb-2">
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => openFacebookCommunity('settings')}
        className="w-full flex items-center gap-3 p-4 hover:bg-secondary/50 transition-colors text-left"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shadow-[0_0_18px_rgba(24,119,242,0.45)]"
          style={{ backgroundColor: FB_BLUE }}
        >
          <Facebook className="w-5 h-5 text-white" strokeWidth={2} fill="white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-body font-medium text-foreground">Join Community</p>
          <p className="text-caption text-muted-foreground truncate">
            Connect, share progress, and stay motivated
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </motion.button>

    </div>
  );
}
