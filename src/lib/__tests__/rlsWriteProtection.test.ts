/**
 * RLS regression tests for the money tables.
 *
 * shop_orders and subscriptions are written exclusively by service-role Edge
 * Functions (Paystack init / verify / webhook). Clients may read their own rows
 * but must never be able to insert, update or delete them — otherwise a user
 * could self-grant premium or mark an order as paid.
 *
 * These tests hit the live PostgREST endpoint with the publishable (anon) key,
 * so any migration that loosens grants or adds a permissive write policy fails
 * CI immediately.
 */
import { describe, it, expect } from 'vitest';

const url = process.env.VITE_SUPABASE_URL ?? import.meta.env?.VITE_SUPABASE_URL;
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY;

const PROTECTED_TABLES = ['shop_orders', 'subscriptions'] as const;

async function rest(
  table: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
) {
  const query = method === 'POST' ? '' : '?id=neq.00000000-0000-0000-0000-000000000000';
  const res = await fetch(`${url}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: key as string,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, text: await res.text() };
}

const run = url && key ? describe : describe.skip;

run('RLS write protection on money tables', () => {
  for (const table of PROTECTED_TABLES) {
    it(`blocks anonymous inserts into ${table}`, async () => {
      const { status } = await rest(table, 'POST', {
        user_id: '00000000-0000-0000-0000-000000000000',
      });
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
    });

    it(`blocks anonymous updates on ${table}`, async () => {
      const { status, text } = await rest(table, 'PATCH', { status: 'paid' });
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
      expect(text).not.toContain('"status":"paid"');
    });

    it(`blocks anonymous deletes on ${table}`, async () => {
      const { status, text } = await rest(table, 'DELETE');
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
      expect(text).not.toBe('[]');
    });
  }

  it('blocks anonymous reads of paystack_webhook_events', async () => {
    const res = await fetch(`${url}/rest/v1/paystack_webhook_events?select=id&limit=1`, {
      headers: { apikey: key as string, Authorization: `Bearer ${key}` },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
