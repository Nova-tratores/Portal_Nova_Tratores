// Cache de notas fiscais — regras PURAS (sem banco, sem Omie).
//
// Um documento por nota: PDF (ver/imprimir) + XML (documento fiscal oficial),
// guardados no bucket PRIVADO `notas-fiscais`. Aqui ficam: caminho do arquivo,
// backoff das tentativas, selo que a tela mostra e a leitura dos erros da Omie.

export type TipoNota = 'entrada' | 'saida_produto' | 'saida_servico';

export interface LinhaDoc {
  id: number;
  conta_omie: string;
  tipo: TipoNota;
  chave_nfe: string | null;
  n_cod_nf: number;
  numero: string | null;
  serie: string | null;
  data_emissao: string | null; // YYYY-MM-DD
  parte_nome: string | null;
  parte_doc: string | null;
  valor: number | null;
  cancelada: boolean;
  pdf_path: string | null;
  xml_path: string | null;
  pdf_em?: string | null;
  xml_em?: string | null;
  tentativas: number;
  proxima_tentativa_em: string | null;
  ultimo_erro: string | null;
}

export const MAX_TENTATIVAS = 8;
export const TETO_BACKOFF_HORAS = 24 * 7;
export const ADIAR_PENDENTE_DIAS = 7;

export const ROTULO_TIPO: Record<TipoNota, string> = {
  entrada: 'Entrada',
  saida_produto: 'Saída · peças/máquinas',
  saida_servico: 'Saída · serviço (NFS-e)',
};

export const TIPOS: TipoNota[] = ['entrada', 'saida_produto', 'saida_servico'];

export function ehTipoNota(v: unknown): v is TipoNota {
  return typeof v === 'string' && (TIPOS as string[]).includes(v);
}

/** Caminho no bucket: <CONTA>/<tipo>/<ano>/<n_cod_nf>.<ext>. n_cod_nf é único por conta. */
export function caminhoArquivo(l: Pick<LinhaDoc, 'conta_omie' | 'tipo' | 'data_emissao' | 'n_cod_nf'>, ext: 'pdf' | 'xml'): string {
  const ano = l.data_emissao && /^\d{4}/.test(l.data_emissao) ? l.data_emissao.slice(0, 4) : 'sem-ano';
  return `${String(l.conta_omie).toUpperCase()}/${l.tipo}/${ano}/${l.n_cod_nf}.${ext}`;
}

/** Nome do arquivo ao baixar: NF-<numero>-<CONTA>.<ext> (NFS-e: NFSe-...). */
export function nomeArquivo(l: Pick<LinhaDoc, 'conta_omie' | 'tipo' | 'numero' | 'n_cod_nf'>, ext: 'pdf' | 'xml'): string {
  const pref = l.tipo === 'saida_servico' ? 'NFSe' : 'NF';
  const num = (l.numero || String(l.n_cod_nf)).replace(/[^\w-]/g, '');
  return `${pref}-${num}-${String(l.conta_omie).toUpperCase()}.${ext}`;
}

/** Backoff exponencial: 2^tentativas horas, teto 7 dias. */
export function proximaTentativa(tentativas: number, agora: Date = new Date()): Date {
  const horas = Math.min(Math.pow(2, Math.max(1, tentativas)), TETO_BACKOFF_HORAS);
  return new Date(agora.getTime() + horas * 3600 * 1000);
}

/** NF ainda não concluída na Omie: tenta de novo daqui a 7 dias, sem gastar tentativa. */
export function adiarPendente(agora: Date = new Date()): Date {
  return new Date(agora.getTime() + ADIAR_PENDENTE_DIAS * 86400 * 1000);
}

export function ehPdf(buf: Uint8Array | null | undefined): boolean {
  if (!buf || buf.length < 5) return false;
  return String.fromCharCode(buf[0], buf[1], buf[2], buf[3], buf[4]) === '%PDF-';
}

export function ehXml(txt: string | null | undefined): boolean {
  const s = String(txt || '').replace(/^﻿/, '').trim();
  return s.startsWith('<') && s.length > 20;
}

/** O campo do XML na Omie vem de 3 jeitos: XML cru, XML com entidades HTML
 *  (`&lt;?xml ... &quot;` — ObterNfe) ou uma URL para baixar (`cXmlNFSe`). */
