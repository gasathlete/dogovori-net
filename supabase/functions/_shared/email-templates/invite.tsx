/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text } from 'npm:@react-email/components@0.0.22'
import { Layout, button, h1, text, small } from './_layout.tsx'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteUrl, confirmationUrl }: InviteEmailProps) => (
  <Layout preview="Покана да се присъедините към dogovori.net" siteUrl={siteUrl}>
    <Heading style={h1}>Получихте покана</Heading>
    <Text style={text}>
      Поканени сте да се присъедините към <strong>dogovori.net</strong> — професионалният юридически помощник за изготвяне на договори. Натиснете бутона, за да приемете и създадете своя профил.
    </Text>
    <Button style={button} href={confirmationUrl}>Приеми поканата</Button>
    <Text style={{ ...small, marginTop: '28px' }}>
      Ако не очаквате такава покана, можете спокойно да игнорирате имейла.
    </Text>
  </Layout>
)

export default InviteEmail
