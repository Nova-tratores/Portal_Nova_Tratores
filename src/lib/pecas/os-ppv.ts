// Rastreio → PPV: quando o departamento LIBERA uma unidade, a peça precisa
// virar venda em algum lugar. Antes ela saía do estoque físico e sumia do
// comercial: alguém tinha que lembrar de abrir o pedido e digitar o item de
// novo. Agora o próprio ato de liberar cuida disso, nos TRÊS destinos:
//
//   os          → acha um PPV aberto da OS; se não houver, cria já vinculado
//   balcao      → usa o PPV que a pessoa escolheu na retirada, ou cria um
//   uso_interno → idem (motivo "Saída Técnico (Sem OS)")
//
// O pedido escolhido/criado fica gravado em `peca_unidades.destino_ppv`, que é
// o que a coluna "Destino" mostra: a peça sempre aponta pro pedido onde entrou.
// ATENÇÃO: `destino_ppv` preenchido NÃO significa "reservada pelo fluxo do
// PPV" — isso continua sendo `destino_tipo='ppv'`, e é por isso que as buscas
// de lib/pecas/ppv-vinculo filtram pelos dois campos.
//
// PRINCÍPIO DE SEGURANÇA: isto NUNCA derruba a liberação. A peça já saiu do
// balcão quando esta função roda — falhar aqui e reverter a liberação faria o
// físico e o sistema discordarem, que é pior que um PPV faltando. Todo erro
// vira aviso na resposta, não exceção.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/lib/pos/supabase'
import { registrarLog } from '@/lib/ppv/queries'
import {
  destinoTemPpv,
  escolherPpvAberto,
  linhaMovimentacao,
  MOTIVO_SAIDA_POR_DESTINO,
  novoIdMovimentacao,
  observacaoPpvRastreio,
  ondeFoiParar,
  ppvAceitaItem,
  ppvsDaOS,
  variantesDeCodigo,
  type DestinoComPpv,
} from './os-ppv-regras'

export {
  destinoTemPpv, escolherPpvAberto, linhaMovimentacao, MOTIVO_SAIDA_POR_DESTINO,
  novoIdMovimentacao, observacaoPpvRastreio, ondeFoiParar, ppvAceitaItem,
  ppvsDaOS, variantesDeCodigo,
}

export interface ResultadoVinculo {
  ppv: string | null
  /** o PPV foi criado agora por causa desta peça */
  criado: boolean
  /** a peça entrou MESMO como item do pedido (false = pedido existe, item não) */
  item: boolean
  /** preço unitário aplicado (0 = peça sem preço de venda cadastrado) */
  preco: number
  aviso: string | null
}

interface UnidadeMinima {
  numero: string
  codigo: string
  descricao: string | null
  destino_tipo: string | null
  destino_os: string | null
  destino_ppv: string | null
}

/** O que a pessoa pediu na retirada quando escolheu "criar um pedido novo". */
export interface IntencaoPpv {
  cliente: string
  documento?: string
  tecnico?: string
}

const VAZIO: ResultadoVinculo = { ppv: null, criado: false, item: false, preco: 0, aviso: null }

/**
 * Garante o PPV do destino, adiciona a peça liberada nele, anota o pedido na
 * unidade e registra nos DOIS históricos (o do pedido e o da unidade).
 * Devolve o que aconteceu — nunca lança.
 */
