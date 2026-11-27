/**
 * handle-email-unsubscribe — валидира unsubscribe токен от по-стари имейли и
 * отписва получателя.
 *
 * Управляваното изпращане на Lovable е източникът на истината за спиране на
 * имейли, затова тук освен локалния запис извикваме и `setEmailUnsubscribe`.
 * Локалните таблици (`suppressed_emails`, `email_unsubscribe_tokens`) остават
 * само като одитен изглед.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { setEmailUnsubscribe } from 'npm:@lovable.dev/email-js@0.1.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SENDER_DOMAIN = 'dogovori.net'

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500)
  }

  const url = new URL(req.url)
  let token: string | null = url.searchParams.get('token')

  if (req.method === 'POST') {
    const contentType = req.headers.get('content-type') ?? ''
    if (contentType.includes('application/x-www-form-urlencoded')) {
      // RFC 8058 one-click unsubscribe: токенът идва от query параметъра.
      const params = new URLSearchParams(await req.text())
      if (!params.get('List-Unsubscribe')) {
        token = params.get('token') ?? token
      }
    } else {
      try {
        const body = await req.json()
        if (body?.token) token = String(body.token)
      } catch {
        /* токенът остава от query параметъра */
      }
    }
  }

  if (!token) {
    return jsonResponse({ valid: false, error: 'Token is required' }, 400)
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: tokenRecord, error: lookupError } = await supabase
    .from('email_unsubscribe_tokens')
    .select('email, used_at')
    .eq('token', token)
    .maybeSingle()

  if (lookupError) {
    console.error('token lookup failed', { code: lookupError.code, message: lookupError.message })
    return jsonResponse({ valid: false, error: 'Lookup failed' }, 500)
  }
  if (!tokenRecord) {
    return jsonResponse({ valid: false, reason: 'invalid_token' }, 404)
  }
  if (tokenRecord.used_at) {
    return jsonResponse({ valid: false, reason: 'already_unsubscribed' })
  }
  if (req.method === 'GET') {
    return jsonResponse({ valid: true })
  }

  // Атомарно маркиране (избягва TOCTOU при двойно натискане).
  const { data: updated, error: updateError } = await supabase
    .from('email_unsubscribe_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token)
    .is('used_at', null)
    .select('email')
    .maybeSingle()

  if (updateError) {
    console.error('token update failed', { code: updateError.code, message: updateError.message })
    return jsonResponse({ error: 'Failed to process unsubscribe' }, 500)
  }
  if (!updated) {
    return jsonResponse({ success: false, reason: 'already_unsubscribed' })
  }

  const email = String(tokenRecord.email).toLowerCase()

  // Източник на истината: управляваното изпращане на Lovable.
  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  if (apiKey) {
    try {
      await setEmailUnsubscribe(
        { recipient: email, domain: SENDER_DOMAIN, subscribed: false },
        { apiKey },
      )
    } catch (err) {
      console.error('managed unsubscribe failed', {
        message: err instanceof Error ? err.message : 'unknown',
      })
      // Връщаме токена в неизползвано състояние, за да може потребителят да
      // опита отново — иначе линкът щеше да „изгори" без реален ефект.
      await supabase
        .from('email_unsubscribe_tokens')
        .update({ used_at: null })
        .eq('token', token)
      return jsonResponse({ error: 'Failed to process unsubscribe' }, 500)
    }
  }

  const { error: suppressError } = await supabase
    .from('suppressed_emails')
    .upsert({ email, reason: 'unsubscribe' }, { onConflict: 'email' })
  if (suppressError) {
    // Одитният запис не бива да проваля вече изпълненото отписване.
    console.error('suppressed_emails write failed', {
      code: suppressError.code,
      message: suppressError.message,
    })
  }

  return jsonResponse({ success: true })
})
