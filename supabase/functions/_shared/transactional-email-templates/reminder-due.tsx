/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text } from 'npm:@react-email/components@0.0.22'
import { Layout, button, h1, text, small } from '../email-templates/_layout.tsx'
import type { TemplateEntry } from './registry.ts'

interface ReminderDueProps {
  name?: string
  documentTitle?: string
  kind?: 'expiration' | 'renewal' | 'custom' | string
  remindOn?: string
  note?: string
}

const kindLabel: Record<string, string> = {
  expiration: 'Изтичане на срок',
  renewal: 'Подновяване',
  custom: 'Напомняне',
}

const ReminderDueEmail = ({ name, documentTitle, kind, remindOn, note }: ReminderDueProps) => (
  <Layout preview={`Напомняне за документ${documentTitle ? `: ${documentTitle}` : ''}`}>
    <Heading style={h1}>
      {name ? `${name}, имате напомняне за документ` : 'Имате напомняне за документ'}
    </Heading>
    <Text style={text}>
      <strong>{kindLabel[kind ?? 'custom'] ?? 'Напомняне'}</strong>
      {remindOn ? ` — ${remindOn}` : ''}
    </Text>
    {documentTitle ? (
      <Text style={text}>
        Документ: <strong>{documentTitle}</strong>
      </Text>
    ) : null}
    {note ? <Text style={text}>{note}</Text> : null}
    <Button style={button} href="https://dogovori.net/account?tab=documents">
      Отвори документите
    </Button>
    <Text style={{ ...small, marginTop: '28px' }}>
      Можете да маркирате напомнянето като изпълнено или да го изтриете от секция „Документи".
    </Text>
  </Layout>
)

export const template = {
  component: ReminderDueEmail,
  subject: (d: Record<string, any>) =>
    d?.documentTitle ? `Напомняне: ${d.documentTitle}` : 'Напомняне за документ',
  displayName: 'Напомняне за документ',
  previewData: {
    name: 'Иван',
    documentTitle: 'Договор за наем — ул. Витоша 10',
    kind: 'expiration',
    remindOn: '15.07.2026',
    note: 'Подгответе предложение за подновяване.',
  },
} satisfies TemplateEntry
