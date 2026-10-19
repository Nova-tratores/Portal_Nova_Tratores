/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// INTELIGÊNCIA DE VENDAS — Boletim do agro (servidor): o robô que coleta as
// fontes, pede à IA a edição do dia (UMA chamada) e grava iv_boletim/iv_noticias.
//
// Cada fonte falha sozinha (fica registrada em `fontes`/`erros`); sem chave de IA
// ou com a IA fora, as notícias entram como vieram do RSS — o boletim não falha.
// =============================================================================
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { chamarIA } from '@/lib/assistente/ia';
import { emCache } from './server';
import { municipiosDaLoja } from './ibge-server';
import { hojeBR, somarDias } from './normalizar';
import {
  PROMPT_IA, URL_CONAB, foraDoAgro, alertasClima, cidadesCitadas, filtrarJanela, focusComparado,
  fmtNum, montarIndicadores, noticiaSemIA, noticiasDosIndicadores, parseConab, parseRSS, pontuar, precosConab,
  selecionarCandidatos, tirarVeiculoDoTitulo, validarNoticiasIA,
  type AlertaClima, type Candidato, type ClimaCidade, type DadosBrutos, type DiaClima, type FocusItem,
  type FontePermitida, type Indicador, type Manchete, type NoticiaBoletim, type RegistroFocus,
} from './noticias';
import { linhaServeMaquina } from './plano-safra';
import { corpoGoogle, ehLinkGoogle, extrairArtigo, idDoLinkGoogle, parametrosGoogle, urlDaRespostaGoogle } from './noticias-artigo';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function baixar(url: string, o: { timeout?: number; tentativas?: number; accept?: string } = {}): Promise<Response> {
  let ultimo: unknown;
  for (let i = 0; i < (o.tentativas ?? 1); i++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: o.accept || '*/*', 'Accept-Language': 'pt-BR,pt;q=0.9' },
        signal: AbortSignal.timeout(o.timeout ?? 20_000), redirect: 'follow', cache: 'no-store',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) { ultimo = e; }
  }
  throw new Error(String((ultimo as any)?.message || ultimo));
}
const baixarTexto = async (url: string, o?: Parameters<typeof baixar>[1]) => (await baixar(url, o)).text();
const baixarJSON = async (url: string, o?: Parameters<typeof baixar>[1]) => (await baixar(url, { accept: 'application/json', ...o })).json();

// ── fontes ────────────────────────────────────────────────────────────────────

interface Feed { id: string; nome: string; url: string; regional?: boolean; google?: boolean }

