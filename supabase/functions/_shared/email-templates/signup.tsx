/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text } from 'npm:@react-email/components@0.0.22'
import { Layout, button, h1, text, small } from './_layout.tsx'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({ siteUrl, recipient, confirmationUrl }: SignupEmailProps) => (
  <Layout preview="Потвърдете имейла си за dogovori.net" siteUrl={siteUrl}>
    <Heading style={h1}>Добре дошли в dogovori.net</Heading>
    <Text style={text}>
      Благодарим Ви, че създадохте профил с <strong>{recipient}</strong>. Остава само една стъпка — потвърдете имейл адреса си, за да активирате профила и да започнете да изготвяте договори.
    </Text>
    <Button style={button} href={confirmationUrl}>Потвърди имейла</Button>
    <Text style={{ ...small, marginTop: '28px' }}>
      Ако бутонът не работи, копирайте този линк в браузъра:
    </Text>
    <Text style={{ ...small, wordBreak: 'break-all', color: '#9b8033' }}>{confirmationUrl}</Text>
    <Text style={{ ...small, marginTop: '20px' }}>
      Ако не сте създавали профил, можете спокойно да игнорирате този имейл.
    </Text>
  </Layout>
)

export default SignupEmail
