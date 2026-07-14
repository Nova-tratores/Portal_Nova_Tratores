// =============================================================================
// LEITURA DE CRLV — extrai os dados do documento do veículo e devolve JSON
// estruturado pra pré-preencher a Ficha (o humano SEMPRE revisa antes de
// salvar — nada é gravado automaticamente).
//
// Estratégia em camadas (da mais barata pra mais cara):
//   1. PDF com camada de texto (CRLV-e emitido digital) -> extrai o texto com
//      o pdfjs (já é dependência do projeto) e manda SÓ O TEXTO pra IA
//      estruturar. Centavos de custo.
//   2. PDF escaneado (sem texto) -> manda o PDF inteiro como arquivo pra IA
//      (a OpenAI rasteriza as páginas internamente).
//   3. Foto (jpg/png/webp) -> visão da IA direto na imagem.
//
// Usa o mesmo provider do Tratorilson (lib/assistente/ia.ts — OPENAI_API_KEY).
// =============================================================================
import { chamarIA } from '@/lib/assistente/ia';

export interface DadosCrlv {
  placa: string | null;
  renavam: string | null;
  chassi: string | null;
  marca: string | null;
  modelo: string | null;
  ano_fabricacao: number | null;
  ano_modelo: number | null;
  cor: string | null;
  combustivel: string | null;
  proprietario: string | null;
  cpf_cnpj_proprietario: string | null;
  exercicio: number | null; // ano do licenciamento (validade do CRLV)
}

const PROMPT_SISTEMA = `Você extrai dados de CRLV / CRLV-e (Certificado de Registro e Licenciamento de Veículo, Brasil).
Responda SOMENTE um objeto JSON válido, sem comentários, com EXATAMENTE estas chaves:
placa, renavam, chassi, marca, modelo, ano_fabricacao, ano_modelo, cor, combustivel, proprietario, cpf_cnpj_proprietario, exercicio.
Regras:
- use null quando o campo não estiver legível ou não existir;
- o CRLV traz "MARCA/MODELO/VERSÃO" junto (ex.: "VW/VOYAGE 1.6 MSI") — separe: marca="VW", modelo="VOYAGE 1.6 MSI";
- ano_fabricacao, ano_modelo e exercicio são números (ex.: 2023);
- placa sem hífen; renavam e chassi exatamente como impressos;
- proprietario é o NOME no campo proprietário do documento;
- cor e combustivel como impressos (ex.: "Branca", "Alcool/Gasolina").`;

/** Texto da camada de texto de um PDF (CRLV-e digital tem; escaneado não). */
export async function extrairTextoPdf(buffer: Buffer): Promise<string> {
  // build legacy = funciona em Node sem worker nem canvas (só texto)
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  }).promise;
  let texto = '';
  const paginas = Math.min(doc.numPages, 4);
  for (let i = 1; i <= paginas; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    texto += tc.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
  }
  try { await doc.destroy(); } catch { /* */ }
  return texto.trim();
}

function ehPdf(buffer: Buffer, nome: string | null): boolean {
  return buffer.subarray(0, 5).toString('latin1').startsWith('%PDF') || /\.pdf$/i.test(nome || '');
}

function mimeImagem(nome: string | null): string | null {
  const ext = (nome || '').toLowerCase().match(/\.(jpe?g|png|webp|gif)$/)?.[1];
  if (!ext) return null;
  return ext.startsWith('jp') ? 'image/jpeg' : `image/${ext}`;
}

function parseJson(conteudo: string): Record<string, unknown> {
  const limpo = conteudo.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(limpo);
}

function normalizar(bruto: Record<string, unknown>): DadosCrlv {
  const s = (k: string) => {
    const v = bruto[k];
    const t = v == null ? '' : String(v).trim();
    return t && t.toLowerCase() !== 'null' ? t : null;
  };
  const n = (k: string) => {
    const v = Number(String(bruto[k] ?? '').replace(/\D/g, ''));
    return Number.isFinite(v) && v >= 1900 && v <= 2100 ? v : null;
  };
  return {
    placa: s('placa')?.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || null,
    renavam: s('renavam'),
    chassi: s('chassi'),
    marca: s('marca'),
    modelo: s('modelo'),
    ano_fabricacao: n('ano_fabricacao'),
    ano_modelo: n('ano_modelo'),
    cor: s('cor'),
    combustivel: s('combustivel'),
    proprietario: s('proprietario'),
    cpf_cnpj_proprietario: s('cpf_cnpj_proprietario'),
    exercicio: n('exercicio'),
  };
}

export interface ResultadoLeituraCrlv {
  dados: DadosCrlv;
  /** como o documento foi lido — útil pra depurar custo/qualidade */
  fonte: 'pdf_texto' | 'pdf_arquivo' | 'imagem';
}

export async function lerCrlv(buffer: Buffer, nomeArquivo: string | null): Promise<ResultadoLeituraCrlv> {
  let userContent: unknown;
  let fonte: ResultadoLeituraCrlv['fonte'];

  if (ehPdf(buffer, nomeArquivo)) {
    let texto = '';
    try { texto = await extrairTextoPdf(buffer); } catch { /* escaneado/corrompido — cai pro arquivo */ }
    if (texto.length >= 120) {
      fonte = 'pdf_texto';
      userContent = `Texto extraído do documento:\n\n${texto.slice(0, 12_000)}`;
    } else {
      // sem camada de texto (escaneado) -> manda o PDF inteiro
      fonte = 'pdf_arquivo';
      userContent = [
        { type: 'text', text: 'Extraia os dados deste CRLV.' },
        {
          type: 'file',
          file: {
            filename: nomeArquivo || 'crlv.pdf',
            file_data: `data:application/pdf;base64,${buffer.toString('base64')}`,
          },
        },
      ];
    }
  } else {
    const mime = mimeImagem(nomeArquivo) || 'image/jpeg';
    fonte = 'imagem';
    userContent = [
      { type: 'text', text: 'Extraia os dados deste CRLV.' },
      { type: 'image_url', image_url: { url: `data:${mime};base64,${buffer.toString('base64')}` } },
    ];
  }

  const resposta = await chamarIA({
    messages: [
      { role: 'system', content: PROMPT_SISTEMA },
      { role: 'user', content: userContent },
    ],
    temperature: 0,
    response_format: { type: 'json_object' },
  });
  const conteudo = resposta?.choices?.[0]?.message?.content || '';
  if (!conteudo) throw new Error('A IA não devolveu conteúdo.');

  return { dados: normalizar(parseJson(conteudo)), fonte };
}
