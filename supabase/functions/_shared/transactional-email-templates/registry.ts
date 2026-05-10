/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as welcome } from './welcome.tsx'
import { template as paymentReceipt } from './payment-receipt.tsx'
import { template as proExpiring } from './pro-expiring.tsx'
import { template as proExpired } from './pro-expired.tsx'
import { template as teamInvitation } from './team-invitation.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'welcome': welcome,
  'payment-receipt': paymentReceipt,
  'pro-expiring': proExpiring,
  'pro-expired': proExpired,
  'team-invitation': teamInvitation,
}
