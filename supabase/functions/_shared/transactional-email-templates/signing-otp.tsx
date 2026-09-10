/// <reference types="npm:@types/react@^18.3.0" />

import * as React from 'npm:react@18.3.1'
import { Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import { Layout, h1, text, small, COLORS } from '../email-templates/_layout.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  code?: string
  documentTitle?: string
}

const SigningOtp = ({ code, documentTitle }: Props) => (
  <Layout preview={`Код за подпис: ${code ?? ''}`}>
    <Heading style={h1}>Код за потвърждение</Heading>
    <Text style={text}>
      Вашият еднократен код за подписване на <strong>„{documentTitle ?? 'документ'}“</strong>:
    </Text>
    <Section style={codeBox}>
      <Text style={codeStyle}>{code ?? '------'}</Text>
    </Section>
    <Text style={small}>
      Кодът е валиден 10 минути. Ако не сте инициирали подписване, игнорирайте този имейл.
    </Text>
  </Layout>
)

const codeBox = {
  background: COLORS.bg,
  padding: '18px 20px',
  borderRadius: '8px',
  textAlign: 'center' as const,
  margin: '18px 0',
}
const codeStyle = {
  fontSize: '32px',
  letterSpacing: '8px',
  fontWeight: 700 as const,
  color: COLORS.text,
  margin: 0,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}

export const template = {
  component: SigningOtp,
  subject: 'Код за електронен подпис',
  displayName: 'Signing — OTP код',
  previewData: { code: '482915', documentTitle: 'Договор за наем' },
} satisfies TemplateEntry
