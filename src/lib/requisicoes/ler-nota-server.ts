// Ler a nota anexada numa requisição — parte do SERVIDOR (regras em ler-nota.ts).
// Ordem, da mais segura para a menos: PDF com chave de acesso → foto/PDF lido pela IA →
// conferência com a nota de entrada do Omie (mesmo CNPJ + número). Nada é gravado aqui:
// a tela mostra o resultado e a pessoa clica em "Usar estes dados".
import { supabase } from '@/lib/pos/supabase';
import { chamarIA } from '@/lib/assistente/ia';
import { dataISO, numeroNota, soDigitos } from './casar-nota';
import { extrairDoTextoDanfe, limparLeituraIA, NOTA_VAZIA, PROMPT_LER_NOTA, type DadosNota } from './ler-nota';

export type FonteLeitura = 'omie' | 'chave' | 'ia';

export interface ResultadoLeitura {
  dados: DadosNota;
  /** omie = achada nas notas de entrada (vale o que está no Omie); chave = chave válida no PDF; ia = só leitura da imagem */
  fonte: FonteLeitura;
  notaOmieId: number | null;
  avisos: string[];
  /** PDF sem texto (escaneado): a tela desenha a 1ª página e manda de novo como imagem */
  escaneado?: boolean;
}

const LIMITE_BYTES = 12 * 1024 * 1024;

function urlDoAnexo(caminho: string): string | null {
  if (!caminho) return null;
  if (caminho.startsWith('http')) return caminho;
  if (caminho.startsWith('SupaAtualizarReq_Images/')) return null; // Drive antigo: sem link direto
  return supabase.storage.from('requisicoes').getPublicUrl(caminho).data.publicUrl;
}

async function textoDoPdf(buf: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: buf, useSystemFonts: true }).promise;
  try {
    const partes: string[] = [];
    for (let p = 1; p <= Math.min(2, doc.numPages); p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      partes.push(tc.items.map((i) => ('str' in i ? i.str : '')).join(' '));
    }
    return partes.join(' ');
  } finally { try { await doc.destroy(); } catch { /* */ } }
}

async function lerComIA(conteudo: { texto?: string; imagemBase64?: string; mime?: string }): Promise<DadosNota> {
  const partes: unknown[] = [{ type: 'text', text: PROMPT_LER_NOTA }];
  if (conteudo.texto) partes.push({ type: 'text', text: `Texto do documento:\n${conteudo.texto.slice(0, 12000)}` });
  if (conteudo.imagemBase64) partes.push({ type: 'image_url', image_url: { url: `data:${conteudo.mime || 'image/jpeg'};base64,${conteudo.imagemBase64}`, detail: 'high' } });
  const j = await chamarIA({ temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: partes }] });
  const bruto = JSON.parse(String(j?.choices?.[0]?.message?.content || '{}'));
  return limparLeituraIA(bruto);
}

/** Procura a nota nas notas de entrada (CNPJ + número). */
async function notaNoOmie(cnpj: string | null, numero: string | null) {
  if (!numero) return null;
  const { data } = await supabase.from('notas_entrada')
    .select('id,numero_nf,data_emissao,valor_nf,cnpj_cpf:emitente->>cnpj_cpf,nome_emitente,cancelada')
    .ilike('numero_nf', `%${numero}`).limit(30);
  const achadas = (data || []).filter((n: any) => numeroNota(n.numero_nf) === numero && (!cnpj || soDigitos(n.cnpj_cpf) === cnpj));
  // sem CNPJ só serve se for UMA nota com esse número
  if (!cnpj && achadas.length !== 1) return null;
  return achadas[0] || null;
}

/**
 * extra.texto: texto do PDF lido pelo navegador (no servidor do portal a biblioteca de PDF falha
 *   calada e todo PDF parecia "escaneado" — 23/10/2026);
 * extra.imagem: "data:image/jpeg;base64,…" — a 1ª página do PDF sem texto, desenhada pelo navegador.
 */
