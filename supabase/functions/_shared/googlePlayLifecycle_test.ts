import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1'
import {
  ADMIN_NOTIFICATION_EMAIL,
  buildLifecycleEmails,
  classifyPlayNotification,
  formatPlayMoney,
  type LifecycleEmailInput,
} from './googlePlayLifecycle.ts'
import { TEMPLATES } from './transactional-email-templates/registry.ts'

const sub = (type: number) => ({
  packageName: 'app.lovable.habtastic',
  eventTimeMillis: '1795000000000',
  subscriptionNotification: { notificationType: type, purchaseToken: 'tok-abc', subscriptionId: 'habtastic_premium_monthly' },
})

Deno.test('each Google Play notification maps to the right email', () => {
  const expected: Record<number, string | null> = {
    4: 'purchase',
    2: 'renewal',
    1: 'renewal',
    6: 'payment_failed',
    5: 'payment_failed',
    3: 'cancellation',
    13: 'expiration',
    12: 'refund',
    7: null,
    10: null,
  }
  for (const [type, kind] of Object.entries(expected)) {
    assertEquals(classifyPlayNotification(sub(Number(type))).kind, kind, `type ${type}`)
  }
})

Deno.test('subscription refunds (voided purchases) send a refund email; one-time products are ignored', () => {
  const voided = classifyPlayNotification({
    voidedPurchaseNotification: { purchaseToken: 'tok-abc', orderId: 'GPA.1', productType: 1 },
  })
  assertEquals(voided.kind, 'refund')
  assertEquals(voided.purchaseToken, 'tok-abc')
  assertEquals(voided.orderId, 'GPA.1')

  const oneTime = classifyPlayNotification({ oneTimeProductNotification: { purchaseToken: 'x' } })
  assertEquals(oneTime.unsupported, true)
  assertEquals(oneTime.kind, null)
})

Deno.test('Google money keeps cents: R94.99 and R899.99', () => {
  assertEquals(formatPlayMoney('94', 990000000), '94.99')
  assertEquals(formatPlayMoney('899', 990000000), '899.99')
})

const base: LifecycleEmailInput = {
  kind: 'purchase',
  notificationType: 4,
  purchaseToken: 'tok-abc',
  userId: '1a2b3c4d-0000-4000-8000-000000000000',
  productId: 'habtastic_premium_yearly',
  interval: 'annually',
  amount: '899.99',
  currency: 'ZAR',
  periodEnd: '2027-11-18T00:00:00Z',
  orderId: 'GPA.1234',
  eventTimeMillis: '1795000000000',
}

Deno.test('admin copy goes to info@habtastic.com without the customer email', async () => {
  const emails = await buildLifecycleEmails(base, 'buyer@example.com')
  assertEquals(emails.length, 2)
  const [customer, admin] = emails
  assertEquals(customer.templateName, 'subscription-lifecycle')
  assertEquals(customer.recipientEmail, 'buyer@example.com')
  assertEquals(admin.templateName, 'admin-subscription-alert')
  assertEquals(TEMPLATES['admin-subscription-alert'].to, ADMIN_NOTIFICATION_EMAIL)
  assertEquals(ADMIN_NOTIFICATION_EMAIL, 'info@habtastic.com')
  assertEquals(JSON.stringify(admin).includes('buyer@example.com'), false)
  assertEquals(admin.templateData.accountRef, '1a2b3c4d')
  assertEquals(customer.templateData.planName, 'Premium Yearly')
})

Deno.test('redelivered notifications reuse the same keys; a new renewal period gets new keys', async () => {
  const a = await buildLifecycleEmails({ ...base, kind: 'renewal', notificationType: 2 }, 'b@example.com')
  const b = await buildLifecycleEmails({ ...base, kind: 'renewal', notificationType: 2 }, 'b@example.com')
  const next = await buildLifecycleEmails(
    { ...base, kind: 'renewal', notificationType: 2, periodEnd: '2028-11-18T00:00:00Z' },
    'b@example.com',
  )
  assertEquals(a.map((e) => e.idempotencyKey), b.map((e) => e.idempotencyKey))
  assertNotEquals(a[0].idempotencyKey, next[0].idempotencyKey)
  assertNotEquals(a[0].idempotencyKey, a[1].idempotencyKey)
})

Deno.test('REVOKED and VOIDED for the same refunded order send one refund email', async () => {
  const revoked = await buildLifecycleEmails({ ...base, kind: 'refund', notificationType: 12 }, 'b@example.com')
  const voided = await buildLifecycleEmails({ ...base, kind: 'refund', notificationType: null }, 'b@example.com')
  assertEquals(revoked[0].idempotencyKey, voided[0].idempotencyKey)
})

