// =============================================================================
// INTELIGÊNCIA DE VENDAS — Boletim do agro (notícias diárias). Lib PURA.
//
// O robô (noticias-server.ts) baixa RSS de portais de agro, preços da CONAB,
// expectativas do Focus (BCB), dólar e previsão do tempo. Aqui ficam as partes
// sem rede: ler o RSS, filtrar/deduplicar, montar os indicadores com a tendência
// para quem VENDE trator, alertas de clima e a validação do que a IA devolveu
// (a IA só escolhe e reescreve — link e número têm que vir das fontes).
// =============================================================================
import { textoNorm } from './normalizar';
import { imagemDoRSS } from './noticias-artigo';

export type Tendencia = 'boa' | 'ruim' | 'neutra';
export const CATEGORIAS = ['taxas', 'mercado', 'regiao', 'clima', 'credito', 'maquinas', 'politica'] as const;
export type Categoria = (typeof CATEGORIAS)[number];
const TENDENCIAS: Tendencia[] = ['boa', 'ruim', 'neutra'];

export interface ItemRSS {
  titulo: string;
  link: string;
  descricao: string;
  publicadoEm: string | null; // ISO
  fonte: string | null;       // <source> (Google Notícias) — nome do veículo
  imagem?: string | null;     // foto da matéria vinda do próprio RSS (noticias-artigo.ts)
}

export interface Candidato extends ItemRSS {
  fonte_nome: string;
  feed: string;      // id do feed de onde veio
  cidades: string[]; // cidades da região citadas
  pontos: number;    // prioridade (região, agro, recência)
}

export interface Indicador {
  id: string; nome: string; valor: number; texto: string; variacaoPct: number | null;
  tendencia: Tendencia; referencia: string; fonte_nome: string; fonte_url: string;
}

export interface FocusItem { indicador: string; ano: string; mediana: number; anterior: number | null; data: string }
export interface DiaClima { data: string; chuva_mm: number; prob: number | null; tmin: number; tmax: number }
export interface AlertaClima { tipo: 'geada' | 'chuva_forte' | 'estiagem' | 'chuva_boa'; texto: string; tendencia: Tendencia }
export interface ClimaCidade { cidade: string; dias: DiaClima[]; alertas: string[] }

export interface NoticiaBoletim {
  categoria: Categoria; tendencia: Tendencia; titulo: string; resumo: string; impacto: string;
  fonte_nome: string; fonte_url: string; publicado_em: string | null; destaque: boolean; cidades: string[];
  /** preenchidos pelo robô depois de abrir a matéria (podem faltar) */
  imagem_url?: string | null; url_artigo?: string | null; corpo?: string[] | null;
}

export interface Manchete { titulo: string; resumo: string }

// ── texto ─────────────────────────────────────────────────────────────────────

const ENTIDADES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', ordm: 'º', ordf: 'ª', deg: '°',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', atilde: 'ã', otilde: 'õ', ccedil: 'ç',
  acirc: 'â', ecirc: 'ê', ocirc: 'ô', agrave: 'à', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó',
  Uacute: 'Ú', Atilde: 'Ã', Otilde: 'Õ', Ccedil: 'Ç', Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô', Agrave: 'À', uuml: 'ü',
};

export function decodificarEntidades(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
    }
    return ENTIDADES[e] ?? m;
  });
}

/** Tira CDATA, tags HTML e entidades; espaços colapsados. */
export function limparTexto(s: unknown): string {
  let t = String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  // a descrição costuma vir com o HTML "escapado" (&lt;p&gt;) — decodifica antes de tirar as tags
  t = decodificarEntidades(t);
  t = t.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  t = decodificarEntidades(t); // entidades duplamente escapadas (&amp;quot;)
  return t.replace(/\s+/g, ' ').trim();
}

const tag = (bloco: string, nome: string): string => {
  const m = bloco.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, 'i'));
  return m ? m[1] : '';
};

