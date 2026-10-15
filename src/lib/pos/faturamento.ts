// Faturar a OS (NFS-e) pelo portal — SERVIDOR (banco + Omie).
// Molde: faturamento do PPV (src/lib/ppv/omie.ts). Plano: docs/pos-faturar-os-plano.md
//
// Pontos que não podem ser "simplificados":
//  - Conta FIXA Nova Tratores (a OS só existe nela).
//  - A OS é achada por nCodOS / código de integração e CONFERIDA (cNumOS) antes
//    de qualquer escrita — o envio antigo reaproveitava "<Id_Ordem>-<timestamp>"
//    sem guardar, e consultar pelo Id_Ordem achava a OS antiga.
//  - Trava no banco (UPDATE condicional em faturando_desde) antes do Omie.
//  - Escritas no Omie SEM reenvio automático; sem resposta = "desconhecido" e a
//    reconciliação confere no Omie antes de qualquer nova tentativa.
//  - Sem as colunas da migration sql/pos-faturamento.sql → 503 (nunca fatura sem trava).
import { supabase } from './supabase';
import { TBL_OS, TBL_PEDIDOS, TBL_LOGS_PPO } from './constants';
import { contaOmie } from '@/lib/omie/contas';
import { omie as omiePorta, OmieBloqueioError } from '@/lib/omie/porta';
import { aplicarMudancaFase } from './fase';
import { logAndNotify } from '@/lib/server/audit-notify';
import { filtrarDestinatarios } from '@/lib/notif/prefs';
import { resolverNfseDaOS } from '@/lib/clientes/nfse-omie';
import { hojeSaoPaulo, parcelasDoPagamento } from '@/lib/pagamento/parcelas';
import { normalizarPagamento, OPCOES_PAGAMENTO } from './cobranca';
import {
  bloqueioFaturar, conferirIdentidade, estadoNoOmie, situacaoNfse, statusPendente, travaAtiva,
  chaveNum, motivoPPVFora, valorMudou, valorLiquido, TRAVA_MINUTOS,
  type OSParaFaturar, type PPVDaOS, type RpsNfse, type StatusFaturamento,
} from './faturamento-regras';
import { executarFaturamento, ErroOmie, type OSNoOmie } from './faturamento-fluxo';
import type { Autenticado } from '@/lib/auth/server';
import { permite } from '@/lib/permissoes/explicitas';
import {
  validarCampos, diferencasDoModelo, valoresAtuais, montarItemAlteracao,
  type CamposFiscais, type ItemServicoOmie,
} from './modelo-fiscal';
import {
  listarModelos, listarVinculos, lerModelo, modeloDoCliente, vincularCliente, ModelosFiscaisFaltando,
} from './modelos-fiscais-db';

const EMPRESA = 'Nova Tratores';
const conta = () => contaOmie(EMPRESA);

export class MigracaoFaltando extends Error {
  constructor() { super('Falta aplicar a migration sql/pos-faturamento.sql no banco — o faturamento pelo portal fica desligado até lá.'); this.name = 'MigracaoFaltando'; }
}

// ---------------------------------------------------------------- interruptor
// POS_FATURAR=on (todos com a permissão) | dev (só Dev) | off/ausente (desligado)
export function faturamentoHabilitado(auth: Pick<Autenticado, 'isDev'>): boolean {
  const modo = String(process.env.POS_FATURAR || 'off').toLowerCase();
  if (modo === 'on') return true;
  if (modo === 'dev') return auth.isDev;
  return false;
}
export function podeFaturarOS(auth: Autenticado): boolean {
  return permite(auth.modulos, auth.isAdmin, 'pos', 'faturar', auth.isDev);
}
/** Cancelar NFS-e/NF-e pelo portal (só Dev ou quem um Dev marcou). */
export function podeCancelarFaturamento(auth: Autenticado): boolean {
  return permite(auth.modulos, auth.isAdmin, 'pos', 'cancelar_faturamento', auth.isDev);
}
/** Substituir a OS/pedido do Omie (cancela o antigo): só Dev ou quem um Dev marcou. */
export function podeSubstituirOmie(auth: Autenticado): boolean {
  return permite(auth.modulos, auth.isAdmin, 'pos', 'substituir_omie', auth.isDev);
}
export function podeFaturarPPV(auth: Autenticado): boolean {
  return permite(auth.modulos, auth.isAdmin, 'ppv', 'faturar');
}
/** Criar/editar modelos fiscais e o vínculo com clientes (ação explícita). */
export function podeGerenciarModelos(auth: Autenticado): boolean {
  return permite(auth.modulos, auth.isAdmin, 'pos', 'modelos_fiscais');
}

// ---------------------------------------------------------------- Omie
type Param = Record<string, unknown>;

/**
 * Chamada ao Omie, pela PORTA ÚNICA (src/lib/omie/porta.ts). `escrita`: SEM reenvio;
 * recusa explícita → ErroOmie; timeout/rede/resposta estranha/"consumo redundante"
 * → Error comum (= "pode ter feito"). Leitura: até 2 reenvios em "consumo
 * redundante"/429, esperando o que a Omie pedir (máx. 20 s).
 */
async function omie<T>(endpoint: string, call: string, param: Param, opts: { escrita?: boolean; timeoutMs?: number } = {}): Promise<T> {
  const acc = conta();
  if (!acc.key || !acc.secret) throw new ErroOmie('Credenciais do Omie (conta Nova) não configuradas.');
  let data: Record<string, unknown>;
  try {
    data = await omiePorta<Record<string, unknown>>(
      { appKey: acc.key, appSecret: acc.secret, rotulo: EMPRESA }, endpoint, call, param,
      {
        gravacao: !!opts.escrita,
        tentativas: opts.escrita ? 0 : 4, // leitura repetida ("consumo redundante") espera o que a Omie pede
        maxEsperaMs: 65_000,
        timeoutMs: opts.timeoutMs ?? (opts.escrita ? 60_000 : 30_000),
        lancarFault: false,
      },
    );
  } catch (e) {
    // Bloqueio/chave recusada: a porta nem chamou ou a Omie recusou → recusa limpa.
    if (e instanceof OmieBloqueioError) throw new ErroOmie(`Omie bloqueou a chamada — aguarde alguns minutos. (${e.message})`);
    // HTTP 429 numa escrita sem reenvio: recusado antes de processar → recusa limpa.
    if ((e as { recusa429?: boolean })?.recusa429) throw new ErroOmie('Omie bloqueou a chamada (HTTP 429) — aguarde alguns minutos.');
    throw e; // OmieIncertoError e falhas de rede/timeout = "pode ter feito"
  }
  const fault = typeof data.faultstring === 'string' ? String(data.faultstring) : '';
  if (fault) {
    // "consumo redundante" numa ESCRITA quer dizer que uma chamada igual acabou
    // de chegar — pode ter sido processada: não é recusa limpa. (A porta já trata
    // assim; a checagem fica por segurança.)
    if (opts.escrita && /redundant|aguarde\s+\d+\s+segundo/i.test(fault)) throw new Error(`Omie: ${fault}`);
    throw new ErroOmie(fault);
  }
  return data as T;
}