export async function vincularUnidadeLiberadaAoPpv(
  unidadeId: string,
  u: UnidadeMinima,
  ator: { id: string; nome: string; email?: string },
): Promise<ResultadoVinculo> {
  if (!destinoTemPpv(u.destino_tipo)) return VAZIO
  const destino = u.destino_tipo as DestinoComPpv

  const r = await executar(unidadeId, u, destino, ator.nome)
  if (!r.ppv) return r

  // a unidade passa a apontar pro pedido — é isto que a coluna "Destino" lê
  if (r.ppv !== (u.destino_ppv || '')) {
    await supabase.from('peca_unidades').update({ destino_ppv: r.ppv }).eq('id', unidadeId)
  }

  const quePeca = `${u.codigo}${u.descricao ? ` · ${u.descricao}` : ''}`
  const ondeVai = ondeFoiParar(destino, u.destino_os)
  // histórico DO PEDIDO: quem abrir o PPV entende de onde veio a linha — e se
  // o item NÃO entrou, o log diz isso em vez de afirmar o contrário
  const oQueAconteceu = !r.item
    ? `ATENÇÃO: pedido ligado ao rastreio de peças (QR) — unidade ${u.numero}, peça ${quePeca} — mas o item NÃO foi lançado; inclua manualmente`
    : r.criado
      ? `Pedido criado pelo rastreio de peças (QR) ao liberar ${u.numero} ${ondeVai} — peça ${quePeca}`
      : `Peça ${quePeca} adicionada pelo rastreio de peças (QR) — unidade ${u.numero}, liberada por ${ator.nome}`
  await registrarLog(r.ppv, oQueAconteceu, ator.email || 'rastreio@ppv.local')
    .catch(() => { /* log é acessório */ })

  // histórico DA UNIDADE: fecha o rastro do outro lado, em /p/<id>
  await supabase.from('peca_unidade_eventos').insert({
    unidade_id: unidadeId,
    autor_id: ator.id,
    autor_nome: ator.nome,
    tipo: 'observacao',
    payload: {
      origem: 'rastreio_ppv',
      ppv: r.ppv,
      ppv_criado: r.criado,
      item_lancado: r.item,
      destino_tipo: destino,
      ...(u.destino_os ? { os: u.destino_os } : {}),
      preco: r.preco,
    },
  })
  return r
}

async function executar(
  unidadeId: string,
  u: UnidadeMinima,
  destino: DestinoComPpv,
  quemNome: string,
): Promise<ResultadoVinculo> {
  try {
    const achado = destino === 'os'
      ? await ppvDaOS(u, quemNome)
      : await ppvAvulso(unidadeId, u, destino, quemNome)
    if (!achado.ppv) return achado

    const preco = await precoDeVenda(u.codigo)
    const r = await inserirMovimentacao(achado.ppv, u, preco, achado.tecnico)
    if (!r.ok) {
      // com o motivo junto: "não entrou" sem causa já custou um PPV vazio que
      // ninguém soube explicar até alguém ir ler o log do banco
      return {
        ppv: achado.ppv,
        criado: achado.criado,
        item: false,
        preco,
        aviso: `Pedido ${achado.ppv} pronto, mas a peça NÃO entrou nele — lance manualmente.${r.erro ? ` (${r.erro})` : ''}`,
      }
    }
    return {
      ppv: achado.ppv,
      criado: achado.criado,
      item: true,
      preco,
      aviso: preco > 0 ? null : 'Peça sem preço de venda cadastrado: entrou por R$ 0,00.',
    }
  } catch (e) {
    return { ...VAZIO, aviso: `Falha ao ligar a peça ao pedido: ${e instanceof Error ? e.message : 'erro'}` }
  }
}

interface Achado { ppv: string | null; criado: boolean; item: boolean; preco: number; aviso: string | null; tecnico: string }

// ── destino OS ─────────────────────────────────────────────────────────────

