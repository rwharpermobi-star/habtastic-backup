/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Row,
  Column,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'HabTastic AI'
const APP_URL = 'https://habtastic.com/subscription'
const LOGO_URL =
  'https://habtastic.com/app-icon-512.png'

interface PaymentReceiptProps {
  planName?: string
  amount?: string
  currency?: string
  reference?: string
  paidAt?: string
  nextBillingDate?: string
}

const PaymentReceiptEmail = ({
  planName = 'Premium Monthly',
  amount = '0.00',
  currency = 'ZAR',
  reference = '—',
  paidAt = '—',
  nextBillingDate,
}: PaymentReceiptProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      Your {SITE_NAME} payment receipt — {currency} {amount}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} width="64" height="64" alt={SITE_NAME} style={logo} />
        <Heading style={h1}>Payment confirmed ✅</Heading>
        <Text style={text}>
          Thanks for backing your own progress. Your {SITE_NAME} Premium is active
          and every feature is unlocked — unlimited habits, unlimited Winston, the
          full lot.
        </Text>

        <Section style={box}>
          <Row>
            <Column style={label}>Plan</Column>
            <Column style={value}>{planName}</Column>
          </Row>
          <Row>
            <Column style={label}>Amount paid</Column>
            <Column style={value}>
              {currency} {amount}
            </Column>
          </Row>
          <Row>
            <Column style={label}>Reference</Column>
            <Column style={value}>{reference}</Column>
          </Row>
          <Row>
            <Column style={label}>Date</Column>
            <Column style={value}>{paidAt}</Column>
          </Row>
          {nextBillingDate ? (
            <Row>
              <Column style={label}>Next billing</Column>
              <Column style={value}>{nextBillingDate}</Column>
            </Row>
          ) : null}
        </Section>

        <Section style={{ textAlign: 'center' as const, margin: '32px 0' }}>
          <Button style={button} href={APP_URL}>
            View subscription
          </Button>
        </Section>

        <Hr style={hr} />
        <Text style={footer}>
          This is your official receipt — keep it for your records. Payments are
          processed securely by Paystack; {SITE_NAME} never stores your card
          details.
          <br />
          Billing questions: info@habtastic.com · Technical help: support@habtastic.com
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: PaymentReceiptEmail,
  subject: (data: Record<string, any>) =>
    `Your HabTastic AI receipt — ${data?.currency ?? 'ZAR'} ${data?.amount ?? ''}`.trim(),
  displayName: 'Payment receipt / confirmation',
  previewData: {
    planName: 'Premium Monthly',
    amount: '99.00',
    currency: 'ZAR',
    reference: 'HT-1A2B3C4D',
    paidAt: '16 Aug 2026',
    nextBillingDate: '16 Sep 2026',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const logo = { marginBottom: '24px' }
const h1 = {
  fontSize: '26px',
  fontWeight: 'bold' as const,
  color: 'hsl(215, 25%, 20%)',
  margin: '0 0 20px',
}
const text = {
  fontSize: '15px',
  color: 'hsl(215, 16%, 42%)',
  lineHeight: '1.6',
  margin: '0 0 20px',
}
const box = {
  backgroundColor: 'hsl(210, 40%, 98%)',
  border: '1px solid hsl(215, 16%, 88%)',
  borderRadius: '16px',
  padding: '18px 22px',
  margin: '24px 0',
}
const label = {
  fontSize: '13px',
  color: 'hsl(215, 16%, 50%)',
  padding: '6px 0',
  width: '45%',
}
const value = {
  fontSize: '14px',
  fontWeight: 'bold' as const,
  color: 'hsl(215, 25%, 20%)',
  padding: '6px 0',
}
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
const footer = {
  fontSize: '12px',
  color: 'hsl(215, 16%, 55%)',
  margin: '0',
  lineHeight: '1.6',
}
