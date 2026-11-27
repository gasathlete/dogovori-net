/// <reference types="npm:@types/react@^18.3.0" />

import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text } from 'npm:@react-email/components@0.0.22'
import { Layout, button, h1, text, small } from '../email-templates/_layout.tsx'
import type { TemplateEntry } from './registry.ts'

interface TeamInvitationProps {
  teamName: string
  inviteUrl: string
  inviterName?: string
}

const TeamInvitationEmail = ({ teamName, inviteUrl, inviterName }: TeamInvitationProps) => (
  <Layout preview={`Покана за екипа "${teamName}" в dogovori.net`}>
    <Heading style={h1}>Покана за екип</Heading>
    <Text style={text}>
      {inviterName ? <><strong>{inviterName}</strong> Ви кани</> : 'Поканени сте'} да се присъедините към екипа{' '}
      <strong>{teamName}</strong> в dogovori.net.
    </Text>
    <Text style={text}>
      Като член на екипа ще имате достъп до споделени шаблони, branded документи и общия лимит от 100 операции на място на месец.
    </Text>
    <Button style={button} href={inviteUrl}>Приеми поканата</Button>
    <Text style={{ ...small, marginTop: '24px' }}>
      Поканата е валидна 14 дни. Ако линкът не работи, копирайте този адрес: {inviteUrl}
    </Text>
  </Layout>
)

export const template = {
  component: TeamInvitationEmail,
  subject: (data: Record<string, any>) => `Покана за екипа "${data.teamName}" в dogovori.net`,
  displayName: 'Team Invitation',
  previewData: { teamName: 'Адвокатска кантора Иванов', inviteUrl: 'https://dogovori.net/team/accept?token=abc', inviterName: 'Иван Иванов' },
} satisfies TemplateEntry
