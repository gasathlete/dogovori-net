/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text } from 'npm:@react-email/components@0.0.22'
import { Layout, button, h1, text, small } from './_layout.tsx'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ confirmationUrl }: RecoveryEmailProps) => (
  <Layout preview="Възстановяване на парола за dogovori.net">
    <Heading style={h1}>Възстановяване на парола</Heading>
    <Text style={text}>
      Получихме заявка за смяна на паролата Ви. Натиснете бутона по-долу, за да изберете нова парола. Линкът е валиден за 1 час.
    </Text>
    <Button style={button} href={confirmationUrl}>Смени паролата</Button>
    <Text style={{ ...small, marginTop: '28px' }}>
      Ако не сте подавали тази заявка, игнорирайте имейла — паролата Ви няма да бъде променена.
    </Text>
  </Layout>
)

export default RecoveryEmail
