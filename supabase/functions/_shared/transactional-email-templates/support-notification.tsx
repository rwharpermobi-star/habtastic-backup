/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body,
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
const LOGO_URL =
  'https://habtastic.com/app-icon-512.png'

interface SupportNotificationProps {
  category?: string
  message?: string
  userName?: string
  userEmail?: string
  userId?: string
  submittedAt?: string
}

const SupportNotificationEmail = ({
  category,
  message,
  userName,
  userEmail,
  userId,
  submittedAt,
}: SupportNotificationProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      New {category || 'support'} request from {userName || userEmail || 'a user'}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} width="56" height="56" alt={SITE_NAME} style={logo} />
        <Heading style={h1}>📨 New support request</Heading>
        <Text style={text}>
          A {SITE_NAME} user just submitted a new request. Details below:
        </Text>

        <Section style={card}>
          <Text style={label}>Category</Text>
          <Text style={value}>{category || 'General'}</Text>

          <Text style={label}>From</Text>
          <Text style={value}>
            {userName || 'Unknown'} {userEmail ? `<${userEmail}>` : ''}
          </Text>

          {userId ? (
            <>
              <Text style={label}>User ID</Text>
              <Text style={mono}>{userId}</Text>
            </>
          ) : null}

          {submittedAt ? (
            <>
              <Text style={label}>Submitted</Text>
              <Text style={value}>{submittedAt}</Text>
            </>
          ) : null}
        </Section>

        <Section style={messageBox}>
          <Text style={label}>Message</Text>
          <Text style={messageText}>{message || '(no message)'}</Text>
        </Section>

        <Text style={footer}>
          Reply directly to the user at{' '}
          <span style={{ color: 'hsl(175, 77%, 26%)' }}>{userEmail || 'their email'}</span>.
          <br />
          — {SITE_NAME} Support System
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SupportNotificationEmail,
  subject: (data: Record<string, any>) =>
    `[${SITE_NAME} Support] ${data?.category || 'New request'} from ${data?.userName || data?.userEmail || 'user'}`,
  displayName: 'Support team notification',
  to: 'support@habtastic.com',
  previewData: {
    category: 'Technical Support',
    message: "I can't add a new habit on Android — the button doesn't respond.",
    userName: 'Jane Doe',
    userEmail: 'jane@example.com',
    userId: '00000000-0000-0000-0000-000000000000',
    submittedAt: new Date().toISOString(),
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '600px' }
const logo = { marginBottom: '20px' }
const h1 = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: 'hsl(215, 25%, 20%)',
  margin: '0 0 16px',
}
const text = {
  fontSize: '15px',
  color: 'hsl(215, 16%, 42%)',
  lineHeight: '1.6',
  margin: '0 0 20px',
}
const card = {
  backgroundColor: 'hsl(210, 40%, 98%)',
  border: '1px solid hsl(215, 16%, 88%)',
  borderRadius: '14px',
  padding: '18px 20px',
  margin: '0 0 16px',
}
const messageBox = {
  backgroundColor: 'hsl(175, 77%, 96%)',
  border: '1px solid hsl(175, 60%, 80%)',
  borderRadius: '14px',
  padding: '18px 20px',
  margin: '0 0 24px',
}
const label = {
  fontSize: '11px',
  fontWeight: 'bold' as const,
  color: 'hsl(215, 16%, 50%)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  margin: '8px 0 2px',
}
const value = {
  fontSize: '14px',
  color: 'hsl(215, 25%, 20%)',
  margin: '0 0 4px',
  lineHeight: '1.5',
}
const mono = {
  fontSize: '12px',
  fontFamily: 'monospace',
  color: 'hsl(215, 25%, 30%)',
  margin: '0 0 4px',
}
const messageText = {
  fontSize: '14px',
  color: 'hsl(215, 25%, 20%)',
  lineHeight: '1.6',
  margin: '0',
  whiteSpace: 'pre-wrap' as const,
}
const footer = {
  fontSize: '12px',
  color: 'hsl(215, 16%, 55%)',
  margin: '24px 0 0',
  lineHeight: '1.6',
}