const google = (q: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:2d`)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

export const FEEDS: Feed[] = [
  { id: 'g1-agro', nome: 'G1 Agronegócios', url: 'https://g1.globo.com/rss/g1/economia/agronegocios/' },
  { id: 'g1-regiao', nome: 'G1 Itapetininga e região', url: 'https://g1.globo.com/rss/g1/sp/itapetininga-regiao/', regional: true },
  { id: 'canal-rural', nome: 'Canal Rural', url: 'https://www.canalrural.com.br/feed/' },
  { id: 'agrolink', nome: 'Agrolink', url: 'https://www.agrolink.com.br/rss/noticias.xml' },
  { id: 'agencia-brasil', nome: 'Agência Brasil — Economia', url: 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml' },
  { id: 'gn-regiao-1', nome: 'Google Notícias (região 1)', regional: true, google: true,
    url: google('(agro OR rural OR produtor OR safra OR lavoura) (Piraju OR Avaré OR Ourinhos OR Itapeva OR Fartura OR Taquarituba)') },
  { id: 'gn-regiao-2', nome: 'Google Notícias (região 2)', regional: true, google: true,
    url: google('(agro OR rural OR produtor OR safra OR lavoura) (Itaí OR "Cerqueira César" OR "Santa Cruz do Rio Pardo" OR "Bernardino de Campos" OR Ipaussu OR Chavantes OR Itararé)') },
  { id: 'gn-credito', nome: 'Google Notícias (crédito rural)', google: true, url: google('"Plano Safra" OR Moderfrota OR Pronaf OR "crédito rural"') },
  { id: 'gn-precos', nome: 'Google Notícias (preços)', google: true, url: google('preço soja OR milho OR café OR "boi gordo"') },
  { id: 'gn-clima', nome: 'Google Notícias (clima)', google: true, url: google('(geada OR chuva OR estiagem) "São Paulo" agro') },
  { id: 'gn-maquinas', nome: 'Google Notícias (máquinas)', google: true, url: google('trator OR "máquinas agrícolas" vendas') },
];

/** Cidades da previsão do tempo (coordenadas fixas do centro da cidade). */
export const CIDADES_CLIMA: { cidade: string; lat: number; lng: number }[] = [
  { cidade: 'Piraju', lat: -23.19, lng: -49.38 },
  { cidade: 'Avaré', lat: -23.10, lng: -48.93 },
  { cidade: 'Ourinhos', lat: -22.98, lng: -49.87 },
  { cidade: 'Itapeva', lat: -23.98, lng: -48.88 },
  { cidade: 'Fartura', lat: -23.39, lng: -49.51 },
];
const urlClima = (lat: number | string, lng: number | string) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=America%2FSao_Paulo&forecast_days=7`;

/** Cidades usadas para marcar "região": as 45 da loja + praças vizinhas que aparecem nas notícias. */
function cidadesDaRegiao(): string[] {
  const loja = municipiosDaLoja().map((m) => m.nome);
  return [...new Set([...loja, 'Itapeva', 'Assis', 'Botucatu', 'Itapetininga'])];
}

async function coletarFeed(f: Feed, cidades: string[], agora: Date): Promise<Candidato[]> {
  const xml = await baixarTexto(f.url, { timeout: 20_000, tentativas: 2, accept: 'application/rss+xml, application/xml, text/xml' });
  const itens = filtrarJanela(parseRSS(xml), 48, agora);
  return itens.map((i) => {
    const titulo = tirarVeiculoDoTitulo(i.titulo, i.fonte);
    // a descrição do Google Notícias só repete o título + veículo: descarta
    const descricao = f.google ? '' : i.descricao.slice(0, 600);
    const item = { ...i, titulo, descricao };
    const cid = cidadesCitadas(`${titulo} ${descricao}`, cidades);
    return {
      ...item, feed: f.id, cidades: cid, fonte_nome: (f.google && i.fonte) || f.nome.replace(/ \(.*\)$/, ''),
      pontos: pontuar(item, cid, !!f.regional, agora),
    };
  });
}

async function dolar(fontes: Record<string, 'ok' | 'erro'>, erros: string[]): Promise<DadosBrutos['dolar']> {
  try {
    const j = await baixarJSON('https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados/ultimos/2?formato=json', { timeout: 12_000, tentativas: 2 });
    const arr = (Array.isArray(j) ? j : []).filter((x: any) => Number.isFinite(Number(x?.valor)));
    if (!arr.length) throw new Error('série vazia');
    const ult = arr[arr.length - 1], ant = arr.length > 1 ? arr[arr.length - 2] : null;
    const [d, m, a] = String(ult.data).split('/');
    fontes['Dólar PTAX (BCB)'] = 'ok';
    return { valor: Number(ult.valor), anterior: ant ? Number(ant.valor) : null, data: `${a}-${m}-${d}`, fonte_nome: 'Banco Central — PTAX', fonte_url: 'https://www.bcb.gov.br/estabilidadefinanceira/historicocotacoes' };
  } catch (e: any) {
    fontes['Dólar PTAX (BCB)'] = 'erro';
    erros.push(`Dólar PTAX (BCB): ${e?.message || e}`);
  }
  try {
    const j = await baixarJSON('https://economia.awesomeapi.com.br/json/last/USD-BRL', { timeout: 12_000, tentativas: 2 });
    const u = j?.USDBRL;
    const valor = Number(u?.bid), pct = Number(u?.pctChange);
    if (!Number.isFinite(valor)) throw new Error('resposta sem cotação');
    fontes['Dólar (AwesomeAPI)'] = 'ok';
    return {
      valor: Math.round(valor * 10_000) / 10_000, anterior: Number.isFinite(pct) ? valor / (1 + pct / 100) : null,
      data: String(u.create_date || '').slice(0, 10) || hojeBR(), fonte_nome: 'AwesomeAPI — câmbio', fonte_url: 'https://economia.awesomeapi.com.br/json/last/USD-BRL',
    };
  } catch (e: any) {
    fontes['Dólar (AwesomeAPI)'] = 'erro';
    erros.push(`Dólar (AwesomeAPI): ${e?.message || e}`);
    return null;
  }
}

async function selic(): Promise<DadosBrutos['selic']> {
  const j = await baixarJSON('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json', { timeout: 12_000, tentativas: 2 });
  const u = Array.isArray(j) ? j[j.length - 1] : null;
  const valor = Number(u?.valor);
  if (!u || !Number.isFinite(valor)) throw new Error('série vazia');
  const [d, m, a] = String(u.data).split('/');
  return { valor, data: `${a}-${m}-${d}` };
}

async function focus(hoje: string): Promise<FocusItem[]> {
  const ano = Number(hoje.slice(0, 4));
  const anos = [String(ano), String(ano + 1)];
  const desde = somarDias(hoje, -45);
  const listas = await Promise.all(['Selic', 'IPCA', 'Câmbio', 'PIB Agropecuária'].map(async (ind) => {
    const filtro = `Indicador eq '${ind}' and baseCalculo eq 0 and Data ge '${desde}'`;
    const url = `https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$top=400&$filter=${encodeURIComponent(filtro)}&$orderby=${encodeURIComponent('Data desc')}&$format=json&$select=Indicador,Data,DataReferencia,Mediana`;
    const j = await baixarJSON(url, { timeout: 25_000, tentativas: 2 });
    return (j?.value || []) as RegistroFocus[];
  }));
  const r = focusComparado(listas.flat(), anos);
  if (!r.length) throw new Error('Focus sem dados');
  return r;
}

async function clima(): Promise<(ClimaCidade & { alertasObj: AlertaClima[]; fonte_url: string })[]> {
  const lats = CIDADES_CLIMA.map((c) => c.lat).join(','), lngs = CIDADES_CLIMA.map((c) => c.lng).join(',');
  const j = await baixarJSON(urlClima(lats, lngs), { timeout: 20_000, tentativas: 2 });
  const arr = Array.isArray(j) ? j : [j];
  return CIDADES_CLIMA.map((c, k) => {
    const d = arr[k]?.daily || {};
    const dias: DiaClima[] = (d.time || []).map((t: string, i: number) => ({
      data: t, chuva_mm: Number(d.precipitation_sum?.[i]) || 0,
      prob: d.precipitation_probability_max?.[i] == null ? null : Number(d.precipitation_probability_max[i]),
      tmin: Number(d.temperature_2m_min?.[i]), tmax: Number(d.temperature_2m_max?.[i]),
    }));
    const alertasObj = alertasClima(dias);
    return { cidade: c.cidade, dias, alertas: alertasObj.map((a) => a.texto), alertasObj, fonte_url: urlClima(c.lat, c.lng) };
  });
}

/** Arquivo da CONAB (~20 MB, latin1): baixa inteiro e guarda só as linhas de SP que interessam (cache 12 h). */
async function linhasConab() {
  return emCache('iv-conab-precos', 12 * 3_600_000, async () => {
    const r = await baixar(URL_CONAB, { timeout: 90_000, tentativas: 2, accept: 'text/plain' });
    const texto = new TextDecoder('latin1').decode(await r.arrayBuffer());
    return parseConab(texto);
  });
}

/** Linhas do Plano Safra atualizadas nas últimas 48 h viram UMA notícia de crédito (todas as linhas juntas). */
async function planoSafraRecente(): Promise<NoticiaBoletim[]> {
  const desde = new Date(Date.now() - 48 * 3_600_000).toISOString();
  const { data, error } = await supabaseAdmin.from('iv_linhas_credito')
    .select('id,programa,nome,taxa_aa,taxa_aa_max,prazo_anos,fonte_url,conferido_em,conferido_por,safra,financia,publico')
    .eq('status', 'vigente').gte('conferido_em', desde).order('taxa_aa');
  if (error) throw error;
  const linhas = (data || []).filter(linhaServeMaquina);
  if (!linhas.length) return [];
  const nomeProg = (p: string) => ({ pronaf: 'Pronaf Mais Alimentos', pronamp: 'Pronamp', moderfrota: 'Moderfrota', inovagro: 'Inovagro' } as Record<string, string>)[p] || p;
  const porPrograma = new Map<string, any[]>();
  for (const l of linhas) porPrograma.set(l.programa, [...(porPrograma.get(l.programa) || []), l]);
  const menor = linhas.find((l: any) => l.taxa_aa != null);
  const robo = linhas.every((l: any) => /rob/i.test(String(l.conferido_por || '')));
  const resumoProg = [...porPrograma.entries()].map(([p, ls]) => `${nomeProg(p)} a partir de ${fmtNum(Number(ls[0].taxa_aa ?? 0), 2)}% ao ano`).join('; ');
  return [{
    categoria: 'credito', tendencia: 'neutra', destaque: false, cidades: [], publicado_em: linhas.map((l: any) => l.conferido_em).sort().pop() || null,
    titulo: `Plano Safra ${linhas[0].safra || ''}: juros para máquina a partir de ${menor ? fmtNum(Number(menor.taxa_aa), 2) : '?'}% ao ano`.replace('  ', ' ').slice(0, 110),
    resumo: `${robo ? 'O robô leu as páginas oficiais do BNDES e atualizou' : 'A equipe atualizou'} as condições de ${porPrograma.size} programa(s): ${resumoProg}.`,
    impacto: 'As taxas novas já estão na calculadora: use "Calcular" no quadro do Plano Safra antes de apresentar o financiamento.',
    fonte_nome: 'BNDES — páginas oficiais', fonte_url: menor?.fonte_url ? `${menor.fonte_url}#iv-plano-safra` : 'https://www.bndes.gov.br#iv-plano-safra',
  }];
}

// ── matéria completa: link real, foto e texto ────────────────────────────────

/** Link do Google Notícias → link real (2 chamadas). Falhou: devolve null e fica o do Google. */
async function resolverGoogle(url: string): Promise<string | null> {
  try {
    const id = idDoLinkGoogle(url);
    if (!id) return null;
    const pg = await baixarTexto(`https://news.google.com/articles/${id}?hl=pt-BR&gl=BR&ceid=BR:pt-419`, { timeout: 12_000 });
    const p = parametrosGoogle(pg);
    if (!p) return null;
    const r = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
      method: 'POST', body: corpoGoogle(id, p.ts, p.sg), signal: AbortSignal.timeout(12_000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': UA },
    });
    return r.ok ? urlDaRespostaGoogle(await r.text()) : null;
  } catch { return null; }
}

