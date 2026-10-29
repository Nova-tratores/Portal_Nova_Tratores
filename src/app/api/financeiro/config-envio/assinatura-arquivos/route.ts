// Arquivos e imagens da ASSINATURA de quem está logado (caixa de e-mail do cabeçalho).
//   GET                         → arquivos fixos (vão em toda resposta)
//   POST form {arquivo}         → guarda um arquivo fixo
//   POST form {arquivo, imagem=1} → sobe uma imagem e devolve a URL pra pôr no HTML
//   DELETE ?nome=               → tira um arquivo fixo
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { autenticar } from '@/lib/auth/server'
import {
  LIMITE_IMAGEM_BYTES, LIMITE_TOTAL_BYTES, apagarArquivoAssinatura, guardarArquivoAssinatura,
  guardarImagemAssinatura, listarArquivosAssinatura, nomeSeguro, validarAnexos,
} from '@/lib/financeiro/email-anexos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
)

const falha = (e: unknown, status = 500) =>
  NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status })

export async function GET(req: Request) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { return NextResponse.json({ arquivos: await listarArquivosAssinatura(supabase, auth.userId) }) }
  catch (e) { return falha(e) }
}

export async function POST(req: Request) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const form = await req.formData().catch(() => null)
  const arquivo = form?.get('arquivo')
  if (!(arquivo instanceof File)) return NextResponse.json({ error: 'Escolha um arquivo.' }, { status: 400 })
  const conteudo = Buffer.from(await arquivo.arrayBuffer())

  try {
    if (form?.get('imagem')) {
      if (!/^image\//.test(arquivo.type)) return NextResponse.json({ error: 'Escolha uma imagem (PNG, JPG ou GIF).' }, { status: 400 })
      if (conteudo.length > LIMITE_IMAGEM_BYTES) return NextResponse.json({ error: 'Imagem acima de 2 MB — diminua antes de pôr na assinatura.' }, { status: 400 })
      return NextResponse.json({ url: await guardarImagemAssinatura(supabase, auth.userId, arquivo.name, conteudo, arquivo.type) })
    }
    // arquivo fixo: o conjunto inteiro precisa caber num e-mail (sobra espaço pros anexos da hora)
    const atuais = (await listarArquivosAssinatura(supabase, auth.userId)).filter((a) => a.nome !== nomeSeguro(arquivo.name))
    const erro = validarAnexos([...atuais, { nome: arquivo.name, tamanho: conteudo.length }])
    if (erro) return NextResponse.json({ error: erro }, { status: 400 })
    if (atuais.reduce((s, a) => s + a.tamanho, 0) + conteudo.length > LIMITE_TOTAL_BYTES / 2) {
      return NextResponse.json({ error: 'Os arquivos da assinatura passariam de 9 MB — eles vão em TODA resposta; use arquivos menores.' }, { status: 400 })
    }
    const nome = await guardarArquivoAssinatura(supabase, auth.userId, arquivo.name, conteudo, arquivo.type)
    return NextResponse.json({ ok: true, nome, arquivos: await listarArquivosAssinatura(supabase, auth.userId) })
  } catch (e) { return falha(e) }
}

export async function DELETE(req: Request) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const nome = new URL(req.url).searchParams.get('nome') || ''
  if (!nome) return NextResponse.json({ error: 'nome é obrigatório' }, { status: 400 })
  try {
    await apagarArquivoAssinatura(supabase, auth.userId, nome)
    return NextResponse.json({ ok: true, arquivos: await listarArquivosAssinatura(supabase, auth.userId) })
  } catch (e) { return falha(e) }
}