async function ppvDaOS(u: UnidadeMinima, quemNome: string): Promise<Achado> {
  const nada: Achado = { ...VAZIO, tecnico: '' }
  const idOs = String(u.destino_os || '').trim()
  if (!idOs) return { ...nada, aviso: 'Peça de OS sem OS gravada — não consegui achar o pedido.' }

  const { data: osRow } = await supabase
    .from('Ordem_Servico')
    .select('Id_Ordem, Os_Cliente, Os_Tecnico, Status, ID_PPV, Servico_Interno')
    .eq('Id_Ordem', idOs)
    .maybeSingle()
  if (!osRow) return { ...nada, aviso: `OS ${idOs} não encontrada — a peça saiu sem entrar em pedido.` }
  const os = osRow as any
  const tecnico = String(os.Os_Tecnico || '')

  // 1) tem pedido aberto?
  const ids = ppvsDaOS(os.ID_PPV)
  let ppv: string | null = null
  if (ids.length > 0) {
    const { data: peds } = await supabase
      .from('pedidos')
      .select('id_pedido, status, faturado_omie_em, Tipo_Pedido, pedido_omie')
      .in('id_pedido', ids)
    const mapa = new Map<string, { status: string | null; faturado: boolean }>()
    for (const p of (peds || []) as any[]) {
      // Remessa enviada ao Omie já saiu com documento: conta como fechada
      const faturado = !!p.faturado_omie_em
        || (String(p.Tipo_Pedido || '') === 'Remessa' && !!p.pedido_omie)
      mapa.set(String(p.id_pedido), { status: p.status, faturado })
    }
    ppv = escolherPpvAberto(ids, mapa)
  }
  if (ppv) return { ppv, criado: false, item: false, preco: 0, aviso: null, tecnico }

  // 2) não tem: cria um já vinculado (mesma regra da tela da OS)
  const novo = await criarPedido({
    cliente: String(os.Os_Cliente || ''),
    tecnico,
    // OS interna sai por remessa — mesma regra do fluxo de criação pela OS
    tipo: os.Servico_Interno ? 'Remessa' : 'Pedido',
    motivo: MOTIVO_SAIDA_POR_DESTINO.os,
    observacao: observacaoPpvRastreio('os', idOs),
    idOs,
    quemNome,
  })
  if (!novo) return { ...nada, aviso: 'Não consegui criar o pedido desta OS — a peça saiu sem entrar em pedido.' }

  const listaNova = os.ID_PPV ? `${os.ID_PPV},${novo}` : novo
  await supabase.from('Ordem_Servico').update({ ID_PPV: listaNova }).eq('Id_Ordem', idOs)
  return { ppv: novo, criado: true, item: false, preco: 0, aviso: null, tecnico }
}

// ── destinos balcão / uso interno ──────────────────────────────────────────

async function ppvAvulso(
  unidadeId: string,
  u: UnidadeMinima,
  destino: DestinoComPpv,
  quemNome: string,
): Promise<Achado> {
  const nada: Achado = { ...VAZIO, tecnico: '' }
  const escolhido = String(u.destino_ppv || '').trim()

  // (a) a pessoa apontou um pedido na retirada
  if (escolhido) {
    const { data: cab } = await supabase
      .from('pedidos')
      .select('id_pedido, status, Tipo_Pedido, pedido_omie, faturado_omie_em, tecnico')
      .eq('id_pedido', escolhido)
      .maybeSingle()
    if (!cab) return { ...nada, aviso: `Pedido ${escolhido} não existe mais — lance a peça manualmente.` }
    // fechou entre a retirada e a liberação: acrescentar item aqui seria peça
    // vendida sem nota. Melhor avisar que abrir outro pedido por conta própria.
    if (!ppvAceitaItem(cab as any)) {
      return { ...nada, aviso: `Pedido ${escolhido} já foi faturado/fechado — lance a peça manualmente em outro pedido.` }
    }
    return { ppv: escolhido, criado: false, item: false, preco: 0, aviso: null, tecnico: String((cab as any).tecnico || '') }
  }

  // (b) pediu pra criar: os dados do cliente ficaram no evento da retirada
  const intencao = await intencaoDaRetirada(unidadeId)
  if (!intencao?.cliente) {
    return { ...nada, aviso: 'Retirada sem pedido definido — lance a peça manualmente num PPV.' }
  }
  const novo = await criarPedido({
    cliente: intencao.cliente,
    tecnico: intencao.tecnico || '',
    tipo: 'Pedido',
    motivo: MOTIVO_SAIDA_POR_DESTINO[destino],
    observacao: observacaoPpvRastreio(destino),
    idOs: '',
    quemNome,
  })
  if (!novo) return { ...nada, aviso: 'Não consegui criar o pedido — a peça saiu sem entrar em pedido.' }
  return { ppv: novo, criado: true, item: false, preco: 0, aviso: null, tecnico: intencao.tecnico || '' }
}

/**
 * Cliente/técnico escolhidos na hora de pegar a peça.
 *
 * Ficam no PAYLOAD do evento de retirada, não em coluna: o pedido só nasce na
 * liberação (se a retirada for recusada, nada foi criado), e a timeline da
 * unidade é append-only — o último evento 'retirada' é o desta retirada.
 */
