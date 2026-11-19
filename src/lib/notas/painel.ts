// Painel de notas + Central de erros da Omie (/financeiro/notas, abas Problemas e Envios ao Omie).
// Regras PURAS: cada fonte do banco vira uma `LinhaPainel` igual. Sem banco, sem Omie.
// Plano: docs/painel-notas-e-erros-omie.md

export type Empresa = 'NOVA' | 'CASTRO' | '';

export type Situacao =
  | 'rejeitada'      // a prefeitura/SEFAZ/Omie recusou
  | 'presa'          // mandada, mas a nota não voltou faz tempo
  | 'incerta'        // a Omie não respondeu com certeza (pode ter faturado)
  | 'falhou'         // a gravação na Omie falhou
  | 'sem_documento'  // nota existe, mas a Omie não devolveu PDF/XML
  | 'robo'           // robô (sync) com erro
  | 'resolvida';     // falhou, mas depois deu certo (só na aba Envios)

export interface LinhaPainel {
  id: string;
  origem: string;        // rótulo curto da fonte: "NFS-e da OS", "PPV", "Devolução em garantia"...
  empresa: Empresa;
  tipo: string;          // "NFS-e", "NF-e", "Remessa", "Conta a pagar", "Robô"...
  documento: string;     // nº do caso no portal: OS-0704, PPV-0542, NF 840225...
  cliente: string;
  valor: number | null;
  situacao: Situacao;
  motivo: string;
  quem: string;
  quando: string;        // ISO
  link: string | null;
}

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  rejeitada: 'Rejeitada',
  presa: 'Nota não voltou',
  incerta: 'Resposta incerta',
  falhou: 'Falhou',
  sem_documento: 'Sem PDF/XML',
  robo: 'Robô com erro',
  resolvida: 'Resolvida depois',
};

// ── utilidades ────────────────────────────────────────────────────────────

export function empresaDe(v: unknown): Empresa {
  const s = String(v ?? '').trim().toUpperCase();
  if (s.startsWith('NOVA')) return 'NOVA';
  if (s.startsWith('CASTRO')) return 'CASTRO';
  return '';
}

export function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  // "1.234,56" (BR) ou "1234.56" (US)
  const n = /,\d{1,2}$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return Number.isFinite(n) ? n : null;
}

const semZeros = (v: unknown) => String(v ?? '').trim().replace(/^0+(?=\d)/, '');

