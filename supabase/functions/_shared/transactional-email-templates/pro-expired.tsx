/// <reference types="npm:@types/react@^18.3.0" />

import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text } from 'npm:@react-email/components@0.0.22'
import { Layout, button, h1, text, small } from '../email-templates/_layout.tsx'
import type { TemplateEntry } from './registry.ts'

interface ProExpiredProps {
  name?: string
}

const ProExpiredEmail = ({ name }: ProExpiredProps) => (
  <Layout preview="Pro абонаментът Ви изтече">
    <Heading style={h1}>
      {name ? `${name}, Pro абонаментът Ви изтече` : 'Pro абонаментът Ви изтече'}
    </Heading>
    <Text style={text}>
      Профилът Ви в dogovori.net вече е във Free режим. Можете да преглеждате запазените си документи, но нови сваляния и Pro функции (DOCX, споделяне за подпис, неограничен брой договори) са ограничени.
    </Text>
    <Text style={text}>
      Подновете Pro с един клик и продължете без прекъсване:
    </Text>
    <Button style={button} href="https://dogovori.net/account?tab=subscription">
      Поднови Pro
    </Button>
    <Text style={{ ...small, marginTop: '28px' }}>
      Благодарим, че бяхте с нас. Надяваме се скоро отново да Ви видим в Pro.
    </Text>
  </Layout>
)

export const template = {
  component: ProExpiredEmail,
  subject: 'Pro абонаментът Ви изтече',
  displayName: 'Pro — изтекъл',
  previewData: { name: 'Иван' },
} satisfies TemplateEntry