export async function lerNotaDaRequisicao(reqId: number, campo: string, extra: { texto?: string | null; imagem?: string | null } = {}): Promise<ResultadoLeitura> {
  const imagem = extra.imagem;
  if (!/^foto_nf[2-5]?$|^recibo_fornecedor$|^boleto_fornecedor$/.test(campo)) throw new Error('anexo inválido');
  const { data: req, error } = await supabase.from('Requisicao').select(`id,${campo}`).eq('id', reqId).single();
  if (error || !req) throw new Error('requisição não encontrada');
  const url = urlDoAnexo(String((req as unknown as Record<string, unknown>)[campo] || ''));
  if (!url) throw new Error('Esse anexo não tem link direto (arquivo antigo do Drive).');

  let dados: DadosNota = { ...NOTA_VAZIA };
  let fonte: FonteLeitura = 'ia';
  const avisos: string[] = [];
  let escaneado = false;

  const img = String(imagem || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (img) {
    // PDF escaneado já virou imagem no navegador: a IA lê como foto da nota
    if (img[2].length > LIMITE_BYTES * 1.4) throw new Error('imagem grande demais para ler');
    dados = await lerComIA({ imagemBase64: img[2], mime: img[1] });
    if (dados.chave) fonte = 'chave';
    return conferirNoOmie(dados, fonte, avisos);
  }

  const textoNavegador = String(extra.texto || '').slice(0, 60000);
  if (textoNavegador.trim().length > 50) return lerTextoDoPdf(textoNavegador, avisos);

  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('não consegui baixar o anexo');
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.byteLength > LIMITE_BYTES) throw new Error('arquivo grande demais para ler');
  const tipo = (r.headers.get('content-type') || '').toLowerCase();
  const ehPdf = tipo.includes('pdf') || (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46);

  if (ehPdf) {
    const texto = await textoDoPdf(buf).catch(() => '');
    if (texto.trim().length > 50) {
      return lerTextoDoPdf(texto, avisos);
    } else {
      // sem texto: é uma foto dentro do PDF. A tela desenha a página e manda de volta como imagem.
      escaneado = true;
      return { dados, fonte, notaOmieId: null, avisos, escaneado };
    }
  } else {
    if (!tipo.startsWith('image/')) throw new Error('Formato não suportado (use foto ou PDF).');
    dados = await lerComIA({ imagemBase64: Buffer.from(buf).toString('base64'), mime: tipo });
    if (dados.chave) fonte = 'chave';
  }

  return conferirNoOmie(dados, fonte, avisos, escaneado);
}

/** Texto da DANFE/PDF → dados (chave + valor + data; o que faltar, a IA completa lendo o texto). */
async function lerTextoDoPdf(texto: string, avisos: string[]): Promise<ResultadoLeitura> {
  let dados = extrairDoTextoDanfe(texto);
  const fonte: FonteLeitura = dados.chave ? 'chave' : 'ia';
  if (!dados.chave || !dados.valor || !dados.nome) {
    const ia = await lerComIA({ texto }).catch(() => null);
    if (ia) dados = { ...ia, ...Object.fromEntries(Object.entries(dados).filter(([, v]) => v != null)) } as DadosNota;
  }
  return conferirNoOmie(dados, fonte, avisos);
}

/** Conferência com o Omie: se a nota está lá (CNPJ + número), valem os dados de lá. */
async function conferirNoOmie(dados: DadosNota, fonte: FonteLeitura, avisos: string[], escaneado = false): Promise<ResultadoLeitura> {
  let notaOmieId: number | null = null;
  const omie = await notaNoOmie(dados.cnpj, dados.numero).catch(() => null);
  if (omie) {
    notaOmieId = Number(omie.id);
    const valorOmie = Number(omie.valor_nf) || null;
    if (dados.valor && valorOmie && Math.abs(dados.valor - valorOmie) > 0.01) avisos.push(`Na foto li ${dados.valor.toFixed(2)}, no Omie está ${valorOmie.toFixed(2)} — vale o do Omie.`);
    dados = {
      ...dados,
      cnpj: soDigitos(omie.cnpj_cpf) || dados.cnpj,
      nome: String(omie.nome_emitente || dados.nome || '') || null,
      numero: numeroNota(omie.numero_nf),
      data: dataISO(omie.data_emissao) || dados.data,
      valor: valorOmie ?? dados.valor,
    };
    fonte = 'omie';
  }
  if (!dados.numero && !dados.valor) avisos.push('Não consegui ler o número nem o valor desse anexo.');
  return { dados, fonte, notaOmieId, avisos, escaneado };
}
