// Fluxograma REAL de um processo a partir do histórico (process mining).
// Entrada: eventos "caso X saiu da fase A para a fase B, por fulano, em tal hora". Evento sem
// `de` é um MARCO ("a OS está em B a partir de agora": criação, envio etc.) — não vira seta, mas
// marca a hora de entrada em B (é o que permite medir o tempo na primeira fase).
// Saída: fases, setas (volume, tempo parado antes de passar, quem passa), voltas para trás
// (retrabalho), caminhos mais comuns e quem faz o quê — robô separado de pessoa.
// Pura (client-safe, sem banco): a rota lê a fonte e normaliza; a tela só desenha.

export type TipoAtor = 'pessoa' | 'robo' | 'compartilhado';

export interface EventoProcesso {
  caso: string;
  /** '' = marco (entrada em `para` sem a fase anterior). */
  de: string;
  para: string;
  quem: string;
  tipo: TipoAtor;
  /** ISO (timestamptz) */
  em: string;
}

export interface SetaProcesso {
  de: string;
  para: string;
  n: number;
  casos: number;
  /** Mediana, em horas, do tempo que o caso ficou em `de` antes de passar (só quando a entrada em `de` foi vista). */
  medianaH: number | null;
  /** Em quantas passagens o tempo foi medido (entrada na fase `de` registrada). */
  medidas: number;
  robo: number;
  /** Volta para uma fase anterior na ordem do processo (retrabalho). */
  volta: boolean;
  /** Quem passou (pessoas e logins compartilhados), mais frequente primeiro. */
  quem: Array<[string, number]>;
}

export interface FaseProcesso {
  fase: string;
  /** Casos que passaram pela fase (entraram ou saíram dela). */
  casos: number;
  entradas: number;
  saidas: number;
  /** Mediana, em horas, do tempo parado na fase (entrada vista → saída). */
  medianaH: number | null;
  medidas: number;
  /** Casos que começaram nesta fase (primeiro registro do caso). */
  inicios: number;
  /** Casos que estão nela agora (última fase conhecida do caso). */
  paradosAgora: number;
  /** Quem tira o caso desta fase (inclui robôs), mais frequente primeiro. */
  quemMove: Array<[string, number, TipoAtor]>;
}

export interface AtorProcesso {
  quem: string;
  tipo: TipoAtor;
  n: number;
  casos: number;
  /** Para quais fases essa pessoa mais move. */
  para: Array<[string, number]>;
}

export interface ResumoProcesso {
  eventos: number;
  casos: number;
  /** Fração das trocas feitas por robô. */
  pctRobo: number;
  casosComVolta: number;
  /** Quem registra o primeiro evento dos casos (quem cria). */
  criadores: Array<[string, number, TipoAtor]>;
  fases: FaseProcesso[];
  setas: SetaProcesso[];
  /** Sequência de fases de cada caso (repetições seguidas colapsadas), as mais comuns. */
  caminhos: Array<{ fases: string[]; n: number }>;
  atores: AtorProcesso[];
  periodo: { de: string | null; ate: string | null };
}

function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function topContagem(m: Map<string, number>, max = 8): Array<[string, number]> {
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max);
}

function soma<K>(m: Map<K, number>, k: K, v = 1) { m.set(k, (m.get(k) || 0) + v); }

/**
 * `ordem` = ordem canônica das fases (define o que é "volta"). Fase fora da ordem entra
 * antes das finais (`finais`), na ordem em que aparece. Fases finais nunca contam como volta.
 * `fasesReais`: quando a fase anterior gravada NÃO é uma delas (ex.: o rótulo "Enviado" que o envio
 * para a Omie grava), usa a fase em que o caso estava de fato (a última conhecida).
 */