// ---------------------------------------------------------------- banco
const COLS = 'Id_Ordem, Os_Cliente, Cnpj_Cliente, Status, Ordem_Omie, Servico_Interno, Tipo_Servico, ID_PPV, Valor_Total, '
  + 'forma_pagamento, omie_ncodos, omie_ccodint, faturando_desde, faturamento_status, faturamento_erro, faturamento_pecas, '
  + 'faturado_omie_em, faturado_por, nfse_numero, nfse_link';

export interface PecaFaturada { id: string; pedidoOmie?: string; ok: boolean; erro?: string | null; nf?: string | null }

interface LinhaOS {
  Id_Ordem: string; Os_Cliente: string | null; Cnpj_Cliente: string | null; Status: string | null; Ordem_Omie: string | null;
  Servico_Interno: boolean | null; Tipo_Servico: string | null; ID_PPV: string | null; Valor_Total: number | string | null;
  forma_pagamento: string | null; omie_ncodos: number | null; omie_ccodint: string | null; faturando_desde: string | null;
  faturamento_status: StatusFaturamento | null; faturamento_erro: string | null; faturamento_pecas: PecaFaturada[] | null;
  faturado_omie_em: string | null; faturado_por: string | null; nfse_numero: string | null; nfse_link: string | null;
}

function ehColunaFaltando(err: { code?: string; message?: string } | null): boolean {
  return !!err && (err.code === '42703' || err.code === 'PGRST204' || /column .* does not exist|Could not find the .* column/i.test(err.message || ''));
}

async function lerOS(id: string): Promise<LinhaOS | null> {
  const { data, error } = await supabase.from(TBL_OS).select(COLS).eq('Id_Ordem', id).limit(1);
  if (ehColunaFaltando(error)) throw new MigracaoFaltando();
  if (error) throw new Error(error.message);
  return (data?.[0] as unknown as LinhaOS) || null;
}

async function gravarOS(id: string, campos: Record<string, unknown>) {
  const { error } = await supabase.from(TBL_OS).update(campos).eq('Id_Ordem', id);
  if (ehColunaFaltando(error)) throw new MigracaoFaltando();
  if (error) throw new Error(error.message);
}

async function logOS(id: string, acao: string, userName: string, status: string) {
  const agora = new Date();
  await supabase.from(TBL_LOGS_PPO).insert({
    Id_ppo: id,
    Data_Acao: new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(agora),
    Hora_Acao: agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    UsuEmail: userName || 'Sistema', acao: acao.slice(0, 900),
    Status_Anterior: status, Status_Atual: status, Dias_Na_Fase: 0, Total_Dias_Aberto: 0,
  });
}

/** Mesma regra do envio (criarOSNoOmie): Tipo_Servico 'Garantia' OU garantia vinculada; e se já tem montadora. */
type InfoGarantia = { eh: boolean; semMontadora: boolean };
async function ehGarantia(os: LinhaOS): Promise<InfoGarantia> {
  const { data } = await supabase.from('garantias').select('montadora_id')
    .eq('id_ordem', os.Id_Ordem).order('created_at', { ascending: false }).limit(1);
  const linha = (data?.[0] as { montadora_id?: string | null } | undefined) || null;
  const eh = String(os.Tipo_Servico || '').toLowerCase().trim() === 'garantia' || !!linha;
  return { eh, semMontadora: eh && !linha?.montadora_id };
}

function paraRegras(os: LinhaOS, garantia: InfoGarantia): OSParaFaturar {
  return {
    idOrdem: os.Id_Ordem, ordemOmie: String(os.Ordem_Omie || ''), status: String(os.Status || ''),
    servicoInterno: !!os.Servico_Interno, ehGarantia: garantia.eh, garantiaSemMontadora: garantia.semMontadora, faturadoEm: os.faturado_omie_em,
    faturamentoStatus: os.faturamento_status, faturandoDesde: os.faturando_desde,
  };
}

// ---------------------------------------------------------------- OS no Omie
interface OSConsultada extends OSNoOmie {
  ServicosPrestados?: Array<ItemServicoOmie & { nQtde?: number; nValUnit?: number }>;
}

/** Acha a OS no Omie e confere que é ESTA. Grava omie_ncodos/omie_ccodint se faltarem. */
async function resolverOSNoOmie(os: LinhaOS): Promise<{ nCodOS: number; dados: OSConsultada }> {
  const tentativas: Param[] = [];
  if (os.omie_ncodos) tentativas.push({ nCodOS: Number(os.omie_ncodos) });
  if (os.omie_ccodint) tentativas.push({ cCodIntOS: os.omie_ccodint });
  tentativas.push({ cCodIntOS: os.Id_Ordem });

  let ultimoErro = 'OS não encontrada no Omie.';
  for (const p of tentativas) {
    let dados: OSConsultada;
    try { dados = await omie<OSConsultada>('/servicos/os/', 'ConsultarOS', p); }
    catch (e) { ultimoErro = e instanceof Error ? e.message : String(e); continue; }
    const dif = conferirIdentidade({ idOrdem: os.Id_Ordem, ordemOmie: String(os.Ordem_Omie || ''), ccodintGravado: os.omie_ccodint }, dados.Cabecalho);
    if (dif) { ultimoErro = dif; continue; }
    const nCodOS = Number(dados.Cabecalho!.nCodOS);
    if (!os.omie_ncodos || !os.omie_ccodint) {
      await gravarOS(os.Id_Ordem, { omie_ncodos: nCodOS, omie_ccodint: os.omie_ccodint || dados.Cabecalho?.cCodIntOS || null }).catch(() => {});
    }
    return { nCodOS, dados };
  }
  throw new ErroOmie(ultimoErro);
}

// ---------------------------------------------------------------- PPVs da OS
/** peça do pedido para a prévia: saldo (saídas − devoluções) por código */
export interface ItemPeca { codigo: string; descricao: string; quantidade: number; valorUnitario: number; total: number }
async function itensDoPPV(id: string): Promise<ItemPeca[]> {
  const { data } = await supabase.from('movimentacoes').select('CodProduto, Descricao, Qtde, Preco, TipoMovimento').eq('Id_PPV', id);
  const m = new Map<string, ItemPeca>();
  for (const r of (data || []) as Record<string, unknown>[]) {
    const cod = String(r.CodProduto || '').trim();
    if (!cod) continue;
    const q = (parseFloat(String(r.Qtde ?? 0).replace(',', '.')) || 0) * (/devolu/i.test(String(r.TipoMovimento || '')) ? -1 : 1);
    const x = m.get(cod) || { codigo: cod, descricao: String(r.Descricao || ''), quantidade: 0, valorUnitario: Number(r.Preco) || 0, total: 0 };
    x.quantidade += q;
    if (Number(r.Preco) > 0) x.valorUnitario = Number(r.Preco);
    m.set(cod, x);
  }
  return Array.from(m.values()).filter((x) => x.quantidade > 0.0005)
    .map((x) => ({ ...x, quantidade: Math.round(x.quantidade * 1000) / 1000, total: Math.round(x.quantidade * x.valorUnitario * 100) / 100 }));
}

