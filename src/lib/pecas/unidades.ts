// Rastreio de peças por unidade (QR na etiqueta) — tipos e constantes
// compartilhados entre client e server. A máquina de estados de verdade é
// validada no SERVIDOR (unidades-server.transicionar); aqui vive o mapa.

export type UnidadeStatus =
  | 'estoque'
  | 'retirada_pendente'
  | 'liberada'
  | 'aplicada'
  | 'devolucao_pendente'
  | 'cancelada'
  | 'extraviada';

export type DestinoTipo = 'os' | 'balcao' | 'uso_interno' | 'ppv';

export interface PecaUnidade {
  id: string;
  numero: string;
  lote_id: string;
  conta_omie: string;
  codigo: string;
  descricao: string;
  locacao: string;
  alt_conta_omie: string | null;
  alt_codigo: string | null;
  alt_descricao: string | null;
  alt_locacao: string | null;
  status: UnidadeStatus;
  destino_tipo: DestinoTipo | null;
  destino_os: string | null;
  destino_ppv: string | null;
  venda_preco: number | null;
  destino_obs: string;
  retirado_por: string | null;
  retirado_por_nome: string;
  retirado_em: string | null;
  liberado_por: string | null;
  liberado_em: string | null;
  aplicado_em: string | null;
  devolvido_em: string | null;
  criado_por: string | null;
  criado_por_nome: string;
  created_at: string;
  updated_at: string;
}

export interface UnidadeEvento {
  id: string;
  unidade_id: string;
  autor_id: string | null;
  autor_nome: string;
  tipo: string;
  de_status: string | null;
  para_status: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export const STATUS_LABEL: Record<UnidadeStatus, string> = {
  estoque: 'Em estoque',
  retirada_pendente: 'Aguardando liberação',
  liberada: 'Retirada liberada',
  aplicada: 'Aplicada',
  devolucao_pendente: 'Devolução pendente',
  cancelada: 'Cancelada',
  extraviada: 'Extraviada',
};

export const STATUS_COR: Record<UnidadeStatus, string> = {
  estoque: '#16a34a',
  retirada_pendente: '#f59e0b',
  liberada: '#2563eb',
  aplicada: '#6b7280',
  devolucao_pendente: '#f97316',
  cancelada: '#94a3b8',
  extraviada: '#dc2626',
};

export const DESTINO_LABEL: Record<DestinoTipo, string> = {
  os: 'Ordem de serviço',
  balcao: 'Venda balcão',
  uso_interno: 'Uso interno',
  ppv: 'Pedido de venda (PPV)',
};

export const EMPRESA_LABEL: Record<string, string> = {
  NOVA: 'NOVA TRATORES',
  CASTRO: 'CASTRO PEÇAS',
};

export const EMPRESA_COR: Record<string, string> = {
  NOVA: '#1d4ed8',
  CASTRO: '#be185d',
};

export type UnidadeAcao =
  | 'retirar'
  | 'liberar'
  | 'recusar'
  | 'cancelar_retirada'
  | 'concluir'
  | 'devolver'
  | 'receber_devolucao'
  | 'cancelar'
  | 'extraviar'
  | 'recuperar'
  | 'aplicar_cron'
  | 'devolver_cron'
  | 'reservar_ppv'
  | 'aplicar_faturamento';

// acao -> { de quais estados pode sair, pra qual vai, tipo do evento }
export const TRANSICOES: Record<UnidadeAcao, { de: UnidadeStatus[]; para: UnidadeStatus; evento: string }> = {
  retirar:           { de: ['estoque'],            para: 'retirada_pendente',  evento: 'retirada' },
  liberar:           { de: ['retirada_pendente'],  para: 'liberada',           evento: 'liberacao' },
  recusar:           { de: ['retirada_pendente'],  para: 'estoque',            evento: 'recusa' },
  cancelar_retirada: { de: ['retirada_pendente'],  para: 'estoque',            evento: 'retirada_cancelada' },
  concluir:          { de: ['liberada'],           para: 'aplicada',           evento: 'aplicacao' },
  devolver:          { de: ['liberada'],           para: 'devolucao_pendente', evento: 'devolucao_marcada' },
  receber_devolucao: { de: ['devolucao_pendente'], para: 'estoque',            evento: 'devolucao_recebida' },
  cancelar:          { de: ['estoque'],            para: 'cancelada',          evento: 'cancelamento' },
  extraviar:         { de: ['retirada_pendente', 'liberada', 'devolucao_pendente'], para: 'extraviada', evento: 'extravio' },
  recuperar:         { de: ['extraviada'],         para: 'estoque',            evento: 'recuperacao' },
  aplicar_cron:      { de: ['liberada'],           para: 'aplicada',           evento: 'aplicacao' },
  devolver_cron:     { de: ['liberada'],           para: 'devolucao_pendente', evento: 'devolucao_marcada' },
  // fluxo PPV: scan reserva a unidade pro pedido; faturamento aplica as liberadas
  reservar_ppv:        { de: ['estoque'],  para: 'retirada_pendente', evento: 'retirada' },
  aplicar_faturamento: { de: ['liberada'], para: 'aplicada',          evento: 'aplicacao' },
};

// comparação de códigos de peça (relatório do técnico × unidade)
export const norm = (s: string | null | undefined) => String(s || '').trim().toUpperCase();

export interface AlvoUnidade {
  href: string;
  titulo: string;
  tipo: 'ppv' | 'os' | 'rastreio';
}

/**
 * Pra onde o atalho de uma unidade leva na fila de peças.
 *
 * Ordem pedida pelo usuário: o PEDIDO primeiro, depois a OS, e só então a
 * página de rastreio. Quem está na fila quer ver o documento comercial da
 * peça — a página de rastreio é o que ele já tem na frente em forma de linha.
 * Ela continua a um clique: o número da unidade linka pra lá.
 *
 * "Tem pedido" = `destino_ppv` preenchido, esteja ele aberto ou já faturado —
 * pedido fechado é justamente o que alguém quer conferir quando a peça saiu.
 */
export function alvoDaUnidade(u: {
  id: string;
  destino_ppv?: string | null;
  destino_os?: string | null;
}): AlvoUnidade {
  const ppv = String(u.destino_ppv || '').trim();
  if (ppv) return { href: `/ppv?id=${encodeURIComponent(ppv)}`, titulo: `Abrir o pedido ${ppv}`, tipo: 'ppv' };
  const os = String(u.destino_os || '').trim();
  // é `?id=` mesmo, não `?os=`: /pos lê searchParams.get("id") pra abrir o
  // drawer da OS (mesmo parâmetro dos links de notificação do módulo)
  if (os) return { href: `/pos?id=${encodeURIComponent(os)}`, titulo: `Abrir a ${os}`, tipo: 'os' };
  return { href: `/p/${u.id}`, titulo: 'Abrir página de rastreio', tipo: 'rastreio' };
}