async function intencaoDaRetirada(unidadeId: string): Promise<IntencaoPpv | null> {
  const { data } = await supabase
    .from('peca_unidade_eventos')
    .select('payload')
    .eq('unidade_id', unidadeId)
    .eq('tipo', 'retirada')
    .order('created_at', { ascending: false })
    .limit(1)
  const alvo = (data as any[])?.[0]?.payload?.ppv_novo
  if (!alvo || typeof alvo !== 'object') return null
  const cliente = String(alvo.cliente || '').trim()
  if (!cliente) return null
  return { cliente, documento: String(alvo.documento || '').trim(), tecnico: String(alvo.tecnico || '').trim() }
}

// ── escrita ────────────────────────────────────────────────────────────────

async function criarPedido(p: {
  cliente: string
  tecnico: string
  tipo: 'Pedido' | 'Remessa'
  motivo: string
  observacao: string
  idOs: string
  quemNome: string
}): Promise<string | null> {
  const prefixo = p.tipo === 'Remessa' ? 'REM' : 'PPV'
  const { data: ultimos } = await supabase
    .from('pedidos')
    .select('id_pedido')
    .order('id_pedido', { ascending: false })
    .limit(50)
  let maxNum = 0
  const re = new RegExp(`^${prefixo}-(\\d+)$`)
  for (const row of (ultimos || []) as any[]) {
    const m = String(row.id_pedido || '').match(re)
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10))
  }
  const novo = `${prefixo}-${String(maxNum + 1).padStart(4, '0')}`

  const { error } = await supabase.from('pedidos').insert({
    id_pedido: novo,
    Tipo_Pedido: p.tipo,
    cliente: p.cliente,
    tecnico: p.tecnico,
    // nasce aguardando faturamento: a peça JÁ saiu fisicamente
    status: 'Aguardando Para Faturar',
    valor_total: 0,
    observacao: p.observacao,
    Motivo_Saida_Pedido: p.motivo,
    email_usuario: p.quemNome,
    Id_Os: p.idOs,
    data: dataHoraBR(),
  })
  return error ? null : novo
}

function dataHoraBR(): string {
  const d = new Date()
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

async function precoDeVenda(codigo: string): Promise<number> {
  const vars = variantesDeCodigo(codigo)
  if (vars.length === 0) return 0
  const { data } = await supabase
    .from('Produtos_Completos')
    .select('Preco_Venda')
    .in('Codigo_Produto', vars)
    .limit(1)
  const p = parseFloat(String((data as any)?.[0]?.Preco_Venda ?? 0))
  return Number.isFinite(p) && p > 0 ? p : 0
}

async function inserirMovimentacao(
  ppv: string,
  u: UnidadeMinima,
  preco: number,
  tecnico: string,
): Promise<{ ok: boolean; erro?: string }> {
  const dataHora = dataHoraBR()
  let ultimo = ''
  // o Id é sorteado (convenção do módulo): na colisão com um já existente o
  // banco recusa, então tenta de novo em vez de perder a peça
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const { error } = await supabase.from('movimentacoes').insert(
      linhaMovimentacao({ ppv, codigo: u.codigo, descricao: u.descricao, preco, tecnico, dataHora, id: novoIdMovimentacao() }),
    )
    if (!error) {
      await recalcularTotal(ppv)
      return { ok: true }
    }
    ultimo = error.message
    if (error.code !== '23505') break // não é colisão de Id: repetir não ajuda
  }
  return { ok: false, erro: ultimo }
}

/** Total do pedido = soma das saídas menos devoluções (mesma conta do módulo). */
async function recalcularTotal(ppv: string): Promise<void> {
  const { data } = await supabase
    .from('movimentacoes')
    .select('TipoMovimento, Qtde, Preco')
    .eq('Id_PPV', ppv)
  let total = 0
  for (const m of (data || []) as any[]) {
    const qt = parseFloat(String(m.Qtde ?? '0').replace(',', '.')) || 0
    const pr = Number(m.Preco) || 0
    total += (String(m.TipoMovimento || '') === 'Devolução' ? -1 : 1) * qt * pr
  }
  await supabase.from('pedidos').update({ valor_total: Math.max(0, +total.toFixed(2)) }).eq('id_pedido', ppv)
}
