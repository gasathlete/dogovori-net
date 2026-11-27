/// <reference types="npm:@types/react@^18.3.0" />

import * as React from 'npm:react@18.3.1'
import { Heading, Section, Text } from 'npm:@react-email/components@0.0.22'
import { Layout, h1, text, small, COLORS } from '../email-templates/_layout.tsx'
import type { TemplateEntry } from './registry.ts'

interface IllegalAlertProps {
  category?: string
  matchedTerm?: string
  functionName?: string
  userEmail?: string
  userId?: string
  excerpt?: string
  createdAt?: string
}

const IllegalContentAlertEmail = ({
  category,
  matchedTerm,
  functionName,
  userEmail,
  userId,
  excerpt,
  createdAt,
}: IllegalAlertProps) => (
  <Layout preview="Блокиран опит за незаконно съдържание в dogovori.net">
    <Heading style={h1}>🚨 Блокиран опит за незаконно съдържание</Heading>
    <Text style={text}>
      Платформата автоматично блокира заявка с признаци за незаконно съдържание.
      Опитът е регистриран в админ панела.
    </Text>

    <Section style={box}>
      <Text style={row}><strong>Категория:</strong> {category ?? '—'}</Text>
      <Text style={row}><strong>Засечен термин:</strong> {matchedTerm ?? '—'}</Text>
      <Text style={row}><strong>Функция:</strong> {functionName ?? '—'}</Text>
      <Text style={row}><strong>Потребител:</strong> {userEmail ?? '—'}</Text>
      <Text style={row}><strong>User ID:</strong> {userId ?? '—'}</Text>
      <Text style={row}><strong>Време:</strong> {createdAt ?? '—'}</Text>
    </Section>

    <Text style={{ ...text, marginTop: '20px' }}>
      <strong>Откъс от заявката:</strong>
    </Text>
    <Section style={excerptBox}>
      <Text style={excerptText}>{excerpt ?? '(няма)'}</Text>
    </Section>

    <Text style={{ ...small, marginTop: '24px' }}>
      Прегледайте всички блокирани опити в админ панела: <a href="https://dogovori.net/admin">dogovori.net/admin</a>
    </Text>
  </Layout>
)

const box = {
  backgroundColor: '#fff5f5',
  border: `1px solid ${COLORS?.border ?? '#fecaca'}`,
  borderRadius: '6px',
  padding: '14px 16px',
  margin: '14px 0 0',
}
const row = { fontSize: '14px', color: COLORS?.text ?? '#1f2937', margin: '0 0 6px', lineHeight: '1.5' }
const excerptBox = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
  padding: '12px 14px',
  margin: '6px 0 0',
}
const excerptText = { fontSize: '13px', color: '#374151', margin: 0, whiteSpace: 'pre-wrap' as const, fontFamily: 'monospace' }

export const template = {
  component: IllegalContentAlertEmail,
  subject: '🚨 Блокиран опит за незаконно съдържание — dogovori.net',
  displayName: 'Illegal content alert (admin)',
  previewData: {
    category: 'Насилие срещу личността',
    matchedTerm: 'убииство',
    functionName: 'generate-contract',
    userEmail: 'user@example.com',
    userId: '00000000-0000-0000-0000-000000000000',
    excerpt: 'Договор за поръчково убийство на ...',
    createdAt: new Date().toISOString(),
  },
} satisfies TemplateEntry