const OFICIAIS = /bcb\.gov\.br|open-meteo\.com|bndes\.gov\.br/i;

/** Abre cada matéria (6 por vez, 15 s cada) e guarda link real, foto e parágrafos. Erro = fica sem. */
async function enriquecer(noticias: NoticiaBoletim[], fotosRSS: Map<string, string>): Promise<void> {
  const fila = noticias.filter((n) => !OFICIAIS.test(n.fonte_url));
  let i = 0;
  const trabalhador = async () => {
    while (i < fila.length) {
      const n = fila[i++];
      n.imagem_url = fotosRSS.get(n.fonte_url) || null;
      try {
        const real = ehLinkGoogle(n.fonte_url) ? await resolverGoogle(n.fonte_url) : n.fonte_url;
        if (!real) continue;
        n.url_artigo = real;
        const html = await baixarTexto(real, { timeout: 15_000, accept: 'text/html' });
        const a = extrairArtigo(html.slice(0, 2_500_000), real);
        if (!n.imagem_url && a.imagem) n.imagem_url = a.imagem;
        if (a.paragrafos.length >= 2) n.corpo = a.paragrafos;
      } catch { /* sem a matéria: o modal mostra o resumo e o link */ }
    }
  };
  await Promise.all(Array.from({ length: 6 }, trabalhador));
}