async function ppvsDaOS(os: LinhaOS): Promise<PPVDaOS[]> {
  const ids = String(os.ID_PPV || '').split(',').map((s) => s.trim()).filter(Boolean);
  const filtro = `Id_Os.eq.${os.Id_Ordem}${ids.length ? `,id_pedido.in.(${ids.map((x) => `"${x}"`).join(',')})` : ''}`;
  const { data } = await supabase.from(TBL_PEDIDOS)
    .select('id_pedido, pedido_omie, Tipo_Pedido, status, omie_empresa, faturado_omie_em, valor_total')
    .or(filtro);
  return (data || []).map((p: Record<string, unknown>) => ({
    id: String(p.id_pedido), pedidoOmie: String(p.pedido_omie || ''), tipo: String(p.Tipo_Pedido || 'Pedido'),
    status: String(p.status || ''), empresa: String(p.omie_empresa || ''), faturadoEm: (p.faturado_omie_em as string) || null,
    valor: Number(p.valor_total || 0),
  }));
}

/**
 * Pedidos de peças que PRECISAM de nota para a OS ser concluída: estão no Omie,
 * não são remessa e não estão cancelados. (Pedido que nunca foi ao Omie não trava.)
 */
function ehConcluidaOuCancelada(status: string | null | undefined): boolean {
  return /^conclu|cancel/i.test(String(status || ''));
}

function pedidoQueConta(p: PPVDaOS): boolean {
  return !!p.pedidoOmie && !/cancel/i.test(p.status) && !/remessa/i.test(p.tipo);
}

/**
 * Regra do José (13/10/2026): a OS só vai para Concluída quando a OS E todos os
 * pedidos de peças dela estiverem faturados. Quem faturou só um, conclui quando
 * o outro for faturado (por aqui ou direto no Omie, na próxima conferência).
 */
async function concluirSeTudoFaturado(id: string, userName: string, motivo: string): Promise<boolean> {
  const os = await lerOS(id);
  if (!os?.faturado_omie_em) return false;
  if (ehConcluidaOuCancelada(os.Status)) return false;
  const faltam = (await ppvsDaOS(os)).filter((p) => pedidoQueConta(p) && !p.faturadoEm);
  if (faltam.length) return false;
  try {
    const f = await aplicarMudancaFase(id, 'Concluída', userName, { acaoLog: `Concluída — ${motivo}` });
    if (f.success) {
      const { registrarAlimentacaoOS } = await import('./alimentacao-os');
      await registrarAlimentacaoOS(id).catch(() => {});
      return true;
    }
  } catch (e) { console.error(`[faturar OS] ${id}: concluir falhou`, e); }
  return false;
}

/** Notificação no sino para QUEM faturou (achado pelo e-mail gravado em faturado_por). */
async function notificarQuemFaturou(quem: string | null | undefined, titulo: string, descricao: string, link: string) {
  const email = String(quem || '').trim();
  if (!email.includes('@')) return; // "Sistema" / "Omie (faturada direto lá)"
  try {
    const { data: u } = await supabase.from('financeiro_usu').select('id').ilike('email', email).limit(1);
    const userId = (u?.[0] as { id?: string } | undefined)?.id;
    if (!userId) return;
    const { data: pref } = await supabase.from('portal_permissoes').select('user_id, categoria, notif_silenciado').eq('user_id', userId).maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (pref && filtrarDestinatarios('pos', [pref as any]).length === 0) return;
    await supabase.from('portal_notificacoes').insert({ user_id: userId, tipo: 'pos', titulo, descricao, link });
  } catch { /* notificação não derruba nada */ }
}

// ---------------------------------------------------------------- estado p/ a tela
export interface EstadoFaturamentoOS {
  habilitado: boolean;
  /** pode "Cancelar nota e refazer" (pos:cancelar_faturamento) */
  podeCancelarNota?: boolean;
  /** notas canceladas desta OS (mais recente por último) */
  anteriores?: Array<{ nfse: string | null; ordemOmie: string; canceladaEm: string; motivo: string; nfseLink: string | null; chave: string | null; novaOmie: string | null; omieCancelada?: boolean }>;
  /** valor da OS no Omie (para explicar o título que sai ao cancelar) */
  valor?: number;
  podeFaturar: boolean;
  podeFaturarPecas: boolean;
  enviadaOmie: boolean;
  bloqueio: string | null;
  status: StatusFaturamento | null;
  erro: string | null;
  faturadoEm: string | null;
  faturadoPor: string | null;
  formaPagamento: string | null;
  nfseNumero: string | null;
  nfseLink: string | null;
  pecas: PecaFaturada[];
  /** pedidos de peças da OS que contam para concluir (no Omie, não remessa, não cancelados) */
  pedidos?: Array<{ id: string; pedidoOmie: string; faturado: boolean }>;
  migracaoFaltando?: boolean;
}

export async function estadoFaturamento(id: string, auth: Autenticado): Promise<EstadoFaturamentoOS> {
  const base = { habilitado: faturamentoHabilitado(auth), podeFaturar: podeFaturarOS(auth), podeFaturarPecas: podeFaturarPPV(auth), podeCancelarNota: podeCancelarFaturamento(auth) };
  let os: LinhaOS | null;
  try { os = await lerOS(id); }
  catch (e) {
    if (e instanceof MigracaoFaltando) {
      return { ...base, habilitado: false, enviadaOmie: false, bloqueio: e.message, status: null, erro: null, faturadoEm: null, faturadoPor: null, formaPagamento: null, nfseNumero: null, nfseLink: null, pecas: [], migracaoFaltando: true };
    }
    throw e;
  }
  if (!os) throw new Error('OS não encontrada.');
  const garantia = await ehGarantia(os);
  return {
    ...base,
    enviadaOmie: !!os.Ordem_Omie,
    bloqueio: bloqueioFaturar(paraRegras(os, garantia)),
    status: os.faturamento_status, erro: os.faturamento_erro,
    faturadoEm: os.faturado_omie_em, faturadoPor: os.faturado_por, formaPagamento: os.forma_pagamento,
    nfseNumero: os.nfse_numero, nfseLink: os.nfse_link,
    pecas: Array.isArray(os.faturamento_pecas) ? os.faturamento_pecas : [],
    valor: Number(String(os.Valor_Total ?? 0).replace(',', '.')) || 0,
    anteriores: await (async () => {
      const { data } = await supabase.from(TBL_OS).select('faturamento_anterior').eq('Id_Ordem', id).limit(1);
      const l = (data?.[0] as { faturamento_anterior?: Record<string, unknown>[] } | undefined)?.faturamento_anterior;
      return Array.isArray(l) ? l.map((x) => ({
        nfse: (x.nfse as string) || null, ordemOmie: String(x.ordemOmie || ''), canceladaEm: String(x.canceladaEm || ''), motivo: String(x.motivo || ''),
        nfseLink: (x.nfseLink as string) || null, chave: (x.chave as string) || null, novaOmie: (x.novaOmie as string) || null,
        omieCancelada: x.omieCancelada === undefined ? undefined : !!x.omieCancelada,
      })) : [];
    })().catch(() => []),
    pedidos: (await ppvsDaOS(os)).filter(pedidoQueConta).map((p) => ({ id: p.id, pedidoOmie: p.pedidoOmie, faturado: !!p.faturadoEm })),
  };
}