export function minerarProcesso(
  eventosBrutos: EventoProcesso[],
  opts: { ordem: string[]; finais?: string[]; maxCaminhos?: number; fasesReais?: string[] } = { ordem: [] },
): ResumoProcesso {
  const finais = new Set(opts.finais || []);
  const reais = opts.fasesReais ? new Set(opts.fasesReais) : null;
  const ordenados = eventosBrutos
    .filter((e) => e.caso && e.para && Number.isFinite(Date.parse(e.em)))
    .sort((a, b) => a.caso.localeCompare(b.caso) || Date.parse(a.em) - Date.parse(b.em));
  const eventos: EventoProcesso[] = [];
  let casoAtual = '', faseAtual = '';
  for (const e0 of ordenados) {
    if (e0.caso !== casoAtual) { casoAtual = e0.caso; faseAtual = ''; }
    const e = reais && e0.de && !reais.has(e0.de) && faseAtual ? { ...e0, de: faseAtual } : e0;
    faseAtual = e.para;
    if (e.de !== e.para) eventos.push(e);
  }

  // ordem final: canônica + desconhecidas antes das finais
  const ordem = [...opts.ordem];
  const posFinal = () => { const i = ordem.findIndex((f) => finais.has(f)); return i < 0 ? ordem.length : i; };
  for (const e of eventos) for (const f of [e.de, e.para]) if (f && !ordem.includes(f)) ordem.splice(posFinal(), 0, f);
  const idx = new Map(ordem.map((f, i) => [f, i]));
  const ehVolta = (de: string, para: string) => !finais.has(para) && (idx.get(para)! < idx.get(de)!);

  const porCaso = new Map<string, EventoProcesso[]>();
  for (const e of eventos) { const l = porCaso.get(e.caso) || []; l.push(e); porCaso.set(e.caso, l); }

  type AcSeta = { n: number; casos: Set<string>; tempos: number[]; robo: number; quem: Map<string, number> };
  const setas = new Map<string, AcSeta>();
  type AcFase = { casos: Set<string>; entradas: number; saidas: number; tempos: number[]; agora: number; inicios: number; quem: Map<string, number> };
  const fases = new Map<string, AcFase>();
  const fase = (f: string) => {
    let a = fases.get(f);
    if (!a) { a = { casos: new Set(), entradas: 0, saidas: 0, tempos: [], agora: 0, inicios: 0, quem: new Map() }; fases.set(f, a); }
    return a;
  };
  const tipoDe = new Map<string, TipoAtor>();
  type AcAtor = { n: number; casos: Set<string>; para: Map<string, number> };
  const atores = new Map<string, AcAtor>();
  const caminhos = new Map<string, number>();
  const criadores = new Map<string, number>();
  let robo = 0, casosComVolta = 0, transicoes = 0;

  for (const [caso, lista] of porCaso) {
    let entrouEm = null as { fase: string; t: number } | null;
    let voltou = false;
    const caminho: string[] = [lista[0].de || lista[0].para];
    fase(caminho[0]).inicios++;
    soma(criadores, lista[0].quem);
    tipoDe.set(lista[0].quem, lista[0].tipo);
    for (const e of lista) {
      const t = Date.parse(e.em);
      if (!e.de) { // marco: entrou em `para` (se já não estava nela)
        if (entrouEm?.fase !== e.para) {
          fase(e.para).casos.add(caso);
          if (caminho[caminho.length - 1] !== e.para) caminho.push(e.para);
          entrouEm = { fase: e.para, t };
        }
        continue;
      }
      transicoes++;
      const chave = `${e.de}\u0000${e.para}`;
      let s = setas.get(chave);
      if (!s) { s = { n: 0, casos: new Set(), tempos: [], robo: 0, quem: new Map() }; setas.set(chave, s); }
      s.n++; s.casos.add(caso);
      const tempoH = entrouEm && entrouEm.fase === e.de ? (t - entrouEm.t) / 3600000 : null;
      if (tempoH != null) { s.tempos.push(tempoH); fase(e.de).tempos.push(tempoH); }
      if (e.tipo === 'robo') { s.robo++; robo++; } else soma(s.quem, e.quem);

      const fd = fase(e.de), fp = fase(e.para);
      fd.casos.add(caso); fp.casos.add(caso);
      fd.saidas++; fp.entradas++;
      soma(fd.quem, e.quem);
      tipoDe.set(e.quem, e.tipo);

      let a = atores.get(e.quem);
      if (!a) { a = { n: 0, casos: new Set(), para: new Map() }; atores.set(e.quem, a); }
      a.n++; a.casos.add(caso); soma(a.para, e.para);

      if (ehVolta(e.de, e.para)) voltou = true;
      if (caminho[caminho.length - 1] !== e.de) caminho.push(e.de); // buraco no histórico
      caminho.push(e.para);
      entrouEm = { fase: e.para, t };
    }
    fase(lista[lista.length - 1].para).agora++;
    if (voltou) casosComVolta++;
    soma(caminhos, caminho.join('\u0000'));
  }

  const listaFases: FaseProcesso[] = ordem.filter((f) => fases.has(f)).map((f) => {
    const a = fases.get(f)!;
    return {
      fase: f, casos: a.casos.size, entradas: a.entradas, saidas: a.saidas, medianaH: mediana(a.tempos), medidas: a.tempos.length,
      inicios: a.inicios, paradosAgora: a.agora,
      quemMove: topContagem(a.quem, 6).map(([q, n]) => [q, n, tipoDe.get(q) || 'pessoa'] as [string, number, TipoAtor]),
    };
  });

  const listaSetas: SetaProcesso[] = [...setas.entries()].map(([k, s]) => {
    const [de, para] = k.split('\u0000');
    return { de, para, n: s.n, casos: s.casos.size, medianaH: mediana(s.tempos), medidas: s.tempos.length, robo: s.robo, volta: ehVolta(de, para), quem: topContagem(s.quem, 6) };
  }).sort((a, b) => b.n - a.n);

  const listaAtores: AtorProcesso[] = [...atores.entries()].map(([quem, a]) => ({
    quem, tipo: tipoDe.get(quem) || 'pessoa', n: a.n, casos: a.casos.size, para: topContagem(a.para, 4),
  })).sort((a, b) => b.n - a.n);

  const ts = eventos.map((e) => e.em).sort();
  return {
    eventos: transicoes,
    casos: porCaso.size,
    pctRobo: transicoes ? robo / transicoes : 0,
    casosComVolta,
    criadores: topContagem(criadores, 10).map(([q, n]) => [q, n, tipoDe.get(q) || 'pessoa'] as [string, number, TipoAtor]),
    fases: listaFases,
    setas: listaSetas,
    caminhos: [...caminhos.entries()].sort((a, b) => b[1] - a[1]).slice(0, opts.maxCaminhos ?? 10)
      .map(([k, n]) => ({ fases: k.split('\u0000'), n })),
    atores: listaAtores,
    periodo: { de: ts[0] || null, ate: ts[ts.length - 1] || null },
  };
}

