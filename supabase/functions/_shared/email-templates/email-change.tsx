/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text } from 'npm:@react-email/components@0.0.22'
import { Layout, button, h1, text, small } from './_layout.tsx'

interface EmailChangeEmailProps {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({ oldEmail, newEmail, confirmationUrl }: EmailChangeEmailProps) => (
  <Layout preview="Потвърдете смяната на имейла за dogovori.net">
    <Heading style={h1}>Потвърдете смяната на имейл</Heading>
    <Text style={text}>
      Поискахте да смените имейл адреса си за dogovori.net от <strong>{oldEmail}</strong> на <strong>{newEmail}</strong>.
    </Text>
    <Text style={text}>Натиснете бутона, за да потвърдите промяната:</Text>
    <Button style={button} href={confirmationUrl}>Потвърди смяната</Button>
    <Text style={{ ...small, marginTop: '28px' }}>
      Ако не сте поискали тази промяна, защитете незабавно профила си.
    </Text>
  </Layout>
)

export default EmailChangeEmail
