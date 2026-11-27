/// <reference types="npm:@types/react@^18.3.0" />
import * as React from 'npm:react@18.3.1'
import { Text } from 'npm:@react-email/components@0.0.22'
import { Layout, h1, text, small } from '../email-templates/_layout.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  teamName?: string
  teamId?: string
  contactName?: string
  contactEmail?: string
  urgency?: string
  subjectText?: string
  message?: string
}

const URGENCY_LABELS: Record<string, string> = {
  normal: 'Стандартно (≤ 1 работен ден)',
  high: 'Спешно (≤ 4 часа)',
  incident: 'Инцидент / прекъсване',
}

const Email = ({
  teamName,
  teamId,
  contactName,
  contactEmail,
  urgency,
  subjectText,
  message,
}: Props) => (
  <Layout preview={`Нова заявка от екип ${teamName ?? ''}`}>
    <Text style={h1}>Нова заявка от Екип</Text>
    <Text style={text}>
      <strong>Екип:</strong> {teamName ?? '—'} ({teamId ?? '—'})
    </Text>
    <Text style={text}>
      <strong>Контакт:</strong> {contactName || '—'} · {contactEmail ?? '—'}
    </Text>
    <Text style={text}>
      <strong>Спешност:</strong> {URGENCY_LABELS[urgency ?? 'normal'] ?? urgency ?? '—'}
    </Text>
    <Text style={text}>
      <strong>Тема:</strong> {subjectText ?? '—'}
    </Text>
    <Text style={{ ...text, whiteSpace: 'pre-wrap' }}>{message ?? ''}</Text>
    <Text style={small}>Отговорът се изпраща директно на посочения имейл за контакт.</Text>
  </Layout>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `[Team · ${data.urgency ?? 'normal'}] ${data.subjectText ?? 'Заявка'} — ${data.teamName ?? ''}`,
  displayName: 'Заявка до акаунт мениджър',
  to: 'team@dogovori.net',
  previewData: {
    teamName: 'Адвокатско дружество Иванов',
    teamId: '00000000-0000-0000-0000-000000000000',
    contactName: 'Иван Иванов',
    contactEmail: 'ivan@firma.bg',
    urgency: 'high',
    subjectText: 'Промяна на места по абонамента',
    message: 'Нуждаем се от 2 допълнителни места от началото на следващия месец.',
  },
} satisfies TemplateEntry
