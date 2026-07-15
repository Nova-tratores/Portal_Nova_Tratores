// =============================================================================
// LEITURA DE CRLV — extrai os dados do documento do veículo e devolve JSON
// estruturado pra pré-preencher a Ficha (o humano SEMPRE revisa antes de
// salvar — nada é gravado automaticamente).
//
// Estratégia em camadas (da mais barata pra mais cara):
//   1. PARSER DETERMINÍSTICO (SEM IA) — o CRLV-e digital é um formulário
//      padronizado da SENATRAN: cada rótulo ("PLACA", "CHASSI"...) tem o valor
//      logo ABAIXO, na mesma coluna. O pdfjs dá a coordenada de cada texto,
//      então casamos rótulo→valor por geometria. De graça, offline, exato.
//      (Validado contra CRLV-e real do DETRAN-SP.)
//   2. IA com o TEXTO extraído — só se o parser não reconhecer o padrão
//      (layout muito diferente) mas o PDF tiver texto.
//   3. IA com o ARQUIVO/FOTO — PDF escaneado ou imagem exigem OCR; sem
//      OPENAI_API_KEY esses casos retornam erro amigável (o resto funciona).
//
// Provider da IA (fallback): o mesmo do Tratorilson (lib/assistente/ia.ts).
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

export interface ResultadoLeituraCrlv {
  dados: DadosCrlv;
  /** como o documento foi lido — 'pdf_padrao' = parser sem IA */
  fonte: 'pdf_padrao' | 'pdf_texto_ia' | 'pdf_arquivo_ia' | 'imagem_ia';
}

// ── 1) Parser determinístico do CRLV-e ──────────────────────────────────────

export interface ItemPdf {
  str: string;
  x: number;
  y: number;
  pagina: number;
}

// Rótulos do formulário CRLV-e (SENATRAN). O valor fica ABAIXO do rótulo, na
// mesma coluna (x ≈ igual), a até ~30 unidades de distância vertical.
const ROTULOS: { campo: string; re: RegExp }[] = [
  { campo: 'renavam', re: /^C[ÓO]DIGO RENAVAM$/i },
  { campo: 'placa', re: /^PLACA$/i },
  { campo: 'exercicio', re: /^EXERC[ÍI]CIO$/i },
  { campo: 'ano_fabricacao', re: /^ANO FABRICA[ÇC][ÃA]O$/i },
  { campo: 'ano_modelo', re: /^ANO MODELO$/i },
  { campo: 'marca_modelo', re: /^MARCA\s*\/\s*MODELO\s*\/\s*VERS[ÃA]O$/i },
  { campo: 'chassi', re: /^CHASSI$/i },
  { campo: 'cor', re: /^COR PREDOMINANTE$/i },
  { campo: 'combustivel', re: /^COMBUST[ÍI]VEL$/i },
  { campo: 'proprietario', re: /^NOME$/i },
  { campo: 'cpf_cnpj', re: /^CPF\s*\/\s*CNPJ$/i },
  { campo: 'categoria', re: /^CATEGORIA$/i },
];

const X_TOLERANCIA = 14; // valores alinham à esquerda com o rótulo (Δx real ≤ 2)
const Y_MAX_ABAIXO = 30; // Δy real observado: 11 a 23

function ehRotulo(s: string): boolean {
  const t = s.trim();
  return ROTULOS.some((r) => r.re.test(t)) ||
    // outros rótulos/textos fixos do formulário que nunca são valor
    /^(N[ÚU]MERO DO CRV|ESP[ÉE]CIE|PLACA ANTERIOR|CAPACIDADE|POT[ÊE]NCIA|PESO BRUTO|MOTOR|CMT|EIXOS|LOTA[ÇC][ÃA]O|CARROCERIA|LOCAL|DATA|CAT\b|C[ÓO]DIGO DE SEGURAN[ÇC]A|DADOS DO SEGURO|Valide este QRCode|ASSINADO DIGITALMENTE|QRCode)/i.test(t);
}

/** O item-valor de um rótulo: o texto mais PRÓXIMO abaixo dele, na mesma coluna. */
function valorAbaixo(itens: ItemPdf[], rotulo: ItemPdf): string | null {
  let melhor: ItemPdf | null = null;
  for (const it of itens) {
    if (it.pagina !== rotulo.pagina) continue;
    const dy = rotulo.y - it.y;
    if (dy <= 2 || dy > Y_MAX_ABAIXO) continue;
    if (Math.abs(it.x - rotulo.x) > X_TOLERANCIA) continue;
    if (!it.str.trim() || ehRotulo(it.str)) continue;
    if (!melhor || it.y > melhor.y) melhor = it; // o mais perto (maior y)
  }
  return melhor ? melhor.str.trim() : null;
}

const soAno = (s: string | null) => {
  const n = Number((s || '').replace(/\D/g, '').slice(0, 4));
  return Number.isFinite(n) && n >= 1950 && n <= 2100 ? n : null;
};

/**
 * Parser sem IA do CRLV-e digital. Devolve null se o PDF não tem o padrão
 * (aí vale tentar o fallback com IA).
 */
