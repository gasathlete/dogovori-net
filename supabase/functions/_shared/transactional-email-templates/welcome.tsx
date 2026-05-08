/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Button, Heading, Section, Text } from 'npm:@react-email/components@0.0.22'
import { Layout, button, h1, text, small, COLORS } from '../email-templates/_layout.tsx'
import type { TemplateEntry } from './registry.ts'

interface WelcomeEmailProps {
  name?: string
}

const WelcomeEmail = ({ name }: WelcomeEmailProps) => (
  <Layout preview="Добре дошли в dogovori.net — Вашият юридически помощник">
    <Heading style={h1}>
      {name ? `Здравейте, ${name}!` : 'Добре дошли!'}
    </Heading>
    <Text style={text}>
      Радваме се, че се присъединихте към <strong>dogovori.net</strong> — професионалният помощник за изготвяне на договори по българското законодателство (ЗЗД, ТЗ, ЗУТ).
    </Text>
    <Text style={text}>С Вашия профил можете да:</Text>
    <Section style={{ margin: '0 0 22px', paddingLeft: '6px' }}>
      <Text style={bullet}>· Изготвяте договори с професионални шаблони</Text>
      <Text style={bullet}>· Запазвате и редактирате документи в личния си архив</Text>
      <Text style={bullet}>· Сваляте договорите си в PDF и DOCX</Text>
      <Text style={bullet}>· Споделяте за подпис чрез защитен линк <em>(Pro)</em></Text>
    </Section>
    <Button style={button} href="https://dogovori.net/wizard">
      Изготви първия си договор
    </Button>
    <Text style={{ ...small, marginTop: '28px' }}>
      Имате въпроси? Просто отговорете на този имейл — ще се радваме да помогнем.
    </Text>
  </Layout>
)

const bullet = {
  fontSize: '14px',
  color: COLORS.text,
  lineHeight: '1.7',
  margin: '0 0 4px',
}

export const template = {
  component: WelcomeEmail,
  subject: 'Добре дошли в dogovori.net',
  displayName: 'Welcome — нов потребител',
  previewData: { name: 'Иван' },
} satisfies TemplateEntry
