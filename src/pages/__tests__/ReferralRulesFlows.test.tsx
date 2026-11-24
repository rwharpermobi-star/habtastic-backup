import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ---- Mocks ----
const saveMock = vi.fn();
const splitMock = vi.fn((s: string) => [s]);
const textMock = vi.fn();
const addPageMock = vi.fn();

vi.mock('jspdf', () => {
  return {
    default: vi.fn().mockImplementation(function MockJsPDF() {
      return {
        internal: { pageSize: { getWidth: () => 595, getHeight: () => 842 } },
        setFont: vi.fn(),
        setFontSize: vi.fn(),
        text: textMock,
        splitTextToSize: splitMock,
        addPage: addPageMock,
        save: saveMock,
      };
    }),
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from 'sonner';
import ReferralRules from '../ReferralRules';
import SubmitFeedback from '../SubmitFeedback';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ insert: vi.fn() }), functions: { invoke: vi.fn() } },
}));

function renderWithRoutes(initialPath = '/referral/rules') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/referral/rules" element={<ReferralRules />} />
        <Route path="/settings/feedback/submit" element={<SubmitFeedback />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ReferralRules — timeline accuracy', () => {
  it('renders the current referral verification timeline and milestone rules', () => {
    renderWithRoutes();

    // These are the current server-verified steps; old Day 0/Day 30
    // timeline labels and hardcoded XP promises were removed intentionally.
    expect(screen.getByText(/At signup/i)).toBeInTheDocument();
    expect(screen.getByText(/On verified paid Premium upgrade/i)).toBeInTheDocument();
    expect(screen.getByText(/Configured milestones/i)).toBeInTheDocument();
    expect(screen.getByText(/newly registered accounts only/i)).toBeInTheDocument();
    expect(screen.getByText(/server-verified live Premium purchase/i)).toBeInTheDocument();
    expect(screen.getByText(/Any XP and points bonuses follow server-side configuration/i)).toBeInTheDocument();

    // The current default milestone tiers remain visible.
    expect(screen.getByText(/^1 Qualified Paid Referral$/i)).toBeInTheDocument();
    expect(screen.getByText(/^3 Qualified Paid Referrals/i)).toBeInTheDocument();
    expect(screen.getByText(/^10 Qualified Paid Referrals/i)).toBeInTheDocument();
    expect(screen.getByText(/^20 Qualified Paid Referrals/i)).toBeInTheDocument();
    expect(screen.getByText(/^Lifetime Premium$/i)).toBeInTheDocument();
    expect(screen.getByText(/Milestone XP and points bonuses are currently set to zero/i)).toBeInTheDocument();
  });
});

describe('ReferralRules — PDF download', () => {
  beforeEach(() => {
    saveMock.mockClear();
    textMock.mockClear();
  });

  it('generates and saves a PDF with the expected filename', async () => {
    renderWithRoutes();
    fireEvent.click(screen.getByRole('button', { name: /download rules as pdf/i }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledWith('habtastic-referral-rules.pdf'));
    // Title must be in the document
    const printedStrings = textMock.mock.calls.map((c) => (Array.isArray(c[0]) ? c[0].join(' ') : c[0])).join(' ');
    expect(printedStrings).toMatch(/HabTastic AI Referral Program/i);
    // All major sections present
    [
      'Eligible Referrals',
      'Reward Milestones',
      'Reward Timeline',
      'Important Rules',
      'XP & Bonus Rewards',
      'Fair Use Policy',
      'Need Help?',
    ].forEach((section) => expect(printedStrings).toContain(section));
  });
});

describe('Need help? — referred email prefill', () => {
  beforeEach(() => {
    (toast.error as any).mockClear?.();
  });

  it('blocks navigation when email is empty', () => {
    renderWithRoutes();
    fireEvent.click(screen.getByRole('button', { name: /open support form/i }));
    expect(toast.error).toHaveBeenCalled();
    // We did not navigate away — rules heading still visible
    expect(screen.getByRole('heading', { name: /Program Rules/i })).toBeInTheDocument();
  });

  it('blocks navigation when email is malformed', () => {
    renderWithRoutes();
    fireEvent.change(screen.getByLabelText(/referred user's email/i), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: /open support form/i }));
    expect(toast.error).toHaveBeenCalledWith('Please enter a valid email');
  });

  it('opens SubmitFeedback with the email prefilled in the message body', async () => {
    renderWithRoutes();
    fireEvent.change(screen.getByLabelText(/referred user's email/i), {
      target: { value: 'friend@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /open support form/i }));

    // Now on SubmitFeedback page
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Submit Feedback/i })).toBeInTheDocument(),
    );
    const textarea = screen.getByPlaceholderText(/Tell us what's on your mind/i) as HTMLTextAreaElement;
    expect(textarea.value).toContain('Referred user email: friend@example.com');
    expect(textarea.value).toContain('Re: Referral not tracked');
  });
});
