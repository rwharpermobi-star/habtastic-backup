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
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

const LOGO_URL = 'https://habtastic.com/app-icon-512.png'

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your {siteName} password</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} width="64" height="64" alt={siteName} style={logo} />
        <Heading style={h1}>Reset your password 🔑</Heading>
        <Text style={text}>
          We got a request to reset your {siteName} password. Tap the button below to choose a new one and get back to crushing your habits.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Reset Password
        </Button>
        <Text style={footer}>
          Didn't request this? You can safely ignore this email — your password stays the same.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const logo = { marginBottom: '24px' }
const h1 = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: 'hsl(215, 25%, 20%)',
  margin: '0 0 20px',
}
const text = {
  fontSize: '15px',
  color: 'hsl(215, 16%, 42%)',
  lineHeight: '1.6',
  margin: '0 0 28px',
}
const button = {
  backgroundColor: 'hsl(175, 77%, 26%)',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  borderRadius: '20px',
  padding: '14px 28px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: 'hsl(215, 16%, 55%)', margin: '32px 0 0' }
