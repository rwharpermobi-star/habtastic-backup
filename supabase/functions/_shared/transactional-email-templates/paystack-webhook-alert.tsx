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

interface Props {
  alertType?: string
  environment?: string
  webhookUrl?: string
  detail?: string
  minutesSinceLast?: number | null
  reachStatus?: string
  detectedAt?: string
}

const Email = ({
  alertType,
  environment,
  webhookUrl,
  detail,
  minutesSinceLast,
  reachStatus,
  detectedAt,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      Paystack webhook alert ({environment || 'live'}): {alertType || 'issue detected'}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>🚨 Paystack webhook alert</Heading>
        <Text style={text}>
          {SITE_NAME} detected a problem with the Paystack webhook. Immediate review recommended.
        </Text>

        <Section style={card}>
          <Text style={label}>Alert type</Text>
          <Text style={value}>{alertType || 'unknown'}</Text>

          <Text style={label}>Environment</Text>
          <Text style={value}>{environment || 'live'}</Text>

          <Text style={label}>Webhook URL</Text>
          <Text style={mono}>{webhookUrl || '(unset)'}</Text>

          {reachStatus ? (
            <>
              <Text style={label}>Reachability</Text>
              <Text style={value}>{reachStatus}</Text>
            </>
          ) : null}

          {typeof minutesSinceLast === 'number' ? (
            <>
              <Text style={label}>Minutes since last event</Text>
              <Text style={value}>{minutesSinceLast}</Text>
            </>
          ) : null}

          {detectedAt ? (
            <>
              <Text style={label}>Detected at</Text>
              <Text style={value}>{detectedAt}</Text>
            </>
          ) : null}
        </Section>

        <Section style={messageBox}>
          <Text style={label}>Details</Text>
          <Text style={messageText}>{detail || '(no details)'}</Text>
        </Section>

        <Text style={footer}>
          Investigate in the Paystack Health screen inside {SITE_NAME}.
          <br />— {SITE_NAME} monitoring
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `[${SITE_NAME}] Paystack webhook alert — ${data?.alertType || 'issue'} (${data?.environment || 'live'})`,
  displayName: 'Paystack webhook alert',
  to: 'support@habtastic.com',
  previewData: {
    alertType: 'no_events_3d',
    environment: 'live',
    webhookUrl: 'https://example.supabase.co/functions/v1/paystack-webhook',
    detail: 'No Paystack webhook events received in the last 3 days.',
    minutesSinceLast: 4380,
    reachStatus: 'HTTP 401 (reachable)',
    detectedAt: new Date().toISOString(),
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '600px' }
const h1 = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: 'hsl(0, 70%, 40%)',
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
  backgroundColor: 'hsl(0, 80%, 97%)',
  border: '1px solid hsl(0, 60%, 85%)',
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
  wordBreak: 'break-all' as const,
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
