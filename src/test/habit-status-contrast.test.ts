import { describe, it, expect } from 'vitest';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  THEME_BG,
  contrastRatio,
  hexToRgb,
  relativeLuminance,
} from '@/lib/habitStatus';

// WCAG 2.1 thresholds:
//   AA  large text / non-text (icons, status pills): >= 3.0
//   AA  body text:                                    >= 4.5
//
// Status circles are non-text indicators (≥24x24px graphical objects), so we
// require WCAG 1.4.11 — Non-text Contrast (≥3.0) against BOTH light and dark
// theme backgrounds. This guards against accidental palette drift that would
// dull a status color in dark mode.
const NON_TEXT_AA = 3.0;

describe('habitStatus colors', () => {
  describe('utility math', () => {
    it('hexToRgb parses 6-digit and 3-digit hex', () => {
      expect(hexToRgb('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
      expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
      expect(hexToRgb('#FFF')).toEqual({ r: 255, g: 255, b: 255 });
    });

    it('relativeLuminance is ~1 for white and ~0 for black', () => {
      expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 2);
      expect(relativeLuminance('#000000')).toBeCloseTo(0, 2);
    });

    it('contrastRatio is 21 for white on black', () => {
      expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
    });
  });

  describe.each(Object.entries(STATUS_COLORS))(
    'status color "%s" (%s)',
    (key, color) => {
      it(`meets WCAG non-text AA against light background (${THEME_BG.light})`, () => {
        const ratio = contrastRatio(color, THEME_BG.light);
        expect(
          ratio,
          `${key} (${color}) on light bg: ratio ${ratio.toFixed(2)} below ${NON_TEXT_AA}`,
        ).toBeGreaterThanOrEqual(NON_TEXT_AA);
      });

      it(`meets WCAG non-text AA against dark background (${THEME_BG.dark})`, () => {
        const ratio = contrastRatio(color, THEME_BG.dark);
        expect(
          ratio,
          `${key} (${color}) on dark bg: ratio ${ratio.toFixed(2)} below ${NON_TEXT_AA}`,
        ).toBeGreaterThanOrEqual(NON_TEXT_AA);
      });

      it('meets WCAG non-text AA against card surfaces (light + dark)', () => {
        expect(contrastRatio(color, THEME_BG.cardLight)).toBeGreaterThanOrEqual(NON_TEXT_AA);
        expect(contrastRatio(color, THEME_BG.cardDark)).toBeGreaterThanOrEqual(NON_TEXT_AA);
      });
    },
  );

  it('exposes a label for every non-future status', () => {
    expect(Object.keys(STATUS_LABELS).sort()).toEqual(
      ['completed', 'missed', 'partial', 'today'].sort(),
    );
  });
});
