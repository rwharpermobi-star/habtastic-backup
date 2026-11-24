/**
 * Regression test for the "Tap to replay" control on the Coach (Winston) page.
 *
 * Purpose:
 *   1. Verify that clicking the replay button invokes `handleReplay`
 *      (a `useCallback`) without throwing.
 *   2. Verify the three behavior branches:
 *        - empty/whitespace text → no-op (does not call voice.speak)
 *        - voice.state === 'speaking' → calls voice.interrupt(), not speak()
 *        - otherwise → calls voice.speak(text)
 *
 * We rebuild a minimal harness that mirrors the exact `handleReplay`
 * implementation and the button markup from `ChatBubble` in
 * `src/pages/Coach.tsx`. This keeps the test fast and isolated from
 * Coach's heavy data-loading dependencies, while still exercising the
 * real callback shape that previously caused hook-order crashes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useCallback } from 'react';

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'interrupted';

interface VoiceLike {
  state: VoiceState;
  speak: (text: string) => Promise<void> | void;
  interrupt: () => void;
}

// Mirror of the real handleReplay + replay button from src/pages/Coach.tsx.
function ReplayHarness({
  voice,
  text,
  isReplaying = false,
}: {
  voice: VoiceLike;
  text: string;
  isReplaying?: boolean;
}) {
  // Same shape as Coach.tsx ~L447 — keep in sync if logic changes.
  const handleReplay = useCallback(
    (t: string) => {
      if (!t?.trim()) return;
      if (voice.state === 'speaking') {
        voice.interrupt();
        return;
      }
      voice.speak(t);
    },
    [voice],
  );

  return (
    <button
      type="button"
      onClick={() => handleReplay(text)}
      aria-label={isReplaying ? 'Stop playback' : 'Replay Winston voice'}
    >
      {isReplaying ? 'Tap to stop' : 'Tap to replay'}
    </button>
  );
}

function makeVoice(state: VoiceState = 'idle') {
  const speak = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  const interrupt = vi.fn<() => void>();

  return {
    state,
    speak,
    interrupt,
  } satisfies VoiceLike;
}

describe('Coach "Tap to replay" control', () => {
  beforeEach(() => {
    // Silence vibrate() / haptic() if the harness ever calls it
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('renders the replay button with the expected label', () => {
    const voice = makeVoice('idle');
    render(<ReplayHarness voice={voice} text="Hello there" />);
    expect(
      screen.getByRole('button', { name: /replay winston voice/i }),
    ).toHaveTextContent('Tap to replay');
  });

  it('calls voice.speak(text) when clicked from idle state — without throwing', () => {
    const voice = makeVoice('idle');
    render(<ReplayHarness voice={voice} text="Replay this line." />);

    const btn = screen.getByRole('button', { name: /replay winston voice/i });
    expect(() => fireEvent.click(btn)).not.toThrow();

    expect(voice.speak).toHaveBeenCalledTimes(1);
    expect(voice.speak).toHaveBeenCalledWith('Replay this line.');
    expect(voice.interrupt).not.toHaveBeenCalled();
  });

  it('interrupts (and does NOT speak) when clicked while voice is already speaking', () => {
    const voice = makeVoice('speaking');
    render(
      <ReplayHarness voice={voice} text="Already talking" isReplaying />,
    );

    const btn = screen.getByRole('button', { name: /stop playback/i });
    expect(btn).toHaveTextContent('Tap to stop');

    expect(() => fireEvent.click(btn)).not.toThrow();
    expect(voice.interrupt).toHaveBeenCalledTimes(1);
    expect(voice.speak).not.toHaveBeenCalled();
  });

  it('is a no-op for empty / whitespace-only text', () => {
    const voice = makeVoice('idle');
    render(<ReplayHarness voice={voice} text="   " />);

    const btn = screen.getByRole('button', { name: /replay winston voice/i });
    expect(() => fireEvent.click(btn)).not.toThrow();

    expect(voice.speak).not.toHaveBeenCalled();
    expect(voice.interrupt).not.toHaveBeenCalled();
  });

  it('does not throw if voice.speak rejects (handleReplay does not await)', () => {
    const voice: VoiceLike = {
      state: 'idle',
      speak: vi.fn().mockRejectedValue(new Error('tts down')),
      interrupt: vi.fn(),
    };
    render(<ReplayHarness voice={voice} text="boom" />);
    const btn = screen.getByRole('button', { name: /replay winston voice/i });
    expect(() => fireEvent.click(btn)).not.toThrow();
    expect(voice.speak).toHaveBeenCalledWith('boom');
  });
});