// ---------------------------------------------------------------- simular
// ValidarOS em cache por 3 min por OS: recusa fiscal conta como erro para o
// bloqueio 425 do Omie (10 erros / 30 min por chave) — abrir a janela várias
// vezes não pode estourar isso.
const cacheValidar = new Map<number, { em: number; ok: boolean; msg: string | null }>();

async function validarComCache(nCodOS: number): Promise<{ ok: boolean; msg: string | null }> {
  const c = cacheValidar.get(nCodOS);
  if (c && Date.now() - c.em < 3 * 60_000) return c;
  let r: { ok: boolean; msg: string | null };
  try { await omie('/servicos/osp/', 'ValidarOS', { nCodOS }); r = { ok: true, msg: null }; }
  catch (e) { r = { ok: false, msg: e instanceof Error ? e.message : String(e) }; }
  cacheValidar.set(nCodOS, { em: Date.now(), ...r });
  return r;
}

export interface SimulacaoFaturamentoOS {
  ok: boolean;
  erro?: string;
  os?: { id: string; cliente: string; numeroOmie: string; status: string };
  totalOmie?: number;
  valorPortal?: number;
  divergente?: boolean;
  servicos?: Array<{ descricao: string; detalhe?: string; quantidade: number; valorUnitario: number; desconto: number; total: number }>;
  /** total dos pedidos de peças da OS (o Valor_Total do portal soma serviço + peças) */
  pecasPortal?: number;
  formaPagamento?: string | null;
  opcoesPagamento?: readonly string[];
  hoje?: string;
  validacao?: { ok: boolean; msg: string | null };
  ppvs?: Array<PPVDaOS & { motivoFora: string | null; itens?: ItemPeca[] }>;
  podeFaturarPecas?: boolean;
  liquidoOmie?: number;
  retidoOmie?: number;
  impostos?: {
    disponivel: boolean;               // false = migration dos modelos ainda não aplicada
    modelo: { id: string; nome: string; origem: 'cliente' | 'padrao'; campos: CamposFiscais } | null;
    /** clientes: quem usa o modelo (ex.: "Piraju", "Iaras") — aparece no nome do modelo */
    modelos: Array<{ id: string; nome: string; padrao: boolean; campos: CamposFiscais; descricao?: string | null; clientes: string[] }>;
    /** nome do cliente parece órgão público (prefeitura, câmara, fundo municipal…) */
    orgaoPublico?: boolean;
    atuais: Record<string, string | number | null | 'varia'>;
    qtdItens: number;
    podeGerenciar: boolean;
    documento: string;
  };
}

export async function simularFaturamentoOS(id: string, auth: Autenticado): Promise<SimulacaoFaturamentoOS> {
  const os = await lerOS(id);
  if (!os) return { ok: false, erro: 'OS não encontrada.' };
  const garantia = await ehGarantia(os);
  const bloq = bloqueioFaturar(paraRegras(os, garantia));
  if (bloq) return { ok: false, erro: bloq };

  let r: { nCodOS: number; dados: OSConsultada };
  try { r = await resolverOSNoOmie(os); } catch (e) { return { ok: false, erro: e instanceof Error ? e.message : String(e) }; }
  const est = estadoNoOmie(r.dados.Cabecalho, r.dados.InfoCadastro);
  if (est !== 'aberta') {
    // já faturada/cancelada direto no Omie: a reconciliação carimba
    void reconciliarFaturamentoOS(id).catch(() => {});
    return { ok: false, erro: est === 'cancelada' ? 'A OS está cancelada no Omie.' : 'A OS já está faturada (ou faturando) no Omie. O portal vai atualizar a situação sozinho.' };
  }
  const totalOmie = Number(r.dados.Cabecalho?.nValorTotal || 0);
  const valorPortal = Number(String(os.Valor_Total ?? 0).replace(',', '.')) || 0;
  const ppvs = await Promise.all((await ppvsDaOS(os)).map(async (p) => ({ ...p, motivoFora: motivoPPVFora(p), itens: await itensDoPPV(p.id).catch(() => []) })));
  // o Valor_Total da OS no portal = serviço + peças dos PPVs: a nota de serviço compara só o serviço
  const pecasPortal = Math.round(ppvs.filter((p) => !/cancel/i.test(String(p.status || ''))).reduce((t, p) => t + (Number(p.valor) || 0), 0) * 100) / 100;
  const servicoPortal = Math.max(0, Math.round((valorPortal - pecasPortal) * 100) / 100);
  const itens = r.dados.ServicosPrestados || [];
  let impostos: SimulacaoFaturamentoOS['impostos'];
  try {
    const [{ modelo, origem }, modelos, vinculos] = await Promise.all([modeloDoCliente(os.Cnpj_Cliente), listarModelos(), listarVinculos().catch(() => [])]);
    // "MUNICIPIO DE ESPIRITO SANTO DO TURVO" → "Espirito Santo Do Turvo"
    const curto = (nome: string | null) => String(nome || '').replace(/^(munic[ií]pio de|prefeitura municipal de|prefeitura de|c[aâ]mara municipal de)\s+/i, '').toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase()).trim();
    impostos = {
      disponivel: true,
      modelo: modelo && origem ? { id: modelo.id, nome: modelo.nome, origem, campos: modelo.campos } : null,
      modelos: modelos.map((m) => ({ id: m.id, nome: m.nome, padrao: m.padrao, campos: m.campos, descricao: m.descricao, clientes: vinculos.filter((v) => v.modeloId === m.id).map((v) => curto(v.clienteNome)).filter(Boolean) })),
      orgaoPublico: /munic[ií]pi|prefeitura|c[aâ]mara municipal|fundo municipal|secretaria municipal|autarquia/i.test(String(os.Os_Cliente || '')),
      atuais: valoresAtuais(itens), qtdItens: itens.length, podeGerenciar: podeGerenciarModelos(auth),
      documento: String(os.Cnpj_Cliente || ''),
    };
  } catch (e) {
    if (!(e instanceof ModelosFiscaisFaltando)) throw e;
    impostos = { disponivel: false, modelo: null, modelos: [], atuais: valoresAtuais(itens), qtdItens: itens.length, podeGerenciar: false, documento: String(os.Cnpj_Cliente || '') };
  }
  return {
    liquidoOmie: valorLiquido(r.dados.Cabecalho),
    retidoOmie: Number(r.dados.Cabecalho?.nValorTotalImpRet || 0),
    impostos,
    ok: true,
    os: { id: os.Id_Ordem, cliente: String(os.Os_Cliente || ''), numeroOmie: chaveNum(os.Ordem_Omie), status: String(os.Status || '') },
    totalOmie, valorPortal: servicoPortal, pecasPortal, divergente: valorMudou(totalOmie, servicoPortal),
    servicos: (r.dados.ServicosPrestados || []).map((s) => {
      const it = s as Record<string, unknown>;
      const q = Number(it.nQtde || 0), u = Number(it.nValUnit || 0);
      const desconto = Number(it.nValorDesconto || 0) > 0 ? Number(it.nValorDesconto) : it.cTpDesconto === 'P' ? q * u * Number(it.nAliqDesconto || it.nPercDesconto || 0) / 100 : 0;
      const texto = String(it.cDescServ || '');
      const sol = String(it.cCodigo || '') === 'sol.aber.os' || u <= 0.01;
      const pedido = texto.match(/Solicita[çc][ãa]o do cliente:\s*([^|\n]*)/i)?.[1]?.trim();
      return {
        descricao: sol ? 'Solicitação de serviço' : (texto.split(/\n|\|/)[0].slice(0, 120) || 'Serviço'),
        detalhe: sol ? (pedido || texto.split(/\n|\|/).filter(Boolean).slice(0, 2).join(' · ')).slice(0, 140) : undefined,
        quantidade: q, valorUnitario: u, desconto: Math.round(desconto * 100) / 100,
        total: Math.max(0, Math.round((q * u - desconto) * 100) / 100),
      };
    }),
    formaPagamento: normalizarPagamento(os.forma_pagamento),
    opcoesPagamento: OPCOES_PAGAMENTO,
    hoje: hojeSaoPaulo(),
    validacao: await validarComCache(r.nCodOS),
    ppvs,
    podeFaturarPecas: podeFaturarPPV(auth),
  };
}

