// Rastreio de peças × PPV — vínculo entre unidades rastreadas e pedidos de
// venda (tabela `pedidos` + itens em `movimentacoes`).
//
// Fluxo: scan na tela de liberação RESERVA a unidade pro PPV (retirada_pendente
// com destino_tipo='ppv'), a liberação em lote confirma quem pegou (liberada) e
// o FATURAMENTO aplica as liberadas (aplicada). Reserva nunca liberada num PPV
// faturado NÃO é aplicada sozinha — a liberação é a confirmação de entrega
// física — vira alerta 'faturado_sem_liberacao' + notificação.
//
// IMPORTANTE: este arquivo NÃO importa nada de lib/ppv (os hooks em
// lib/ppv/omie.ts importam daqui — import no outro sentido criaria ciclo).
// Leitura de pedidos/movimentacoes é feita direto via service role.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/lib/pos/supabase';
import { norm, type PecaUnidade } from './unidades';
import { transicionar, notificarResponsaveisPecas, type Ator } from './unidades-server';
import { PPV_STATUS_TERMINAIS, ppvFaturado, saldoPorCodigo, montarConferencia, type ConferenciaPPV } from './ppv-conferencia';

// parte pura (agregação/flags) vive em ppv-conferencia.ts — re-exportada aqui
// pra quem já importa deste módulo
export {
  CONTA_TO_EMPRESA, PPV_STATUS_TERMINAIS, ppvFaturado, saldoPorCodigo, montarConferencia,
  type ConferenciaFlag, type ConferenciaLinha, type ConferenciaPPV,
} from './ppv-conferencia';

export interface PPVCabecalho {
  id_pedido: string;
  Tipo_Pedido: string | null;
  status: string | null;
  cliente: string | null;
  tecnico: string | null;
  pedido_omie: string | null;
  omie_empresa: string | null;
  faturado_omie_em: string | null;
}

export async function buscarCabecalhoPPV(idPPV: string): Promise<PPVCabecalho | null> {
  const { data } = await supabase
    .from('pedidos')
    .select('id_pedido, Tipo_Pedido, status, cliente, tecnico, pedido_omie, omie_empresa, faturado_omie_em')
    .eq('id_pedido', idPPV)
    .maybeSingle();
  return (data as PPVCabecalho) || null;
}

const SISTEMA: Ator = { id: null, nome: 'sistema (faturamento do PPV)' };

async function unidadesDoPPV(idPPV: string): Promise<PecaUnidade[]> {
  const { data } = await supabase
    .from('peca_unidades')
    .select('*')
    .eq('destino_ppv', idPPV);
  return (data as PecaUnidade[]) || [];
}

// Já existe o alerta 'faturado_sem_liberacao' pra esta unidade? (idempotência,
// mesmo padrão do cron de abate)
async function jaAlertada(unidadeId: string): Promise<boolean> {
  const { data } = await supabase
    .from('peca_unidade_eventos')
    .select('id')
    .eq('unidade_id', unidadeId)
    .eq('tipo', 'observacao')
    .contains('payload', { alerta: 'faturado_sem_liberacao' })
    .limit(1);
  return !!(data && data.length > 0);
}

/**
 * PPV faturou (NF-e) / remessa enviada / fechado pela OS: aplica as unidades
 * LIBERADAS (gravando o preço final de venda do item); reservas pendentes
 * viram alerta (1x) + notificação. NUNCA lança — chamada best-effort depois
 * de a NF já ter sido emitida.
 */
