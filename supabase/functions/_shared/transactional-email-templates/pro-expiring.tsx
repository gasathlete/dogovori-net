/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text } from 'npm:@react-email/components@0.0.22'
import { Layout, button, h1, text, small } from '../email-templates/_layout.tsx'
import type { TemplateEntry } from './registry.ts'

interface ProExpiringProps {
  name?: string
  daysLeft?: number
  expiresOn?: string
}

const ProExpiringEmail = ({ name, daysLeft, expiresOn }: ProExpiringProps) => (
  <Layout preview="Вашият Pro план изтича скоро">
    <Heading style={h1}>
      {name ? `${name}, Pro планът Ви изтича скоро` : 'Вашият Pro план изтича скоро'}
    </Heading>
    <Text style={text}>
      {typeof daysLeft === 'number'
        ? `Остават Ви ${daysLeft} ${daysLeft === 1 ? 'ден' : 'дни'} от Pro абонамента в dogovori.net.`
        : 'Pro абонаментът Ви в dogovori.net изтича скоро.'}
      {expiresOn ? ` Дата на изтичане: ${expiresOn}.` : ''}
    </Text>
    <Text style={text}>
      Подновете сега, за да запазите достъп до неограничен брой договори, DOCX експорт и споделяне за подпис.
    </Text>
    <Button style={button} href="https://dogovori.net/account?tab=subscription">
      Поднови Pro
    </Button>
    <Text style={{ ...small, marginTop: '28px' }}>
      Ако вече сте подновили — игнорирайте това съобщение.
    </Text>
  </Layout>
)

export const template = {
  component: ProExpiringEmail,
  subject: 'Pro планът Ви изтича скоро',
  displayName: 'Pro — изтича скоро',
  previewData: { name: 'Иван', daysLeft: 7, expiresOn: '15.05.2026' },
} satisfies TemplateEntry