const colunaFaltando = (e: any) => e?.code === '42703' || e?.code === 'PGRST204' || /column .* does not exist|Could not find the .* column/i.test(String(e?.message));

// ── geração ───────────────────────────────────────────────────────────────────

export interface Previsoes { focus: FocusItem[]; clima: ClimaCidade[] }
export interface ResultadoBoletim {
  dia: string; gravado: boolean; pulado?: string; usouIA: boolean; candidatos: number;
  manchete: Manchete | null; indicadores: Indicador[]; noticias: NoticiaBoletim[]; previsoes: Previsoes;
  fontes: Record<string, 'ok' | 'erro'>; erros: string[];
}

const g = globalThis as any;

/** Uma geração por vez no processo (robô e botão "Atualizar" esperam a mesma). */
export function gerarBoletim(opcoes: { forcar?: boolean; gravar?: boolean } = {}): Promise<ResultadoBoletim> {
  if (g.__ivBoletimRodando) return g.__ivBoletimRodando;
  const p = gerarBoletimAgora(opcoes).finally(() => { g.__ivBoletimRodando = null; });
  g.__ivBoletimRodando = p;
  return p;
}

export function boletimRodando(): boolean { return !!g.__ivBoletimRodando; }

async function gerarBoletimAgora({ forcar = false, gravar = true }: { forcar?: boolean; gravar?: boolean }): Promise<ResultadoBoletim> {
  const agora = new Date();
  const dia = hojeBR(agora);
  const fontes: Record<string, 'ok' | 'erro'> = {};
  const erros: string[] = [];
  const vazio: ResultadoBoletim = { dia, gravado: false, usouIA: false, candidatos: 0, manchete: null, indicadores: [], noticias: [], previsoes: { focus: [], clima: [] }, fontes, erros };

  if (gravar && !forcar) {
    const { data, error } = await supabaseAdmin.from('iv_boletim').select('dia').eq('dia', dia).maybeSingle();
    if (error) throw error;
    if (data) return { ...vazio, pulado: 'boletim de hoje já existe' };
  }

  const cidades = cidadesDaRegiao();
  const tenta = async <T>(nome: string, fn: () => Promise<T>, padrao: T): Promise<T> => {
    try { const r = await fn(); fontes[nome] = 'ok'; return r; } catch (e: any) {
      fontes[nome] = 'erro'; erros.push(`${nome}: ${String(e?.message || e).slice(0, 200)}`); return padrao;
    }
  };

  const [feeds, dol, sel, foc, cli, conab, safra] = await Promise.all([
    Promise.all(FEEDS.map((f) => tenta(f.nome, () => coletarFeed(f, cidades, agora), [] as Candidato[]))),
    dolar(fontes, erros),
    tenta('Selic meta (BCB SGS 432)', selic, null),
    tenta('Focus (BCB)', () => focus(dia), [] as FocusItem[]),
    tenta('Clima (Open-Meteo)', clima, [] as Awaited<ReturnType<typeof clima>>),
    tenta('CONAB preços semanais', linhasConab, [] as Awaited<ReturnType<typeof linhasConab>>),
    (async () => {
      try { const r = await planoSafraRecente(); fontes['Plano Safra (portal)'] = 'ok'; return r; } catch (e: any) {
        // tabela do Plano Safra pode ainda não existir: não é erro do boletim
        if (!/iv_linhas_credito/.test(String(e?.message))) { fontes['Plano Safra (portal)'] = 'erro'; erros.push(`Plano Safra: ${e?.message || e}`); }
        return [] as NoticiaBoletim[];
      }
    })(),
  ]);

  const precos = precosConab(conab, dia);
  if (fontes['CONAB preços semanais'] === 'ok' && !precos.length) erros.push('CONAB: nenhuma praça da região com preço recente');
  const indicadores = montarIndicadores({ dolar: dol, selic: sel, precos });
  const candidatos = selecionarCandidatos(feeds.flat().filter((c) => !foraDoAgro(c.titulo)), 70);

  // notícias geradas pelos números (link = fonte oficial)
  const doNumero = [
    ...noticiasDosIndicadores(indicadores, foc, cli.map((c) => ({ cidade: c.cidade, alertas: c.alertasObj, fonte_url: c.fonte_url }))),
    ...safra,
  ];

  // texto de referência com os números permitidos à IA
  const textoIndicadores = [
    ...indicadores.map((i) => `${i.nome}: ${i.texto}${i.variacaoPct != null ? ` (${fmtNum(i.variacaoPct, 2)}%)` : ''} — ${i.referencia}`),
    ...foc.map((f) => `Focus ${f.indicador} ${f.ano}: ${fmtNum(f.mediana, 2)}${f.anterior != null ? ` (4 semanas antes: ${fmtNum(f.anterior, 2)})` : ''}`),
    ...cli.flatMap((c) => c.alertas.map((a) => `${c.cidade}: ${a}`)),
    ...doNumero.map((n) => `${n.titulo}. ${n.resumo}`),
  ].join('\n');

  const permitidas: FontePermitida[] = candidatos.map((c, k) => ({
    ref: `c${k + 1}`, url: c.link, fonte_nome: c.fonte_nome, publicado_em: c.publicadoEm,
    texto: c.descricao ? `${c.titulo} — ${c.descricao}` : c.titulo, cidades: c.cidades,
  }));

  let manchete: Manchete | null = null;
  let daIA: NoticiaBoletim[] = [];
  let usouIA = false;
  if (candidatos.length) {
    try {
      const lista = permitidas.map((p) => `[${p.ref}] (${p.fonte_nome}${p.publicado_em ? `, ${p.publicado_em.slice(0, 10)}` : ''}) ${p.texto.slice(0, 380)}`).join('\n');
      const j = await chamarIA({
        temperature: 0.3, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PROMPT_IA },
          { role: 'user', content: `Hoje: ${dia}\nCidades da região: ${cidades.join(', ')}\n\nINDICADORES DO DIA:\n${textoIndicadores || '(nenhum)'}\n\nNOTÍCIAS CANDIDATAS:\n${lista}` },
        ],
      });
      const v = validarNoticiasIA(JSON.parse(j?.choices?.[0]?.message?.content || '{}'), permitidas, cidades, textoIndicadores);
      manchete = v.manchete;
      daIA = v.noticias;
      usouIA = daIA.length > 0;
      fontes['IA (edição)'] = usouIA ? 'ok' : 'erro';
      if (!usouIA) erros.push('IA: nenhuma notícia válida na resposta');
    } catch (e: any) {
      fontes['IA (edição)'] = 'erro';
      erros.push(`IA: ${String(e?.message || e).slice(0, 200)}`);
    }
  }

  // sem IA (ou IA devolveu pouco): completa com as candidatas como vieram
  if (daIA.length < 12) {
    const usados = new Set(daIA.map((n) => n.fonte_url));
    for (const c of candidatos) {
      if (daIA.length >= (usouIA ? 12 : 20)) break;
      if (!usados.has(c.link)) { daIA.push(noticiaSemIA(c)); usados.add(c.link); }
    }
  }
  if (!daIA.some((n) => n.destaque)) daIA.slice(0, 3).forEach((n) => { n.destaque = true; });

  // ordem: destaques → números do dia → resto; uma notícia por link (unique no banco)
  // (as candidatas já foram deduplicadas por link e título; aqui só o link, que é unique no banco)
  const vistos = new Set<string>();
  const noticias = [...daIA.filter((n) => n.destaque), ...doNumero, ...daIA.filter((n) => !n.destaque)]
    .filter((n) => !vistos.has(n.fonte_url) && !!vistos.add(n.fonte_url)).slice(0, 32);

  if (!manchete) {
    const m = noticias.find((n) => n.destaque) || noticias[0];
    manchete = m ? { titulo: m.titulo, resumo: m.resumo } : null;
  }

  // foto e texto de cada matéria (o RSS às vezes já traz a foto)
  const fotosRSS = new Map(candidatos.filter((c) => c.imagem).map((c) => [c.link, c.imagem as string]));
  await enriquecer(noticias, fotosRSS);
  const comTexto = noticias.filter((n) => n.corpo?.length).length, comFoto = noticias.filter((n) => n.imagem_url).length;
  fontes[`Matérias abertas (${comTexto} com texto, ${comFoto} com foto)`] = comTexto ? 'ok' : 'erro';

  const previsoes: Previsoes = { focus: foc, clima: cli.map(({ cidade, dias, alertas }) => ({ cidade, dias, alertas })) };
  const resultado: ResultadoBoletim = { dia, gravado: false, usouIA, candidatos: candidatos.length, manchete, indicadores, noticias, previsoes, fontes, erros };
  if (!gravar) return resultado;

  const { error: e1 } = await supabaseAdmin.from('iv_boletim').upsert({
    dia, manchete, indicadores, previsoes, gerado_em: new Date().toISOString(), fontes, erros,
  }, { onConflict: 'dia' });
  if (e1) throw e1;
  const { error: e2 } = await supabaseAdmin.from('iv_noticias').delete().eq('dia', dia);
  if (e2) throw e2;
  if (noticias.length) {
    let { error: e3 } = await supabaseAdmin.from('iv_noticias').insert(noticias.map((n) => ({ ...n, dia })));
    // sem as colunas novas (imagem_url/url_artigo/corpo): grava sem elas
    if (e3 && colunaFaltando(e3)) {
      ({ error: e3 } = await supabaseAdmin.from('iv_noticias').insert(noticias.map((n) => {
        const x: Record<string, unknown> = { ...n, dia };
        delete x.imagem_url; delete x.url_artigo; delete x.corpo;
        return x;
      })));
    }
    if (e3) throw e3;
  }
  return { ...resultado, gravado: true };
}

