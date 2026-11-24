import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Users, Trophy, Activity, Handshake, Settings, Shield } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import CommunityFeed from '@/components/CommunityFeed';
import CommunityGuidelinesGate from '@/components/CommunityGuidelinesGate';
import CommunityChallengesList from '@/components/CommunityChallengesList';
import AccountabilityPartnerPanel from '@/components/AccountabilityPartnerPanel';
import FacebookHubCard from '@/components/FacebookHubCard';
import CommunityTopMembers from '@/components/CommunityTopMembers';
import FeedFilters, { type FeedFilter } from '@/components/FeedFilters';
import NotificationBell from '@/components/NotificationBell';
import { useAuth } from '@/contexts/AuthContext';
import { useAdmin } from '@/hooks/useAdmin';

type Tab = 'feed' | 'challenges' | 'partner' | 'friends';

export default function Community() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('feed');
  const [filter, setFilter] = useState<FeedFilter>('all');
  const { isAdmin } = useAdmin();

  return (
    <motion.div className="min-h-screen pb-24 px-5 pt-14 bg-background"
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-1">
          <NotificationBell />
          {isAdmin && (
            <button onClick={() => navigate('/admin/moderation')}
              className="p-2 rounded-full hover:bg-secondary/50" aria-label="Admin">
              <Shield className="w-5 h-5 text-primary" />
            </button>
          )}
          {user && (
            <button onClick={() => navigate(`/u/${user.id}`)}
              className="p-2 rounded-full hover:bg-secondary/50" aria-label="My profile">
              <Settings className="w-5 h-5 text-foreground" />
            </button>
          )}
        </div>
      </div>

      <h1 className="text-h1 text-foreground mb-1 flex items-center gap-2">
        <Users className="w-6 h-6 text-primary" /> Community
      </h1>
      <p className="text-sm text-muted-foreground mb-4">Connect, compete, and grow together.</p>

      <FacebookHubCard />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="grid grid-cols-4 w-full mb-4 bg-secondary/50 rounded-full p-1 h-auto">
          <TabsTrigger value="feed" className="rounded-full text-xs gap-1"><Activity className="w-3.5 h-3.5" /> Feed</TabsTrigger>
          <TabsTrigger value="challenges" className="rounded-full text-xs gap-1"><Trophy className="w-3.5 h-3.5" /> Challenges</TabsTrigger>
          <TabsTrigger value="partner" className="rounded-full text-xs gap-1"><Handshake className="w-3.5 h-3.5" /> Partner</TabsTrigger>
          <TabsTrigger value="friends" className="rounded-full text-xs gap-1"><Users className="w-3.5 h-3.5" /> Friends</TabsTrigger>
        </TabsList>

        <TabsContent value="feed">
          <CommunityTopMembers />
          <CommunityGuidelinesGate>
            <FeedFilters value={filter} onChange={setFilter} />
            <CommunityFeed filter={filter} />
          </CommunityGuidelinesGate>
        </TabsContent>
        <TabsContent value="challenges"><CommunityChallengesList /></TabsContent>
        <TabsContent value="partner"><AccountabilityPartnerPanel /></TabsContent>
        <TabsContent value="friends">
          <div className="glass rounded-card p-6 text-center">
            <p className="text-sm text-foreground mb-3">Manage friends and weekly leaderboard.</p>
            <button onClick={() => navigate('/friends')} className="gradient-primary text-primary-foreground rounded-btn px-4 py-2 text-sm font-semibold">
              Open Friends →
            </button>
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
