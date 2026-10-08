import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { autenticar } from '@/lib/auth/server'
import { decrypt, encrypt, temChaveCripto } from '@/lib/cripto'
import { PRESETS, provedorDoHost, seguroPorPorta, testarConta } from '@/lib/financeiro/email-conta'

export const runtime = 'nodejs'
// o teste da conta (SMTP + IMAP) pode levar até ~35 s num servidor lento
export const maxDuration = 60

// Config do e-mail de ENVIO por usuário (remetente do boleto). Tudo pelo servidor:
// a tabela tem RLS sem policies, então só o service role acessa. A senha de app
// é guardada criptografada e NUNCA é devolvida ao cliente.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function GET(req: Request) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data } = await supabase
    .from('financeiro_envio_config')
    .select('email_envio, smtp_host, smtp_port, smtp_secure, senha_enc')
    .eq('user_id', auth.userId)
    .maybeSingle()

  // Assinatura HTML (colada do Gmail) — coluna pode não existir ainda (migration)
  let assinatura = ''
  try {
    const { data: ass } = await supabase
      .from('financeiro_envio_config')
      .select('assinatura_html')
      .eq('user_id', auth.userId)
      .maybeSingle()
    assinatura = String(ass?.assinatura_html || '')
  } catch { /* sem coluna — segue sem assinatura */ }

  return NextResponse.json({
    configurado: !!(data?.email_envio && data?.senha_enc),
    email_envio: data?.email_envio || '',
    smtp_host: data?.smtp_host || '',
    smtp_port: data?.smtp_port || null,
    smtp_secure: data?.smtp_secure ?? true,
    provedor: provedorDoHost(data?.smtp_host || ''),
    assinatura_html: assinatura,
    cripto_ok: temChaveCripto(),
  })
}

// Assinatura das respostas/envios: HTML colado do Gmail (imagens ficam como
// links hospedados pelo Google — chegam normais pro destinatário).
export async function PATCH(req: Request) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (typeof body.assinatura_html !== 'string') {
    return NextResponse.json({ error: 'assinatura_html é obrigatória (string; vazia = remover).' }, { status: 400 })
  }
  const assinatura = body.assinatura_html.slice(0, 100000)
  const { error } = await supabase
    .from('financeiro_envio_config')
    .update({ assinatura_html: assinatura, updated_at: new Date().toISOString() })
    .eq('user_id', auth.userId)
  if (error) {
    const msg = /assinatura_html/.test(error.message)
      ? 'Falta a coluna assinatura_html — rode: alter table financeiro_envio_config add column if not exists assinatura_html text;'
      : error.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
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
  const port = preset ? preset.port : (parseInt(body.smtp_port) || null)
  const patch: Record<string, unknown> = {
    user_id: auth.userId,
    email_envio: email,
    smtp_host: preset ? preset.host : String(body.smtp_host || '').trim(),
    smtp_port: port,
    // 465 = SSL, 587 = STARTTLS — a combinação errada nunca conecta
    smtp_secure: preset ? preset.secure : seguroPorPorta(port, body.smtp_secure),
    updated_at: new Date().toISOString(),
  }
  if (senha) {
    try { patch.senha_enc = encrypt(senha) } catch (e) {
      return NextResponse.json({ error: 'Falha ao criptografar a senha.' }, { status: 500 })
    }
  }

  // Testa login no envio (SMTP) e na caixa (IMAP) ANTES de gravar — senha
  // errada aparecia só no 1º envio. `forcar: true` grava mesmo com falha
  // (ex.: servidor fora do ar agora). Sem senha nova, testa com a já salva.
  let teste = null
  if (email && patch.smtp_host && port) {
    let senhaTeste = senha
    if (!senhaTeste) {
      const { data: atual } = await supabase.from('financeiro_envio_config')
        .select('senha_enc').eq('user_id', auth.userId).maybeSingle()
      try { senhaTeste = atual?.senha_enc ? decrypt(atual.senha_enc) : '' } catch { senhaTeste = '' }
    }
    if (!senhaTeste) {
      return NextResponse.json({ error: 'Informe a senha do e-mail.' }, { status: 400 })
    }
    teste = await testarConta({
      email_envio: email, smtp_host: String(patch.smtp_host), smtp_port: port,
      smtp_secure: patch.smtp_secure as boolean,
    }, senhaTeste)
    if (!teste.ok && body.forcar !== true) {
      const partes = [
        !teste.smtp.ok && `Envio (SMTP): ${teste.smtp.erro}`,
        !teste.imap.ok && `Caixa de entrada (IMAP): ${teste.imap.erro}`,
      ].filter(Boolean)
      return NextResponse.json({ error: partes.join(' · '), teste, podeForcar: true }, { status: 422 })
    }
  }

  const { error } = await supabase
    .from('financeiro_envio_config')
    .upsert(patch, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, teste })
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
