// Bundled illustrated artwork for Avatar Studio items, keyed by the stable
// cosmetic item id. Images ship with the app so they work offline on Android.
import crownMaster from '@/assets/cosmetics/crown_master.webp';
import effectBuilderAura from '@/assets/cosmetics/effect_builder_aura.webp';
import effectDrivenFlame from '@/assets/cosmetics/effect_driven_flame.webp';
import effectWinstonSpark from '@/assets/cosmetics/effect_winston_spark.webp';
import frameBeginnerGlow from '@/assets/cosmetics/frame_beginner_glow.webp';
import frameStarBronze from '@/assets/cosmetics/frame_star_bronze.webp';
import frameStarGold from '@/assets/cosmetics/frame_star_gold.webp';
import frameStarPlatinum from '@/assets/cosmetics/frame_star_platinum.webp';
import frameStarSilver from '@/assets/cosmetics/frame_star_silver.webp';

export interface CosmeticArt {
  src: string;
  /** Accent colour (HSL) used for the card glow and Studio background tint. */
  color: string;
}

export const COSMETIC_ART: Record<string, CosmeticArt> = {
  frame_beginner_glow: { src: frameBeginnerGlow, color: 'hsl(170 75% 55%)' },
  frame_star_bronze: { src: frameStarBronze, color: 'hsl(28 60% 50%)' },
  frame_star_silver: { src: frameStarSilver, color: 'hsl(220 12% 70%)' },
  frame_star_gold: { src: frameStarGold, color: 'hsl(45 95% 55%)' },
  frame_star_platinum: { src: frameStarPlatinum, color: 'hsl(250 40% 80%)' },
  effect_winston_spark: { src: effectWinstonSpark, color: 'hsl(230 85% 62%)' },
  effect_builder_aura: { src: effectBuilderAura, color: 'hsl(30 90% 58%)' },
  effect_driven_flame: { src: effectDrivenFlame, color: 'hsl(15 95% 55%)' },
  crown_master: { src: crownMaster, color: 'hsl(45 100% 55%)' },
};

export function cosmeticArtFor(id: string): CosmeticArt | null {
  return COSMETIC_ART[id] ?? null;
}
