/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="bg" dir="ltr">
    <Head />
    <Preview>Възстановяване на парола за {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Възстановяване на парола</Heading>
        <Text style={text}>
          Получихме заявка за смяна на паролата Ви за {siteName}. Натиснете бутона по-долу, за да изберете нова парола.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Смени паролата
        </Button>
        <Text style={footer}>
          Ако не сте подавали тази заявка, игнорирайте имейла — паролата Ви няма да бъде променена.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1a2540', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#4a5568', lineHeight: '1.6', margin: '0 0 20px' }
const button = {
  backgroundColor: '#c9a84c',
  color: '#1a2540',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '8px',
  padding: '12px 22px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
