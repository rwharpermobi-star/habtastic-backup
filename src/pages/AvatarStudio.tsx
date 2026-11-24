import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Scissors, Smile, Glasses, Crown, Shirt, Image as ImageIcon, CircleDashed, Sparkles,
  Loader2, RefreshCw, type LucideIcon,
} from 'lucide-react';
import { useProfile } from '@/hooks/useProfile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useCosmetics, CosmeticItem, CosmeticCategory,
} from '@/hooks/useCosmetics';
import AvatarCanvas from '@/components/AvatarCanvas';
import CosmeticCard from '@/components/CosmeticCard';
import LimitedDropBanner from '@/components/LimitedDropBanner';

const CATEGORIES: { id: CosmeticCategory; label: string; icon: LucideIcon }[] = [
  { id: 'hairstyle', label: 'Hairstyles', icon: Scissors },
  { id: 'face', label: 'Faces', icon: Smile },
  { id: 'accessory', label: 'Accessories', icon: Glasses },
  { id: 'hat', label: 'Hats', icon: Crown },
  { id: 'clothing', label: 'Clothing', icon: Shirt },
  { id: 'background', label: 'Backgrounds', icon: ImageIcon },
  { id: 'frame', label: 'Frames', icon: CircleDashed },
  { id: 'effect', label: 'Effects', icon: Sparkles },
];

/** Categories that have at least one item, in display order. */
export function categoriesWithItems(byCategory: Record<CosmeticCategory, CosmeticItem[]>) {
  return CATEGORIES.filter((c) => byCategory[c.id].length > 0);
}