export function parsearCrlvItens(itens: ItemPdf[]): DadosCrlv | null {
  // precisa parecer um CRLV: o título ou os rótulos-chave presentes
  const textoTodo = itens.map((i) => i.str).join(' ');
  const pareceCrlv =
    /CERTIFICADO DE REGISTRO E LICENCIAMENTO/i.test(textoTodo) ||
    (/C[ÓO]DIGO RENAVAM/i.test(textoTodo) && /CHASSI/i.test(textoTodo));
  if (!pareceCrlv) return null;

  const bruto: Record<string, string | null> = {};
  for (const { campo, re } of ROTULOS) {
    if (bruto[campo]) continue; // primeiro rótulo (página 1) vence
    const rotulo = itens.find((i) => re.test(i.str.trim()));
    if (rotulo) bruto[campo] = valorAbaixo(itens, rotulo);
  }

  // MARCA/MODELO/VERSÃO vem junto ("VW/VOYAGE MPI") — separa no 1º '/'
  let marca: string | null = null;
  let modelo: string | null = null;
  if (bruto.marca_modelo) {
    const [m, ...resto] = bruto.marca_modelo.split('/');
    marca = m.trim() || null;
    modelo = resto.join('/').trim() || null;
  }

  const placa = (bruto.placa || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const chassi = (bruto.chassi || '').replace(/\s/g, '').toUpperCase();
  const renavam = (bruto.renavam || '').replace(/\D/g, '');

  const dados: DadosCrlv = {
    placa: /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa) ? placa : null,
    renavam: renavam.length >= 9 && renavam.length <= 11 ? renavam : null,
    chassi: /^[A-HJ-NPR-Z0-9]{17}$/.test(chassi) ? chassi : null,
    marca,
    modelo,
    ano_fabricacao: soAno(bruto.ano_fabricacao),
    ano_modelo: soAno(bruto.ano_modelo),
    cor: bruto.cor || null,
    combustivel: bruto.combustivel || null,
    proprietario: bruto.proprietario || null,
    cpf_cnpj_proprietario: bruto.cpf_cnpj || null,
    exercicio: soAno(bruto.exercicio),
  };

  // sem NENHUM identificador do veículo o parser não serviu — deixa pra IA
  if (!dados.placa && !dados.renavam && !dados.chassi) return null;
  return dados;
}

// ── Extração do PDF (texto + posições) ───────────────────────────────────────

export async function extrairItensPdf(buffer: Buffer): Promise<ItemPdf[]> {
  // build legacy = funciona em Node sem worker nem canvas (só texto)
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  }).promise;
  const itens: ItemPdf[] = [];
  const paginas = Math.min(doc.numPages, 4);
  for (let p = 1; p <= paginas; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      itens.push({ str: it.str, x: it.transform[4], y: it.transform[5], pagina: p });
    }
  }
  try { await doc.destroy(); } catch { /* */ }
  return itens;
}

function ehPdf(buffer: Buffer, nome: string | null): boolean {
  return buffer.subarray(0, 5).toString('latin1').startsWith('%PDF') || /\.pdf$/i.test(nome || '');
}

// ── 2/3) Fallback com IA (texto, arquivo ou foto) ────────────────────────────

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

function mimeImagem(nome: string | null): string | null {
  const ext = (nome || '').toLowerCase().match(/\.(jpe?g|png|webp|gif)$/)?.[1];
  if (!ext) return null;
  return ext.startsWith('jp') ? 'image/jpeg' : `image/${ext}`;
}

function parseJson(conteudo: string): Record<string, unknown> {
  const limpo = conteudo.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(limpo);
}

function normalizarIA(bruto: Record<string, unknown>): DadosCrlv {
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

async function lerComIA(userContent: unknown): Promise<DadosCrlv> {
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
  return normalizarIA(parseJson(conteudo));
}

// ── Orquestração ─────────────────────────────────────────────────────────────

export async function lerCrlv(buffer: Buffer, nomeArquivo: string | null): Promise<ResultadoLeituraCrlv> {
  if (ehPdf(buffer, nomeArquivo)) {
    let itens: ItemPdf[] = [];
    try { itens = await extrairItensPdf(buffer); } catch { /* corrompido/escaneado */ }

    // 1) parser determinístico — o caminho normal, sem IA
    const parseado = parsearCrlvItens(itens);
    if (parseado) return { dados: parseado, fonte: 'pdf_padrao' };

    // 2) tem texto mas o layout fugiu do padrão -> IA só com o texto
    const texto = itens.map((i) => i.str).join(' ').trim();
    if (texto.length >= 120) {
      return { dados: await lerComIA(`Texto extraído do documento:\n\n${texto.slice(0, 12_000)}`), fonte: 'pdf_texto_ia' };
    }

    // 3) PDF sem camada de texto (escaneado) -> IA com o arquivo inteiro
    return {
      dados: await lerComIA([
        { type: 'text', text: 'Extraia os dados deste CRLV.' },
        {
          type: 'file',
          file: {
            filename: nomeArquivo || 'crlv.pdf',
            file_data: `data:application/pdf;base64,${buffer.toString('base64')}`,
          },
        },
      ]),
      fonte: 'pdf_arquivo_ia',
    };
  }

  // foto -> visão da IA
  const mime = mimeImagem(nomeArquivo) || 'image/jpeg';
  return {
    dados: await lerComIA([
      { type: 'text', text: 'Extraia os dados deste CRLV.' },
      { type: 'image_url', image_url: { url: `data:${mime};base64,${buffer.toString('base64')}` } },
    ]),
    fonte: 'imagem_ia',
  };
}
