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
const LOGO_URL =
  'https://habtastic.com/app-icon-512.png'

interface WelcomeEmailProps {
  name?: string
}

const WelcomeEmail = ({ name }: WelcomeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to {SITE_NAME} ⚡ Let's start your winning streak</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} width="64" height="64" alt={SITE_NAME} style={logo} />
        <Heading style={h1}>
          {name ? `Welcome, ${name}! 🎉` : 'Welcome to HabTastic! 🎉'}
        </Heading>
        <Text style={text}>
          You just took the first step toward a stronger, more consistent you. {SITE_NAME} turns your daily habits into a winning streak — with XP, coins, and Winston (your AI coach) cheering you on every day.
        </Text>

        <Section style={tipBox}>
          <Text style={tipTitle}>🚀 Your first 3 wins</Text>
          <Text style={tipItem}>1️⃣ Add your first habit (start small — 1 minute counts!)</Text>
          <Text style={tipItem}>2️⃣ Check it off today to start your streak ⛓️</Text>
          <Text style={tipItem}>3️⃣ Say hi to Winston for a personalized plan 💬</Text>
        </Section>

        <Section style={{ textAlign: 'center' as const, margin: '32px 0' }}>
          <Button style={button} href={APP_URL}>
            Let's Win Today! 💥
          </Button>
        </Section>

        <Text style={text}>
          Pro tip: consistency beats intensity. Even on busy days, a tiny check-in keeps your chain alive 🔥
        </Text>

        <Text style={footer}>
          Questions or feedback? Just reply to this email — we read every message.
          <br />
          Technical help: support@habtastic.com · Billing &amp; general enquiries: info@habtastic.com
          <br />
          — The {SITE_NAME} Team
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WelcomeEmail,
  subject: 'Welcome to HabTastic ⚡ Let\'s start your streak',
  displayName: 'Welcome email',
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
  margin: '24px 0',
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
const footer = {
  fontSize: '12px',
  color: 'hsl(215, 16%, 55%)',
  margin: '32px 0 0',
  lineHeight: '1.6',
}
