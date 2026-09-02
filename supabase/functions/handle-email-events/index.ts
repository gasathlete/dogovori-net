import { createEmailWebhookHandler } from 'npm:@lovable.dev/email-js@0.1.0'
import { createClient } from 'npm:@supabase/supabase-js@2'

// Notification-only bookkeeping: Lovable enforces suppression server-side at
// send time. These rows are an app-side audit view, never a send gate.

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

async function record(
  eventId: string,
  recipient: string,
  reason: 'bounce' | 'complaint' | 'unsubscribe',
  logStatus: 'bounced' | 'complained' | 'suppressed',
  errorMessage: string,
) {
  const email = recipient.toLowerCase()

  const { error: supErr } = await admin
    .from('suppressed_emails')
    .upsert({ email, reason, metadata: null }, { onConflict: 'email' })
  if (supErr) {
    console.error('suppressed_emails write failed', {
      event_id: eventId,
      code: supErr.code,
      message: supErr.message,
    })
    throw new Error('suppressed_emails write failed')
  }

  const { error: logErr } = await admin.from('email_send_log').insert({
    template_name: 'system',
    recipient_email: email,
    status: logStatus,
    error_message: errorMessage,
  })
  if (logErr) {
    console.error('email_send_log write failed', {
      event_id: eventId,
      code: logErr.code,
      message: logErr.message,
    })
    throw new Error('email_send_log write failed')
  }
}

const handler = createEmailWebhookHandler({
  apiKey: Deno.env.get('LOVABLE_API_KEY')!,
  on: {
    'email.bounced': async (event) => {
      await record(
        event.event_id,
        event.data.recipient,
        'bounce',
        'bounced',
        'Имейлът не беше доставен (bounce) — адресът е спрян за бъдещи изпращания.',
      )
    },
    'email.complaint': async (event) => {
      await record(
        event.event_id,
        event.data.recipient,
        'complaint',
        'complained',
        'Получателят маркира имейла като спам — адресът е спрян за бъдещи изпращания.',
      )
    },
    'email.unsubscribed': async (event) => {
      await record(
        event.event_id,
        event.data.recipient,
        'unsubscribe',
        'suppressed',
        'Получателят се отписа от имейлите на приложението.',
      )
    },
  },
})

Deno.serve((req) => handler(req))
