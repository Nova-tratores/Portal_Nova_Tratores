// De acordo do técnico e recibo da comissão autorizada (05/11/2026).
// POST FormData { id, acao: 'de_acordo'|'contestou'|'recibo'|'pasta_rh', forma: 'papel'|'tela', nome, motivo?, assinatura?, file?, qual? }
//   de_acordo / recibo → grava no portal e copia para a pasta do funcionário no RH; pasta_rh {qual} = tentar a cópia de novo.
// GET ?id=&qual=ciencia|recibo → { url } link temporário do arquivo assinado.
import { NextRequest, NextResponse } from 'next/server'
import { guardarComissao } from '@/lib/mecanicos/lancamento-comissao-rota'
import { registrarCiencia, SemTabela, SemCiencia } from '@/lib/mecanicos/lancamento-comissao-server'
import { registrarRecibo, enviarParaPastaRH, arquivoDoPedido, SemRecibo } from '@/lib/mecanicos/documento-comissao-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TIPOS = /^(application\/pdf|image\/)/
const MAX_MB = 15

const erro = (e: unknown) => {
  if (e instanceof SemTabela || e instanceof SemCiencia || e instanceof SemRecibo) return NextResponse.json({ error: e.message, semTabela: true }, { status: 503 })
  const st = (e as { status?: number })?.status || 500
  return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha' }, { status: st })
}

export async function GET(req: NextRequest) {
  const g = await guardarComissao(req)
  if (g.resposta) return g.resposta
  try {
    const qual = req.nextUrl.searchParams.get('qual') === 'recibo' ? 'recibo' : 'ciencia'
    const url = await arquivoDoPedido(String(req.nextUrl.searchParams.get('id') || ''), qual)
    if (!url) return NextResponse.json({ error: 'Não há arquivo anexado' }, { status: 404 })
    return NextResponse.json({ url })
  } catch (e) { return erro(e) }
}

export async function POST(req: NextRequest) {
  const g = await guardarComissao(req)
  if (g.resposta) return g.resposta
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  const id = String(form.get('id') || '')
  const acao = String(form.get('acao') || '')
  const file = form.get('file') as File | null
  let arquivo: { nome: string; tipo: string; bytes: Buffer } | null = null
  if (file && file.size) {
    if (file.size > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `Arquivo maior que ${MAX_MB} MB` }, { status: 400 })
    if (!TIPOS.test(file.type || '')) return NextResponse.json({ error: 'Envie em foto ou PDF' }, { status: 400 })
    arquivo = { nome: file.name || 'documento-assinado', tipo: file.type, bytes: Buffer.from(await file.arrayBuffer()) }
  }
  try {
    if (acao === 'pasta_rh') {
      const qual = form.get('qual') === 'recibo' ? 'recibo' : 'ciencia'
      return NextResponse.json({ pastaRH: await enviarParaPastaRH(id, qual) })
    }
    if (acao === 'recibo') {
      if (!arquivo) return NextResponse.json({ error: 'Anexe o recibo assinado (foto ou PDF)' }, { status: 400 })
      await registrarRecibo(id, arquivo, g.user!)
      return NextResponse.json({ ok: true, pastaRH: await enviarParaPastaRH(id, 'recibo') })
    }
    const r = await registrarCiencia(id, {
      acao: acao === 'contestou' ? 'contestou' : 'de_acordo', forma: form.get('forma') === 'tela' ? 'tela' : 'papel',
      nome: String(form.get('nome') || ''), motivo: String(form.get('motivo') || ''),
      assinatura: form.get('assinatura') ? String(form.get('assinatura')) : null, arquivo,
    }, g.user!, { ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null, ua: req.headers.get('user-agent')?.slice(0, 300) || null })
    const pastaRH = r.ciencia_status === 'de_acordo' ? await enviarParaPastaRH(id, 'ciencia') : null
    return NextResponse.json({ ...r, pastaRH })
  } catch (e) { return erro(e) }
}
