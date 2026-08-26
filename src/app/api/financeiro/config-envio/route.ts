import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { autenticar } from '@/lib/auth/server'
import { encrypt, temChaveCripto } from '@/lib/cripto'

// Config do e-mail de ENVIO por usuário (remetente do boleto). Tudo pelo servidor:
// a tabela tem RLS sem policies, então só o service role acessa. A senha de app
// é guardada criptografada e NUNCA é devolvida ao cliente.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// Presets de SMTP por provedor (o usuário escolhe "outro" p/ preencher à mão).
const PRESETS: Record<string, { host: string; port: number; secure: boolean }> = {
  gmail: { host: 'smtp.gmail.com', port: 465, secure: true },
  outlook: { host: 'smtp.office365.com', port: 587, secure: false },
}

export async function GET(req: Request) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data } = await supabase
    .from('financeiro_envio_config')
    .select('email_envio, smtp_host, smtp_port, smtp_secure, senha_enc')
    .eq('user_id', auth.userId)
    .maybeSingle()

  return NextResponse.json({
    configurado: !!(data?.email_envio && data?.senha_enc),
    email_envio: data?.email_envio || '',
    smtp_host: data?.smtp_host || '',
    smtp_port: data?.smtp_port || null,
    smtp_secure: data?.smtp_secure ?? true,
    cripto_ok: temChaveCripto(),
  })
}

export async function POST(req: Request) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temChaveCripto()) {
    return NextResponse.json({ error: 'Servidor sem EMAIL_ENC_KEY — avise o TI para configurar a chave de criptografia.' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const email = String(body.email_envio || '').trim()
  const senha = String(body.senha || '').trim() // opcional: só troca se vier
  const provedor = String(body.provedor || '').trim().toLowerCase()

  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'E-mail de envio inválido.' }, { status: 400 })
  }

  const preset = PRESETS[provedor]
  const patch: Record<string, unknown> = {
    user_id: auth.userId,
    email_envio: email,
    smtp_host: preset ? preset.host : String(body.smtp_host || '').trim(),
    smtp_port: preset ? preset.port : (parseInt(body.smtp_port) || null),
    smtp_secure: preset ? preset.secure : (body.smtp_secure !== false),
    updated_at: new Date().toISOString(),
  }
  if (senha) {
    try { patch.senha_enc = encrypt(senha) } catch (e) {
      return NextResponse.json({ error: 'Falha ao criptografar a senha.' }, { status: 500 })
    }
  }

  const { error } = await supabase
    .from('financeiro_envio_config')
    .upsert(patch, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Desvincular o e-mail: apaga a config do PRÓPRIO usuário (a senha salva some;
// os e-mails já enviados/registrados nos cards ficam).
export async function DELETE(req: Request) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const { error } = await supabase
    .from('financeiro_envio_config')
    .delete()
    .eq('user_id', auth.userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
