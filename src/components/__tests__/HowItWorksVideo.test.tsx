import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HowItWorksVideo, {
  HowItWorksHomeCard,
  HowItWorksModal,
  WALKTHROUGH_CHAPTERS,
} from '@/components/HowItWorksVideo';

describe('HowItWorksVideo', () => {
  beforeEach(() => {
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  it('renders native video player, captions track, poster, and all 6 chapter buttons', () => {
    render(<HowItWorksVideo />);
    const video = screen.getByLabelText(/how habtastic ai works walkthrough video/i) as HTMLVideoElement;
    expect(video).toBeInTheDocument();
    expect(video.getAttribute('src')).toBe('/videos/how-habtastic-works.mp4');
    expect(video.getAttribute('poster')).toBe('/videos/how-habtastic-works-poster.jpg');

    const track = video.querySelector('track');
    expect(track).not.toBeNull();
    expect(track?.getAttribute('src')).toBe('/videos/how-habtastic-works.vtt');

    for (const ch of WALKTHROUGH_CHAPTERS) {
      expect(screen.getByRole('button', { name: new RegExp(ch.label, 'i') })).toBeInTheDocument();
    }
  });

  it('seeks to chapter timestamp and starts playback when a chapter chip is clicked', () => {
    render(<HowItWorksVideo />);
    const video = screen.getByLabelText(/how habtastic ai works walkthrough video/i) as HTMLVideoElement;
    const winstonBtn = screen.getByRole('button', { name: /winston ai/i });
    fireEvent.click(winstonBtn);
    expect(video.currentTime).toBeCloseTo(35.15, 2);
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('triggers watch and dismiss handlers on HowItWorksHomeCard and closes HowItWorksModal', () => {
    const onWatch = vi.fn();
    const onDismiss = vi.fn();
    const onClose = vi.fn();

    render(
      <>
        <HowItWorksHomeCard onWatch={onWatch} onDismiss={onDismiss} />
        <HowItWorksModal open={true} onClose={onClose} />
      </>
    );

    fireEvent.click(screen.getByRole('button', { name: /watch walkthrough/i }));
    expect(onWatch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /hide walkthrough card/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /close video walkthrough/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hides captions only when showCaptions is false', () => {
    render(<HowItWorksVideo showCaptions={false} />);
    const video = screen.getByLabelText(/how habtastic ai works walkthrough video/i) as HTMLVideoElement;
    expect(video.querySelector('track')).toBeNull();
    expect(screen.queryByText(/voiceover \+ captions/i)).not.toBeInTheDocument();
    expect(screen.getByText(/watch 69-second app tour/i)).toBeInTheDocument();
  });
});
