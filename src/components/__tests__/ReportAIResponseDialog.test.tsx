import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReportAIResponseDialog, { AI_REPORT_CATEGORY } from '../ReportAIResponseDialog';

const insert = vi.fn().mockResolvedValue({ error: null });
const invoke = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ insert }),
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'test@habtastic.com', user_metadata: { name: 'Test' } },
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('ReportAIResponseDialog', () => {
  beforeEach(() => {
    insert.mockClear();
    invoke.mockClear();
  });

  it('submits a report to the feedback table with the AI Response Report category', async () => {
    const onOpenChange = vi.fn();
    render(
      <ReportAIResponseDialog
        open
        onOpenChange={onOpenChange}
        responseText="Winston said something bad"
        messageTs={1700000000000}
      />,
    );

    fireEvent.click(screen.getByLabelText('Hate/harassment'));
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }));

    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    const payload = insert.mock.calls[0][0];
    expect(payload.category).toBe(AI_REPORT_CATEGORY);
    expect(payload.user_id).toBe('user-1');
    expect(payload.message).toContain('Hate/harassment');
    expect(payload.message).toContain('Winston said something bad');
    expect(payload.metadata.reason).toBe('Hate/harassment');
    expect(payload.metadata.message_at).toBe(new Date(1700000000000).toISOString());

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('send-transactional-email', expect.anything()));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
