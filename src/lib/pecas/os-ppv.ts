// Rastreio × OS → PPV: quando o departamento LIBERA uma unidade cujo destino é
// uma OS, a peça precisa virar venda em algum lugar. Antes ela saía do estoque
// físico e sumia do comercial: alguém tinha que lembrar de abrir o PPV e
// digitar o item de novo. Agora o próprio ato de liberar cuida disso.
//
// Regra: acha um PPV ABERTO da OS; se não houver, cria um já vinculado; e
// acrescenta a peça como uma movimentação de saída.
//
// PRINCÍPIO DE SEGURANÇA: isto NUNCA derruba a liberação. A peça já saiu do
// balcão quando esta função roda — falhar aqui e reverter a liberação faria o
// físico e o sistema discordarem, que é pior que um PPV faltando. Todo erro
// vira aviso na resposta, não exceção.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/lib/pos/supabase'
import { registrarLog } from '@/lib/ppv/queries'
import { escolherPpvAberto, ppvsDaOS, variantesDeCodigo } from './os-ppv-regras'

export { escolherPpvAberto, ppvsDaOS, variantesDeCodigo }

export interface ResultadoVinculo {
  ppv: string | null
  /** o PPV foi criado agora por causa desta peça */
  criado: boolean
  /** preço unitário aplicado (0 = peça sem preço de venda cadastrado) */
  preco: number
  aviso: string | null
}

interface UnidadeMinima {
  numero: string
  codigo: string
  descricao: string | null
  destino_os: string | null
}

/**
 * Garante o PPV da OS, adiciona a peça liberada nele e registra nos DOIS
 * históricos (o do pedido e o da unidade). Devolve o que aconteceu — nunca lança.
 */
export async function vincularUnidadeLiberadaAoPpvDaOS(
  unidadeId: string,
  u: UnidadeMinima,
  ator: { id: string; nome: string; email?: string },
): Promise<ResultadoVinculo> {
  const r = await executar(u, ator.nome)
  if (r.ppv) {
    const quePeca = `${u.codigo}${u.descricao ? ` · ${u.descricao}` : ''}`
    // histórico DO PEDIDO: quem abrir o PPV entende de onde veio a linha
    await registrarLog(
      r.ppv,
      r.criado
        ? `PPV criado pelo rastreio de peças (QR) ao liberar ${u.numero} para a OS ${u.destino_os} — peça ${quePeca}`
        : `Peça ${quePeca} adicionada pelo rastreio de peças (QR) — unidade ${u.numero}, liberada por ${ator.nome}`,
      ator.email || 'rastreio@ppv.local',
    ).catch(() => { /* log é acessório */ })

    // histórico DA UNIDADE: fecha o rastro do outro lado, em /p/<id>
    await supabase.from('peca_unidade_eventos').insert({
      unidade_id: unidadeId,
      autor_id: ator.id,
      autor_nome: ator.nome,
      tipo: 'observacao',
      payload: { origem: 'rastreio_ppv', ppv: r.ppv, ppv_criado: r.criado, os: u.destino_os, preco: r.preco },
    })
  }
  return r
}

async function executar(u: UnidadeMinima, quemNome: string): Promise<ResultadoVinculo> {
  const vazio: ResultadoVinculo = { ppv: null, criado: false, preco: 0, aviso: null }
  const idOs = String(u.destino_os || '').trim()
  if (!idOs) return vazio

  try {
    const { data: osRow } = await supabase
      .from('Ordem_Servico')
      .select('Id_Ordem, Os_Cliente, Os_Tecnico, Status, ID_PPV, Servico_Interno')
      .eq('Id_Ordem', idOs)
      .maybeSingle()
    if (!osRow) return { ...vazio, aviso: `OS ${idOs} não encontrada — a peça saiu sem entrar em PPV.` }

    // 1) tem PPV aberto?
    const ids = ppvsDaOS((osRow as any).ID_PPV)
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

    // 2) não tem: cria um já vinculado (mesma regra da tela da OS)
    let criado = false
    if (!ppv) {
      ppv = await criarPpvDaOS(osRow as any, idOs, quemNome)
      if (!ppv) return { ...vazio, aviso: 'Não consegui criar o PPV desta OS — a peça saiu sem entrar em pedido.' }
      criado = true
    }

    // 3) acrescenta a peça
    const preco = await precoDeVenda(u.codigo)
    const ok = await inserirMovimentacao(ppv, u, preco, String((osRow as any).Os_Tecnico || ''))
    if (!ok) return { ppv, criado, preco, aviso: `PPV ${ppv} pronto, mas a peça não entrou — lance manualmente.` }

    return { ppv, criado, preco, aviso: preco > 0 ? null : 'Peça sem preço de venda cadastrado: entrou por R$ 0,00.' }
  } catch (e) {
    return { ...vazio, aviso: `Falha ao ligar a peça ao PPV: ${e instanceof Error ? e.message : 'erro'}` }
  }
}

async function criarPpvDaOS(os: any, idOs: string, quemNome: string): Promise<string | null> {
  const { data: ultimos } = await supabase
    .from('pedidos')
    .select('id_pedido')
    .order('id_pedido', { ascending: false })
    .limit(50)
  let maxNum = 0
  for (const row of (ultimos || []) as any[]) {
    const m = String(row.id_pedido || '').match(/^PPV-(\d+)$/)
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10))
  }
  const novo = `PPV-${String(maxNum + 1).padStart(4, '0')}`

  const agora = new Date()
  const p2 = (n: number) => String(n).padStart(2, '0')
  const dataBR = `${p2(agora.getDate())}/${p2(agora.getMonth() + 1)}/${agora.getFullYear()} ${p2(agora.getHours())}:${p2(agora.getMinutes())}`

  const { error } = await supabase.from('pedidos').insert({
    id_pedido: novo,
    // OS interna sai por remessa — mesma regra do fluxo de criação pela OS
    Tipo_Pedido: os.Servico_Interno ? 'Remessa' : 'Pedido',
    cliente: os.Os_Cliente || '',
    tecnico: os.Os_Tecnico || '',
    // nasce aguardando faturamento: a peça JÁ saiu fisicamente
    status: 'Aguardando Para Faturar',
    valor_total: 0,
    observacao: `Criado pelo rastreio de peças (QR) ao liberar peça para a OS ${idOs}`,
    Motivo_Saida_Pedido: 'Saida Tecnico (Com OS)',
    email_usuario: quemNome,
    Id_Os: idOs,
    data: dataBR,
  })
  if (error) return null

  const listaNova = os.ID_PPV ? `${os.ID_PPV},${novo}` : novo
  await supabase.from('Ordem_Servico').update({ ID_PPV: listaNova }).eq('Id_Ordem', idOs)
  return novo
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

async function inserirMovimentacao(ppv: string, u: UnidadeMinima, preco: number, tecnico: string): Promise<boolean> {
  const agora = new Date()
  const p2 = (n: number) => String(n).padStart(2, '0')
  const dataHora = `${p2(agora.getDate())}/${p2(agora.getMonth() + 1)}/${agora.getFullYear()} ${p2(agora.getHours())}:${p2(agora.getMinutes())}`
  const { error } = await supabase.from('movimentacoes').insert({
    Id_PPV: ppv,
    Data_Hora: dataHora,
    Tecnico: tecnico,
    TipoMovimento: 'Saída',
    CodProduto: u.codigo,
    Descricao: u.descricao || u.codigo,
    Qtde: '1',
    Preco: preco,
  })
  if (error) return false
  await recalcularTotal(ppv)
  return true
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
