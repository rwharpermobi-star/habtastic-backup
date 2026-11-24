/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'HabTastic AI'
const LOGO_URL = 'https://habtastic.com/app-icon-512.png'

type Kind = 'purchase' | 'renewal' | 'payment_failed' | 'cancellation' | 'expiration' | 'refund'

interface Props {
  kind?: Kind
  planName?: string
  amount?: string | null
  currency?: string
  periodEnd?: string | null
  accessPaused?: boolean
  refundReason?: 'refund' | 'chargeback' | 'revoked' | null
  premiumRemoved?: boolean
  manageUrl?: string
}

const COPY: Record<Kind, { subject: (p: Props) => string; heading: string; body: (p: Props) => string; cta: string }> = {
  purchase: {
    subject: (p) => `Welcome to ${SITE_NAME} ${p.planName ?? 'Premium'} 👑`,
    heading: 'Premium is unlocked 👑',
    body: (p) =>
      `Thanks for subscribing to ${p.planName ?? 'Premium'} through Google Play. Unlimited habits, unlimited Winston and every Premium feature are now yours.`,
    cta: 'Manage subscription',
  },
  renewal: {
    subject: (p) => `Your ${SITE_NAME} ${p.planName ?? 'Premium'} has renewed`,
    heading: 'Subscription renewed ✅',
    body: (p) =>
      `Your ${p.planName ?? 'Premium'} subscription renewed successfully through Google Play. Keep that streak going.`,
    cta: 'Manage subscription',
  },
  payment_failed: {
    subject: () => `Action needed: your ${SITE_NAME} payment didn't go through`,
    heading: "Your payment didn't go through",
    body: (p) =>
      p.accessPaused
        ? 'Google Play still could not charge your payment method, so Premium is paused. Update your payment method in Google Play and Premium switches back on automatically.'
        : "Google Play couldn't charge your payment method for your Premium renewal. You still have Premium for now — update your payment method in Google Play so you don't lose access.",
    cta: 'Update payment in Google Play',
  },
  cancellation: {
    subject: () => `Your ${SITE_NAME} subscription has been cancelled`,
    heading: 'Subscription cancelled',
    body: (p) =>
      `Your ${p.planName ?? 'Premium'} subscription won't renew. You keep Premium${p.periodEnd ? ` until ${p.periodEnd}` : ' until the end of your paid period'}, and your habits and progress stay saved. Changed your mind? You can resubscribe any time in Google Play.`,
    cta: 'Resubscribe in Google Play',
  },
  expiration: {
    subject: () => `Your ${SITE_NAME} Premium has ended`,
    heading: 'Your Premium has ended',
    body: () =>
      "Your Google Play Premium subscription has expired. Your habits, streaks and progress are all still saved — subscribe again whenever you're ready.",
    cta: 'Subscribe again',
  },
  refund: {
    subject: (p) =>
      p.refundReason === 'chargeback'
        ? `Your ${SITE_NAME} payment was reversed`
        : `Your ${SITE_NAME} refund has been processed`,
    heading: 'Refund processed',
    body: (p) => {
      const what =
        p.refundReason === 'chargeback'
          ? 'Your bank or card provider reversed your HabTastic AI Premium payment (a chargeback).'
          : 'Google Play has processed a refund for your HabTastic AI Premium payment.'
      const access = p.premiumRemoved
        ? ' Because the payment was returned, Premium from this subscription has ended. Your habits and progress are still saved.'
        : p.refundReason === 'chargeback'
          ? ''
          : ' Refunds usually reach your original payment method within a few business days, depending on your bank.'
      const mistake = p.refundReason === 'chargeback' ? ' If this was a mistake, contact info@habtastic.com.' : ''
      return what + access + mistake
    },
    cta: 'View Google Play subscriptions',
  },
}

const safeKind = (k: unknown): Kind => (typeof k === 'string' && k in COPY ? (k as Kind) : 'purchase')

const SubscriptionLifecycleEmail = (props: Props) => {
  const kind = safeKind(props.kind)
  const copy = COPY[kind]
  const showAmount = !!props.amount && (kind === 'purchase' || kind === 'renewal' || kind === 'refund')
  const periodLabel =
    kind === 'cancellation' ? 'Premium until' : kind === 'expiration' ? 'Ended on' : kind === 'refund' ? null : 'Next renewal'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{copy.subject(props)}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img src={LOGO_URL} width="64" height="64" alt={SITE_NAME} style={logo} />
          <Heading style={h1}>{kind === 'refund' && props.refundReason === 'chargeback' ? 'Payment reversed' : copy.heading}</Heading>
          <Text style={text}>{copy.body(props)}</Text>

          <Section style={box}>
            <Row>
              <Column style={label}>Plan</Column>
              <Column style={value}>{props.planName ?? 'Premium'}</Column>
            </Row>
            {showAmount ? (
              <Row>
                <Column style={label}>{kind === 'refund' ? 'Refunded' : 'Amount'}</Column>
                <Column style={value}>
                  {props.currency ?? 'ZAR'} {props.amount}
                </Column>
              </Row>
            ) : null}
            {periodLabel && props.periodEnd ? (
              <Row>
                <Column style={label}>{periodLabel}</Column>
                <Column style={value}>{props.periodEnd}</Column>
              </Row>
            ) : null}
            <Row>
              <Column style={label}>Billed by</Column>
              <Column style={value}>Google Play</Column>
            </Row>
          </Section>

          <Section style={{ textAlign: 'center' as const, margin: '32px 0' }}>
            <Button style={button} href={props.manageUrl ?? 'https://play.google.com/store/account/subscriptions'}>
              {copy.cta}
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            Your subscription is billed and managed by Google Play. {SITE_NAME} never sees or stores your card details.
            <br />
            Billing questions: info@habtastic.com · Technical help: support@habtastic.com
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: SubscriptionLifecycleEmail,
  subject: (data: Record<string, any>) => COPY[safeKind(data?.kind)].subject(data ?? {}),
  displayName: 'Google Play subscription update (customer)',
  previewData: {
    kind: 'purchase',
    planName: 'Premium Monthly',
    amount: '94.99',
    currency: 'ZAR',
    periodEnd: '18 Dec 2026',
    accessPaused: false,
    manageUrl: 'https://play.google.com/store/account/subscriptions?sku=habtastic_premium_monthly&package=app.lovable.habtastic',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const logo = { marginBottom: '24px' }
const h1 = { fontSize: '26px', fontWeight: 'bold' as const, color: 'hsl(215, 25%, 20%)', margin: '0 0 20px' }
const text = { fontSize: '15px', color: 'hsl(215, 16%, 42%)', lineHeight: '1.6', margin: '0 0 20px' }
const box = {
  backgroundColor: 'hsl(210, 40%, 98%)',
  border: '1px solid hsl(215, 16%, 88%)',
  borderRadius: '16px',
  padding: '18px 22px',
  margin: '24px 0',
}
const label = { fontSize: '13px', color: 'hsl(215, 16%, 50%)', padding: '6px 0', width: '45%' }
const value = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(215, 25%, 20%)', padding: '6px 0' }
const button = {
  backgroundColor: 'hsl(175, 77%, 26%)',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  borderRadius: '20px',
  padding: '14px 32px',
  textDecoration: 'none',
}
const hr = { borderColor: 'hsl(215, 16%, 90%)', margin: '28px 0 16px' }
const footer = { fontSize: '12px', color: 'hsl(215, 16%, 55%)', margin: '0', lineHeight: '1.6' }
