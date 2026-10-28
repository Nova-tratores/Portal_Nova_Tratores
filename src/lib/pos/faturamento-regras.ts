// Faturar a OS (NFS-e) pelo portal — regras PURAS (sem banco, sem Omie).
// Client-safe: a janela de faturar usa os rótulos e o bloqueio daqui.
// Plano completo: docs/pos-faturar-os-plano.md

export type StatusFaturamento =
  | 'faturando' | 'desconhecido' | 'erro'
  | 'nfse_aguardando' | 'nfse_autorizada' | 'nfse_rejeitada' | 'nfse_cancelada'
  /** OS interna: faturada com RECIBO no Omie (sem NFS-e, sem conta a receber) */
  | 'recibo_emitido'
  /** o portal carimbou "faturada", mas o Omie seguiu com a OS aberta — desfeito */
  | 'omie_nao_faturou';

/** A trava de faturamento vale 10 min (lease) — depois disso a reconciliação decide. */
export const TRAVA_MINUTOS = 10;

/** Nº de OS/NF só com dígitos e sem zeros à esquerda ("000777" → "777"). */
export function chaveNum(s: unknown): string {
  return String(s ?? '').replace(/\D/g, '').replace(/^0+/, '');
}

export interface CabecalhoOmie {
  nCodOS?: number;
  cNumOS?: string;
  cCodIntOS?: string;
  cEtapa?: string;
  nValorTotal?: number;
  nValorTotalImpRet?: number; // impostos retidos (ISS/IR/… retidos pelo cliente)
}
export interface InfoCadastroOmie { cFaturada?: string; cCancelada?: string; dDtFat?: string }

/**
 * A OS achada no Omie é MESMO a desta OS do portal? O envio reaproveita o
 * cCodIntOS "<Id_Ordem>-<timestamp>" quando o código já existia — consultar
 * pelo Id_Ordem pode achar a OS antiga. Exige o mesmo nº visível (cNumOS) e
 * o código de integração no padrão. null = confere.
 */
export function conferirIdentidade(
  os: { idOrdem: string; ordemOmie: string; ccodintGravado?: string | null },
  cab: CabecalhoOmie | null | undefined,
): string | null {
  if (!cab?.nCodOS) return 'OS não encontrada no Omie.';
  const numPortal = chaveNum(os.ordemOmie);
  const numOmie = chaveNum(cab.cNumOS);
  if (!numPortal) return 'A OS não tem o nº do Omie gravado no portal.';
  if (numPortal !== numOmie) {
    return `A OS achada no Omie é a nº ${numOmie || '?'}, mas o portal registra a nº ${numPortal}. Nada foi feito — avise o suporte do portal.`;
  }
  const cod = String(cab.cCodIntOS || '');
  if (os.ccodintGravado) {
    if (cod !== os.ccodintGravado) return `O código de integração da OS no Omie (${cod || 'vazio'}) não confere com o gravado (${os.ccodintGravado}).`;
  } else if (cod) {
    const esc = os.idOrdem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`^${esc}(-\\d+)?$`).test(cod)) {
      return `O código de integração da OS no Omie (${cod}) não é desta OS (${os.idOrdem}).`;
    }
  }
  return null;
}

export type EstadoOmie = 'aberta' | 'faturando' | 'faturada' | 'cancelada';

/** Estado da OS no Omie: etapa 50 = faturando; 60 ou cFaturada = faturada. */
export function estadoNoOmie(cab: CabecalhoOmie | null | undefined, info: InfoCadastroOmie | null | undefined): EstadoOmie {
  if (info?.cCancelada === 'S') return 'cancelada';
  const etapa = Number(cab?.cEtapa || 0);
  if (info?.cFaturada === 'S' || etapa >= 60) return 'faturada';
  if (etapa >= 50) return 'faturando';
  return 'aberta';
}

export function travaAtiva(faturandoDesde: string | null | undefined, agora: Date = new Date()): boolean {
  if (!faturandoDesde) return false;
  const t = new Date(faturandoDesde).getTime();
  return Number.isFinite(t) && agora.getTime() - t < TRAVA_MINUTOS * 60_000;
}

export interface OSParaFaturar {
  idOrdem: string;
  ordemOmie: string;
  status: string;
  servicoInterno: boolean;
  ehGarantia: boolean;
  /** garantia ainda sem montadora escolhida em /garantias (o contrato no Omie depende dela) */
  garantiaSemMontadora?: boolean;
  faturadoEm: string | null;
  faturamentoStatus: string | null;
  faturandoDesde: string | null;
}

/** Motivo pelo qual NÃO dá pra faturar agora; null = pode. */
export function bloqueioFaturar(os: OSParaFaturar, agora: Date = new Date()): string | null {
  if (!os.ordemOmie) return 'A OS ainda não foi enviada ao Omie.';
  if (os.faturadoEm) return 'Esta OS já foi faturada.';
  if (/cancel/i.test(os.status)) return 'OS cancelada não é faturada.';
  // Garantia fatura sim (José, 13/10/2026) — mas só com a montadora escolhida:
  // a OS vai ao Omie com os códigos de garantia e o contrato da montadora.
  if (os.ehGarantia && os.garantiaSemMontadora) return 'OS de garantia: escolha a montadora em Garantias antes de faturar (a nota sai no contrato dela).';
  if (os.faturamentoStatus === 'desconhecido') {
    return 'O último faturamento não teve resposta clara do Omie. Clique em "Conferir no Omie" antes de tentar de novo.';
  }
  if (travaAtiva(os.faturandoDesde, agora)) return 'Já existe um faturamento desta OS em andamento.';
  return null;
}

