/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'HabTastic'
const APP_URL = 'https://habtastic.com'
const PRICING_URL = 'https://habtastic.com/pricing'
const LOGO_URL =
  'https://habtastic.com/app-icon-512.png'

interface TrialEndedProps {
  name?: string
}

const TrialEndedEmail = ({ name }: TrialEndedProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {SITE_NAME} free trial has ended — upgrade to keep your streak alive</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} width="64" height="64" alt={SITE_NAME} style={logo} />
        <Heading style={h1}>
          {name ? `${name}, your free trial has ended` : 'Your free trial has ended'}
        </Heading>
        <Text style={text}>
          Your 5-day Premium trial is over — but your habits, streaks, and progress are all saved. Upgrade to Premium to keep unlocking the full {SITE_NAME} experience.
        </Text>

        <Section style={tipBox}>
          <Text style={tipTitle}>👑 With Premium you keep:</Text>
          <Text style={tipItem}>✅ Unlimited habits (Free supports up to 4)</Text>
          <Text style={tipItem}>✅ Unlimited Winston AI coaching</Text>
          <Text style={tipItem}>✅ Advanced analytics & insights</Text>
          <Text style={tipItem}>✅ Wellness Hub, themes & all extras</Text>
        </Section>

        <Section style={tipBox}>
          <Text style={tipTitle}>🚀 How to upgrade — 3 quick steps</Text>
          <Text style={tipItem}>1️⃣ Open the {SITE_NAME} app</Text>
          <Text style={tipItem}>2️⃣ Tap <strong>Premium</strong> in the bottom tab bar</Text>
          <Text style={tipItem}>3️⃣ Pick a plan — checkout is instant & secure</Text>
        </Section>

        <Section style={{ textAlign: 'center' as const, margin: '32px 0' }}>
          <Button style={button} href={PRICING_URL}>
            Upgrade to Premium 👑
          </Button>
        </Section>

        <Text style={text}>
          Prefer the free plan? No problem — you can keep tracking up to 4 habits and use up to 5 Winston messages per UTC day. Just open the app and keep your streak going at <a href={APP_URL} style={link}>{APP_URL}</a>.
        </Text>

        <Text style={footer}>
          Questions? Just reply to this email — we read every message.
          <br />
          Subscription &amp; payment help: info@habtastic.com · Technical help: support@habtastic.com · Everything else: info@habtastic.com
          <br />
          — The {SITE_NAME} Team
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TrialEndedEmail,
  subject: 'Your HabTastic free trial has ended — upgrade to keep going 👑',
  displayName: 'Trial ended',
  previewData: { name: 'Jane' },
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
const tipBox = {
  backgroundColor: 'hsl(210, 40%, 98%)',
  border: '1px solid hsl(215, 16%, 88%)',
  borderRadius: '16px',
  padding: '20px 22px',
  margin: '20px 0',
}
const tipTitle = {
  fontSize: '15px',
  fontWeight: 'bold' as const,
  color: 'hsl(175, 77%, 26%)',
  margin: '0 0 12px',
}
const tipItem = {
  fontSize: '14px',
  color: 'hsl(215, 25%, 20%)',
  lineHeight: '1.6',
  margin: '0 0 6px',
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
const link = { color: 'hsl(175, 77%, 26%)', textDecoration: 'underline' }
const footer = {
  fontSize: '12px',
  color: 'hsl(215, 16%, 55%)',
  margin: '32px 0 0',
  lineHeight: '1.6',
}
