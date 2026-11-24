import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ShareCard from '@/components/ShareCard';
import { useAchievements } from '@/hooks/useAchievements';

export default function Achievements() {
  const navigate = useNavigate();
  const { achievements, unlockedCount } = useAchievements();

  return (
    <div className="min-h-screen pb-24 px-5 pt-14 bg-background">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground mb-6 hover:text-foreground transition-colors">
        <ArrowLeft className="w-5 h-5" />
        <span className="text-body font-medium">Back</span>
      </button>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-h1 text-foreground">Achievements</h1>
        <span className="text-caption text-muted-foreground">{unlockedCount}/{achievements.length} unlocked</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {achievements.map((a, i) => (
          <div
            key={a.id}
            className={`glass rounded-card p-4 shadow-card transition-all animate-fade-in-up ${a.unlocked ? '' : 'opacity-40'}`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">{a.unlocked ? a.icon : '🔒'}</span>
              {a.unlocked && (
                <ShareCard title={a.title} subtitle={a.desc} emoji={a.icon} stat="Achievement Unlocked!">
                  <button className="p-1 rounded-full hover:bg-secondary/50">
                    <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                  </button>
                </ShareCard>
              )}
            </div>
            <p className="font-semibold text-body mt-2">{a.title}</p>
            <p className="text-caption text-muted-foreground">{a.desc}</p>
            {a.unlocked && a.unlockedAt && (
              <p className="text-[11px] text-muted-foreground/70 mt-1">
                {new Date(a.unlockedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
