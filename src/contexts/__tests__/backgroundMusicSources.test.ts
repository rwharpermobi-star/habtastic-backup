import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  TRACK_SOURCES,
  MIME_BY_EXT,
  resolveTrackUrl,
  type BgTrack,
} from '@/contexts/BackgroundMusicContext';

/**
 * Source-resolution contract for background music.
 * Web (Chrome/Firefox) and Android WebView decode Opus, so they must land on
 * the small .ogg files. Engines without Opus (older iOS Safari) must fall back
 * to the AAC/.m4a copy instead of failing to play.
 */
function mockCanPlayType(supported: string[]) {
  const spy = vi
    .spyOn(HTMLMediaElement.prototype, 'canPlayType')
    .mockImplementation((mime: string) =>
      supported.some((s) => mime.startsWith(s)) ? 'probably' : ''
    );
  return spy;
}

afterEach(() => vi.restoreAllMocks());

describe('background music sources', () => {
  it('keeps all three tracks available', () => {
    expect(Object.keys(TRACK_SOURCES).sort()).toEqual(['ambient', 'lofi', 'rain']);
  });

  it('declares a known mime type for every source', () => {
    for (const sources of Object.values(TRACK_SOURCES)) {
      expect(sources.length).toBeGreaterThan(0);
      for (const src of sources) {
        expect(MIME_BY_EXT[src.split('.').pop() as string]).toBeTruthy();
      }
    }
  });

  it('gives lofi and ambient an Opus primary plus a non-Opus fallback', () => {
    for (const t of ['lofi', 'ambient'] as BgTrack[]) {
      expect(TRACK_SOURCES[t][0]).toMatch(/\.ogg$/);
      expect(TRACK_SOURCES[t].length).toBeGreaterThan(1);
      expect(TRACK_SOURCES[t].some((s) => !s.endsWith('.ogg'))).toBe(true);
    }
  });

  it('prefers Opus on Opus-capable engines (web + Android WebView)', () => {
    mockCanPlayType(['audio/ogg', 'audio/mp4', 'audio/mpeg']);
    expect(resolveTrackUrl('lofi')).toBe('/sounds/lofi.ogg');
    expect(resolveTrackUrl('ambient')).toBe('/sounds/ambient.ogg');
  });

  it('falls back to AAC when Opus is unsupported', () => {
    mockCanPlayType(['audio/mp4', 'audio/mpeg']);
    expect(resolveTrackUrl('lofi')).toBe('/sounds/lofi.m4a');
    expect(resolveTrackUrl('ambient')).toBe('/sounds/ambient.m4a');
  });

  it('still returns a playable candidate when nothing reports support', () => {
    mockCanPlayType([]);
    for (const t of Object.keys(TRACK_SOURCES) as BgTrack[]) {
      expect(TRACK_SOURCES[t]).toContain(resolveTrackUrl(t));
    }
  });

  it('prefers opus for rain too', () => {
    mockCanPlayType(['audio/ogg', 'audio/mpeg']);
    expect(resolveTrackUrl('rain')).toBe('/sounds/rain.ogg');
  });
});
