/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Button, Heading, Section, Text } from 'npm:@react-email/components@0.0.22'
import { Layout, button, h1, text, small } from './_layout.tsx'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
  token?: string
}

export const SignupEmail = ({ siteUrl, recipient, confirmationUrl, token }: SignupEmailProps) => (
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

    {token ? (
      <Section style={{ marginTop: '28px', padding: '16px', border: '1px solid #e6d9a8', borderRadius: '8px', backgroundColor: '#fbf7e9' }}>
        <Text style={{ ...small, margin: 0 }}>
          Или въведете този 6-цифрен код на страницата за вход → „Не получих имейл за потвърждение":
        </Text>
        <Text style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '6px', textAlign: 'center', margin: '12px 0 0', color: '#1a1a2e' }}>
          {token}
        </Text>
      </Section>
    ) : null}

    <Text style={{ ...small, marginTop: '20px' }}>
      Ако не сте създавали профил, можете спокойно да игнорирате този имейл.
    </Text>
  </Layout>
)

export default SignupEmail