// ---------------------------------------------------------------- faturar
export interface ResultadoFaturarOS {
  ok: boolean;
  status: number;           // HTTP sugerido pra rota
  tipo?: 'faturada' | 'ja_faturada' | 'desconhecido' | 'erro' | 'em_andamento' | 'pendente_omie';
  mensagem?: string;
  nfseNumero?: string | null;
  pecas?: PecaFaturada[];
  /** a OS foi para Concluída (só quando a OS e os pedidos de peças estão faturados) */
  concluida?: boolean;
}

export async function faturarOSNoOmie(
  id: string,
  entrada: {
    forma: string | null; ppvIds: string[]; totalConfirmado: number;
    impostos?: { modeloId?: string | null; campos?: unknown; salvarParaCliente?: boolean } | null;
  },
  auth: Autenticado,
): Promise<ResultadoFaturarOS> {
  const userName = auth.email || 'Sistema';
  const os = await lerOS(id);
  if (!os) return { ok: false, status: 404, tipo: 'erro', mensagem: 'OS não encontrada.' };
  const garantia = await ehGarantia(os);
  const bloq = bloqueioFaturar(paraRegras(os, garantia));
  if (bloq) return { ok: false, status: 409, tipo: 'erro', mensagem: bloq };

  const forma = normalizarPagamento(entrada.forma);
  if (!forma) return { ok: false, status: 400, tipo: 'erro', mensagem: 'Escolha a forma de pagamento.' };

  // PPVs pedidos precisam ser DESTA OS, elegíveis e quem fatura precisa poder faturar PPV
  const todos = await ppvsDaOS(os);
  const pedidos = Array.from(new Set(entrada.ppvIds.map(String)));
  for (const pid of pedidos) {
    const p = todos.find((x) => x.id === pid);
    if (!p) return { ok: false, status: 400, tipo: 'erro', mensagem: `O pedido ${pid} não é desta OS.` };
    const fora = motivoPPVFora(p);
    if (fora) return { ok: false, status: 400, tipo: 'erro', mensagem: `O pedido ${pid} não pode ser faturado junto (${fora}).` };
  }
  if (pedidos.length && !podeFaturarPPV(auth)) {
    return { ok: false, status: 403, tipo: 'erro', mensagem: 'Você não tem permissão para faturar pedidos de peças (PPV). Desmarque as peças ou peça a permissão.' };
  }

  // Impostos dos itens (modelo fiscal + ajustes desta OS)
  const { campos: camposImpostos, erros: errosImpostos } = validarCampos(entrada.impostos?.campos);
  if (errosImpostos.length) return { ok: false, status: 400, tipo: 'erro', mensagem: `Impostos: ${errosImpostos.join(' ')}` };
  let registroImpostos: Record<string, unknown> | null = null;
  if (Object.keys(camposImpostos).length) {
    const modeloId = entrada.impostos?.modeloId || null;
    const modelo = modeloId ? await lerModelo(modeloId) : null;
    if (modeloId && !modelo) return { ok: false, status: 400, tipo: 'erro', mensagem: 'O modelo fiscal escolhido não existe mais. Abra a janela de novo.' };
    registroImpostos = {
      modeloId: modelo?.id || null, modeloNome: modelo?.nome || null, campos: camposImpostos,
      ajustes: diferencasDoModelo(modelo?.campos, camposImpostos), por: userName, em: new Date().toISOString(),
    };
  }
  if (entrada.impostos?.salvarParaCliente) {
    if (!podeGerenciarModelos(auth)) return { ok: false, status: 403, tipo: 'erro', mensagem: 'Você não tem a permissão "Modelos fiscais" para vincular o modelo ao cliente.' };
    if (!entrada.impostos.modeloId) return { ok: false, status: 400, tipo: 'erro', mensagem: 'Escolha um modelo para vincular ao cliente.' };
  }

  // TRAVA atômica: só um faturamento por OS por vez (lease de 10 min)
  const agoraIso = new Date().toISOString();
  const limite = new Date(Date.now() - TRAVA_MINUTOS * 60_000).toISOString();
  const { data: travou, error: errTrava } = await supabase.from(TBL_OS)
    .update({
      faturando_desde: agoraIso, faturamento_status: 'faturando', faturamento_erro: null, faturado_por: userName,
      faturamento_pecas: pedidos.map((pid) => ({ id: pid, ok: false, erro: 'não processado' })),
      // o que será aplicado (só manda a coluna quando há impostos: ela vem da migration dos modelos)
      ...(registroImpostos ? { faturamento_impostos: registroImpostos } : {}),
    })
    .eq('Id_Ordem', id)
    .is('faturado_omie_em', null)
    .or(`faturando_desde.is.null,faturando_desde.lt.${limite}`)
    .select('Id_Ordem');
  if (ehColunaFaltando(errTrava)) throw new MigracaoFaltando();
  if (errTrava) throw new Error(errTrava.message);
  if (!travou?.length) return { ok: false, status: 409, tipo: 'em_andamento', mensagem: 'Já existe um faturamento desta OS em andamento (ou ela acabou de ser faturada). Atualize a tela.' };

  const liberar = async (status: StatusFaturamento | null, erro: string | null) => {
    await gravarOS(id, {
      faturando_desde: null, faturamento_status: status, faturamento_erro: erro,
      ...(status === 'erro' ? { faturamento_pecas: null, ...(registroImpostos ? { faturamento_impostos: null } : {}) } : {}),
    }).catch(() => {});
  };

  let nCodOS: number;
  try { nCodOS = (await resolverOSNoOmie(os)).nCodOS; }
  catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await liberar('erro', m);
    await auditar(id, userName, auth.userId, 'faturar_erro', { etapa: 'identidade', erro: m });
    return { ok: false, status: 400, tipo: 'erro', mensagem: m };
  }

  let respostaCrua = '';
  const r = await executarFaturamento({
    consultar: () => omie<OSNoOmie>('/servicos/os/', 'ConsultarOS', { nCodOS }),
    alterarImpostos: async (itens, campos) => {
      const servicos = itens.map((i) => montarItemAlteracao(i, campos)).filter(Boolean);
      if (!servicos.length) throw new ErroOmie('A OS não tem itens de serviço para aplicar os impostos.');
      await omie('/servicos/os/', 'AlterarOS', { Cabecalho: { nCodOS }, ServicosPrestados: servicos }, { escrita: true });
    },
    alterarParcelas: async (plano) => {
      await omie('/servicos/os/', 'AlterarOS', {
        Cabecalho: { nCodOS, cCodParc: plano.cCodParc, nQtdeParc: plano.nQtdeParc },
        Parcelas: plano.parcelas,
      }, { escrita: true });
    },
    validar: async () => { await omie('/servicos/osp/', 'ValidarOS', { nCodOS }); cacheValidar.delete(nCodOS); },
    faturar: async () => {
      const resp = await omie<{ cCodStatus?: string; cDescStatus?: string }>('/servicos/osp/', 'FaturarOS', { nCodOS }, { escrita: true, timeoutMs: 90_000 });
      respostaCrua = JSON.stringify(resp).slice(0, 500);
      return resp;
    },
  }, { forma, aplicarParcelas: true, hojeISO: hojeSaoPaulo(), totalConfirmado: Number(entrada.totalConfirmado) || 0, impostos: camposImpostos });

  // "usar sempre para este cliente": vale mesmo se o faturamento falhar depois (é uma escolha do cadastro)
  if (entrada.impostos?.salvarParaCliente && entrada.impostos.modeloId && os.Cnpj_Cliente) {
    try { await vincularCliente(os.Cnpj_Cliente, entrada.impostos.modeloId, os.Os_Cliente, userName); } catch { /* não derruba o faturamento */ }
  }

  if (r.tipo === 'erro') {
    await liberar('erro', r.mensagem);
    await auditar(id, userName, auth.userId, 'faturar_erro', { erro: r.mensagem, forma });
    await logOS(id, `Faturamento NÃO realizado: ${r.mensagem}`, userName, String(os.Status || ''));
    return { ok: false, status: 400, tipo: 'erro', mensagem: r.mensagem };
  }
  if (r.tipo === 'pendente_omie') {
    await gravarOS(id, { faturando_desde: null, faturamento_status: 'desconhecido', faturamento_erro: r.mensagem }).catch(() => {});
    return { ok: false, status: 409, tipo: 'pendente_omie', mensagem: r.mensagem };
  }
  if (r.tipo === 'desconhecido') {
    // trava continua; status "desconhecido" bloqueia nova tentativa até conferir
    await gravarOS(id, { faturamento_status: 'desconhecido', faturamento_erro: r.mensagem }).catch(() => {});
    await auditar(id, userName, auth.userId, 'faturar_desconhecido', { erro: r.mensagem, forma });
    await logOS(id, `Faturamento sem resposta clara do Omie — conferindo. ${r.mensagem}`, userName, String(os.Status || ''));
    // confere já (às vezes o Omie demora só alguns segundos)
    try { await reconciliarFaturamentoOS(id, { forcar: true }); } catch { /* fica pro agendador */ }
    return { ok: false, status: 202, tipo: 'desconhecido', mensagem: r.mensagem };
  }

  // faturada (ou já estava faturada no Omie desde a abertura da janela)
  const { pecas, concluida } = await posFaturamento(id, {
    userName, userId: auth.userId, nCodOS,
    forma: r.tipo === 'faturada' ? forma : null,
    ppvIds: r.tipo === 'faturada' ? pedidos : [],
    respostaCrua, porFora: r.tipo === 'ja_faturada',
    dataFaturamentoOmie: r.tipo === 'ja_faturada'
      ? await omie<OSNoOmie>('/servicos/os/', 'ConsultarOS', { nCodOS }).then((x) => x.InfoCadastro?.dDtFat || null, () => null)
      : null,
  });
  const atual = await lerOS(id).catch(() => null);
  return { ok: true, status: 200, tipo: r.tipo === 'faturada' ? 'faturada' : 'ja_faturada', nfseNumero: atual?.nfse_numero || null, pecas, concluida };
}