// ── robô ──────────────────────────────────────────────────────────────────────

const horaMinBR = (d: Date) => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  return Number(p.find((x) => x.type === 'hour')?.value) * 60 + Number(p.find((x) => x.type === 'minute')?.value);
};

/**
 * Chamado pelo agendador (instrumentation.ts) a cada 10 min:
 *  - na subida do processo (`boot`): gera se ainda não existe o boletim de hoje;
 *  - depois das 06:30 BRT: gera (de novo) se o de hoje não existe ou foi feito antes das 06:00
 *    (ex.: o processo subiu de madrugada) — assim o boletim do dia sempre tem as notícias da manhã.
 * Devolve uma linha para o log, ou null quando não havia nada a fazer.
 */
export async function rodarBoletimAgendado(boot = false): Promise<string | null> {
  const agora = new Date();
  const dia = hojeBR(agora);
  if (g.__ivBoletimOk === dia) return null;
  const { data, error } = await supabaseAdmin.from('iv_boletim').select('dia,gerado_em').eq('dia', dia).maybeSingle();
  if (error) throw error; // tabela faltando: o instrumentation loga e segue
  const geradoCedo = data?.gerado_em ? horaMinBR(new Date(data.gerado_em)) < 6 * 60 && hojeBR(new Date(data.gerado_em)) === dia : false;
  const depoisDas630 = horaMinBR(agora) >= 6 * 60 + 30;
  if (data && !geradoCedo) { g.__ivBoletimOk = dia; return null; }
  if (!boot && !depoisDas630) return null;
  if (data && geradoCedo && !depoisDas630) return null;
  // falhou há pouco (ex.: banco fora): espera 30 min antes de tentar de novo
  if (g.__ivBoletimFalhaEm && Date.now() - g.__ivBoletimFalhaEm < 30 * 60_000) return null;
  let r: ResultadoBoletim;
  try { r = await gerarBoletim({ forcar: true }); } catch (e) { g.__ivBoletimFalhaEm = Date.now(); throw e; }
  g.__ivBoletimFalhaEm = 0;
  if (depoisDas630) g.__ivBoletimOk = dia;
  const ok = Object.values(r.fontes).filter((v) => v === 'ok').length;
  return `${r.noticias.length} notícias, ${r.candidatos} candidatas, fontes ${ok}/${Object.keys(r.fontes).length} ok${r.usouIA ? '' : ' (sem IA)'}`;
}