Deno.test('no customer email on file still notifies the admin', async () => {
  const emails = await buildLifecycleEmails(base, null)
  assertEquals(emails.map((e) => e.templateName), ['admin-subscription-alert'])
})

Deno.test('customer and admin templates render a subject for every event', () => {
  for (const kind of ['purchase', 'renewal', 'payment_failed', 'cancellation', 'expiration', 'refund']) {
    for (const name of ['subscription-lifecycle', 'admin-subscription-alert']) {
      const subject = TEMPLATES[name].subject
      const text = typeof subject === 'function' ? subject({ kind, planName: 'Premium Monthly' }) : subject
      assertEquals(text.length > 10, true, `${name}/${kind}`)
    }
  }
})

import { decidePlayRevocation } from './googlePlayLifecycle.ts'

const refundNote = (over: Record<string, unknown> = {}) => ({
  kind: 'refund' as const,
  label: 'VOIDED_PURCHASE',
  orderId: 'GPA.1..2',
  refundType: 1,
  ...over,
})

Deno.test('REVOKED removes Premium immediately', () => {
  const d = decidePlayRevocation({
    notification: refundNote({ label: 'SUBSCRIPTION_REVOKED', orderId: null, refundType: null }),
    latestOrderId: 'GPA.1..2',
    googleEntitled: false,
  })
  assertEquals([d.revoke, d.reason, d.orderId], [true, 'revoked', 'GPA.1..2'])
})

Deno.test('refund of the current paid order removes Premium now, even if Google still shows it active', () => {
  const d = decidePlayRevocation({ notification: refundNote(), latestOrderId: 'GPA.1..2', googleEntitled: true })
  assertEquals([d.revoke, d.reason], [true, 'refund'])
})

Deno.test('chargebacks (voided reason 7) remove Premium and are labelled chargeback', () => {
  const d = decidePlayRevocation({ notification: refundNote(), latestOrderId: 'GPA.1..2', googleEntitled: true, voidedReason: 7 })
  assertEquals([d.revoke, d.reason], [true, 'chargeback'])
})

Deno.test('refund of an older renewal keeps the current paid period', () => {
  const d = decidePlayRevocation({ notification: refundNote({ orderId: 'GPA.1..0' }), latestOrderId: 'GPA.1..2', googleEntitled: true })
  assertEquals(d.revoke, false)
  assertEquals(d.why, 'older_order_voided_current_period_paid')
})

Deno.test('older-order refund still removes Premium once Google ends the subscription', () => {
  const d = decidePlayRevocation({ notification: refundNote({ orderId: 'GPA.1..0' }), latestOrderId: 'GPA.1..2', googleEntitled: false })
  assertEquals([d.revoke, d.orderId], [true, 'GPA.1..0'])
})

Deno.test('partial refunds keep Premium', () => {
  const d = decidePlayRevocation({ notification: refundNote({ refundType: 2 }), latestOrderId: 'GPA.1..2', googleEntitled: true })
  assertEquals(d.revoke, false)
})

Deno.test('non-refund notifications never revoke', () => {
  for (const kind of ['purchase', 'renewal', 'payment_failed', 'cancellation', 'expiration'] as const) {
    const d = decidePlayRevocation({ notification: refundNote({ kind }), latestOrderId: 'GPA.1', googleEntitled: false })
    assertEquals(d.revoke, false, kind)
  }
})

Deno.test('refund emails say Premium ended only when it actually did', async () => {
  const { renderAsync } = await import('npm:@react-email/components@0.0.22')
  const React = await import('npm:react@18.3.1')
  const t = TEMPLATES['subscription-lifecycle']
  const render = (data: Record<string, unknown>) =>
    renderAsync(React.createElement(t.component, { ...t.previewData, kind: 'refund', ...data }), { plainText: true })
  const removed = await render({ refundReason: 'refund', premiumRemoved: true })
  const kept = await render({ refundReason: 'refund', premiumRemoved: false })
  const chargeback = await render({ refundReason: 'chargeback', premiumRemoved: true })
  assertEquals(removed.includes('Premium from this subscription has ended'), true)
  assertEquals(kept.includes('Premium from this subscription has ended'), false)
  assertEquals(chargeback.includes('chargeback'), true)
  const subject = t.subject as (d: Record<string, unknown>) => string
  assertEquals(subject({ kind: 'refund', refundReason: 'chargeback' }), 'Your HabTastic AI payment was reversed')
  const admin = TEMPLATES['admin-subscription-alert'].subject as (d: Record<string, unknown>) => string
  assertEquals(admin({ kind: 'refund', refundReason: 'chargeback' }).startsWith('[HabTastic AI] Chargeback received'), true)
})