/** "há 3 h", "há 2 dias" — para a coluna "desde". */
export function haQuanto(iso: string | null | undefined, agora: Date = new Date()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.round((agora.getTime() - t) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

/** O log da prefeitura que a Omie devolve vem como uma linha só, partes separadas por " · ":
 *  "S · 0240 · E0240 : O CEP informado ... · ERRO · Integração · 11/09/2026 · 15:18:07 · S · Envio do RPS ...".
 *  Devolve só as mensagens marcadas como ERRO (o que a pessoa precisa corrigir). */
export function motivoDoLogPrefeitura(texto: string | null | undefined): string {
  const s = String(texto ?? '').trim();
  if (!s) return '';
  const partes = s.split(/\s+·\s+/);
  const erros: string[] = [];
  partes.forEach((p, i) => {
    if (/^ERRO$/i.test(p.trim()) && i > 0) {
      const msg = partes[i - 1].trim();
      if (msg && !erros.includes(msg)) erros.push(msg.replace(/\s*:\s*/, ': '));
    }
  });
  if (erros.length) return erros.join(' | ');
  return s.length > 300 ? `${s.slice(0, 300)}…` : s;
}

// ── links para abrir o caso ───────────────────────────────────────────────

export function linkDoCaso(tipo: string, ref: Record<string, unknown> = {}): string | null {
  const v = (k: string) => (ref[k] === null || ref[k] === undefined || ref[k] === '' ? null : String(ref[k]));
  switch (tipo) {
    case 'os': return v('id') ? `/pos?id=${encodeURIComponent(v('id')!)}` : null;
    case 'ppv': return v('id') ? `/ppv?id=${encodeURIComponent(v('id')!)}` : null;
    case 'remessa': return v('conta') && v('id') ? `/remessas?ficha=${encodeURIComponent(`${v('conta')!.toLowerCase()}-${v('id')}`)}` : '/remessas';
    case 'garantia': return v('id') ? `/garantias?id=${encodeURIComponent(v('id')!)}` : null;
    case 'recebimento': return v('nota') ? `/estoque/recebimentos?conta=${encodeURIComponent((v('conta') || '').toLowerCase())}&nota=${encodeURIComponent(v('nota')!)}` : '/estoque/recebimentos';
    case 'pedido_maquina': return v('id') ? `/pedidos-maquinas?pvm=${encodeURIComponent(v('id')!)}` : '/pedidos-maquinas';
    case 'conta_pagar': return '/financeiro/caixa/lancar-conta' + (v('id') ? `?id=${encodeURIComponent(v('id')!)}` : '');
    case 'robo': return '/agendamentos';
    case 'notas_sem_doc': return '/financeiro/notas';
    default: return null;
  }
}

// ── OS (NFS-e faturada pelo portal ou direto na Omie) ─────────────────────

export interface OSRow {
  Id_Ordem: string;
  Os_Cliente?: string | null;
  Valor_Total?: unknown;
  faturamento_status?: string | null;
  faturamento_erro?: string | null;
  faturado_por?: string | null;
  faturado_omie_em?: string | null;
  faturando_desde?: string | null;
}

export const STATUS_OS_PROBLEMA = ['nfse_rejeitada', 'nfse_aguardando', 'desconhecido', 'erro', 'faturando', 'omie_nao_faturou'] as const;
export const MIN_PRESA_NFSE = 30;
export const MIN_TRAVA_FATURANDO = 10;

/** OS que precisa de atenção, ou null se ainda está dentro do tempo normal. */
export function daOS(os: OSRow, agora: Date = new Date()): LinhaPainel | null {
  const st = String(os.faturamento_status || '');
  const desde = os.faturado_omie_em || os.faturando_desde || null;
  const minutos = desde ? (agora.getTime() - new Date(desde).getTime()) / 60000 : Infinity;
  let situacao: Situacao;
  let motivo: string;
  switch (st) {
    case 'nfse_rejeitada':
      situacao = 'rejeitada'; motivo = motivoDoLogPrefeitura(os.faturamento_erro) || 'A prefeitura rejeitou a NFS-e.'; break;
    case 'nfse_aguardando':
      if (minutos < MIN_PRESA_NFSE) return null;
      situacao = 'presa'; motivo = 'A OS foi faturada, mas a NFS-e ainda não voltou da prefeitura.'; break;
    case 'desconhecido':
      situacao = 'incerta'; motivo = os.faturamento_erro || 'A Omie não respondeu com certeza se faturou.'; break;
    case 'erro':
      situacao = 'falhou'; motivo = os.faturamento_erro || 'O faturamento falhou.'; break;
    case 'omie_nao_faturou':
      situacao = 'falhou'; motivo = os.faturamento_erro || 'A Omie aceitou o pedido, mas não faturou a OS.'; break;
    case 'faturando':
      if (minutos < MIN_TRAVA_FATURANDO) return null;
      situacao = 'presa'; motivo = 'Faturamento começou e não terminou (trava presa).'; break;
    default:
      return null;
  }
  return {
    id: `os:${os.Id_Ordem}`,
    origem: 'NFS-e da OS',
    empresa: 'NOVA', // o POS fatura só na Nova
    tipo: 'NFS-e',
    documento: os.Id_Ordem,
    cliente: String(os.Os_Cliente || ''),
    valor: numero(os.Valor_Total),
    situacao, motivo,
    quem: String(os.faturado_por || ''),
    quando: desde || '',
    link: linkDoCaso('os', { id: os.Id_Ordem }),
  };
}

// ── remessas (módulo /remessas) e devolução em garantia ───────────────────

export interface EmissaoRow {
  id: string;
  conta_omie?: string | null;
  tipo?: string | null;
  status?: string | null;
  erro?: string | null;
  nf_numero?: string | null;
  cliente?: string | null;
  fornecedor?: string | null;
  valor_total?: unknown;
  user_nome?: string | null;
  criado_em?: string | null;
  atualizado_em?: string | null;
  id_remessa_ref?: unknown;
  n_cod?: unknown;
  garantia_id?: unknown;
  id_receb?: unknown;
  numero_nfe?: string | null;
}

/** criada (na Omie) e não faturada depois de 30 min, faturada sem NF, ou falhou. */
function situacaoEmissao(r: EmissaoRow, agora: Date): { situacao: Situacao; motivo: string } | null {
  const st = String(r.status || '');
  const quando = r.atualizado_em || r.criado_em;
  const min = quando ? (agora.getTime() - new Date(quando).getTime()) / 60000 : Infinity;
  if (st === 'falhou') return { situacao: 'falhou', motivo: r.erro || 'A Omie recusou.' };
  if (st === 'criando' && min >= MIN_TRAVA_FATURANDO) return { situacao: 'incerta', motivo: 'Começou a criar na Omie e não terminou. Confira na Omie antes de tentar de novo.' };
  if (st === 'criada' && min >= MIN_PRESA_NFSE) return { situacao: 'presa', motivo: r.erro || 'Criada na Omie, mas ainda não faturada (sem NF-e).' };
  if (st === 'faturada' && !r.nf_numero && min >= MIN_PRESA_NFSE) return { situacao: 'presa', motivo: 'Faturada, mas a NF-e não voltou.' };
  return null;
}

export function daRemessa(r: EmissaoRow, agora: Date = new Date()): LinhaPainel | null {
  const s = situacaoEmissao(r, agora);
  if (!s) return null;
  const empresa = empresaDe(r.conta_omie);
  const idRem = r.n_cod || r.id_remessa_ref;
  return {
    id: `remessa:${r.id}`,
    origem: r.tipo === 'retorno' ? 'Volta de demonstração' : 'Remessa de demonstração',
    empresa,
    tipo: r.tipo === 'retorno' ? 'NF-e de entrada' : 'Remessa',
    documento: r.nf_numero ? `NF ${semZeros(r.nf_numero)}` : 'sem NF',
    cliente: String(r.cliente || ''),
    valor: numero(r.valor_total),
    ...s,
    quem: String(r.user_nome || ''),
    quando: r.atualizado_em || r.criado_em || '',
    link: linkDoCaso('remessa', { conta: empresa, id: idRem }),
  };
}

export function doRetornoGarantia(r: EmissaoRow, agora: Date = new Date()): LinhaPainel | null {
  const s = situacaoEmissao(r, agora);
  if (!s) return null;
  const empresa = empresaDe(r.conta_omie);
  return {
    id: `retorno:${r.id}`,
    origem: 'Devolução em garantia',
    empresa,
    tipo: 'Remessa',
    documento: r.numero_nfe ? `NF ${semZeros(r.numero_nfe)}` : '',
    cliente: String(r.fornecedor || ''),
    valor: numero(r.valor_total),
    ...s,
    quem: String(r.user_nome || ''),
    quando: r.atualizado_em || r.criado_em || '',
    link: r.garantia_id ? linkDoCaso('garantia', { id: r.garantia_id }) : linkDoCaso('recebimento', { conta: empresa, nota: r.id_receb }),
  };
}

// ── reversão de recebimento com pagamento ─────────────────────────────────

export interface ReversaoRow {
  id: string | number;
  conta_omie?: string | null;
  id_receb?: unknown;
  numero_nfe?: string | null;
  fornecedor?: string | null;
  valor_nfe?: unknown;
  status?: string | null;
  erro?: string | null;
  user_nome?: string | null;
  criado_em?: string | null;
  atualizado_em?: string | null;
}

export function daReversao(r: ReversaoRow, agora: Date = new Date()): LinhaPainel | null {
  const st = String(r.status || '');
  const quando = r.atualizado_em || r.criado_em || '';
  const min = quando ? (agora.getTime() - new Date(quando).getTime()) / 60000 : Infinity;
  let situacao: Situacao; let motivo: string;
  if (st === 'falhou') { situacao = 'falhou'; motivo = r.erro || 'A reversão falhou.'; }
  else if (st === 'parcial') { situacao = 'falhou'; motivo = r.erro || 'Parte dos pagamentos não foi relançada.'; }
  else if (st === 'revertendo' && min >= MIN_TRAVA_FATURANDO) { situacao = 'incerta'; motivo = 'A reversão começou e não terminou. Confira na Omie.'; }
  else if (st === 'aguardando_relancamento') { situacao = 'presa'; motivo = 'Nota revertida com pagamentos guardados: dê a entrada de novo e relance os pagamentos.'; }
  else return null;
  const empresa = empresaDe(r.conta_omie);
  return {
    id: `reversao:${r.id}`,
    origem: 'Reversão de recebimento',
    empresa,
    tipo: 'Recebimento',
    documento: r.numero_nfe ? `NF ${semZeros(r.numero_nfe)}` : '',
    cliente: String(r.fornecedor || ''),
    valor: numero(r.valor_nfe),
    situacao, motivo,
    quem: String(r.user_nome || ''),
    quando,
    link: linkDoCaso('recebimento', { conta: empresa, nota: r.id_receb }),
  };
}

// ── notas sem PDF/XML (cache) — um item só, com a contagem ────────────────

export interface NotaSemDocRow { conta_omie?: string | null; tipo?: string | null; numero?: string | null; ultimo_erro?: string | null; tentativas?: number | null; atualizado_em?: string | null }

export function daNotaSemDoc(notas: NotaSemDocRow[], empresa: Empresa): LinhaPainel | null {
  const lista = notas.filter((n) => !empresa || empresaDe(n.conta_omie) === empresa);
  if (!lista.length) return null;
  const ultima = lista.map((n) => n.atualizado_em || '').sort().pop() || '';
  const exemplos = lista.slice(0, 5).map((n) => semZeros(n.numero)).filter(Boolean).join(', ');
  return {
    id: `semdoc:${empresa || 'todas'}`,
    origem: 'Arquivo das notas',
    empresa,
    tipo: 'PDF/XML',
    documento: `${lista.length} nota(s)`,
    cliente: '',
    valor: null,
    situacao: 'sem_documento',
    motivo: `A Omie não devolveu o PDF/XML depois de várias tentativas${exemplos ? ` (ex.: NF ${exemplos})` : ''}.`,
    quem: 'Robô das notas',
    quando: ultima,
    link: linkDoCaso('notas_sem_doc'),
  };
}

// ── audit_log: falhas de pessoas ao gravar na Omie ────────────────────────

export interface AuditRow {
  id: string | number;
  user_nome?: string | null;
  sistema?: string | null;
  acao?: string | null;
  entidade?: string | null;
  entidade_id?: string | null;
  entidade_label?: string | null;
  detalhes?: Record<string, unknown> | null;
  created_at?: string | null;
}

/** Ações do audit_log que são falha de gravação na Omie. `erro_envio` (e-mail do boleto) NÃO é Omie. */
export function ehFalhaOmie(sistema: string, acao: string): boolean {
  if (!acao) return false;
  if (acao === 'erro_envio') return false;
  if (sistema === 'localizacao' && acao === 'erro_gravar') return true;
  return /(_erro|_falhou|_recusado|_desconhecido)$/.test(acao) || acao === 'erro_envio_omie';
}

const ORIGEM_AUDIT: Record<string, { origem: string; tipo: string }> = {
  pos: { origem: 'Faturar OS', tipo: 'NFS-e' },
  ppv: { origem: 'Faturar PPV', tipo: 'NF-e' },
  'pedidos-maquinas': { origem: 'Pedido de máquinas', tipo: 'NF-e' },
  remessas: { origem: 'Remessas', tipo: 'Remessa' },
  recebimentos: { origem: 'Recebimentos', tipo: 'Recebimento' },
  financeiro: { origem: 'Conta a pagar', tipo: 'Financeiro' },
  localizacao: { origem: 'Localização da peça', tipo: 'Cadastro de produto' },
  clientes: { origem: 'Cadastro de cliente', tipo: 'Cadastro' },
};

function textoErro(d: Record<string, unknown> | null | undefined): string {
  if (!d) return '';
  const r = d.resultado as Record<string, unknown> | undefined;
  const e = d.erro ?? r?.erro ?? d.mensagem ?? d.motivo;
  return e === undefined || e === null ? '' : String(e);
}

export function daAuditoria(a: AuditRow): LinhaPainel | null {
  const sistema = String(a.sistema || '');
  const acao = String(a.acao || '');
  if (!ehFalhaOmie(sistema, acao)) return null;
  const d = (a.detalhes || {}) as Record<string, unknown>;
  const base = ORIGEM_AUDIT[sistema] || { origem: sistema || 'Portal', tipo: '' };
  const eid = String(a.entidade_id || '');
  let origem = base.origem;
  let tipo = base.tipo;
  let link: string | null = null;
  let documento = eid;
  let empresa = empresaDe(d.empresa ?? d.conta ?? (eid.includes(':') ? eid.split(':')[0] : eid.split('-')[0]));

  if (sistema === 'pos') { link = linkDoCaso('os', { id: eid }); empresa = 'NOVA'; }
  else if (sistema === 'ppv') link = linkDoCaso('ppv', { id: eid });
  else if (sistema === 'pedidos-maquinas') { link = linkDoCaso('pedido_maquina', { id: eid }); documento = eid ? `Pedido ${eid}` : ''; }
  else if (sistema === 'remessas') { const [c, ...resto] = eid.split('-'); link = linkDoCaso('remessa', { conta: c, id: resto.join('-') }); documento = resto.join('-') || eid; }
  else if (acao === 'devolucao_garantia_falhou') { origem = 'Devolução em garantia'; tipo = 'Remessa'; link = linkDoCaso('recebimento', { conta: empresa, nota: eid }); documento = `Recebimento ${eid}`; }
  else if (acao === 'reverter_recebimento_recusado') { origem = 'Reversão de recebimento'; link = linkDoCaso('recebimento', { conta: empresa, nota: eid }); documento = `Recebimento ${eid}`; }
  else if (sistema === 'financeiro') { link = linkDoCaso('conta_pagar', { id: eid }); documento = `Conta #${eid}`; }
  else if (sistema === 'localizacao') { documento = eid.split(':')[1] || eid; }

  const incerta = /_desconhecido$/.test(acao);
  // o rótulo do audit às vezes é só o nº do caso ("OS OS-0908") ou o nome da ação — aí não é cliente
  let cliente = String(a.entidade_label || '').replace(/^(Pagar #\d+ - |NF #\d+ - |OS |PPV )/, '').trim();
  if (!cliente || cliente === documento || cliente === eid || cliente === origem) cliente = '';
  return {
    id: `audit:${a.id}`,
    origem, empresa, tipo, documento,
    cliente,
    valor: numero(d.valor ?? d.valorTotal),
    situacao: incerta ? 'incerta' : 'falhou',
    motivo: textoErro(d) || (incerta ? 'A Omie não respondeu com certeza.' : 'Falhou (sem mensagem).'),
    quem: String(a.user_nome || ''),
    quando: a.created_at || '',
    link,
  };
}

// ── robôs (cron_runs) ─────────────────────────────────────────────────────

export interface CronRow { id: string | number; job?: string | null; status?: string | null; detalhe?: string | null; iniciado_em?: string | null; quem?: string | null; disparado_por?: string | null }

export function doCron(r: CronRow): LinhaPainel | null {
  const st = String(r.status || '');
  if (!['erro', 'bloqueio', 'interrompida'].includes(st)) return null;
  const motivo = r.detalhe || (st === 'bloqueio' ? 'A Omie bloqueou as chamadas.' : st === 'interrompida' ? 'O servidor reiniciou no meio.' : 'Erro.');
  return {
    id: `cron:${r.id}`,
    origem: 'Robô',
    empresa: empresaDe(/castro/i.test(String(r.job)) ? 'CASTRO' : ''),
    tipo: st === 'interrompida' ? 'Interrompido' : st === 'bloqueio' ? 'Bloqueio da Omie' : 'Erro',
    documento: String(r.job || ''),
    cliente: '',
    valor: null,
    situacao: 'robo',
    motivo,
    quem: String(r.quem || r.disparado_por || 'agendador'),
    quando: r.iniciado_em || '',
    link: linkDoCaso('robo'),
  };
}

/** Robô que falha do mesmo jeito várias vezes vira UMA linha ("12 vezes · última …"). */
export function agruparRobos(linhas: LinhaPainel[]): LinhaPainel[] {
  const grupos = new Map<string, { l: LinhaPainel; n: number }>();
  for (const l of linhas) {
    const chave = `${l.documento}|${l.tipo}|${l.motivo.replace(/\d+/g, '#')}`;
    const g = grupos.get(chave);
    if (!g) grupos.set(chave, { l, n: 1 });
    else {
      g.n++;
      if (String(l.quando) > String(g.l.quando)) g.l = l;
    }
  }
  return [...grupos.values()].map(({ l, n }) => (n > 1 ? { ...l, motivo: `${l.motivo} (${n} vezes no período)` } : l));
}

// ── depois de falhar, deu certo? (aba Envios) ─────────────────────────────

/** Situação ATUAL do caso para marcar a falha antiga como "resolvida depois".
 *  `atual` = mapa id → texto curto do que o caso é hoje (ex.: "NFS-e 1234 autorizada"). */
export function marcarResolvidas(linhas: LinhaPainel[], atual: Map<string, string>): LinhaPainel[] {
  return linhas.map((l) => {
    const chave = l.id.startsWith('audit:') ? `${l.origem}|${l.documento}` : '';
    const hoje = chave ? atual.get(chave) : undefined;
    return hoje ? { ...l, situacao: 'resolvida' as const, motivo: `Hoje: ${hoje}. Na hora, ${l.situacao === 'incerta' ? 'a Omie não confirmou' : 'falhou'}.` } : l;
  });
}

export function chaveResolucao(origem: string, documento: string): string {
  return `${origem}|${documento}`;
}

/** Mais recente primeiro; filtro por empresa ('' = todas, mas linha sem empresa aparece sempre). */
export function ordenarEFiltrar(linhas: LinhaPainel[], empresa: Empresa): LinhaPainel[] {
  return linhas
    .filter((l) => !empresa || !l.empresa || l.empresa === empresa)
    .sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
}

export function contarPorSituacao(linhas: LinhaPainel[]): Record<Situacao, number> {
  const c = { rejeitada: 0, presa: 0, incerta: 0, falhou: 0, sem_documento: 0, robo: 0, resolvida: 0 } as Record<Situacao, number>;
  for (const l of linhas) c[l.situacao]++;
  return c;
}

// ── totais do dia e do mês (aba Notas) ────────────────────────────────────

export interface NotaTotalRow { data_emissao?: string | null; tipo?: string | null; categoria?: string | null; valor?: unknown; cancelada?: boolean | null }

export type GrupoTotal = 'nfse' | 'nfe_pecas' | 'nfe_maquinas' | 'nfe_outras' | 'entrada';

export const ROTULO_GRUPO: Record<GrupoTotal, string> = {
  nfse: 'NFS-e',
  nfe_pecas: 'NF-e peças',
  nfe_maquinas: 'NF-e máquinas',
  nfe_outras: 'NF-e outras',
  entrada: 'Entrada',
};

export function grupoDaNota(n: NotaTotalRow): GrupoTotal {
  const t = String(n.tipo || '');
  if (t === 'entrada') return 'entrada';
  if (t === 'saida_servico') return 'nfse';
  const c = String(n.categoria || '');
  if (c === 'nfe_pecas') return 'nfe_pecas';
  if (c === 'nfe_maquinas' || c === 'nfe_mista') return 'nfe_maquinas';
  return 'nfe_outras';
}

export interface Bloco { qtd: number; valor: number; canceladas: number }
export interface Totais { hoje: Record<GrupoTotal, Bloco>; mes: Record<GrupoTotal, Bloco>; dia: string; mesRef: string }

const vazio = (): Record<GrupoTotal, Bloco> => ({
  nfse: { qtd: 0, valor: 0, canceladas: 0 },
  nfe_pecas: { qtd: 0, valor: 0, canceladas: 0 },
  nfe_maquinas: { qtd: 0, valor: 0, canceladas: 0 },
  nfe_outras: { qtd: 0, valor: 0, canceladas: 0 },
  entrada: { qtd: 0, valor: 0, canceladas: 0 },
});

/** Dia de hoje em Brasília (YYYY-MM-DD). */
export function hojeBR(agora: Date = new Date()): string {
  return new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/** Notas do mês (data_emissao YYYY-MM-DD) → totais de hoje e do mês. Cancelada conta à parte, fora do valor. */
export function totaisDiaMes(notas: NotaTotalRow[], dia: string): Totais {
  const mesRef = dia.slice(0, 7);
  const t: Totais = { hoje: vazio(), mes: vazio(), dia, mesRef };
  for (const n of notas) {
    const d = String(n.data_emissao || '').slice(0, 10);
    if (d.slice(0, 7) !== mesRef) continue;
    const g = grupoDaNota(n);
    const alvos = d === dia ? [t.mes[g], t.hoje[g]] : [t.mes[g]];
    for (const b of alvos) {
      if (n.cancelada) { b.canceladas++; continue; }
      b.qtd++;
      b.valor += numero(n.valor) || 0;
    }
  }
  for (const k of Object.keys(t.mes) as GrupoTotal[]) {
    t.mes[k].valor = Math.round(t.mes[k].valor * 100) / 100;
    t.hoje[k].valor = Math.round(t.hoje[k].valor * 100) / 100;
  }
  return t;
}