// ── leitura para a API ───────────────────────────────────────────────────────

export interface BoletimAPI {
  dia: string; dias: string[]; geradoEm: string | null; manchete: Manchete | null; indicadores: Indicador[];
  noticias: (NoticiaBoletim & { id: number })[]; previsoes: Previsoes; fontes: Record<string, 'ok' | 'erro'>;
}

export async function lerBoletim(diaPedido?: string | null): Promise<BoletimAPI> {
  const { data: lista, error } = await supabaseAdmin.from('iv_boletim').select('dia').order('dia', { ascending: false }).limit(14);
  if (error) throw error;
  const dias = (lista || []).map((x: any) => String(x.dia));
  const dia = diaPedido && /^\d{4}-\d{2}-\d{2}$/.test(diaPedido) ? diaPedido : dias[0] || hojeBR();
  const vazio: BoletimAPI = { dia, dias, geradoEm: null, manchete: null, indicadores: [], noticias: [], previsoes: { focus: [], clima: [] }, fontes: {} };
  const BASE = 'id,categoria,tendencia,titulo,resumo,impacto,fonte_nome,fonte_url,publicado_em,destaque,cidades';
  const lerNoticias = (cols: string) => supabaseAdmin.from('iv_noticias').select(cols).eq('dia', dia).order('destaque', { ascending: false }).order('id', { ascending: true });
  const [{ data: b, error: e1 }, r2] = await Promise.all([
    supabaseAdmin.from('iv_boletim').select('*').eq('dia', dia).maybeSingle(),
    lerNoticias(`${BASE},imagem_url,url_artigo,corpo`),
  ]);
  if (e1) throw e1;
  let { data: ns, error: e2 } = r2 as { data: any[] | null; error: any };
  if (e2 && colunaFaltando(e2)) ({ data: ns, error: e2 } = (await lerNoticias(BASE)) as { data: any[] | null; error: any });
  if (e2) throw e2;
  if (!b) return vazio;
  const prev = (b.previsoes || {}) as Partial<Previsoes>;
  return {
    dia, dias, geradoEm: b.gerado_em ?? null,
    manchete: b.manchete && (b.manchete as any).titulo ? { titulo: String((b.manchete as any).titulo), resumo: String((b.manchete as any).resumo || '') } : null,
    indicadores: Array.isArray(b.indicadores) ? b.indicadores : [],
    noticias: (ns || []).map((n: any) => ({
      id: Number(n.id), categoria: n.categoria, tendencia: n.tendencia, titulo: n.titulo, resumo: n.resumo || '', impacto: n.impacto || '',
      fonte_nome: n.fonte_nome || '', fonte_url: n.fonte_url, publicado_em: n.publicado_em ?? null, destaque: !!n.destaque, cidades: n.cidades || [],
      imagem_url: n.imagem_url ?? null, url_artigo: n.url_artigo ?? null, corpo: Array.isArray(n.corpo) ? n.corpo : null,
    })),
    previsoes: { focus: Array.isArray(prev.focus) ? prev.focus : [], clima: Array.isArray(prev.clima) ? prev.clima : [] },
    fontes: (b.fontes || {}) as Record<string, 'ok' | 'erro'>,
  };
}

