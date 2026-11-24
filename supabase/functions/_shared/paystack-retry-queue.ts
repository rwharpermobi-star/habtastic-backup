// Shared retry/reprocessing helpers for Paystack webhook events.
//
// Every stored event keeps its original idempotency key (event_hash), so
// reprocessing is always safe: the downstream handlers dedupe on
// premium_grants / shop_orders unique keys and can never double-apply.
//
// Backoff: 1m, 5m, 15m, 1h, 6h, 24h (capped), then the event stops retrying
// and stays `failed` for admin inspection.
import { processEvent, writeAudit } from "./paystack-secure-dispatch.ts";

export const MAX_ATTEMPTS = 6;
const BACKOFF_MINUTES = [1, 5, 15, 60, 360, 1440];

export function nextRetryAt(attempts: number): string | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  const minutes = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length - 1)];
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export async function resolveLinks(
  admin: any,
  reference?: string | null,
  subscriptionCode?: string | null,
): Promise<{ shop_order_id: string | null; subscription_id: string | null }> {
  let shopOrderId: string | null = null;
  let subscriptionId: string | null = null;
  try {
    if (reference) {
      const { data } = await admin.from("shop_orders").select("id")
        .eq("paystack_reference", reference).maybeSingle();
      shopOrderId = (data?.id as string) ?? null;
    }
    if (subscriptionCode) {
      const { data } = await admin.from("subscriptions").select("id")
        .eq("paystack_subscription_code", subscriptionCode).maybeSingle();
      subscriptionId = (data?.id as string) ?? null;
    }
  } catch (e) {
    console.warn("[paystack-retry-queue] link resolution failed", e);
  }
  return { shop_order_id: shopOrderId, subscription_id: subscriptionId };
}

export async function markProcessed(
  admin: any,
  eventId: string,
  attempts: number,
  userId: string | null,
  links: { shop_order_id: string | null; subscription_id: string | null },
) {
  await admin.from("paystack_webhook_events").update({
    status: "processed",
    processed_at: new Date().toISOString(),
    error_message: null,
    attempts,
    last_attempt_at: new Date().toISOString(),
    next_retry_at: null,
    user_id: userId,
    shop_order_id: links.shop_order_id,
    subscription_id: links.subscription_id,
  }).eq("id", eventId);
}

export async function markFailed(
  admin: any,
  eventId: string,
  attempts: number,
  error: unknown,
) {
  const retryAt = nextRetryAt(attempts);
  await admin.from("paystack_webhook_events").update({
    status: "failed",
    processed_at: new Date().toISOString(),
    error_message: String(error).slice(0, 2000),
    attempts,
    last_attempt_at: new Date().toISOString(),
    next_retry_at: retryAt,
  }).eq("id", eventId);
  return retryAt;
}

export async function recordDuplicate(admin: any, eventHash: string) {
  try {
    const { data } = await admin.from("paystack_webhook_events")
      .select("id, duplicate_count").eq("event_hash", eventHash).maybeSingle();
    if (!data?.id) return;
    await admin.from("paystack_webhook_events").update({
      duplicate_count: (data.duplicate_count ?? 0) + 1,
    }).eq("id", data.id);
  } catch (e) {
    console.warn("[paystack-retry-queue] duplicate_count bump failed", e);
  }
}

export type SweepOutcome = {
  event_id: string;
  event_type: string;
  attempts: number;
  ok: boolean;
  changed?: number;
  error?: string;
  next_retry_at?: string | null;
};

export async function sweepDueEvents(
  admin: any,
  opts: { limit?: number } = {},
): Promise<SweepOutcome[]> {
  const { data: due } = await admin.rpc("paystack_events_due_for_retry", {
    _limit: opts.limit ?? 25,
    _max_attempts: MAX_ATTEMPTS,
  });
  const outcomes: SweepOutcome[] = [];

  for (const ev of (due ?? []) as any[]) {
    const attempts = (ev.attempts ?? 0) + 1;
    const { data: claimed } = await admin.from("paystack_webhook_events")
      .update({
        attempts,
        last_attempt_at: new Date().toISOString(),
        next_retry_at: nextRetryAt(attempts),
      })
      .eq("id", ev.id)
      .eq("attempts", ev.attempts ?? 0)
      .select("id")
      .maybeSingle();
    if (!claimed?.id) continue;

    const raw = ev.raw_payload ?? {};
    const eventType = (raw?.event as string) ?? ev.event_type;
    const data = raw?.data ?? {};
    try {
      const { user, before, after } = await processEvent(eventType, data, raw?.id ?? null);
      const changed = await writeAudit(
        ev.id as string,
        eventType,
        user ?? (ev.user_id as string) ?? null,
        before,
        after,
        { __retry: true, __attempt: attempts, __source: "sweeper" },
      );
      const links = await resolveLinks(
        admin,
        data?.reference ?? null,
        data?.subscription_code ?? data?.subscription?.subscription_code ?? null,
      );
      await markProcessed(admin, ev.id as string, attempts, user ?? ev.user_id ?? null, links);
      outcomes.push({
        event_id: ev.id, event_type: eventType, attempts, ok: true,
        changed: changed ? Object.keys(changed).length : 0,
      });
    } catch (e) {
      const retryAt = await markFailed(admin, ev.id as string, attempts, e);
      outcomes.push({
        event_id: ev.id, event_type: eventType, attempts, ok: false,
        error: "retry_failed", next_retry_at: retryAt,
      });
    }
  }
  return outcomes;
}
