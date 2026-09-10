/// <reference types="npm:@types/react@^18.3.0" />

import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text } from 'npm:@react-email/components@0.0.22'
import { Layout, button, h1, text, small } from '../email-templates/_layout.tsx'
import type { TemplateEntry } from './registry.ts'

interface PaymentFailedProps {
  name?: string
  amount?: string
  nextAttempt?: string
}

const PaymentFailedEmail = ({ name, amount, nextAttempt }: PaymentFailedProps) => (
  <Layout preview="Неуспешно плащане за абонамента Ви">
    <Heading style={h1}>
      {name ? `${name}, плащането не премина` : 'Плащането за абонамента Ви не премина'}
    </Heading>
    <Text style={text}>
      Опитът за подновяване на абонамента Ви в dogovori.net{amount ? ` (${amount})` : ''} беше неуспешен.
      Това обикновено означава, че картата е изтекла, няма наличност или банката е отказала транзакцията.
    </Text>
    <Text style={text}>
      {nextAttempt
        ? `Stripe ще опита отново автоматично на ${nextAttempt}. `
        : 'Stripe ще опита отново автоматично през следващите дни. '}
      За да избегнете прекъсване на достъпа, моля обновете данните за плащане.
    </Text>
    <Button style={button} href="https://dogovori.net/account?tab=subscription">
      Обнови данни за плащане
    </Button>
    <Text style={{ ...small, marginTop: '28px' }}>
      Ако вече сте обновили картата — игнорирайте това съобщение.
    </Text>
  </Layout>
)

export const template = {
  component: PaymentFailedEmail,
  subject: 'Неуспешно плащане за абонамента Ви',
  displayName: 'Неуспешно плащане',
  previewData: { name: 'Иван', amount: '9.90 EUR', nextAttempt: '15.05.2026' },
} satisfies TemplateEntry