/** Diferença acima de 1 centavo entre o valor visto na janela e o do Omie. */
export function valorMudou(a: number, b: number): boolean {
  return Math.abs(Math.round(a * 100) - Math.round(b * 100)) > 1;
}

/** Valor que o cliente paga = total − impostos retidos (base das parcelas). */
export function valorLiquido(cab: CabecalhoOmie | null | undefined): number {
  const total = Number(cab?.nValorTotal || 0);
  const ret = Number(cab?.nValorTotalImpRet || 0);
  return Math.round((total - (ret > 0 ? ret : 0)) * 100) / 100;
}

// ---------------- NFS-e (StatusOS.ListaRpsNfse) ----------------
// cStatusRps / cStatusLote: 001 aguardando envio · 002 enviado, aguardando ·
// 003 processado com ERRO · 004 sucesso · 005 cancelado.
export interface RpsNfse {
  cStatusRps?: string;
  cStatusLote?: string;
  nNfse?: string;
  mensagens?: unknown;
}

function textoMensagens(m: unknown): string | null {
  if (!m) return null;
  const itens = Array.isArray(m) ? m : [m];
  const partes = itens.flatMap((x) => {
    if (x == null) return [];
    if (typeof x === 'string') return [x];
    if (typeof x === 'object') return Object.values(x as Record<string, unknown>).filter((v) => typeof v === 'string' && v.trim()) as string[];
    return [String(x)];
  });
  const t = partes.join(' · ').trim();
  return t ? t.slice(0, 500) : null;
}

export function situacaoNfse(lista: RpsNfse[] | null | undefined): { status: StatusFaturamento; numero: string | null; mensagem: string | null } {
  const rps = Array.isArray(lista) && lista.length ? lista[lista.length - 1] : null;
  if (!rps) return { status: 'nfse_aguardando', numero: null, mensagem: null };
  const st = String(rps.cStatusRps || rps.cStatusLote || '');
  const numero = chaveNum(rps.nNfse) || null;
  if (st === '005') return { status: 'nfse_cancelada', numero, mensagem: textoMensagens(rps.mensagens) };
  if (st === '003') return { status: 'nfse_rejeitada', numero: null, mensagem: textoMensagens(rps.mensagens) || 'A prefeitura recusou a nota.' };
  if (st === '004' || numero) return { status: 'nfse_autorizada', numero, mensagem: null };
  return { status: 'nfse_aguardando', numero: null, mensagem: null };
}

/**
 * "Faturada" no portal, mas a OS segue ABERTA no Omie (sem nota) depois de um
 * tempo: o FaturarOS disse "sucesso" e não fez (OS-0822, 16/10/2026). Só vale
 * para faturamento feito PELO PORTAL e ainda sem NFS-e; dá 10 min ao Omie.
 */
export function faturamentoFantasma(os: {
  faturadoEm: string | null; faturadoPor: string | null; status: string | null; nfseNumero: string | null;
}, estadoOmie: EstadoOmie, agora: Date = new Date()): boolean {
  if (!os.faturadoEm || os.nfseNumero) return false;
  if (os.faturadoPor === 'Omie (faturada direto lá)') return false;
  if (os.status !== 'nfse_aguardando' && os.status !== 'nfse_rejeitada') return false;
  if (estadoOmie !== 'aberta') return false;
  const t = new Date(os.faturadoEm).getTime();
  return Number.isFinite(t) && agora.getTime() - t >= TRAVA_MINUTOS * 60_000;
}

/** Status ainda em aberto (a reconciliação volta a olhar). */
export function statusPendente(st: string | null | undefined): boolean {
  return st === 'faturando' || st === 'desconhecido' || st === 'nfse_aguardando';
}

export function rotuloStatus(st: string | null | undefined): { texto: string; cor: 'cinza' | 'verde' | 'vermelho' | 'ambar' } | null {
  switch (st) {
    case 'faturando': return { texto: 'Faturando…', cor: 'ambar' };
    case 'desconhecido': return { texto: 'Aguardando o Omie confirmar', cor: 'ambar' };
    case 'erro': return { texto: 'Erro no último faturamento', cor: 'vermelho' };
    case 'nfse_aguardando': return { texto: 'NFS-e aguardando a prefeitura', cor: 'cinza' };
    case 'nfse_autorizada': return { texto: 'NFS-e emitida', cor: 'verde' };
    case 'nfse_rejeitada': return { texto: 'NFS-e rejeitada', cor: 'vermelho' };
    case 'nfse_cancelada': return { texto: 'NFS-e cancelada no Omie', cor: 'vermelho' };
    case 'recibo_emitido': return { texto: 'Faturada com recibo (interna)', cor: 'verde' };
    case 'omie_nao_faturou': return { texto: 'O Omie não faturou — confira e fature de novo', cor: 'vermelho' };
    default: return null;
  }
}

// ---------------- PPVs da OS ----------------
export interface PPVDaOS {
  id: string;
  pedidoOmie: string;
  tipo: string;        // Pedido | Remessa
  status: string;
  empresa: string;
  faturadoEm: string | null;
  valor: number;
}

/** O PPV pode ser faturado junto? null = pode; senão o motivo. */
export function motivoPPVFora(p: PPVDaOS): string | null {
  if (/cancel/i.test(p.status)) return 'cancelado';
  if (p.faturadoEm) return 'já faturado';
  if (!p.pedidoOmie) return 'ainda não enviado ao Omie';
  if (/remessa/i.test(p.tipo)) return 'remessa não é faturada';
  return null;
}
