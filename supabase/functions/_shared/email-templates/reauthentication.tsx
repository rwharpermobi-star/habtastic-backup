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
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

const LOGO_URL = 'https://habtastic.com/app-icon-512.png'

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your HabTastic verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} width="64" height="64" alt="HabTastic" style={logo} />
        <Heading style={h1}>Confirm it's you 🔐</Heading>
        <Text style={text}>Use the code below to confirm your identity:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          This code expires shortly. Didn't request it? You can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

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
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '28px',
  fontWeight: 'bold' as const,
  color: 'hsl(175, 77%, 26%)',
  letterSpacing: '4px',
  margin: '0 0 30px',
}
const footer = { fontSize: '12px', color: 'hsl(215, 16%, 55%)', margin: '32px 0 0' }
