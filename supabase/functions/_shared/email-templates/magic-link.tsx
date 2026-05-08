/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text } from 'npm:@react-email/components@0.0.22'
import { Layout, button, h1, text, small } from './_layout.tsx'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ confirmationUrl }: MagicLinkEmailProps) => (
  <Layout preview="Линк за вход в dogovori.net">
    <Heading style={h1}>Вашият линк за вход</Heading>
    <Text style={text}>
      Натиснете бутона по-долу, за да влезете в профила си в dogovori.net. Линкът е валиден за кратко време.
    </Text>
    <Button style={button} href={confirmationUrl}>Влез в профила</Button>
    <Text style={{ ...small, marginTop: '28px' }}>
      Ако не сте поискали този линк, можете спокойно да игнорирате имейла.
    </Text>
  </Layout>
)

export default MagicLinkEmail
