// GET /api/empresa/os-detalhe?os=OS-0826[,OS-0827…] — peças (itens dos PPVs da OS) e requisições usadas em cada OS, para a
// lista de ordens do Faturamento do Pós-Vendas no /empresa (José, 12/11: "embaixo tem que ficar as ordens e as peças e
// requisições que foram usadas nas ordens"). Só lê tabelas do portal (Ordem_Servico, movimentacoes, Requisicao): rápido.
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// '1.234,56' (texto BR) ou 812.18 (número)
const num = (v: unknown) => { const t = String(v ?? 0).trim(); return parseFloat(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t) || 0 }
const semEntidade = (t: string) => t.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

export interface PecaOs { ppv: string; codigo: string; descricao: string; qtd: number; preco: number; total: number }
export interface ObsOs { fase: string; relatorio: { qtd: number; ultimo: string; tecnico: string } | null; tipo: string; solicitado: string; causa: string; realizado: string; observacoes: string }
export interface ReqOs { id: number; titulo: string; tipo: string; fornecedor: string; valor: number; cobrado: number; status: string; data: string; solicitante: string; temNota: boolean }

export async function GET(req: NextRequest) {
  const g = await guardarDre(req)
  if (g.resposta) return g.resposta
  const ids = [...new Set(String(req.nextUrl.searchParams.get('os') || '').split(',').map((s) => s.trim()).filter((s) => /^OS-\d+$/i.test(s)))].slice(0, 300)
  if (!ids.length) return NextResponse.json({ os: {} })
  try {
    const [{ data: ordens, error: e1 }, { data: reqs, error: e2 }] = await Promise.all([
      sb.from('Ordem_Servico').select('Id_Ordem, ID_PPV, Status, Tipo_Servico, Serv_Solicitado, Causa, Serv_Realizado, Observacoes').in('Id_Ordem', ids),
      sb.from('Requisicao').select('id, ordem_servico, titulo, tipo, fornecedor, valor_despeza, valor_cobrado_cliente, status, data, solicitante, foto_nf').in('ordem_servico', ids),
    ])
    if (e1) throw new Error(e1.message)
    // relatório do técnico (app): a OS tem relatório quando há linha em Ordem_Servico_Tecnicos (José, 12/11: "precisa mostrar se o
    // relatório do técnico já está feito, e a fase que está")
    const { data: rels } = await sb.from('Ordem_Servico_Tecnicos').select('Ordem_Servico, TecResp1, DataInicio').in('Ordem_Servico', ids)
    const relDe = new Map<string, { qtd: number; ultimo: string; tecnico: string }>()
    for (const x of rels || []) { const k = String(x.Ordem_Servico); const y = relDe.get(k) || { qtd: 0, ultimo: '', tecnico: '' }; y.qtd++; const d = String(x.DataInicio || '').slice(0, 10); if (d >= y.ultimo) { y.ultimo = d; y.tecnico = String(x.TecResp1 || '') } relDe.set(k, y) }
    if (e2) throw new Error(e2.message)
    const ppvDe = new Map<string, string>() // PPV → OS
    for (const o of ordens || []) for (const p of String(o.ID_PPV || '').split(',').map((s) => s.trim()).filter(Boolean)) ppvDe.set(p, String(o.Id_Ordem))
    const itens: Array<Record<string, unknown>> = []
    const ppvs = [...ppvDe.keys()]
    for (let i = 0; i < ppvs.length; i += 150) {
      for (let de = 0; ; de += 1000) {
        const { data, error } = await sb.from('movimentacoes').select('Id, Id_PPV, CodProduto, Descricao, Qtde, Preco, TipoMovimento').in('Id_PPV', ppvs.slice(i, i + 150)).order('Id').range(de, de + 999)
        if (error) throw new Error(error.message)
        itens.push(...(data || []))
        if ((data || []).length < 1000) break
      }
    }
    const out: Record<string, { pecas: PecaOs[]; requisicoes: ReqOs[]; obs: ObsOs | null }> = Object.fromEntries(ids.map((id) => [id, { pecas: [], requisicoes: [], obs: null }]))
    // o que está escrito na OS (José, 12/11: "consegue colocar observação também?")
    const txt = (v: unknown) => semEntidade(String(v ?? '').trim())
    for (const o of ordens || []) { const k = String(o.Id_Ordem); if (out[k]) out[k].obs = { fase: txt(o.Status), relatorio: relDe.get(k) || null, tipo: txt(o.Tipo_Servico), solicitado: txt(o.Serv_Solicitado), causa: txt(o.Causa), realizado: txt(o.Serv_Realizado), observacoes: txt(o.Observacoes) } }
    // peças: junta o mesmo código do mesmo PPV (saída − devolução)
    const porChave = new Map<string, PecaOs>()
    for (const it of itens) {
      const ppv = String(it.Id_PPV || ''), cod = String(it.CodProduto || '')
      const qtd = Math.abs(num(it.Qtde)) * (/devolu/i.test(String(it.TipoMovimento || '')) ? -1 : 1)
      const k = `${ppv}|${cod}`
      const x = porChave.get(k) || { ppv, codigo: cod, descricao: semEntidade(String(it.Descricao || cod)), qtd: 0, preco: num(it.Preco), total: 0 }
      x.qtd += qtd; x.total += qtd * num(it.Preco)
      porChave.set(k, x)
    }
    for (const x of porChave.values()) {
      if (Math.abs(x.qtd) < 0.001) continue
      const os = ppvDe.get(x.ppv)
      if (os && out[os]) out[os].pecas.push({ ...x, total: Math.round(x.total * 100) / 100 })
    }
    for (const r of reqs || []) {
      const os = String(r.ordem_servico || '')
      if (!out[os] || /cancel/i.test(String(r.status || ''))) continue
      out[os].requisicoes.push({
        id: Number(r.id), titulo: String(r.titulo || ''), tipo: String(r.tipo || ''), fornecedor: String(r.fornecedor || ''),
        valor: num(r.valor_despeza), cobrado: num(r.valor_cobrado_cliente), status: String(r.status || ''), data: String(r.data || '').slice(0, 10),
        solicitante: String(r.solicitante || ''), temNota: !!r.foto_nf,
      })
    }
    for (const v of Object.values(out)) { v.pecas.sort((a, b) => b.total - a.total); v.requisicoes.sort((a, b) => b.valor - a.valor) }
    return NextResponse.json({ os: out }, { headers: { 'Cache-Control': 'private, max-age=120' } })
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 })
  }
}
