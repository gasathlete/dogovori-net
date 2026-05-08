/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Heading, Text } from 'npm:@react-email/components@0.0.22'
import { Layout, h1, text, small, COLORS } from './_layout.tsx'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Layout preview="Вашият код за потвърждение">
    <Heading style={h1}>Потвърждение на самоличността</Heading>
    <Text style={text}>Използвайте кода по-долу, за да потвърдите самоличността си:</Text>
    <Text style={{
      fontFamily: 'Courier, monospace',
      fontSize: '30px',
      letterSpacing: '6px',
      fontWeight: 'bold' as const,
      color: COLORS.gold,
      backgroundColor: '#fafaf6',
      border: `1px solid ${COLORS.border}`,
      borderRadius: '8px',
      padding: '18px 12px',
      textAlign: 'center' as const,
      margin: '0 0 24px',
    }}>{token}</Text>
    <Text style={small}>
      Кодът е валиден за кратко време. Ако не сте поискали това, игнорирайте имейла.
    </Text>
  </Layout>
)

export default ReauthenticationEmail