async function auditar(id: string, userName: string, userId: string, acao: string, detalhes: Record<string, unknown>) {
  try {
    await logAndNotify({
      userName, sistema: 'pos', acao, entidade: 'ordem_servico', entidadeId: id, entidadeLabel: `OS ${id}`,
      detalhes: { ...detalhes, userId },
      notifTitulo: acao === 'faturar' ? `OS ${id} faturada (NFS-e)` : `OS ${id}: problema no faturamento`,
      notifDescricao: acao === 'faturar' ? `${userName} faturou a OS ${id} pelo portal.` : String(detalhes.erro || ''),
      notifLink: `/pos?id=${id}`,
    });
  } catch { /* auditoria não derruba o faturamento */ }
}

/**
 * Depois que o Omie aceitou: carimba, fatura as peças marcadas, conclui a OS
 * pelo caminho normal (aplicarMudancaFase + alimentação) e tenta a NFS-e.
 */
async function posFaturamento(id: string, ctx: {
  userName: string; userId: string; nCodOS: number; forma: string | null; ppvIds: string[]; respostaCrua: string; porFora: boolean;
  dataFaturamentoOmie?: string | null; // dd/mm/aaaa do InfoCadastro.dDtFat (faturada direto no Omie)
}): Promise<{ pecas: PecaFaturada[]; concluida: boolean }> {
  const os = await lerOS(id);
  const statusAntes = String(os?.Status || '');
  await gravarOS(id, {
    faturado_omie_em: dataOmieISO(ctx.dataFaturamentoOmie) || new Date().toISOString(),
    ...(ctx.porFora ? { faturado_por: 'Omie (faturada direto lá)' } : { faturado_por: ctx.userName }),
    ...(ctx.forma ? { forma_pagamento: ctx.forma } : {}),
    faturamento_status: 'nfse_aguardando', faturamento_erro: null, faturando_desde: null, omie_ncodos: ctx.nCodOS,
  });
  await logOS(id, ctx.porFora
    ? 'OS já estava faturada no Omie — portal registrou o faturamento.'
    : `Faturada pelo portal (FaturarOS) — ${ctx.forma}${ctx.respostaCrua ? ` · Omie: ${ctx.respostaCrua}` : ''}`, ctx.userName, statusAntes);

  // 1) peças marcadas — uma de cada vez; falha numa NÃO desfaz a OS
  const pecas: PecaFaturada[] = [];
  if (ctx.ppvIds.length) {
    const { faturarPPVNoOmie } = await import('@/lib/ppv/omie');
    for (const pid of ctx.ppvIds) {
      try {
        const falhaParc = await aplicarFormaNoPedido(pid, ctx.forma);
        if (falhaParc) { pecas.push({ id: pid, ok: false, erro: `forma de pagamento: ${falhaParc} — o pedido não foi faturado` }); continue; }
        const r = await faturarPPVNoOmie(pid);
        pecas.push({ id: pid, pedidoOmie: r.numeroPedido, ok: !!r.sucesso, erro: r.sucesso ? null : (r.erro || 'falhou'), nf: r.nfNumero || null });
      } catch (e) {
        pecas.push({ id: pid, ok: false, erro: e instanceof Error ? e.message : String(e) });
      }
    }
    await gravarOS(id, { faturamento_pecas: pecas }).catch(() => {});
  } else {
    await gravarOS(id, { faturamento_pecas: null }).catch(() => {});
  }

  // 2) conclui pelo caminho normal (log, métricas, PPV, notificações) + alimentação → financeiro,
  //    MAS só quando a OS e TODOS os pedidos de peças estão faturados (regra 13/10/2026)
  let concluida = false;
  if (!ctx.porFora) {
    concluida = await concluirSeTudoFaturado(id, ctx.userName, 'OS e pedidos de peças faturados');
    if (!concluida) await logOS(id, 'OS faturada — vai para Concluída quando o pedido de peças também for faturado.', ctx.userName, statusAntes);
    await auditar(id, ctx.userName, ctx.userId, 'faturar', { nCodOS: ctx.nCodOS, forma: ctx.forma, pecas, omie: ctx.respostaCrua, concluida });
  }

  // 3) NFS-e (uma tentativa rápida; a reconciliação completa depois)
  try { await atualizarNfse(id, ctx.nCodOS); } catch { /* fica pra reconciliação */ }
  return { pecas, concluida };
}

