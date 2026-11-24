/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Body, Column, Container, Head, Heading, Html, Preview, Row, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

type Kind = 'purchase' | 'renewal' | 'payment_failed' | 'cancellation' | 'expiration' | 'refund'

const TITLES: Record<Kind, string> = {
  purchase: 'New Premium subscription',
  renewal: 'Successful renewal payment',
  payment_failed: 'Failed subscription payment',
  cancellation: 'Subscription cancelled',
  expiration: 'Subscription expired',
  refund: 'Subscription refunded',
}

interface Props {
  kind?: Kind
  provider?: string
  planName?: string
  amount?: string | null
  currency?: string
  periodEnd?: string | null
  accessPaused?: boolean
  refundReason?: 'refund' | 'chargeback' | 'revoked' | null
  premiumRemoved?: boolean
  accountRef?: string
  orderId?: string | null
  occurredAt?: string | null
}

const safeKind = (k: unknown): Kind => (typeof k === 'string' && k in TITLES ? (k as Kind) : 'purchase')

const AdminSubscriptionAlert = (p: Props) => {
  const kind = safeKind(p.kind)
  const rows: [string, string | null | undefined][] = [
    ['Event', TITLES[kind] + (kind === 'payment_failed' ? (p.accessPaused ? ' (Premium paused)' : ' (grace period)') : '')],
    ['Provider', p.provider ?? 'Google Play'],
    ['Refund type', kind === 'refund' ? (p.refundReason === 'chargeback' ? 'Chargeback' : p.refundReason === 'revoked' ? 'Refund + access revoked' : 'Refund') : null],
    ['Premium removed', kind === 'refund' ? (p.premiumRemoved ? 'Yes' : 'No (other Premium time or current period still paid)') : null],
    ['Plan', p.planName],
    ['Amount', p.amount ? `${p.currency ?? 'ZAR'} ${p.amount}` : null],
    ['Period end', p.periodEnd],
    ['Account ref', p.accountRef],
    ['Order ID', p.orderId],
    ['Date', p.occurredAt],
  ]
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`HabTastic AI: ${TITLES[kind]}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{TITLES[kind]}</Heading>
          <Section style={box}>
            {rows.filter(([, v]) => !!v).map(([k, v]) => (
              <Row key={k}>
                <Column style={label}>{k}</Column>
                <Column style={value}>{v}</Column>
              </Row>
            ))}
          </Section>
          <Text style={footer}>
            Automatic HabTastic AI billing notification. Customer contact details are intentionally left out — look the
            account up in the admin panel by its account reference, or the order in Google Play Console.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: AdminSubscriptionAlert,
  to: 'info@habtastic.com',
  subject: (data: Record<string, any>) =>
    `[HabTastic AI] ${safeKind(data?.kind) === 'refund' && data?.refundReason === 'chargeback' ? 'Chargeback received' : TITLES[safeKind(data?.kind)]}${data?.planName ? ` — ${data.planName}` : ''}`,
  displayName: 'Admin billing notification',
  previewData: {
    kind: 'purchase',
    provider: 'Google Play',
    planName: 'Premium Yearly',
    amount: '899.99',
    currency: 'ZAR',
    periodEnd: '18 Nov 2027',
    accountRef: '1a2b3c4d',
    orderId: 'GPA.1234-5678-9012-34567',
    occurredAt: '18 Nov 2026',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '28px 24px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: 'hsl(215, 25%, 20%)', margin: '0 0 16px' }
const box = {
  backgroundColor: 'hsl(210, 40%, 98%)',
  border: '1px solid hsl(215, 16%, 88%)',
  borderRadius: '12px',
  padding: '14px 18px',
  margin: '16px 0',
}
const label = { fontSize: '13px', color: 'hsl(215, 16%, 50%)', padding: '5px 0', width: '40%' }
const value = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(215, 25%, 20%)', padding: '5px 0' }
const footer = { fontSize: '12px', color: 'hsl(215, 16%, 55%)', lineHeight: '1.6', margin: '8px 0 0' }