export async function aplicarUnidadesDoPPV(
  idPPV: string,
  info: { origem: 'faturamento' | 'remessa' | 'os_fechamento'; pedidoOmie?: string; os?: string },
): Promise<{ aplicadas: number; sem_liberacao: number; erros: string[] }> {
  const out = { aplicadas: 0, sem_liberacao: 0, erros: [] as string[] };
  try {
    const [unidades, { data: movs }] = await Promise.all([
      unidadesDoPPV(idPPV),
      supabase
        .from('movimentacoes')
        .select('TipoMovimento, CodProduto, Descricao, Qtde, Preco')
        .eq('Id_PPV', idPPV),
    ]);
    const porCod = saldoPorCodigo((movs as any[]) || []);
    const precoDe = (u: PecaUnidade): number | null => {
      const item = porCod.get(norm(u.codigo)) || porCod.get(norm(u.alt_codigo));
      return item && item.preco != null ? item.preco : null;
    };
    for (const u of unidades) {
      try {
        if (u.status === 'liberada') {
          const preco = precoDe(u);
          await transicionar(u.id, 'aplicar_faturamento', SISTEMA, {
            venda_preco: preco,
            payload: {
              origem: info.origem,
              ppv: idPPV,
              ...(preco != null ? { preco } : {}),
              ...(info.pedidoOmie ? { pedido_omie: info.pedidoOmie } : {}),
              ...(info.os ? { os: info.os } : {}),
            },
          });
          out.aplicadas += 1;
        } else if (u.status === 'retirada_pendente') {
          out.sem_liberacao += 1;
          if (!(await jaAlertada(u.id))) {
            await supabase.from('peca_unidade_eventos').insert({
              unidade_id: u.id,
              autor_id: null,
              autor_nome: SISTEMA.nome,
              tipo: 'observacao',
              de_status: u.status,
              para_status: u.status,
              payload: { alerta: 'faturado_sem_liberacao', ppv: idPPV, origem: info.origem },
            });
          }
        }
      } catch (e) {
        out.erros.push(`${u.numero}: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (out.sem_liberacao > 0) {
      await notificarResponsaveisPecas({
        titulo: `${idPPV} faturado com ${out.sem_liberacao} peça(s) sem liberação`,
        descricao: 'Peças escaneadas no pedido nunca foram liberadas — conferir na tela de liberação.',
        link: `/ppv/liberacao/${idPPV}`,
      });
    }
  } catch (e) {
    out.erros.push(String(e instanceof Error ? e.message : e));
  }
  return out;
}

/**
 * PPV cancelado: solta as unidades — reservas voltam ao estoque; liberadas
 * (peça possivelmente já entregue) viram devolução pendente pro balcão conferir.
 * NUNCA lança.
 */
export async function soltarUnidadesDoPPV(
  idPPV: string,
  ator: Ator,
  motivo: string,
): Promise<{ liberadas_para_estoque: number; em_devolucao: number; erros: string[] }> {
  const out = { liberadas_para_estoque: 0, em_devolucao: 0, erros: [] as string[] };
  try {
    const unidades = await unidadesDoPPV(idPPV);
    for (const u of unidades) {
      try {
        if (u.status === 'retirada_pendente') {
          await transicionar(u.id, 'cancelar_retirada', ator, {
            motivo,
            payload: { origem: 'ppv_cancelado', ppv: idPPV },
          });
          out.liberadas_para_estoque += 1;
        } else if (u.status === 'liberada') {
          await transicionar(u.id, 'devolver', ator, {
            motivo,
            payload: { origem: 'ppv_cancelado', ppv: idPPV },
          });
          out.em_devolucao += 1;
        }
      } catch (e) {
        out.erros.push(`${u.numero}: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (out.em_devolucao > 0) {
      await notificarResponsaveisPecas({
        titulo: `${idPPV} cancelado: ${out.em_devolucao} peça(s) para conferir devolução`,
        descricao: 'Unidades já liberadas do pedido cancelado aguardam conferência física.',
        link: '/ppv/unidades',
      });
    }
  } catch (e) {
    out.erros.push(String(e instanceof Error ? e.message : e));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Conferência: saldo dos itens (movimentacoes) × unidades rastreadas
// (agregação/flags em ppv-conferencia.ts; aqui só a busca no banco)
// ---------------------------------------------------------------------------

export async function conferirPPV(idPPV: string): Promise<ConferenciaPPV | null> {
  const cab = await buscarCabecalhoPPV(idPPV);
  if (!cab) return null;
  const [{ data: movs }, unidades] = await Promise.all([
    supabase
      .from('movimentacoes')
      .select('TipoMovimento, CodProduto, Descricao, Qtde, Preco')
      .eq('Id_PPV', idPPV),
    unidadesDoPPV(idPPV),
  ]);
  return montarConferencia(cab, ppvFaturado(cab), saldoPorCodigo((movs as any[]) || []), unidades);
}

export interface DivergenciaPPV {
  id_ppv: string;
  status: string;
  cliente: string;
  faturado: boolean;
  faturado_em: string | null;
  reservadas: number;
  liberadas: number;
  em_devolucao: number;
}

/**
 * PPVs faturados/terminais que ainda têm unidade presa (reservada/liberada) —
 * é a lista do "questionamento": peça saiu mas não foi faturada (ou faturou
 * sem liberação). PPV aberto com reservas é fluxo normal, não entra.
 */
export async function listarPPVsDivergentes(): Promise<DivergenciaPPV[]> {
  const { data: unidades } = await supabase
    .from('peca_unidades')
    .select('destino_ppv, status')
    .not('destino_ppv', 'is', null)
    .in('status', ['retirada_pendente', 'liberada', 'devolucao_pendente']);
  const porPPV = new Map<string, { reservadas: number; liberadas: number; em_devolucao: number }>();
  for (const u of (unidades as any[]) || []) {
    const id = String(u.destino_ppv || '');
    if (!id) continue;
    const agg = porPPV.get(id) || { reservadas: 0, liberadas: 0, em_devolucao: 0 };
    if (u.status === 'retirada_pendente') agg.reservadas += 1;
    else if (u.status === 'liberada') agg.liberadas += 1;
    else agg.em_devolucao += 1;
    porPPV.set(id, agg);
  }
  if (porPPV.size === 0) return [];

  const ids = [...porPPV.keys()];
  const out: DivergenciaPPV[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data: peds } = await supabase
      .from('pedidos')
      .select('id_pedido, status, cliente, Tipo_Pedido, pedido_omie, faturado_omie_em')
      .in('id_pedido', ids.slice(i, i + 100));
    for (const p of (peds as any[]) || []) {
      const agg = porPPV.get(p.id_pedido)!;
      const faturado = ppvFaturado(p);
      const terminal = PPV_STATUS_TERMINAIS.includes(String(p.status || ''));
      if (!faturado && !terminal) continue; // aberto = fluxo normal
      if (agg.reservadas + agg.liberadas === 0) continue; // só devolução pendente = já tratado
      out.push({
        id_ppv: p.id_pedido,
        status: String(p.status || ''),
        cliente: String(p.cliente || ''),
        faturado,
        faturado_em: p.faturado_omie_em || null,
        ...agg,
      });
    }
  }
  return out.sort((a, b) => (b.faturado_em || '').localeCompare(a.faturado_em || ''));
}