function dataISOdoRSS(s: string): string | null {
  const t = limparTexto(s);
  if (!t) return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** RSS 2.0 (e Atom simples) → itens. Tolerante: item sem título ou link é ignorado. */
export function parseRSS(xml: string): ItemRSS[] {
  const out: ItemRSS[] = [];
  const blocos = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocos) {
    const titulo = limparTexto(tag(b, 'title'));
    let link = limparTexto(tag(b, 'link'));
    if (!link) { const m = b.match(/<link[^>]*href="([^"]+)"/i); if (m) link = decodificarEntidades(m[1]); }
    if (!titulo || !/^https?:\/\//i.test(link)) continue;
    const descricao = limparTexto(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content'));
    const publicadoEm = dataISOdoRSS(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
    const fonte = limparTexto(tag(b, 'source')) || null;
    out.push({ titulo, link, descricao: descricao === titulo ? '' : descricao, publicadoEm, fonte, imagem: imagemDoRSS(b) });
  }
  return out;
}

/** O Google Notícias põe " - Veículo" no fim do título: tira quando bate com o <source>. */
export function tirarVeiculoDoTitulo(titulo: string, fonte: string | null): string {
  if (!fonte) return titulo;
  const suf = ` - ${fonte}`;
  return titulo.endsWith(suf) ? titulo.slice(0, -suf.length).trim() : titulo;
}

/** Só itens publicados nas últimas `horas` (item sem data fica de fora — não dá pra saber se é de hoje). */
export function filtrarJanela<T extends { publicadoEm: string | null }>(itens: T[], horas: number, agora = new Date()): T[] {
  const min = agora.getTime() - horas * 3_600_000;
  const max = agora.getTime() + 3_600_000; // tolera relógio do site um pouco adiantado
  return itens.filter((i) => {
    const t = i.publicadoEm ? Date.parse(i.publicadoEm) : NaN;
    return Number.isFinite(t) && t >= min && t <= max;
  });
}

const PARADAS = new Set(['a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'para', 'por', 'com', 'um', 'uma', 'que', 'se', 'ao', 'aos']);
const palavras = (t: string): Set<string> => new Set(textoNorm(t).split(' ').filter((w) => w.length > 1 && !PARADAS.has(w)));

/** Parecido = mesma notícia em veículos diferentes (Jaccard das palavras ≥ 0,6). */
export function titulosParecidos(a: string, b: string, limiar = 0.6): boolean {
  const A = palavras(a), B = palavras(b);
  if (!A.size || !B.size) return false;
  let comum = 0;
  for (const w of A) if (B.has(w)) comum++;
  return comum / (A.size + B.size - comum) >= limiar;
}

/** Tira repetidos (mesmo link, ou título igual/parecido). Fica o primeiro — ordene antes pela prioridade. */
export function deduplicar<T extends { titulo: string; link: string }>(itens: T[]): T[] {
  const out: T[] = [];
  const links = new Set<string>();
  for (const i of itens) {
    const l = i.link.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
    const chaveLink = /news\.google\.com/.test(l) ? i.link : l; // no Google o id está no caminho
    if (links.has(chaveLink)) continue;
    if (out.some((o) => titulosParecidos(o.titulo, i.titulo))) continue;
    links.add(chaveLink);
    out.push(i);
  }
  return out;
}

// ── cidades e categoria ──────────────────────────────────────────────────────

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Nomes que também são palavra comum ("fartura de chuva", "óleo diesel", rio Paranapanema). */
const AMBIGUAS = new Set(['fartura', 'oleo', 'paranapanema', 'iaras']);

/** Cidades da lista citadas no texto (case-sensitive: "Fartura" cidade ≠ "fartura"). */
export function cidadesCitadas(texto: string, cidades: string[]): string[] {
  const t = semAcento(texto);
  const out: string[] = [];
  for (const c of cidades) {
    const n = semAcento(c);
    const re = AMBIGUAS.has(textoNorm(c))
      ? new RegExp(`(\\b(em|de|municipio de|cidade de)\\s+${escRe(n)}\\b|\\b${escRe(n)}\\s*(\\(SP\\)|[-/,]\\s*SP\\b))`)
      : new RegExp(`(^|[^\\p{L}])${escRe(n)}($|[^\\p{L}])`, 'u');
    if (re.test(t) && !out.includes(c)) out.push(c);
  }
  return out;
}

const REGRAS_CATEGORIA: [Categoria, RegExp][] = [
  ['credito', /plano safra|pronaf|pronamp|moderfrota|inovagro|credito rural|financiamento rural|bndes|custeio|renegocia/],
  ['clima', /chuva|geada|estiagem|\bseca\b|clima|temperatura|frente fria|el nino|la nina|granizo|temporal|meteorolog/],
  ['maquinas', /trator|maquinas agricolas|maquina agricola|colheitadeira|implemento|mahindra|abimaq|anfavea|agrishow|pulverizador|plantadeira/],
  ['taxas', /selic|juros|copom|ipca|inflacao|dolar|cambio|focus/],
  ['mercado', /soja|milho|cafe|\bboi\b|arroba|trigo|feijao|cotac|preco|exporta|safra|colheita|plantio|leite|frango|suino|algodao|cana/],
  ['politica', /governo|ministerio|congresso|senado|camara|\blei\b|decreto|tarifa|imposto|reforma|eleic|prefeit/],
];

/** Categoria por palavra-chave (usada sem IA e para conferir a da IA). Cidade da região sem outro tema = 'regiao'. */
export function categoriaPorPalavra(texto: string, temCidade = false): Categoria {
  const t = textoNorm(texto);
  for (const [cat, re] of REGRAS_CATEGORIA) if (re.test(t)) return cat;
  return temCidade ? 'regiao' : 'mercado';
}

const AGRO = /agro|rural|produtor|lavoura|safra|soja|milho|cafe|boi|pecuar|trator|maquina|plantio|colheita|fazenda|graos|credito rural|plano safra|pronaf|cooperativ|fertiliz|defensiv|geada|chuva|estiagem/;

/** Pontos de prioridade: região pesa mais, agro em seguida, notícia recente ganha um pouco. */
export function pontuar(i: ItemRSS, cidades: string[], feedRegional: boolean, agora = new Date()): number {
  const t = textoNorm(`${i.titulo} ${i.descricao}`);
  let p = 0;
  if (cidades.length) p += 5;
  if (feedRegional) p += 2;
  if (AGRO.test(t)) p += 3;
  if (/plano safra|moderfrota|pronaf|trator|maquinas agricolas|selic|dolar|geada/.test(t)) p += 1;
  if (i.publicadoEm) {
    const h = (agora.getTime() - Date.parse(i.publicadoEm)) / 3_600_000;
    if (h <= 24) p += 1;
  }
  return p;
}

/** Junta, deduplica e limita a lista que vai para a IA. Notícia sem nada de agro nem de região fica de fora. */
export function selecionarCandidatos(itens: Candidato[], max = 70): Candidato[] {
  const relevantes = itens.filter((c) => c.pontos >= 3);
  const ord = [...relevantes].sort((a, b) => b.pontos - a.pontos || Date.parse(b.publicadoEm || '') - Date.parse(a.publicadoEm || ''));
  return deduplicar(ord).slice(0, max);
}

// ── números e indicadores ────────────────────────────────────────────────────

export const fmtNum = (n: number, casas = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
export const fmtReal = (n: number) => `R$ ${fmtNum(n, 2)}`;
export const fmtPct = (n: number, casas = 1) => `${n > 0 ? '+' : ''}${fmtNum(n, casas)}%`;
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const variacao = (atual: number, anterior: number | null | undefined): number | null =>
  anterior && Number.isFinite(anterior) && anterior !== 0 ? Math.round(((atual - anterior) / anterior) * 10_000) / 100 : null;

/**
 * Tendência PARA QUEM VENDE TRATOR NA REGIÃO (regra simples, de propósito):
 *  - 'alta_boa'  → preço de grão, boi, café, leite: produtor capitalizado compra máquina.
 *  - 'alta_ruim' → dólar (máquina, peça e insumo encarecem), Selic e IPCA (crédito mais caro,
 *                  menos margem). O exportador ganha com dólar alto, mas para a venda da loja
 *                  o efeito dominante é o preço da máquina e do financiamento.
 * Variação pequena (|v| < limiar) = 'neutra'.
 */
export function tendenciaDe(variacaoPct: number | null, sentido: 'alta_boa' | 'alta_ruim', limiar: number): Tendencia {
  if (variacaoPct == null || Math.abs(variacaoPct) < limiar) return 'neutra';
  const subiu = variacaoPct > 0;
  return (sentido === 'alta_boa') === subiu ? 'boa' : 'ruim';
}

/** Séries de preço da CONAB que interessam (praças em ordem de preferência: mais perto primeiro). */
export interface SerieConabCfg { id: string; nome: string; produto: string; classificacao?: RegExp; pracas: string[]; fator: number; unidade: string }
export const SERIES_CONAB: SerieConabCfg[] = [
  { id: 'soja', nome: 'Soja', produto: 'SOJA', pracas: ['ASSIS', 'ORLÂNDIA', 'ARAÇATUBA'], fator: 60, unidade: 'sc' },
  { id: 'milho', nome: 'Milho', produto: 'MILHO', pracas: ['AVARÉ', 'ASSIS', 'OURINHOS', 'ITAPEVA'], fator: 60, unidade: 'sc' },
  { id: 'feijao', nome: 'Feijão', produto: 'FEIJAO', classificacao: /COMUM CORES$/, pracas: ['TAQUARITUBA', 'ITAÍ'], fator: 60, unidade: 'sc' },
  { id: 'trigo', nome: 'Trigo', produto: 'TRIGO', pracas: ['ITAPEVA'], fator: 60, unidade: 'sc' },
  { id: 'cafe', nome: 'Café arábica', produto: 'CAFE', classificacao: /^AR[AÁ]BICA/, pracas: ['MARÍLIA', 'FRANCA', 'ESPÍRITO SANTO DO PINHAL'], fator: 60, unidade: 'sc' },
  { id: 'boi', nome: 'Boi gordo', produto: 'BOI', classificacao: /GORDO/, pracas: ['ARAÇATUBA', 'ANDRADINA'], fator: 15, unidade: '@' },
];
export const URL_CONAB = 'https://portaldeinformacoes.conab.gov.br/downloads/arquivos/PrecosSemanalMunicipio.txt';
export const URL_CONAB_PAGINA = 'https://portaldeinformacoes.conab.gov.br/precos-agropecuarios.html';

export interface LinhaConab { produto: string; classificacao: string; praca: string; uf: string; nivel: string; semana: string; valorKg: number }

/** Arquivo da CONAB (';', colunas pelo cabeçalho) → linhas de SP dos produtos pedidos. */
export function parseConab(texto: string, produtos = new Set(SERIES_CONAB.map((s) => s.produto)), uf = 'SP'): LinhaConab[] {
  const linhas = texto.split(/\r?\n/);
  const cab = (linhas[0] || '').split(';').map((c) => c.trim().toLowerCase());
  const col = (n: string) => cab.indexOf(n);
  const iP = col('produto'), iC = col('classificao_produto') >= 0 ? col('classificao_produto') : col('classificacao_produto');
  const iM = col('nom_municipio'), iU = col('uf'), iS = col('data_inicial_final_semana'), iN = col('dsc_nivel_comercializacao'), iV = col('valor_produto_kg');
  if ([iP, iM, iU, iS, iV].some((i) => i < 0)) throw new Error('CONAB: cabeçalho inesperado');
  const out: LinhaConab[] = [];
  for (let k = 1; k < linhas.length; k++) {
    const c = linhas[k].split(';');
    if (c.length < cab.length) continue;
    if (c[iU].trim() !== uf) continue;
    const produto = c[iP].trim();
    if (!produtos.has(produto)) continue;
    const m = c[iS].match(/(\d{2})-(\d{2})-(\d{4})/);
    const valorKg = Number(c[iV].trim().replace(/\./g, '').replace(',', '.'));
    if (!m || !Number.isFinite(valorKg) || valorKg <= 0) continue;
    out.push({
      produto, classificacao: iC >= 0 ? c[iC].trim() : '', praca: c[iM].trim().replace(/-[A-Z]{2}$/, ''), uf,
      nivel: iN >= 0 ? c[iN].trim() : '', semana: `${m[3]}-${m[2]}-${m[1]}`, valorKg,
    });
  }
  return out;
}

export interface PrecoSemana { cfg: SerieConabCfg; praca: string; nivel: string; semana: string; valor: number; anterior: number | null; semanaAnterior: string | null }

/** Para cada produto: a primeira praça (na ordem de preferência) com dado recente (≤ `maxDias`). Preço do produtor antes do atacado. */
export function precosConab(linhas: LinhaConab[], hojeISO: string, maxDias = 45): PrecoSemana[] {
  const limite = new Date(Date.parse(hojeISO + 'T12:00:00Z') - maxDias * 86_400_000).toISOString().slice(0, 10);
  const out: PrecoSemana[] = [];
  for (const cfg of SERIES_CONAB) {
    let achou: PrecoSemana | null = null;
    for (const praca of cfg.pracas) {
      for (const nivel of ['RECEBIDO', 'ATACADO']) {
        const serie = linhas.filter((l) => l.produto === cfg.produto && l.praca === praca && l.nivel.includes(nivel) && (!cfg.classificacao || cfg.classificacao.test(l.classificacao)));
        if (!serie.length) continue;
        const porSemana = new Map<string, number[]>();
        for (const l of serie) porSemana.set(l.semana, [...(porSemana.get(l.semana) || []), l.valorKg]);
        const semanas = [...porSemana.keys()].sort();
        const ult = semanas[semanas.length - 1];
        if (ult < limite) continue;
        const media = (s: string) => { const v = porSemana.get(s)!; return v.reduce((a, b) => a + b, 0) / v.length; };
        const ant = semanas.length > 1 ? semanas[semanas.length - 2] : null;
        achou = {
          cfg, praca, nivel: nivel === 'RECEBIDO' ? 'produtor' : 'atacado', semana: ult,
          valor: Math.round(media(ult) * cfg.fator * 100) / 100,
          anterior: ant ? Math.round(media(ant) * cfg.fator * 100) / 100 : null, semanaAnterior: ant,
        };
        break;
      }
      if (achou) break;
    }
    if (achou) out.push(achou);
  }
  return out;
}

const nomeProprio = (s: string) => s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m) => m.toUpperCase()).replace(/\b(Do|Da|De|Dos|Das)\b/g, (m) => m.toLowerCase());

export interface DadosBrutos {
  dolar?: { valor: number; anterior: number | null; data: string; fonte_nome: string; fonte_url: string } | null;
  selic?: { valor: number; data: string } | null;
  precos?: PrecoSemana[];
}

/** Dados brutos → cards de indicador (texto já formatado, tendência pela regra de tendenciaDe). */
export function montarIndicadores(b: DadosBrutos): Indicador[] {
  const out: Indicador[] = [];
  if (b.dolar) {
    const v = variacao(b.dolar.valor, b.dolar.anterior);
    out.push({
      id: 'dolar', nome: 'Dólar', valor: b.dolar.valor, texto: `R$ ${fmtNum(b.dolar.valor, 2)}`, variacaoPct: v,
      tendencia: tendenciaDe(v, 'alta_ruim', 0.3), referencia: `fechamento de ${ddmm(b.dolar.data)} · var. no dia`,
      fonte_nome: b.dolar.fonte_nome, fonte_url: b.dolar.fonte_url,
    });
  }
  if (b.selic) {
    out.push({
      id: 'selic', nome: 'Selic (meta)', valor: b.selic.valor, texto: `${fmtNum(b.selic.valor, 2)}% a.a.`, variacaoPct: null,
      tendencia: 'neutra', referencia: 'meta atual do Copom', fonte_nome: 'Banco Central (SGS 432)',
      fonte_url: 'https://www.bcb.gov.br/controleinflacao/taxaselic',
    });
  }
  for (const p of b.precos || []) {
    const v = variacao(p.valor, p.anterior);
    out.push({
      id: `preco-${p.cfg.id}`, nome: p.cfg.nome, valor: p.valor, texto: `${fmtReal(p.valor)}/${p.cfg.unidade}`, variacaoPct: v,
      tendencia: tendenciaDe(v, 'alta_boa', 1),
      referencia: `${nomeProprio(p.praca)} · semana de ${ddmm(p.semana)}${p.nivel === 'atacado' ? ' · atacado' : ''}`,
      fonte_nome: 'CONAB — preços semanais', fonte_url: `${URL_CONAB_PAGINA}#${p.cfg.id}`,
    });
  }
  return out;
}

// ── Focus ─────────────────────────────────────────────────────────────────────

export interface RegistroFocus { Indicador: string; Data: string; DataReferencia: string; Mediana: number }
export const INDICADORES_FOCUS = ['Selic', 'IPCA', 'Câmbio', 'PIB Agropecuária'];
export const URL_FOCUS = 'https://www.bcb.gov.br/publicacoes/focus';

/** Última mediana de cada (indicador, ano) × a mediana de ~4 semanas antes (a mais próxima de 28 dias atrás). */
export function focusComparado(registros: RegistroFocus[], anos: string[], dias = 28): FocusItem[] {
  const out: FocusItem[] = [];
  for (const ind of INDICADORES_FOCUS) {
    for (const ano of anos) {
      const serie = registros.filter((r) => r.Indicador === ind && String(r.DataReferencia) === ano && Number.isFinite(Number(r.Mediana)))
        .sort((a, b) => b.Data.localeCompare(a.Data));
      if (!serie.length) continue;
      const ult = serie[0];
      const alvo = Date.parse(ult.Data + 'T12:00:00Z') - dias * 86_400_000;
      const antigos = serie.filter((r) => Date.parse(r.Data + 'T12:00:00Z') <= alvo);
      const ant = antigos[0] ?? null;
      out.push({ indicador: ind, ano, mediana: Number(ult.Mediana), anterior: ant ? Number(ant.Mediana) : null, data: ult.Data });
    }
  }
  return out;
}

/** Previsão do Focus em alta é ruim (Selic, IPCA, câmbio); PIB do agro em alta é bom. */
export function tendenciaFocus(f: FocusItem): Tendencia {
  if (f.anterior == null || f.mediana === f.anterior) return 'neutra';
  const subiu = f.mediana > f.anterior;
  return f.indicador === 'PIB Agropecuária' ? (subiu ? 'boa' : 'ruim') : (subiu ? 'ruim' : 'boa');
}

// ── clima ─────────────────────────────────────────────────────────────────────

/**
 * Alertas dos próximos dias de uma cidade:
 *  geada (mín. ≤ 3 °C) e chuva forte (≥ 40 mm/dia) = ruins; estiagem (7 dias < 5 mm somados) = ruim;
 *  chuva boa para o plantio (set–dez, 20 a 150 mm na semana, sem dia de chuva forte) = boa.
 */
export function alertasClima(dias: DiaClima[]): AlertaClima[] {
  const out: AlertaClima[] = [];
  if (!dias.length) return out;
  const geada = dias.filter((d) => Number.isFinite(d.tmin) && d.tmin <= 3);
  if (geada.length) {
    const pior = geada.reduce((a, b) => (b.tmin < a.tmin ? b : a));
    out.push({ tipo: 'geada', tendencia: 'ruim', texto: `Risco de geada: mínima de ${fmtNum(pior.tmin, 1)} °C em ${ddmm(pior.data)}` });
  }
  const forte = dias.filter((d) => d.chuva_mm >= 40);
  if (forte.length) {
    const pior = forte.reduce((a, b) => (b.chuva_mm > a.chuva_mm ? b : a));
    out.push({ tipo: 'chuva_forte', tendencia: 'ruim', texto: `Chuva forte: ${fmtNum(pior.chuva_mm, 0)} mm previstos em ${ddmm(pior.data)}` });
  }
  const semana = dias.slice(0, 7);
  const soma = semana.reduce((a, d) => a + (Number(d.chuva_mm) || 0), 0);
  if (semana.length >= 7 && soma < 5) {
    out.push({ tipo: 'estiagem', tendencia: 'ruim', texto: `Estiagem: só ${fmtNum(soma, 1)} mm previstos em 7 dias` });
  } else {
    const mes = Number(dias[0].data.slice(5, 7));
    if (mes >= 9 && mes <= 12 && soma >= 20 && soma <= 150 && !forte.length) {
      out.push({ tipo: 'chuva_boa', tendencia: 'boa', texto: `Chuva boa para o plantio: ${fmtNum(soma, 0)} mm previstos na semana` });
    }
  }
  return out;
}

// ── notícias geradas pelos números (sem IA) ──────────────────────────────────

const verbo = (v: number) => (v > 0 ? 'sobe' : 'cai');

export function noticiasDosIndicadores(
  indicadores: Indicador[], focus: FocusItem[],
  clima: { cidade: string; alertas: AlertaClima[]; fonte_url: string }[],
): NoticiaBoletim[] {
  const out: NoticiaBoletim[] = [];
  const base = { publicado_em: null, destaque: false, cidades: [] as string[] };
  for (const i of indicadores) {
    if (i.variacaoPct == null) continue;
    if (i.id === 'dolar' && Math.abs(i.variacaoPct) >= 0.5) {
      out.push({
        ...base, categoria: 'taxas', tendencia: i.tendencia,
        titulo: `Dólar ${verbo(i.variacaoPct)} ${fmtNum(Math.abs(i.variacaoPct), 1)}% e fecha a ${i.texto}`,
        resumo: `A moeda americana ficou em ${i.texto} (${fmtPct(i.variacaoPct)} no dia).`,
        impacto: i.variacaoPct > 0 ? 'Dólar mais alto tende a encarecer máquinas, peças e insumos — vale adiantar negociações em andamento.' : 'Dólar mais baixo alivia o preço de máquinas, peças e insumos.',
        fonte_nome: i.fonte_nome, fonte_url: i.fonte_url,
      });
    }
    if (i.id.startsWith('preco-') && Math.abs(i.variacaoPct) >= 1) {
      const praca = i.referencia.split(' · ')[0];
      out.push({
        ...base, categoria: 'mercado', tendencia: i.tendencia,
        titulo: `${i.nome} ${verbo(i.variacaoPct)} ${fmtNum(Math.abs(i.variacaoPct), 1)}% em ${praca} na semana`,
        resumo: `O preço pago ao produtor ficou em ${i.texto} (${i.referencia}), ${fmtPct(i.variacaoPct)} sobre a semana anterior, segundo a CONAB.`,
        impacto: i.variacaoPct > 0 ? `Produtor de ${i.nome.toLowerCase()} mais capitalizado: bom momento para oferecer troca de máquina.` : `Margem menor para quem produz ${i.nome.toLowerCase()}: argumente com financiamento e custo por hectare.`,
        fonte_nome: i.fonte_nome, fonte_url: i.fonte_url,
      });
    }
  }
  // Focus: UMA notícia com todas as mudanças (antes saía uma por indicador e poluía o boletim)
  const mudou = focus.filter((f) => f.anterior != null && f.mediana !== f.anterior);
  if (mudou.length) {
    const val = (f: FocusItem, n: number) => (f.indicador === 'Câmbio' ? `R$ ${fmtNum(n, 2)}` : `${fmtNum(n, 2)}%`);
    const nome = (f: FocusItem) => (f.indicador === 'Câmbio' ? 'dólar' : f.indicador);
    const boas = mudou.filter((f) => tendenciaFocus(f) === 'boa').length, ruins = mudou.filter((f) => tendenciaFocus(f) === 'ruim').length;
    const ano = mudou[0].ano;
    const doAno = mudou.filter((f) => f.ano === ano);
    const chamada = doAno.slice(0, 3).map((f) => `${nome(f)} ${f.mediana > f.anterior! ? 'sobe' : 'cai'} para ${val(f, f.mediana)}`).join(', ');
    out.push({
      ...base, categoria: 'taxas', tendencia: boas > ruins ? 'boa' : ruins > boas ? 'ruim' : 'neutra',
      titulo: `Focus: mercado revisa previsões para ${ano} — ${chamada}`.slice(0, 110),
      resumo: `Boletim Focus de ${ddmm(mudou[0].data)}, contra quatro semanas antes: ${mudou.map((f) => `${nome(f)} ${f.ano} ${val(f, f.anterior!)} → ${val(f, f.mediana)}`).join('; ')}.`,
      impacto: boas > ruins ? 'O cenário melhorou no geral: bom argumento para o cliente investir e financiar máquina agora.'
        : ruins > boas ? 'O cenário piorou no geral: juros e preço tendem a pesar na decisão; reforce o custo por hectare e as linhas subsidiadas.'
          : 'Previsões mistas: acompanhe os juros antes de apresentar a proposta de financiamento.',
      fonte_nome: 'Banco Central — Boletim Focus', fonte_url: URL_FOCUS,
    });
  }
  // clima: um aviso por tipo, juntando as cidades
  const porTipo = new Map<string, { a: AlertaClima; cidades: string[]; url: string }>();
  for (const c of clima) for (const a of c.alertas) {
    const e = porTipo.get(a.tipo);
    if (e) e.cidades.push(c.cidade); else porTipo.set(a.tipo, { a, cidades: [c.cidade], url: c.fonte_url });
  }
  for (const { a, cidades } of porTipo.values()) {
    const onde = cidades.length > 2 ? `${cidades.slice(0, -1).join(', ')} e ${cidades[cidades.length - 1]}` : cidades.join(' e ');
    const titulos: Record<AlertaClima['tipo'], string> = {
      geada: `Previsão indica risco de geada em ${onde}`, chuva_forte: `Chuva forte prevista para ${onde}`,
      estiagem: `Semana seca em ${onde}: pouca chuva prevista`, chuva_boa: `Chuva na medida para o plantio em ${onde}`,
    };
    const impactos: Record<AlertaClima['tipo'], string> = {
      geada: 'Produtor preocupado com lavoura e pasto: foque em pós-venda e evite pressionar fechamento esta semana.',
      chuva_forte: 'Campo parado e estradas ruins: bom para visitas de relacionamento e agendar demonstrações para depois.',
      estiagem: 'Plantio pode atrasar; produtor tende a segurar investimento até a chuva firmar.',
      chuva_boa: 'Plantio andando: demanda por plantadeira, pulverizador e trator de reserva aumenta.',
    };
    out.push({
      ...base, categoria: 'clima', tendencia: a.tendencia, cidades,
      titulo: titulos[a.tipo], resumo: `${a.texto} (${cidades[0]}${cidades.length > 1 ? ' e outras cidades' : ''}), pela previsão do Open-Meteo para os próximos 7 dias.`,
      impacto: impactos[a.tipo], fonte_nome: 'Open-Meteo — previsão do tempo', fonte_url: `https://open-meteo.com/#${a.tipo}`,
    });
  }
  return out;
}

// ── IA ────────────────────────────────────────────────────────────────────────

export interface FontePermitida { ref: string; url: string; fonte_nome: string; publicado_em: string | null; texto: string; cidades?: string[] }

const txt = (v: unknown, max: number): string => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const corte = s.slice(0, max - 1);
  const ult = corte.lastIndexOf(' ');
  return (ult > max * 0.6 ? corte.slice(0, ult) : corte).replace(/[,;:\-–—\s]+$/, '') + '…';
};

/** Números citados num texto, normalizados ("1.234,5" → "1234.5"; "3%" → "3"). */
export function numerosDoTexto(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(/\d[\d.,]*/g)) {
    let n = m[0].replace(/[.,]$/, '');
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(n)) n = n.replace(/\./g, '').replace(',', '.');
    else n = n.replace(',', '.');
    const v = Number(n);
    if (Number.isFinite(v)) out.push(String(v));
  }
  return out;
}

const MESES = 'janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro';
/** Todo número do texto da IA tem que existir na fonte. Datas ("19 de outubro", "19/10") e anos ficam liberados. */
export function numerosConferem(textoIA: string, textoFonte: string): boolean {
  const permitidos = new Set(numerosDoTexto(textoFonte));
  const semDatas = textoIA
    .replace(new RegExp(`\\b\\d{1,2}(º)? de (${MESES})\\b`, 'gi'), ' ')
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ')
    .replace(/\b(19|20)\d{2}(\/\d{2})?\b/g, ' ');
  return numerosDoTexto(semDatas).every((n) => permitidos.has(n));
}

export const LIMITES = { titulo: 110, resumo: 420, impacto: 280 };

/**
 * Valida o JSON da IA. Regras:
 *  - a notícia só entra se a `ref` (ou `fonte_url`) for de um candidato/fonte permitida — link e
 *    nome do veículo vêm SEMPRE da nossa lista, nunca do texto da IA;
 *  - categoria e tendência só dos valores válidos (senão: palavra-chave / neutra);
 *  - textos cortados no tamanho máximo;
 *  - número que não está na fonte → volta o título/descrição originais (impacto vazio);
 *  - cidades: só as da lista da região;
 *  - no máximo 3 destaques e uma notícia por link.
 */
export function validarNoticiasIA(
  json: unknown, permitidas: FontePermitida[], cidadesValidas: string[] = [], textoIndicadores = '',
): { manchete: Manchete | null; noticias: NoticiaBoletim[] } {
  const j = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const porRef = new Map(permitidas.map((p) => [p.ref, p]));
  const porUrl = new Map(permitidas.map((p) => [p.url, p]));
  const cidadesNorm = new Map(cidadesValidas.map((c) => [textoNorm(c), c]));
  const arr = Array.isArray(j.noticias) ? (j.noticias as Record<string, unknown>[]) : [];
  const out: NoticiaBoletim[] = [];
  const usados = new Set<string>();
  for (const x of arr) {
    if (!x || typeof x !== 'object') continue;
    const f = porRef.get(String(x.ref ?? '').trim()) || porUrl.get(String(x.fonte_url ?? '').trim());
    if (!f || usados.has(f.url)) continue;
    const fonteTexto = `${f.texto} ${textoIndicadores}`;
    let titulo = txt(x.titulo, LIMITES.titulo), resumo = txt(x.resumo, LIMITES.resumo), impacto = txt(x.impacto, LIMITES.impacto);
    if (!titulo || !numerosConferem(`${titulo} ${resumo}`, fonteTexto)) {
      const [t0, ...r0] = f.texto.split(' — ');
      titulo = txt(t0, LIMITES.titulo); resumo = txt(r0.join(' — '), LIMITES.resumo);
    }
    if (!numerosConferem(impacto, fonteTexto)) impacto = '';
    if (!titulo) continue;
    const catIA = String(x.categoria ?? '').toLowerCase().trim();
    const tenIA = String(x.tendencia ?? '').toLowerCase().trim();
    const cidades = [...new Set([
      ...(Array.isArray(x.cidades) ? x.cidades : []).map((c) => cidadesNorm.get(textoNorm(c))).filter((c): c is string => !!c),
      ...(f.cidades || []),
    ])];
    usados.add(f.url);
    out.push({
      categoria: (CATEGORIAS as readonly string[]).includes(catIA) ? (catIA as Categoria) : categoriaPorPalavra(f.texto, cidades.length > 0),
      tendencia: TENDENCIAS.includes(tenIA as Tendencia) ? (tenIA as Tendencia) : 'neutra',
      titulo, resumo, impacto, fonte_nome: f.fonte_nome, fonte_url: f.url, publicado_em: f.publicado_em,
      destaque: x.destaque === true, cidades,
    });
  }
  let n = 0;
  for (const o of out) if (o.destaque && ++n > 3) o.destaque = false;

  let manchete: Manchete | null = null;
  const m = j.manchete as Record<string, unknown> | undefined;
  if (m && typeof m === 'object') {
    const titulo = txt(m.titulo, LIMITES.titulo), resumo = txt(m.resumo, LIMITES.resumo);
    const tudo = `${permitidas.map((p) => p.texto).join(' ')} ${textoIndicadores}`;
    if (titulo && numerosConferem(`${titulo} ${resumo}`, tudo)) manchete = { titulo, resumo };
  }
  return { manchete, noticias: out };
}

/** Sem IA (ou IA fora): a notícia do RSS como veio, categoria por palavra-chave, tendência neutra. */
export function noticiaSemIA(c: Candidato): NoticiaBoletim {
  return {
    categoria: categoriaPorPalavra(`${c.titulo} ${c.descricao}`, c.cidades.length > 0), tendencia: 'neutra',
    titulo: txt(c.titulo, LIMITES.titulo), resumo: txt(c.descricao, LIMITES.resumo), impacto: '',
    fonte_nome: c.fonte_nome, fonte_url: c.link, publicado_em: c.publicadoEm, destaque: false, cidades: c.cidades,
  };
}

export const PROMPT_IA = `Você é o editor do "Boletim do agro" de uma concessionária de tratores Mahindra em Piraju-SP
(região de Avaré, Ourinhos, Itapeva, Fartura, Taquarituba, Santa Cruz do Rio Pardo e vizinhas). O leitor é VENDEDOR de
tratores e implementos: quer saber em 1 minuto o que mudou hoje e como isso afeta a venda.

Você recebe NOTÍCIAS CANDIDATAS numeradas ([c1], [c2]...) e INDICADORES do dia. Escolha de 12 a 20 notícias, priorizando:
região > crédito rural/juros > preços de grãos, café e boi > clima > máquinas > política agrícola. Ignore notícia sem
relação com o agro ou com a economia do produtor, e notícias repetidas.
NUNCA escolha crime, polícia, acidente, morte, trânsito, esporte, saúde, educação ou evento de prefeitura que não seja
agro — mesmo que seja de uma cidade da região. Notícia da região só entra se falar de produtor, lavoura, pecuária,
clima no campo, feira/evento agro, cooperativa, emprego rural ou economia agrícola da cidade.

Responda SÓ um JSON:
{"manchete":{"titulo":"","resumo":""},
 "noticias":[{"ref":"c1","titulo":"","resumo":"","impacto":"","categoria":"","tendencia":"","destaque":false,"cidades":[]}]}

Regras:
- "ref" = o número da candidata usada (ex.: "c7"). NÃO invente links nem fontes.
- "titulo": tom jornalístico, até 110 caracteres, sem ponto final.
- "resumo": 2 ou 3 frases curtas, só com fatos da candidata.
- "impacto": 1 frase — o que isso muda para quem vende trator na região.
- NÃO invente números: use só números que aparecem na candidata ou nos indicadores. Na dúvida, escreva sem número.
- "categoria": taxas | mercado | regiao | clima | credito | maquinas | politica.
- "tendencia" para a venda de máquinas: boa | ruim | neutra (preço de grão/boi/café em alta = boa; dólar, juros e
  inflação em alta = ruim; geada/estiagem = ruim; chuva boa no plantio = boa).
- "destaque": true só nas 3 mais importantes do dia.
- "cidades": cidades da região citadas na notícia (nomes exatamente como na lista de cidades).
- "manchete": a principal mensagem do dia para o vendedor (pode juntar notícias e indicadores), título até 110
  caracteres e resumo de 2 frases.`;

/** Fora do boletim antes mesmo da IA: crime, acidente e afins sem nenhuma palavra do agro. */
export function foraDoAgro(titulo: string): boolean {
  const t = textoNorm(titulo);
  return /\b(morre|morte|morreu|mortos?|acidente|policia|preso|presa|prisao|assassin|homicidio|tiroteio|furto|roubo|crime|trafico|batida|capota|atropel|incendio em casa|desaparecid)/.test(t)
    && !/\b(agro|rural|safra|lavoura|soja|milho|cafe|boi|gado|trator|maquina|produtor|colheita|plantio|fazenda|sitio)/.test(t);
}