// ---------------- Fonte: OS do Pós-venda (logs_ppo) ----------------

export interface LinhaLogOS {
  Id_ppo: string | null;
  UsuEmail: string | null;
  acao: string | null;
  Status_Anterior: string | null;
  Status_Atual: string | null;
  created_at: string | null;
}

const ROBO = /^(sistema\b|admin\.sistema@|tratorilson|autom[aá]tico)/i;
const COMPARTILHADO = /^(posvendas\d*\.?novatratores@|appnovat@)/i;

function semAcento(s: string) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }

/**
 * Quem fez a troca: e-mail vira o nome do cadastro do portal (`nomes` = email minúsculo → nome);
 * nomes que só diferem por acento/caixa viram um só (a grafia mais usada). Robô = "Sistema",
 * "Tratorilson (auto)", "Automático (datas)", admin.sistema ou ação "Auto-move".
 */
export function eventosDasOS(linhas: LinhaLogOS[], nomes: Record<string, string>): EventoProcesso[] {
  const brutos = linhas.map((l) => {
    const usu = String(l.UsuEmail || '').trim();
    const acao = String(l.acao || '');
    let tipo: TipoAtor = 'pessoa';
    let quem = usu || 'não informado';
    if (!usu || ROBO.test(usu) || /^auto-move/i.test(acao)) { tipo = 'robo'; quem = /tratorilson/i.test(usu) ? 'Tratorilson (robô)' : 'Automático do portal'; }
    else if (usu.includes('@')) {
      const nome = nomes[usu.toLowerCase()];
      if (nome) quem = nome.trim();
      else { quem = `${usu.split('@')[0]} (login)`; if (COMPARTILHADO.test(usu)) { tipo = 'compartilhado'; quem = `${usu.split('@')[0]} (login compartilhado)`; } }
    }
    return {
      caso: String(l.Id_ppo || ''), de: String(l.Status_Anterior || '').trim(), para: String(l.Status_Atual || '').trim(),
      quem, tipo, em: String(l.created_at || ''),
    };
  });
  // mesma pessoa com grafias diferentes ("Jose Ortiz" × "José Ortiz"): a mais usada vence
  const cont = new Map<string, Map<string, number>>();
  for (const e of brutos) {
    if (e.tipo !== 'pessoa') continue;
    const k = semAcento(e.quem);
    const m = cont.get(k) || new Map<string, number>();
    soma(m, e.quem); cont.set(k, m);
  }
  const canon = new Map<string, string>();
  for (const [k, m] of cont) canon.set(k, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return brutos.map((e) => (e.tipo === 'pessoa' ? { ...e, quem: canon.get(semAcento(e.quem)) || e.quem } : e));
}

/** Ordem das fases da OS: a do quadro + nomes antigos que ainda aparecem no histórico. */
export function ordemFasesOS(phases: string[]): string[] {
  const o = [...phases];
  const depois = (ref: string, nova: string) => { const i = o.indexOf(ref); if (!o.includes(nova)) o.splice(i < 0 ? o.length : i + 1, 0, nova); };
  depois('Enviado Para Omie', 'Enviado');
  const i = o.indexOf('Preenchido Garantia');
  if (!o.includes('Preenchido')) o.splice(i < 0 ? o.length : i, 0, 'Preenchido');
  return o;
}
