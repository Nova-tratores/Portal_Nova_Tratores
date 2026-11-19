// Pedido de proposta da página de crédito do site (aberto, sem login). Grava em site_pedidos e avisa no sino
// (e no celular, pelo push do portal) quem tem o módulo Site. O WhatsApp o site já abriu antes; isto é o registro.
import { NextResponse } from 'next/server'
import { avisarPedido, corsSite, lerCorpo, passouLimite, sb, semMigration, usuariosDoSite } from '@/lib/marketing/redes/server'

export const runtime = 'nodejs'

type Corpo = {
  nome?: string; telefone?: string; cidade?: string; interesse?: string; linha?: string; valor?: number | null
  usado?: boolean; obs?: string; simulacao?: unknown; origem?: string; visitante?: string; isca?: string
}
const LINHAS = ['pronaf1', 'pronaf5', 'pronamp', 'moderfrota', 'finame', 'consorcio', 'nao-sei']
const corta = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n)

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsSite(req) })
}

export async function POST(req: Request) {
  const cors = corsSite(req)
  if (passouLimite(req, 'site-proposta', 5, 10 * 60_000)) return NextResponse.json({ ok: false }, { status: 429, headers: cors })
  const b = await lerCorpo<Corpo>(req)
  if (!b) return NextResponse.json({ ok: false, erro: 'corpo inválido' }, { status: 400, headers: cors })
  // Robô preencheu a isca: responde ok e não grava.
  if (b.isca) return NextResponse.json({ ok: true }, { headers: cors })
  const nome = corta(b.nome, 120), telefone = corta(b.telefone, 30)
  if (!nome || telefone.replace(/\D/g, '').length < 10) return NextResponse.json({ ok: false, erro: 'nome e WhatsApp obrigatórios' }, { status: 400, headers: cors })

  const linha = LINHAS.includes(String(b.linha)) ? String(b.linha) : null
  const valor = Number(b.valor) > 0 && Number(b.valor) < 100_000_000 ? Number(b.valor) : null
  const registro = {
    nome, telefone, cidade: corta(b.cidade, 80) || null, interesse: corta(b.interesse, 160) || null, linha, valor,
    usado: b.usado === true, obs: corta(b.obs, 2000) || null,
    simulacao: b.simulacao && typeof b.simulacao === 'object' ? b.simulacao : null,
    origem: corta(b.origem, 120) || null, visitante: corta(b.visitante, 64) || null,
  }
  const { data, error } = await sb.from('site_pedidos').insert(registro).select('id').single()
  if (error) {
    console.warn('[site/proposta]', error.message)
    return NextResponse.json({ ok: false, erro: semMigration(error.message) ? 'indisponível' : 'erro' }, { status: semMigration(error.message) ? 503 : 500, headers: cors })
  }
  const dinheiro = valor ? ` · ${valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}` : ''
  await avisarPedido(
    await usuariosDoSite(),
    `Pedido de proposta pelo site — ${nome}`,
    `${registro.interesse || 'Máquina não escolhida'}${dinheiro} · ${registro.cidade || 'cidade não informada'} · ${telefone}`,
    `/marketing/pedidos?id=${data.id}`,
  )
  return NextResponse.json({ ok: true }, { headers: cors })
}
