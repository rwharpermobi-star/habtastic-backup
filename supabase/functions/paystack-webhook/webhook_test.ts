// Signature-verification + idempotency regression tests for the Paystack webhook.
// Run with: deno test --allow-env supabase/functions/paystack-webhook/webhook_test.ts
import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createHmac } from "node:crypto";
import { buildIdempotencyKey } from "../_shared/paystack-idempotency.ts";

Deno.env.set("PAYSTACK_SECRET_KEY", "sk_test_webhook_regression_key");
const { verifySignature } = await import("../_shared/paystack.ts");

const secret = Deno.env.get("PAYSTACK_SECRET_KEY")!;
const sign = (body: string) =>
  createHmac("sha512", secret).update(body).digest("hex");

const body = JSON.stringify({
  event: "charge.success",
  id: 991122,
  data: { reference: "ref_abc", amount: 9900, status: "success" },
});

Deno.test("accepts a correctly signed payload", () => {
  assertEquals(verifySignature(body, sign(body)), true);
});

Deno.test("rejects missing, empty and malformed signatures", () => {
  assertEquals(verifySignature(body, null), false);
  assertEquals(verifySignature(body, ""), false);
  assertEquals(verifySignature(body, "deadbeef"), false);
});

Deno.test("rejects a valid signature for a tampered body", () => {
  const sig = sign(body);
  const tampered = body.replace('"amount":9900', '"amount":1');
  assertEquals(verifySignature(tampered, sig), false);
});

Deno.test("rejects a signature computed with the wrong secret", () => {
  const bad = createHmac("sha512", "sk_test_other").update(body).digest("hex");
  assertEquals(verifySignature(body, bad), false);
});

Deno.test("idempotency key is stable for identical replays", () => {
  const sig = sign(body);
  const event = JSON.parse(body);
  assertEquals(
    buildIdempotencyKey(event, sig, body),
    buildIdempotencyKey(event, sig, body),
  );
});

Deno.test("idempotency key differs across distinct events", () => {
  const sig = sign(body);
  const a = buildIdempotencyKey(JSON.parse(body), sig, body);
  const b = buildIdempotencyKey({ ...JSON.parse(body), id: 991123 }, sig, body);
  assertNotEquals(a, b);
});

Deno.test("falls back to reference then raw body when event id is absent", () => {
  const noId = { event: "charge.success", data: { reference: "ref_abc" } };
  const key = buildIdempotencyKey(noId, "sig", "raw");
  assertEquals(key, buildIdempotencyKey(noId, "sig", "different-raw"));

  const subOnly = {
    event: "subscription.create",
    data: { subscription_code: "SUB_1" },
  };
  assertNotEquals(key, buildIdempotencyKey(subOnly, "sig", "raw"));

  const bare = { event: "charge.success", data: {} };
  assertEquals(
    buildIdempotencyKey(bare, "sig", "raw"),
    buildIdempotencyKey(bare, "sig", "raw"),
  );
  assertNotEquals(
    buildIdempotencyKey(bare, "sig", "raw"),
    buildIdempotencyKey(bare, "sig", "raw2"),
  );
});
