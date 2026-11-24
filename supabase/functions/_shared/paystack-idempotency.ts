// Deterministic idempotency key derivation for Paystack webhook events.
//
// key = sha256(`${eventType}:${eventId}:${signature}`)
// Falls back to the payment reference / subscription code when Paystack omits
// an event id, and finally to the raw body. Combined with the UNIQUE constraint
// on paystack_webhook_events.event_hash this guarantees that replaying the same
// signed event can never apply an order or subscription update twice.
import { createHash } from "node:crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function buildIdempotencyKey(
  event: any,
  signature: string,
  raw: string,
): string {
  const sig = signature || "nosig";
  const eventId = event?.id ?? event?.data?.id ?? null;
  const eventType = event?.event ?? "unknown";
  if (eventId) return sha256(`${eventType}:${eventId}:${sig}`);
  const ref =
    event?.data?.reference ??
    event?.data?.subscription_code ??
    event?.data?.subscription?.subscription_code ??
    null;
  if (ref) return sha256(`${eventType}:${ref}:${sig}`);
  // Final fallback – body + signature. Identical replays still dedupe.
  return sha256(`${sig}:${raw}`);
}