/** "dd/mm/aaaa" do Omie → meio-dia em São Paulo (ISO); null se inválida. */
function dataOmieISO(d: string | null | undefined): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(d || '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}T12:00:00-03:00` : null;
}

/** Lê a NFS-e no StatusOS, grava situação/nº e o PDF (se já existir) na OS e na pasta do cliente. */
async function atualizarNfse(id: string, nCodOS: number): Promise<StatusFaturamento> {
  const antes = await lerOS(id).catch(() => null);
  const st = await omie<{ ListaRpsNfse?: Array<RpsNfse & { danfe?: string; cUrlNfse?: string }> }>('/servicos/os/', 'StatusOS', { nCodOS, lMsg: true });
  const sit = situacaoNfse(st?.ListaRpsNfse);
  const upd: Record<string, unknown> = { faturamento_status: sit.status, faturamento_erro: sit.mensagem };
  if (sit.numero) upd.nfse_numero = sit.numero;

  if (sit.status === 'nfse_autorizada' && sit.numero) {
    const os = await lerOS(id);
    const ult = (st.ListaRpsNfse || []).slice(-1)[0];
    const numOS = chaveNum(os?.Ordem_Omie) || String(nCodOS);
    const res = await resolverNfseDaOS(supabase, conta(), { empresa: EMPRESA, num_os: numOS, cod_os: nCodOS }, { numero: sit.numero, url: ult?.danfe || ult?.cUrlNfse || null });
    if (res.link_nf) upd.nfse_link = res.link_nf;
    // espelho da pasta do cliente (mesma tabela que o webhook atualiza)
    const espelho: Record<string, string> = {};
    if (res.num_nf) espelho.num_nf = res.num_nf;
    if (res.link_nf) espelho.link_nf = res.link_nf;
    if (Object.keys(espelho).length) {
      await supabase.from('portal_nt_clientes_os').update(espelho).eq('cod_os', nCodOS).eq('empresa', EMPRESA);
    }
  }
  await gravarOS(id, upd);

  // a nota saiu (ou voltou rejeitada) AGORA → avisa no sino quem faturou
  const virou = antes?.faturamento_status !== sit.status && (sit.status === 'nfse_autorizada' || sit.status === 'nfse_rejeitada');
  if (virou && antes?.faturado_omie_em) {
    const num = chaveNum(antes.Ordem_Omie) || id;
    if (sit.status === 'nfse_autorizada') {
      await notificarQuemFaturou(antes.faturado_por, `NFS-e da OS ${num} emitida`,
        `A nota ${sit.numero ? `nº ${sit.numero} ` : ''}foi autorizada pelo sistema nacional. ${antes.Os_Cliente || ''}`.trim(), `/pos?id=${id}`);
    } else {
      await notificarQuemFaturou(antes.faturado_por, `NFS-e da OS ${num} REJEITADA`,
        `${sit.mensagem || 'O sistema nacional recusou a nota.'} Corrija e reenvie pelo Omie.`, `/pos?id=${id}`);
    }
  }
  return sit.status;
}

// ---------------------------------------------------------------- reconciliar
/**
 * Põe o portal em dia com o Omie para UMA OS:
 *  - faturamento "desconhecido"/"faturando" com trava vencida → confere no Omie;
 *  - faturada pelo portal com NFS-e pendente → relê a NFS-e;
 *  - faturada DIRETO no Omie → carimba (sem mudar a fase: quem decide é a equipe).
 */
export async function reconciliarFaturamentoOS(id: string, opts: { forcar?: boolean } = {}): Promise<string> {
  const os = await lerOS(id);
  if (!os?.Ordem_Omie) return 'sem Omie';

  if (os.faturado_omie_em) {
    // pedido de peças faturado depois por outro caminho (tela do PPV / direto no Omie): conclui agora
    if (!ehConcluidaOuCancelada(os.Status) && os.faturado_por !== 'Omie (faturada direto lá)') {
      await concluirSeTudoFaturado(id, os.faturado_por || 'Sistema', 'pedido de peças faturado depois da OS');
    }
    if (!statusPendente(os.faturamento_status) && os.faturamento_status !== 'nfse_rejeitada') return 'em dia';
    const nCodOS = Number(os.omie_ncodos || 0) || (await resolverOSNoOmie(os)).nCodOS;
    return `nfse: ${await atualizarNfse(id, nCodOS)}`;
  }

  const tentouPeloPortal = os.faturamento_status === 'faturando' || os.faturamento_status === 'desconhecido';
  if (tentouPeloPortal && !opts.forcar && travaAtiva(os.faturando_desde) && os.faturamento_status === 'faturando') return 'faturamento em andamento';

  let r: { nCodOS: number; dados: OSConsultada };
  try { r = await resolverOSNoOmie(os); } catch (e) { return `não achei no Omie: ${e instanceof Error ? e.message : e}`; }
  const est = estadoNoOmie(r.dados.Cabecalho, r.dados.InfoCadastro);

  if (est === 'faturada') {
    if (tentouPeloPortal) {
      // o FaturarOS do portal passou (resposta perdida): conclui como faturamento do portal
      const pend = (Array.isArray(os.faturamento_pecas) ? os.faturamento_pecas : []).filter((p) => !p.ok).map((p) => p.id);
      await posFaturamento(id, {
        userName: os.faturado_por || 'Sistema', userId: '', nCodOS: r.nCodOS,
        forma: normalizarPagamento(os.forma_pagamento), ppvIds: pend, respostaCrua: 'confirmado pela reconciliação', porFora: false,
      });
      return 'faturada (confirmada)';
    }
    await posFaturamento(id, { userName: 'Sistema', userId: '', nCodOS: r.nCodOS, forma: null, ppvIds: [], respostaCrua: '', porFora: true, dataFaturamentoOmie: r.dados.InfoCadastro?.dDtFat });
    return 'faturada direto no Omie (carimbada)';
  }
  if (tentouPeloPortal) {
    if (est === 'faturando') {
      await gravarOS(id, { faturamento_status: 'desconhecido', faturamento_erro: 'A OS está na etapa de faturamento no Omie, sem nota concluída. Confira no Omie.' });
      return 'etapa 50 no Omie';
    }
    // O Omie pode levar alguns segundos para mostrar a OS faturada: enquanto a
    // trava (10 min) vale, continua "desconhecido" — liberar cedo abriria a porta
    // para um 2º faturamento.
    if (travaAtiva(os.faturando_desde)) return 'aguardando o Omie (trava ativa)';
    // trava vencida e o Omie não registrou nada: libera para tentar de novo
    await gravarOS(id, { faturando_desde: null, faturamento_status: 'erro', faturamento_pecas: null, faturamento_erro: 'O Omie não registrou o faturamento. Pode tentar de novo.' });
    return 'não faturada (liberada)';
  }
  return 'aberta';
}

