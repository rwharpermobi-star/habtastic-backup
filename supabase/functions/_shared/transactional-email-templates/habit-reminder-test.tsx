/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'HabTastic'

interface HabitReminderTestProps {
  name?: string
}

const HabitReminderTestEmail = ({ name }: HabitReminderTestProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {SITE_NAME} email reminders are working ✅</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `Hey ${name}, you're all set! 🎉` : `You're all set! 🎉`}
        </Heading>
        <Text style={text}>
          This is a test from {SITE_NAME}. Your email is verified and ready to
          receive habit reminders whenever push notifications can't reach you.
        </Text>

        <Section style={tipBox}>
          <Text style={tipTitle}>What happens next</Text>
          <Text style={tipItem}>
            • When push notifications are blocked or off, we'll email you at
            your scheduled reminder times.
          </Text>
          <Text style={tipItem}>
            • Email reminders are in beta — expect a few rough edges, and let
            us know what would make them more useful.
          </Text>
        </Section>

        <Text style={footer}>— The {SITE_NAME} Team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: HabitReminderTestEmail,
  subject: 'Your HabTastic email reminders are working ✅',
  displayName: 'Email reminders — test',
  previewData: { name: 'Jane' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: 'hsl(215, 25%, 20%)',
  margin: '0 0 18px',
}
const text = {
  fontSize: '15px',
  color: 'hsl(215, 16%, 42%)',
  lineHeight: '1.6',
  margin: '0 0 18px',
}
const tipBox = {
  backgroundColor: 'hsl(210, 40%, 98%)',
  border: '1px solid hsl(215, 16%, 88%)',
  borderRadius: '16px',
  padding: '18px 20px',
  margin: '20px 0',
}
const tipTitle = {
  fontSize: '14px',
  fontWeight: 'bold' as const,
  color: 'hsl(175, 77%, 26%)',
  margin: '0 0 10px',
}
const tipItem = {
  fontSize: '14px',
  color: 'hsl(215, 25%, 20%)',
  lineHeight: '1.6',
  margin: '0 0 6px',
}
const footer = {
  fontSize: '12px',
  color: 'hsl(215, 16%, 55%)',
  margin: '28px 0 0',
}
