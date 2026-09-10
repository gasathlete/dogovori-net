/// <reference types="npm:@types/react@^18.3.0" />

import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text } from 'npm:@react-email/components@0.0.22'
import { Layout, button, h1, text, small } from '../email-templates/_layout.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  signerName?: string
  documentTitle?: string
  signUrl?: string
  ownerName?: string
  expiresAt?: string
  role?: string
}

const SigningInvitation = ({ signerName, documentTitle, signUrl, ownerName, expiresAt, role }: Props) => (
  <Layout preview={`Покана за подпис: ${documentTitle ?? 'документ'}`}>
    <Heading style={h1}>Покана за електронен подпис</Heading>
    <Text style={text}>
      Здравейте{signerName ? `, ${signerName}` : ''},
    </Text>
    <Text style={text}>
      {ownerName ? <><strong>{ownerName}</strong> Ви</> : 'Получавате'} покана да подпишете
      документ <strong>„{documentTitle ?? 'без заглавие'}“</strong>{role ? ` в ролята на ${role}` : ''}.
    </Text>
    <Button style={button} href={signUrl}>Прегледай и подпиши</Button>
    <Text style={{ ...small, marginTop: '24px' }}>
      Линкът е персонален и не трябва да се препраща. Валиден е до {expiresAt ? new Date(expiresAt).toLocaleDateString('bg-BG') : 'крайния срок'}.
    </Text>
    <Text style={small}>
      Подписването става чрез еднократен код, изпратен на този имейл.
    </Text>
  </Layout>
)

export const template = {
  component: SigningInvitation,
  subject: (d) => `Покана за подпис: ${d?.documentTitle ?? 'договор'}`,
  displayName: 'Signing — покана',
  previewData: {
    signerName: 'Иван Петров',
    documentTitle: 'Договор за наем',
    signUrl: 'https://dogovori.net/sign/abc',
    ownerName: 'Мария Иванова',
    expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    role: 'Наемател',
  },
} satisfies TemplateEntry
