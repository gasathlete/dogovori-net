import {
  sendTemplateEmail,
  type SendTemplateEmailOptions,
  type SendTemplateEmailResult,
} from './send-email.ts'

// Server-only. Sends a registered app email through Lovable's managed email API
// and appends the outcome to email_send_log (audit trail only — the log row
// never decides the send result).

// Точно това, което одитният запис ползва. Структурен тип, защото различни
// функции създават клиента от различни версии на пакета; без преобразуване
// на типове и без скрито внасяне.
export interface EmailAuditLogClient {
  from(table: string): {
    insert(values: Record<string, unknown>): PromiseLike<{
      error: { code?: string | null; message: string } | null
    }>
  }
}

async function logSend(
  admin: EmailAuditLogClient,
  row: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from('email_send_log').insert(row)
  if (error) {
    console.error('email_send_log write failed', {
      code: error.code,
      message: error.message,
    })
  }
}

export async function sendAppEmail(
  admin: EmailAuditLogClient,
  templateName: string,
  to: string,
  options: SendTemplateEmailOptions = {},
): Promise<SendTemplateEmailResult> {
  try {
    const result = await sendTemplateEmail(templateName, to, options)
    await logSend(admin, {
      template_name: templateName,
      recipient_email: to,
      status: result.sent ? 'sent' : 'suppressed',
    })
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await logSend(admin, {
      template_name: templateName,
      recipient_email: to,
      status: 'failed',
      error_message: message.slice(0, 1000),
    })
    throw error
  }
}

export type { SendTemplateEmailOptions, SendTemplateEmailResult }
