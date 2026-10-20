// QUADRO DA LOUSA (José, 20/10/2026) — linhas = técnicos, colunas = dias, cartões = OS.
// GET   /api/lousa/quadro?de=YYYY-MM-DD&ate=YYYY-MM-DD
//   -> { pessoas (técnicos + "Sem técnico"), itens (OS e lançamentos da Lousa), pendentes, podeEditar, agora }
// PATCH /api/lousa/quadro  { acao: 'mover', fonte: 'os'|'lousa', ref, origem?, destino, de?, para? }
//                          { acao: 'pendente', ref }
//   mover = muda o dia (e o técnico, se trocou de linha) NA OS; pendente = marca a OS como
//   pendente SEM tirar a data (sql/lousa-pendente.sql). Tudo fica no histórico da OS.
// Leitura igual à da Agenda no modo técnicos (lib/agenda/server.ts).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar, type Autenticado } from '@/lib/auth/server'
import { carregarAgenda, carregarDiretorio, podeLousa, SEM_TECNICO } from '@/lib/agenda/server'
import { addDias, localDe, DIA_RE, osCancelada, solicitacaoDaOS } from '@/lib/agenda/regras'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { TBL_OS } from '@/lib/pos/constants'
import { moverOS, marcarPendente, moverLancamento, ErroQuadro } from '@/lib/lousa/quadro-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface PendenteQuadro {
  id: string; cliente: string | null; tecnico: string | null; status: string | null; cidade: string | null
  oficina: boolean; solicitacao: string | null; criadaEm: string | null; dia: string | null
}

const podeEditar = (auth: Autenticado) => podeLousa(auth) || auth.modulos.some((m) => m === 'pos' || m.startsWith('pos:'))
const COLS = 'Id_Ordem, Os_Cliente, Os_Tecnico, Os_Tecnico2, Status, Data, Cidade_Cliente, Serv_Solicitado, Servico_Oficina, Previsao_Execucao, Dias_Execucao'

/** OS pendentes: marcadas na Lousa (lousa_pendente). Sem a coluna: as que não têm dia nenhum marcado. */
async function lerPendentes(hoje: string): Promise<{ lista: PendenteQuadro[]; marca: boolean }> {
  let marca = true
  let res = await supabaseAdmin.from(TBL_OS).select(COLS).eq('lousa_pendente', true).limit(300)
  if (res.error) {
    marca = false
    res = await supabaseAdmin.from(TBL_OS).select(COLS).is('Previsao_Execucao', null)
      .gte('Data', addDias(hoje, -180)).order('Data', { ascending: false }).limit(300)
  }
  const lista = ((res.data || []) as Record<string, unknown>[])
    .filter((o) => !osCancelada(String(o.Status || '')) && !/conclu/i.test(String(o.Status || '')) && (marca || !String(o.Dias_Execucao || '').trim()))
    .map((o) => ({
      id: String(o.Id_Ordem), cliente: (o.Os_Cliente as string) || null,
      tecnico: [o.Os_Tecnico, o.Os_Tecnico2].filter((n) => String(n || '').trim()).join(' + ') || null,
      status: (o.Status as string) || null, cidade: (o.Cidade_Cliente as string) || null, oficina: !!o.Servico_Oficina,
      solicitacao: solicitacaoDaOS(o.Serv_Solicitado as string) || null, criadaEm: (o.Data as string) || null,
      dia: String(o.Dias_Execucao || '').split(',')[0]?.trim().slice(0, 10) || (o.Previsao_Execucao ? String(o.Previsao_Execucao).slice(0, 10) : null),
    }))
  return { lista, marca }
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const agora = localDe(new Date().toISOString())
  const sp = req.nextUrl.searchParams
  const de = DIA_RE.test(sp.get('de') || '') ? sp.get('de')! : agora.dia
  let ate = DIA_RE.test(sp.get('ate') || '') ? sp.get('ate')! : addDias(de, 13)
  if (ate < de) ate = de
  if (ate > addDias(de, 31)) ate = addDias(de, 31)
  try {
    const [ag, pend] = await Promise.all([carregarAgenda(auth, de, ate, 'tecnicos'), lerPendentes(agora.dia)])
    const idsPendentes = new Set(pend.lista.map((p) => p.id))
    // pendente fica só embaixo da faixa vermelha (a data continua na OS)
    const itens = ag.itens.filter((i) => (i.fonte === 'os' && !idsPendentes.has(i.ref)) || i.fonte === 'lousa')
    return NextResponse.json({
      pessoas: ag.pessoas, itens, pendentes: pend.lista, avisos: ag.avisos, de, ate, agora,
      podeEditar: podeEditar(auth), pendenteAtivo: pend.marca,
    })
  } catch (e) {
    console.error('[lousa/quadro]', e)
    return NextResponse.json({ error: 'Falha ao montar o quadro' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeEditar(auth)) return NextResponse.json({ error: 'Você não tem permissão para mexer na Lousa.' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { acao?: string; fonte?: string; ref?: string; origem?: string | null; destino?: string; de?: string | null; para?: string | null }
  const ref = String(b.ref || '').trim()
  if (!ref) return NextResponse.json({ error: 'Qual cartão?' }, { status: 400 })
  const quem = auth.email || auth.userId
  try {
    if (b.acao === 'pendente') {
      if (b.fonte === 'lousa') return NextResponse.json({ error: 'Só OS vai para as pendentes.' }, { status: 400 })
      await marcarPendente(ref, quem)
      return NextResponse.json({ ok: true })
    }
    if (b.acao !== 'mover' || !DIA_RE.test(b.destino || '')) return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
    // id da linha → nome do técnico (na OS o nome vai em MAIÚSCULAS, como o POS grava)
    const dir = await carregarDiretorio()
    const nome = (id?: string | null) => {
      if (!id || id === SEM_TECNICO) return null
      const p = dir.pessoas.find((x) => x.id === id)
      return p ? (p.tecnicoNome || p.nome) : null
    }
    const de = nome(b.de), para = nome(b.para)
    if (b.fonte === 'lousa') {
      await moverLancamento(ref, { destino: b.destino!, tecnicoDe: de, tecnicoPara: para })
      return NextResponse.json({ ok: true })
    }
    const r = await moverOS(ref, {
      origem: DIA_RE.test(b.origem || '') ? b.origem! : null, destino: b.destino!,
      tecnicoDe: de ? de.toUpperCase() : null, tecnicoPara: para ? para.toUpperCase() : null,
    }, quem)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    if (e instanceof ErroQuadro) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('[lousa/quadro] PATCH', e)
    return NextResponse.json({ error: 'Não deu para gravar na OS.' }, { status: 500 })
  }
}
