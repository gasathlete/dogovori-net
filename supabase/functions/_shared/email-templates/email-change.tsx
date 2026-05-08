/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface EmailChangeEmailProps {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="bg" dir="ltr">
    <Head />
    <Preview>Потвърдете смяната на имейла за {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Потвърдете смяната на имейл</Heading>
        <Text style={text}>
          Поискахте да смените имейл адреса си за {siteName} от{' '}
          <Link href={`mailto:${oldEmail}`} style={link}>{oldEmail}</Link>{' '}
          на{' '}
          <Link href={`mailto:${newEmail}`} style={link}>{newEmail}</Link>.
        </Text>
        <Text style={text}>Натиснете бутона по-долу, за да потвърдите промяната:</Text>
        <Button style={button} href={confirmationUrl}>
          Потвърди смяната
        </Button>
        <Text style={footer}>
          Ако не сте поискали тази промяна, защитете незабавно профила си.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1a2540', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#4a5568', lineHeight: '1.6', margin: '0 0 20px' }
const link = { color: '#9b8033', textDecoration: 'underline' }
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
