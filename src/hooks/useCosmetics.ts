import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cosmeticArtFor } from '@/lib/cosmeticArt';
import { untypedSupabase } from "@/integrations/supabase/untyped";

export type CosmeticCategory =
  | 'hairstyle' | 'face' | 'accessory' | 'hat'
  | 'clothing' | 'background' | 'frame' | 'effect';

export type CosmeticRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface CosmeticItem {
  id: string;
  category: CosmeticCategory;
  name: string;
  description: string;
  rarity: CosmeticRarity;
  coin_cost: number | null;
  unlock_rule: Record<string, any>;
  /** Bundled illustrated artwork, or null when none ships for this item. */
  art: string | null;
  preview_color: string;
  event_id: string | null;
  available_from: string | null;
  available_until: string | null;
  sort_order: number;
}

export interface EquippedSlots {
  hairstyle: string | null;
  face: string | null;
  accessory: string | null;
  hat: string | null;
  clothing: string | null;
  background: string | null;
  frame: string | null;
  effect: string | null;
}

const EMPTY_SLOTS: EquippedSlots = {
  hairstyle: null, face: null, accessory: null, hat: null,
  clothing: null, background: null, frame: null, effect: null,
};

/** Database slot names (user_equipped_cosmetics columns) for each Studio tab. */
const DB_SLOT_FOR_CATEGORY: Partial<Record<CosmeticCategory, string>> = {
  frame: 'frame',
  effect: 'effect',
  hat: 'crown',
};

/** Maps a stored cosmetic category to the Studio tab that shows it. */
export function studioCategoryFor(dbCategory: string): CosmeticCategory | null {
  switch (dbCategory) {
    case 'frame': return 'frame';
    case 'effect': return 'effect';
    case 'crown': return 'hat';
    default: return null;
  }
}

/** Turns a cosmetic_items row into the shape the Studio renders. */
export function toCosmeticItem(row: Record<string, any>): CosmeticItem | null {
  const category = studioCategoryFor(String(row.category ?? ''));
  if (!category || typeof row.id !== 'string') return null;
  const rarity = (['common', 'rare', 'epic', 'legendary'].includes(row.rarity) ? row.rarity : 'common') as CosmeticRarity;
  const art = cosmeticArtFor(row.id);
  const rule = (row.unlock_rule ?? {}) as Record<string, any>;
  return {
    id: row.id,
    category,
    name: String(row.name ?? row.id),
    description: String(row.description ?? ''),
    rarity,
    coin_cost: typeof row.price_coins === 'number' ? row.price_coins : null,
    unlock_rule: rule,
    art: art?.src ?? null,
    preview_color: art?.color ?? rarityColor(rarity),
    event_id: row.event_id ?? null,
    available_from: row.available_from ?? null,
    available_until: row.available_until ?? null,
    sort_order: typeof rule.level === 'number' ? rule.level : 0,
  };
}

/** Returns a user-facing reason when unequip_cosmetic refused the request, else null. */
export function unequipRefusal(data: unknown): string | null {
  const res = (data ?? {}) as { ok?: boolean; error?: string };
  if (res.ok === true) return null;
  if (res.error === 'not_authenticated') return 'Please sign in again to change your avatar.';
  return 'Could not remove that item. Please try again.';
}

/** Maps a user_equipped_cosmetics row onto the Studio slots. */
export function toEquippedSlots(row: Record<string, any> | null | undefined): EquippedSlots {
  if (!row) return EMPTY_SLOTS;
  return { ...EMPTY_SLOTS, frame: row.frame ?? null, effect: row.effect ?? null, hat: row.crown ?? null };
}

export function rarityColor(r: CosmeticRarity): string {
  switch (r) {
    case 'common': return 'hsl(220 10% 60%)';
    case 'rare': return 'hsl(210 90% 60%)';
    case 'epic': return 'hsl(280 80% 65%)';
    case 'legendary': return 'hsl(45 100% 55%)';
  }
}

export function rarityLabel(r: CosmeticRarity): string {
  return r.charAt(0).toUpperCase() + r.slice(1);
}

export function unlockRuleLabel(rule: Record<string, any>): string {
  switch (rule?.type) {
    case 'purchase': return 'Special unlock';
    case 'level': return `Reach level ${rule.level}`;
    case 'streak': return `Reach ${rule.days}-day streak`;
    case 'referrals': return `Refer ${rule.count} paid friends`;
    case 'xp': return `Earn ${rule.amount} XP`;
    case 'rank': return `Reach ${rule.rank} rank`;
    case 'leaderboard': return `Finish #${rule.place} on monthly leaderboard`;
    case 'event': return 'Limited-time event';
    default: return 'Special unlock';
  }
}

export function useCosmetics() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const catalogQ = useQuery({
    queryKey: ['cosmetics-catalog'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cosmetic_items')
        .select('*')
        .eq('is_active', true);
      if (error) throw error;
      return ((data || []) as Record<string, any>[])
        .map(toCosmeticItem)
        .filter((item): item is CosmeticItem => item !== null)
        .sort((a, b) => a.sort_order - b.sort_order);
    },
    staleTime: 5 * 60_000,
  });

  const ownedQ = useQuery({
    queryKey: ['cosmetics-owned', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('user_cosmetics')
        .select('item_id, acquired_at, acquired_via')
        .eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const equippedQ = useQuery({
    queryKey: ['cosmetics-equipped', user?.id],
    queryFn: async () => {
      if (!user) return EMPTY_SLOTS;
      const { data } = await untypedSupabase
        .from('user_equipped_cosmetics')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      return toEquippedSlots(data as Record<string, any> | null);
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const ownedIds = useMemo(
    () => new Set((ownedQ.data || []).map((o) => o.item_id)),
    [ownedQ.data]
  );

  const equip = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.rpc('equip_cosmetic', { _item_id: itemId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Equipped');
      qc.invalidateQueries({ queryKey: ['cosmetics-equipped'] });
    },
    onError: (e) => toast.error(e.message || 'Could not equip'),
  });

  const unequip = useMutation({
    mutationFn: async (category: CosmeticCategory) => {
      const slot = DB_SLOT_FOR_CATEGORY[category];
      if (!slot) return;
      const { data, error } = await supabase.rpc('unequip_cosmetic', { _slot: slot });
      if (error) throw error;
      const refusal = unequipRefusal(data);
      if (refusal) throw new Error(refusal);
    },
    onSuccess: () => {
      toast.success('Removed');
      qc.invalidateQueries({ queryKey: ['cosmetics-equipped'] });
    },
    onError: (e: any) => toast.error(e.message || 'Could not remove that item'),
  });

  const unlockEligible = useCallback(async () => {
    const { data } = await supabase.rpc('unlock_eligible_cosmetics');
    const granted = (data as any)?.granted || [];
    if (granted.length > 0) {
      qc.invalidateQueries({ queryKey: ['cosmetics-owned'] });
      toast.success(`${granted.length} new cosmetic${granted.length > 1 ? 's' : ''} unlocked! 🎁`);
    }
    return granted;
  }, [qc]);

  return {
    catalog: catalogQ.data || [],
    loading: catalogQ.isLoading || ownedQ.isLoading,
    /** True when the item list could not be loaded from the server. */
    catalogError: catalogQ.isError,
    reloadCatalog: () => { catalogQ.refetch(); },
    owned: ownedQ.data || [],
    ownedIds,
    equipped: equippedQ.data || EMPTY_SLOTS,
    equip: equip.mutate,
    unequip: unequip.mutate,
    unlockEligible,
  };
}