export function pareceUrl(v: string | null | undefined): boolean {
  return /^https?:\/\//i.test(String(v || '').trim());
}

export function desescaparXml(v: string | null | undefined): string | null {
  if (!v) return null;
  let s = String(v).replace(/^﻿/, '').trim();
  if (s.startsWith('&lt;')) {
    s = s
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
  }
  return ehXml(s) ? s : null;
}

export type Selo = 'completa' | 'so_pdf' | 'so_xml' | 'na_fila' | 'pendente_omie' | 'sem_documento';

export const ROTULO_SELO: Record<Selo, string> = {
  completa: 'Guardada (PDF + XML)',
  so_pdf: 'Só PDF guardado',
  so_xml: 'Só XML guardado',
  na_fila: 'Na fila (só na Omie)',
  pendente_omie: 'Aguardando a Omie concluir',
  sem_documento: 'Sem documento na Omie',
};

/** Classifica a linha para a tela. */
export function selo(l: Pick<LinhaDoc, 'pdf_path' | 'xml_path' | 'tentativas' | 'ultimo_erro'>): Selo {
  if (l.pdf_path && l.xml_path) return 'completa';
  if (l.pdf_path) return 'so_pdf';
  if (l.xml_path) return 'so_xml';
  if (l.tentativas >= MAX_TENTATIVAS) return 'sem_documento';
  if (/n[aã]o conclu[ií]da|pendente/i.test(l.ultimo_erro || '')) return 'pendente_omie';
  return 'na_fila';
}

/** Bloqueio/limite da Omie: PARAR o lote inteiro (continuar só piora o bloqueio). */
export function ehBloqueioOmie(e: unknown): boolean {
  const o = e as { bloqueio?: boolean; message?: string; faultstring?: string } | null;
  if (!o) return false;
  if (o.bloqueio === true) return true;
  const txt = `${o.message || ''} ${o.faultstring || ''}`;
  return /api bloqueada|consumo indevido|too many requests|consumo redundante/i.test(txt);
}

/** Omie fora do ar / rede: não conta tentativa, tela entra em modo "Omie fora". */
export function ehOmieFora(e: unknown): boolean {
  const o = e as { message?: string; code?: string; cause?: { code?: string } } | null;
  if (!o) return false;
  const txt = `${o.message || ''} ${o.code || ''} ${o.cause?.code || ''}`;
  return /fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network|upstream|gateway|bad gateway|unexpected token '<'|is not valid JSON|50[234]/i.test(txt);
}

/** NF-e de entrada/saída ainda não consultável (recebimento não concluído). */
export function ehNaoConcluida(e: unknown): boolean {
  const o = e as { message?: string; faultstring?: string } | null;
  const txt = `${o?.message || ''} ${o?.faultstring || ''}`;
  return /n[aã]o cadastrad|n[aã]o encontrad|n[aã]o conclu/i.test(txt);
}

export interface Cobertura {
  total: number;
  comPdf: number;
  comXml: number;
  completas: number;
  naFila: number;
  semDocumento: number;
}

export function percent(parte: number, total: number): string {
  if (!total) return '0%';
  return `${Math.round((parte / total) * 100)}%`;
}

/** Monta o `or=` do PostgREST para a busca livre (nº, chave, nome, CNPJ). */
export function filtroBusca(q: string): string | null {
  const t = String(q || '').trim();
  if (!t) return null;
  const digitos = t.replace(/\D/g, '');
  const esc = t.replace(/[,()]/g, ' ').replace(/%/g, '');
  if (digitos.length >= 20 && digitos.length === t.length) return `chave_nfe.ilike.*${digitos}*`;
  if (digitos.length >= 11 && digitos.length === t.length) return `parte_doc.ilike.*${digitos}*,chave_nfe.ilike.*${digitos}*`;
  if (digitos.length > 0 && digitos.length === t.length) {
    const semZeros = digitos.replace(/^0+(?=\d)/, '');
    return `numero.eq.${semZeros},parte_doc.ilike.*${digitos}*`;
  }
  return `parte_nome.ilike.*${esc}*`;
}