export default function AvatarStudio() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const {
    catalog, owned, ownedIds, equipped,
    equip, unequip, unlockEligible,
    loading, catalogError, reloadCatalog,
  } = useCosmetics();

  const [tab, setTab] = useState<'customize' | 'collection'>('customize');
  const [chosenCat, setChosenCat] = useState<CosmeticCategory | null>(null);
  const [preview, setPreview] = useState<CosmeticItem | null>(null);

  useEffect(() => { unlockEligible(); }, [unlockEligible]);

  const byCategory = useMemo(() => {
    const m: Record<CosmeticCategory, CosmeticItem[]> = {
      hairstyle: [], face: [], accessory: [], hat: [],
      clothing: [], background: [], frame: [], effect: [],
    };
    catalog.forEach((i) => { m[i.category]?.push(i); });
    return m;
  }, [catalog]);

  // Only offer categories that actually have items, so no tab opens onto a blank area.
  const visibleCats = useMemo(() => categoriesWithItems(byCategory), [byCategory]);
  const activeCat: CosmeticCategory =
    (chosenCat && visibleCats.some((c) => c.id === chosenCat) ? chosenCat : visibleCats[0]?.id) ?? 'hat';

  const ownedInCat = byCategory[activeCat].filter((i) => ownedIds.has(i.id));
  const lockedInCat = byCategory[activeCat].filter((i) => !ownedIds.has(i.id));

  const completion = catalog.length === 0
    ? 0 : Math.round((owned.length / catalog.length) * 100);

  return (
    <motion.div
      className="min-h-screen pb-24 px-5 pt-14 bg-background"
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
    >
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground mb-4 hover:text-foreground">
        <ArrowLeft className="w-5 h-5" /><span className="text-body font-medium">Back</span>
      </button>

      <div className="mb-4">
        <h1 className="text-h1 text-foreground">Avatar Studio</h1>
      </div>

      <LimitedDropBanner items={catalog} />

      <div className="mt-5 mb-5 flex flex-col items-center">
        <AvatarCanvas
          equipped={equipped}
          catalog={catalog}
          previewItem={preview}
          baseUrl={profile?.avatar_url}
          fallbackName={profile?.name ?? undefined}
          size={140}
        />
        {preview && (
          <p className="mt-2 text-caption text-muted-foreground">
            Previewing: <span className="font-medium text-foreground">{preview.name}</span>
          </p>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'customize' | 'collection')}>
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="customize">Customize</TabsTrigger>
          <TabsTrigger value="collection">Collection</TabsTrigger>
        </TabsList>

        <TabsContent value="customize" className="mt-4">
          {loading && catalog.length === 0 && !catalogError && (
            <div role="status" className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
              <span className="text-body">Loading items…</span>
            </div>
          )}

          {catalogError && catalog.length === 0 && (
            <div role="alert" className="glass rounded-card p-5 text-center">
              <p className="text-body font-semibold text-foreground">Couldn't load your avatar items</p>
              <p className="text-caption text-muted-foreground mt-1">Check your connection and try again.</p>
              <button
                type="button"
                onClick={reloadCatalog}
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-primary-foreground text-caption font-medium"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden />Try again
              </button>
            </div>
          )}

          {!loading && !catalogError && catalog.length === 0 && (
            <div role="status" className="glass rounded-card p-5 text-center">
              <p className="text-body font-semibold text-foreground">No items yet</p>
              <p className="text-caption text-muted-foreground mt-1">New avatar items are on the way. Check back soon.</p>
            </div>
          )}

          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {visibleCats.map((c) => (
              <button
                key={c.id}
                onClick={() => { setChosenCat(c.id); setPreview(null); }}
                className={`shrink-0 px-3 py-2 rounded-full text-caption font-medium transition-colors flex items-center gap-1.5 ${
                  activeCat === c.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
                }`}
              >
                <c.icon className="w-3.5 h-3.5" aria-hidden />{c.label}
              </button>
            ))}
          </div>

          {ownedInCat.length > 0 && (
            <>
              <h3 className="text-body-lg font-semibold mt-4 mb-1">Your collection</h3>
              <p className="text-caption text-muted-foreground mb-2">Tap an item to wear it. Tap a worn item to take it off.</p>
              <div className="grid grid-cols-3 gap-3">
                {ownedInCat.map((i) => {
                  const isEquipped = equipped[activeCat] === i.id;
                  return (
                    <CosmeticCard
                      key={i.id} item={i} owned equipped={isEquipped}
                      actionLabel={isEquipped ? `Take off ${i.name}` : `Wear ${i.name}`}
                      onClick={() => {
                        if (isEquipped) { setPreview(null); unequip(activeCat); }
                        else { setPreview(i); equip(i.id); }
                      }}
                    />
                  );
                })}
              </div>
            </>
          )}

          {lockedInCat.length > 0 && (
            <>
              <h3 className="text-body-lg font-semibold mt-5 mb-2">Locked</h3>
              <div className="grid grid-cols-3 gap-3">
                {lockedInCat.map((i) => (
                  <CosmeticCard
                    key={i.id} item={i} owned={false}
                    onClick={() => setPreview(i)}
                  />
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="collection" className="mt-4">
          <div className="glass rounded-card p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-caption text-muted-foreground">Completion</p>
                <p className="text-h2 font-bold">{owned.length}<span className="text-muted-foreground"> / {catalog.length}</span></p>
              </div>
              <div className="text-right">
                <p className="text-caption text-muted-foreground">Progress</p>
                <p className="text-h2 font-bold text-primary">{completion}%</p>
              </div>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-accent" style={{ width: `${completion}%` }} />
            </div>
          </div>

          {CATEGORIES.map((c) => {
            const items = byCategory[c.id];
            if (items.length === 0) return null;
            const ownedCount = items.filter((i) => ownedIds.has(i.id)).length;
            return (
              <div key={c.id} className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-body-lg font-semibold flex items-center gap-1.5"><c.icon className="w-4 h-4 text-primary" aria-hidden />{c.label}</h3>
                  <span className="text-caption text-muted-foreground">{ownedCount}/{items.length}</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {items.map((i) => (
                    <CosmeticCard key={i.id} item={i}
                      owned={ownedIds.has(i.id)}
                      equipped={equipped[c.id] === i.id}
                      onClick={() => setPreview(i)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