/**
 * Fatura SÓ os pedidos de peças da OS (NF-e) — antes da OS (escolheu "só o
 * pedido") ou depois (pedido que falhou/ficou para depois). Quando a OS e todos
 * os pedidos ficam faturados, a OS vai para Concluída.
 */
/** A forma de pagamento escolhida vale para a OS E para o pedido de peças (José, 14/10/2026):
 *  grava no pedido do Omie as parcelas da mesma forma, sobre o total do pedido. */
async function aplicarFormaNoPedido(pid: string, forma: string | null): Promise<string | null> {
  if (!forma) return null;
  const { resolverContaDoPedido, omieNaConta } = await import('@/lib/ppv/omie');
  const achado = await resolverContaDoPedido(pid).catch(() => null);
  if (!achado) return 'pedido não encontrado no Omie';
  const ped = achado.pedido as { cabecalho?: { codigo_pedido?: number }; total_pedido?: { valor_total_pedido?: number } };
  const total = Number(ped.total_pedido?.valor_total_pedido || 0);
  const plano = parcelasDoPagamento(forma, total, hojeSaoPaulo());
  if (!plano || !ped.cabecalho?.codigo_pedido) return null;
  const aVista = plano.parcelas.length === 1 && plano.parcelas[0].nDias === 0;
  try {
    await omieNaConta(achado.acc, '/produtos/pedido/', 'AlterarPedidoVenda', {
      cabecalho: { codigo_pedido: ped.cabecalho.codigo_pedido, codigo_parcela: aVista ? '000' : '999', qtde_parcelas: plano.parcelas.length },
      ...(aVista ? {} : { lista_parcelas: { parcela: plano.parcelas.map((p) => ({ numero_parcela: p.nParcela, data_vencimento: p.dDtVenc, quantidade_dias: p.nDias, percentual: p.nPercentual, valor: p.nValor })) } }),
    });
    return null;
  } catch (e) { return `não gravou as parcelas (${e instanceof Error ? e.message : e})`; }
}

export async function faturarPecasPendentes(id: string, ppvIds: string[], auth: Autenticado, forma: string | null = null): Promise<{ ok: boolean; mensagem?: string; pecas?: PecaFaturada[]; concluida?: boolean }> {
  if (!podeFaturarPPV(auth)) return { ok: false, mensagem: 'Você não tem permissão para faturar pedidos de peças (PPV).' };
  const os = await lerOS(id);
  if (!os) return { ok: false, mensagem: 'OS não encontrada.' };
  const atuais: PecaFaturada[] = Array.isArray(os.faturamento_pecas) ? os.faturamento_pecas : [];
  const { faturarPPVNoOmie } = await import('@/lib/ppv/omie');
  const todos = await ppvsDaOS(os);
  for (const pid of ppvIds) {
    const p = todos.find((x) => x.id === pid);
    if (!p) return { ok: false, mensagem: `O pedido ${pid} não é desta OS.` };
    const fora = motivoPPVFora(p);
    if (fora && fora !== 'já faturado') return { ok: false, mensagem: `O pedido ${pid} não pode ser faturado (${fora}).` };
  }
  for (const pid of ppvIds) {
    let res: PecaFaturada;
    try {
      const falhaParc = await aplicarFormaNoPedido(pid, normalizarPagamento(forma));
      if (falhaParc) throw new Error(`forma de pagamento: ${falhaParc} — o pedido não foi faturado`);
      const r = await faturarPPVNoOmie(pid);
      res = { id: pid, pedidoOmie: r.numeroPedido, ok: !!r.sucesso || !!r.jaFaturado, erro: r.sucesso || r.jaFaturado ? null : (r.erro || 'falhou'), nf: r.nfNumero || null };
    } catch (e) { res = { id: pid, ok: false, erro: e instanceof Error ? e.message : String(e) }; }
    const i = atuais.findIndex((p) => p.id === pid);
    if (i >= 0) atuais[i] = res; else atuais.push(res);
  }
  await gravarOS(id, { faturamento_pecas: atuais });
  const userName = auth.email || 'Sistema';
  await logOS(id, `Pedido(s) de peças faturado(s) pela OS: ${ppvIds.join(', ')}`, userName, String(os.Status || ''));
  // resultado de cada pedido no sino de quem faturou (a NF-e de peças sai na hora)
  for (const r of atuais.filter((x) => ppvIds.includes(x.id))) {
    await notificarQuemFaturou(userName, r.ok ? `NF-e das peças ${r.pedidoOmie ? `(PV ${r.pedidoOmie}) ` : ''}emitida` : `NF-e das peças ${r.id} NÃO saiu`,
      r.ok ? `${r.nf ? `NF-e nº ${r.nf}. ` : ''}OS ${id}.` : `${r.erro || 'Falhou no Omie.'} OS ${id}.`, `/pos?id=${id}`);
  }
  const concluida = await concluirSeTudoFaturado(id, userName, 'OS e pedidos de peças faturados');
  return { ok: true, pecas: atuais, concluida };
}

/** Agendador interno (instrumentation.ts): reconcilia as OS com faturamento pendente. */
export async function rodarReconciliacaoFaturamento(): Promise<string> {
  // NFS-e "aguardando" só nos últimos 7 dias — depois disso fica pro "Conferir" manual
  const seteDias = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await supabase.from(TBL_OS)
    .select('Id_Ordem')
    .or(`faturamento_status.in.(faturando,desconhecido),and(faturamento_status.eq.nfse_aguardando,faturado_omie_em.gte.${seteDias})`)
    .limit(30);
  if (ehColunaFaltando(error)) return '';
  if (error || !data?.length) return '';
  const out: string[] = [];
  for (const row of data) {
    try { out.push(`${row.Id_Ordem}: ${await reconciliarFaturamentoOS(String(row.Id_Ordem))}`); }
    catch (e) { out.push(`${row.Id_Ordem}: erro ${e instanceof Error ? e.message : e}`); }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return out.join(' · ');
}

/** Webhook do Omie (OS da conta Nova faturada): acha a OS do portal e reconcilia. */
export async function reconciliarPorCodOS(nCodOS: number, cNumOS: string): Promise<void> {
  const chave = chaveNum(cNumOS);
  const filtros = [`omie_ncodos.eq.${Number(nCodOS) || 0}`];
  if (cNumOS) filtros.push(`Ordem_Omie.eq.${cNumOS}`);
  if (chave && chave !== cNumOS) filtros.push(`Ordem_Omie.eq.${chave}`);
  const { data, error } = await supabase.from(TBL_OS).select('Id_Ordem').or(filtros.join(',')).limit(3);
  if (error || !data?.length) return;
  for (const row of data) {
    // a conferência de identidade dentro da reconciliação descarta OS homônima
    try { await reconciliarFaturamentoOS(String(row.Id_Ordem)); } catch { /* agendador tenta de novo */ }
  }
}
