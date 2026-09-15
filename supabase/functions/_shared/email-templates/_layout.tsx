/// <reference types="npm:@types/react@^18.3.0" />

import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

export const COLORS = {
  bg: '#f6f5f1',
  card: '#ffffff',
  navy: '#0f1a30',
  navySoft: '#1a2540',
  text: '#3a3f4a',
  muted: '#8a8f99',
  gold: '#c9a84c',
  goldDark: '#9b8033',
  border: '#ece7d8',
}

export const button = {
  backgroundColor: COLORS.gold,
  color: COLORS.navy,
  fontSize: '14px',
  fontWeight: 'bold' as const,
  letterSpacing: '0.3px',
  borderRadius: '6px',
  padding: '13px 26px',
  textDecoration: 'none',
  display: 'inline-block',
}

export const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: COLORS.navy,
  margin: '0 0 18px',
  lineHeight: '1.3',
}

export const text = {
  fontSize: '14px',
  color: COLORS.text,
  lineHeight: '1.65',
  margin: '0 0 18px',
}

export const small = {
  fontSize: '12px',
  color: COLORS.muted,
  lineHeight: '1.55',
  margin: '0 0 6px',
}

export const link = { color: COLORS.goldDark, textDecoration: 'underline' }

const main = {
  backgroundColor: COLORS.bg,
  fontFamily: 'Georgia, "Times New Roman", serif',
  margin: 0,
  padding: '32px 12px',
}
const wrapper = { maxWidth: '560px', margin: '0 auto' }
const card = {
  backgroundColor: COLORS.card,
  borderRadius: '10px',
  border: `1px solid ${COLORS.border}`,
  overflow: 'hidden' as const,
}
const headerBar = {
  backgroundColor: COLORS.navy,
  padding: '20px 28px',
  textAlign: 'center' as const,
}
const brandLogo = { display: 'block', width: '280px', maxWidth: '100%', height: '56px', margin: '0 auto' }
const tagline = {
  color: '#c9b88c',
  fontSize: '10px',
  letterSpacing: '2px',
  textTransform: 'uppercase' as const,
  margin: '4px 0 0',
}
const goldBar = {
  height: '3px',
  backgroundColor: COLORS.gold,
  border: 'none',
  margin: 0,
}
const inner = { padding: '32px 32px 28px' }
const footer = {
  padding: '20px 28px',
  textAlign: 'center' as const,
  backgroundColor: '#fafaf6',
  borderTop: `1px solid ${COLORS.border}`,
}
const footerLink = {
  color: COLORS.goldDark,
  fontSize: '12px',
  textDecoration: 'none',
  fontWeight: 'bold' as const,
}

interface LayoutProps {
  preview: string
  children: React.ReactNode
  siteUrl?: string
}

export const Layout = ({ preview, children, siteUrl = 'https://dogovori.net' }: LayoutProps) => (
  <Html lang="bg" dir="ltr">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={main}>
      <Container style={wrapper}>
        <Section style={card}>
          <Section style={headerBar}>
            <Img src={`${siteUrl}/logo-email.png?v=20260915b`} width="280" height="56" alt="Договори.нет" style={brandLogo} />
            <Text style={tagline}>Професионален юридически помощник</Text>
          </Section>
          <Hr style={goldBar} />
          <Section style={inner}>{children}</Section>
          <Section style={footer}>
            <Text style={small}>
              <Link href={siteUrl} style={footerLink}>dogovori.net</Link>
              {' · '}Договори, изготвени според българското законодателство
            </Text>
            <Text style={{ ...small, color: '#b0b4bc' }}>
              © {new Date().getFullYear()} dogovori.net. Всички права запазени.
            </Text>
          </Section>
        </Section>
      </Container>
    </Body>
  </Html>
)
