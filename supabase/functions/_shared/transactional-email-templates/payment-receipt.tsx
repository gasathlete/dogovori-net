/// <reference types="npm:@types/react@^18.3.0" />

import * as React from 'npm:react@18.3.1'
import { Button, Heading, Section, Text } from 'npm:@react-email/components@0.0.22'
import { Layout, button, h1, text, small, COLORS } from '../email-templates/_layout.tsx'
import type { TemplateEntry } from './registry.ts'

interface PaymentReceiptProps {
  name?: string
  productName?: string
  amount?: string
  invoiceUrl?: string
}

const PaymentReceiptEmail = ({ name, productName, amount, invoiceUrl }: PaymentReceiptProps) => (
  <Layout preview="Благодарим за плащането — dogovori.net">
    <Heading style={h1}>
      {name ? `Благодарим, ${name}!` : 'Благодарим за плащането!'}
    </Heading>
    <Text style={text}>
      Получихме плащането Ви успешно. По-долу са детайлите на поръчката:
    </Text>
    <Section style={box}>
      <Text style={row}><strong>Продукт:</strong> {productName || 'dogovori.net'}</Text>
      {amount && <Text style={row}><strong>Сума:</strong> {amount}</Text>}
    </Section>
    {invoiceUrl && (
      <Button style={button} href={invoiceUrl}>
        Свали фактура
      </Button>
    )}
    <Text style={{ ...small, marginTop: '28px' }}>
      Можете да управлявате абонамента и фактурите си от профила си в dogovori.net.
    </Text>
  </Layout>
)

const box = {
  background: '#fafaf7',
  border: `1px solid ${COLORS.gold}33`,
  borderRadius: '6px',
  padding: '14px 18px',
  margin: '0 0 22px',
}
const row = { fontSize: '14px', color: COLORS.text, margin: '4px 0', lineHeight: '1.6' }

export const template = {
  component: PaymentReceiptEmail,
  subject: 'Потвърждение за плащане — dogovori.net',
  displayName: 'Payment receipt',
  previewData: { name: 'Иван', productName: 'Pro месечен', amount: '9.90 EUR', invoiceUrl: 'https://example.com/invoice' },
} satisfies TemplateEntry
