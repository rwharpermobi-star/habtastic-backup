import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolContext } from '@lovable.dev/mcp-js';
import { createSupabaseHandler } from '@lovable.dev/mcp-js/stacks/supabase';
import { assertToolResult } from '@lovable.dev/mcp-js/testing';
import mcp from '@/lib/mcp';
import listHabits from '@/lib/mcp/tools/list-habits';

const { createClient, order } = vi.hoisted(() => ({
  createClient: vi.fn(),
  order: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient }));

const context = new ToolContext({
  type: 'oauth',
  bearer: { token: 'test-token' },
  principal: {
    claims: { sub: 'test-user', client_id: 'test-client' },
    issuer: 'https://example.test/auth/v1',
    resource: 'https://example.test/functions/v1/mcp',
    acceptedAudiences: ['authenticated'],
    scopes: [],
    sub: 'test-user',
    clientId: 'test-client',
  },
});

describe('MCP SDK compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPABASE_URL', 'https://example.test');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'test-key');
    createClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ order }),
      }),
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('registers the existing tools and OAuth audience', () => {
    expect(mcp.tools.map(tool => tool.name)).toEqual([
      'list_habits', 'today_status', 'complete_habit', 'get_stats',
    ]);
    expect(mcp.auth).toMatchObject({ type: 'oauth', acceptedAudiences: ['authenticated'] });
  });

  it.each([
    { habits: [{ id: 'habit-1', name: 'Walk', completions: ['2026-10-30'] }] },
    { habits: [] },
  ])('returns valid tool results for habits $habits', async ({ habits }) => {
    order.mockResolvedValue({ data: habits, error: null });
    const result = await listHabits.handler({}, context);
    await assertToolResult(result);
    expect(result.structuredContent).toMatchObject({
      habits: habits.map(habit => ({ ...habit, completions_count: habit.completions.length })),
    });
    expect(createClient).toHaveBeenCalledWith('https://example.test', 'test-key', {
      global: { headers: { Authorization: 'Bearer test-token' } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it('preserves backend errors as valid error results', async () => {
    order.mockResolvedValue({ data: null, error: { message: 'Unavailable' } });
    const result = await listHabits.handler({}, context);
    await assertToolResult(result, { isError: true });
    expect(result.content).toEqual([{ type: 'text', text: 'Unavailable' }]);
  });

  it('rejects unauthenticated tool calls without creating a backend client', async () => {
    const result = await listHabits.handler({}, new ToolContext(undefined));
    await assertToolResult(result, { isError: true });
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each([undefined, 'Bearer invalid-token'])('requires valid endpoint authentication (%s)', async authorization => {
    const handler = createSupabaseHandler(mcp, { functionName: 'mcp' });
    const response = await handler(new Request('https://example.test/functions/v1/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }));
    expect(response.status).toBe(401);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('publishes protected-resource metadata for the Edge Function route', async () => {
    const handler = createSupabaseHandler(mcp, { functionName: 'mcp' });
    const response = await handler(new Request(
      'https://example.test/functions/v1/mcp/.well-known/oauth-protected-resource',
    ));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      resource: 'https://example.test/functions/v1/mcp',
      authorization_servers: [mcp.auth.issuer],
    });
  });
});
