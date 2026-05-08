/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="bg" dir="ltr">
    <Head />
    <Preview>Вашият код за потвърждение</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Потвърждение на самоличността</Heading>
        <Text style={text}>Използвайте кода по-долу, за да потвърдите самоличността си:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          Кодът е валиден за кратко време. Ако не сте поискали това, игнорирайте имейла.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1a2540', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#4a5568', lineHeight: '1.6', margin: '0 0 20px' }
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '26px',
  letterSpacing: '4px',
  fontWeight: 'bold' as const,
  color: '#c9a84c',
  margin: '0 0 30px',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
