/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text } from 'npm:@react-email/components@0.0.22'
import { Layout, button, h1, text, small } from '../email-templates/_layout.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  documentTitle?: string
  envelopeUrl?: string
  signerCount?: number
  recipientRole?: 'owner' | 'signer'
  recipientName?: string
}

const SigningCompleted = ({ documentTitle, envelopeUrl, signerCount, recipientRole, recipientName }: Props) => (
  <Layout preview={`Документът „${documentTitle ?? ''}“ е подписан`}>
    <Heading style={h1}>Документът е подписан</Heading>
    <Text style={text}>
      Здравейте{recipientName ? `, ${recipientName}` : ''},
    </Text>
    <Text style={text}>
      {recipientRole === 'owner'
        ? <>Всички {signerCount ?? ''} страни са подписали <strong>„{documentTitle ?? 'документ'}“</strong>.</>
        : <>Документът <strong>„{documentTitle ?? 'документ'}“</strong> е финализиран — всички страни са подписали.</>}
    </Text>
    {envelopeUrl ? (
      <Button style={button} href={envelopeUrl}>
        {recipientRole === 'owner' ? 'Преглед на статуса' : 'Изтегли подписания документ'}
      </Button>
    ) : null}
    <Text style={{ ...small, marginTop: '20px' }}>
      Запазваме одит на всички подписи, включително час, IP и потвърждение чрез код.
    </Text>
  </Layout>
)

export const template = {
  component: SigningCompleted,
  subject: (d) => `Подписано: ${d?.documentTitle ?? 'договор'}`,
  displayName: 'Signing — завършено',
  previewData: {
    documentTitle: 'Договор за наем',
    envelopeUrl: 'https://dogovori.net/signing/abc',
    signerCount: 3,
    recipientRole: 'owner',
    recipientName: 'Мария',
  },
} satisfies TemplateEntry
