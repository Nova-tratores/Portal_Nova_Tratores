// Quests do vendedor — regras PURAS das sugestões automáticas (app de vendas).
//
// Fonte: tabela `tratores` (controle de revisões: dono, cidade, entrega e as
// revisões com data/horímetro), visitas do app (dono pelo nome da propriedade)
// e trator_localizacao. Quatro regras, uma quest por alvo:
//   revisao_chegando     horímetro projetado pela média desde a entrega chegou a
//                        50 h da próxima revisão (e não passou dela em +300 h);
//   aniversario_entrega  1, 2, 3… anos da entrega entre 15 dias atrás e 30 à frente;
//   cliente_sumido       já teve contato (revisão, visita, localização), mas o
//                        último foi há mais de 12 meses — alvo = o CLIENTE;
//   trator_sem_noticia   entregue há 6+ meses e NUNCA teve revisão anotada,
//                        localização confirmada nem visita ao dono.
// Nada vai ao vendedor sem o supervisor aprovar (status `sugerida`).

export type Regra = 'revisao_chegando' | 'aniversario_entrega' | 'cliente_sumido' | 'trator_sem_noticia';
export type TipoItem = 'numero' | 'fotos' | 'texto' | 'simnao';
export interface ItemQuest { chave: string; tipo: TipoItem; rotulo: string; obrigatorio: boolean; min?: number }

export interface TratorRevisoes {
  Chassis: string | null; Modelo: string | null; Cliente: string | null; Cidade: string | null; Entrega: string | null;
  [coluna: string]: unknown;
}
export interface ContatoVisita { nomes: (string | null)[]; data: string }
export interface Candidata {
  regra: Regra; chave: string; prioridade: number;
  alvo_tipo: 'trator' | 'cliente';
  chassis: string | null; modelo: string | null; cliente_nome: string | null; cidade: string | null;
  titulo: string; motivo: string; itens: ItemQuest[]; xp: number;
}

export const REVISOES = [50, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000];
export const ROTULO_REGRA: Record<Regra, string> = {
  revisao_chegando: 'Revisão chegando',
  aniversario_entrega: 'Aniversário de entrega',
  cliente_sumido: 'Cliente sumido',
  trator_sem_noticia: 'Trator sem notícia',
};
// ordem de atendimento quando o limite do dia corta
const PRIORIDADE: Record<Regra, number> = { revisao_chegando: 1, aniversario_entrega: 2, cliente_sumido: 3, trator_sem_noticia: 4 };

// ─── Itens prontos ─────────────────────────────────────────────────────────────
export const ITENS: Record<string, ItemQuest> = {
  horimetro: { chave: 'horimetro', tipo: 'numero', rotulo: 'Horímetro (horas)', obrigatorio: true },
  fotos: { chave: 'fotos', tipo: 'fotos', rotulo: 'Fotos do trator (painel com o horímetro + trator inteiro)', obrigatorio: true, min: 2 },
  foto_painel: { chave: 'fotos', tipo: 'fotos', rotulo: 'Foto do painel com o horímetro', obrigatorio: true, min: 1 },
  fotos_propriedade: { chave: 'fotos', tipo: 'fotos', rotulo: 'Fotos da visita', obrigatorio: false, min: 1 },
  relato_operador: { chave: 'relato_operador', tipo: 'texto', rotulo: 'Relato do operador (como o trator está indo, algum problema?)', obrigatorio: true },
  relato_dono: { chave: 'relato_dono', tipo: 'texto', rotulo: 'Relato do dono (satisfação, planos, o que precisa)', obrigatorio: true },
  ofereceu_revisao: { chave: 'ofereceu_revisao', tipo: 'simnao', rotulo: 'Ofereceu a revisão ao cliente?', obrigatorio: true },
};
const opc = (i: ItemQuest): ItemQuest => ({ ...i, obrigatorio: false });

export function itensDaRegra(regra: Regra): ItemQuest[] {
  switch (regra) {
    case 'trator_sem_noticia': return [ITENS.horimetro, ITENS.fotos, ITENS.relato_operador, ITENS.relato_dono];
    case 'revisao_chegando': return [ITENS.horimetro, ITENS.foto_painel, ITENS.ofereceu_revisao, opc(ITENS.relato_dono)];
    case 'aniversario_entrega': return [ITENS.horimetro, ITENS.fotos, opc(ITENS.relato_operador), ITENS.relato_dono];
    case 'cliente_sumido': return [ITENS.relato_dono, ITENS.fotos_propriedade, opc(ITENS.horimetro)];
  }
}

// ─── Datas e nomes ─────────────────────────────────────────────────────────────
/** "DD/MM/AAAA" ou "AAAA-MM-DD" → "AAAA-MM-DD" (a tabela `tratores` mistura os dois). */
export function diaIso(s: unknown): string | null {
  const t = String(s ?? '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
const ms = (d: string) => Date.parse(`${d}T12:00:00Z`);
export const diasEntre = (de: string, ate: string) => Math.round((ms(ate) - ms(de)) / 86400_000);
const maiorDia = (xs: (string | null | undefined)[]) => xs.filter(Boolean).sort().pop() || null;
const fmtDia = (d: string) => d.split('-').reverse().join('/');

const PEQUENAS = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'FAZ', 'FAZENDA', 'SITIO', 'CHACARA', 'ESTANCIA', 'LTDA', 'ME', 'EPP', 'SA', 'OUTROS', 'OUTRO', 'OUTRA']);
export const palavrasNome = (s: unknown) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/)
  .filter((p) => p.length >= 2 && !PEQUENAS.has(p));

/** Mesmo dono — a mesma regra do app (lib/tratoresCliente.js mesmoDono). */
export function mesmoDono(a: unknown, b: unknown): boolean {
  const pa = palavrasNome(a), pbLista = palavrasNome(b), pb = new Set(pbLista);
  if (!pa.length || !pb.size) return false;
  const comuns = pa.filter((p) => pb.has(p)).length;
  if (comuns === 1 && (pa.length === 1 || pb.size === 1)) return true;
  const ultimoBate = pb.has(pa[pa.length - 1]) || pa.includes(pbLista[pbLista.length - 1]);
  return comuns >= 2 && ultimoBate;
}
export const chaveCliente = (nome: unknown) => palavrasNome(nome).join(' ');

// ─── Revisões do trator ────────────────────────────────────────────────────────
export interface Revisao { horas: number; dia: string; horimetro: number | null }
export function revisoesDoTrator(t: TratorRevisoes): Revisao[] {
  const out: Revisao[] = [];
  for (const h of REVISOES) {
    const dia = diaIso(t[`${h}h Data`]);
    if (!dia) continue;
    const bruto = String(t[`${h}h Horimetro`] ?? '').replace(',', '.').trim();
    const n = bruto ? Number(bruto) : NaN;
    out.push({ horas: h, dia, horimetro: Number.isFinite(n) && n > 0 ? n : null });
  }
  return out;
}

/** Horímetro de hoje projetado pela média de uso desde a entrega (null sem nenhum horímetro anotado). */
export function horimetroEstimado(entrega: string, revisoes: Revisao[], hoje: string): number | null {
  const comH = revisoes.filter((r) => r.horimetro != null).sort((a, b) => a.dia.localeCompare(b.dia));
  const ult = comH[comH.length - 1];
  if (!ult) return null;
  const taxa = (ult.horimetro as number) / Math.max(diasEntre(entrega, ult.dia), 30);
  return Math.round((ult.horimetro as number) + taxa * Math.max(0, diasEntre(ult.dia, hoje)));
}

export function proximaRevisao(revisoes: Revisao[]): number | null {
  const feitas = revisoes.map((r) => r.horas);
  const maior = feitas.length ? Math.max(...feitas) : 0;
  return REVISOES.find((h) => h > maior) ?? null;
}

// ─── Candidatas ────────────────────────────────────────────────────────────────
interface Contexto {
  hoje: string;
  /** chassi → dia da última localização confirmada */
  localizacoes: Map<string, string>;
  visitas: ContatoVisita[];
}

// a planilha de origem gravou alguns modelos como número ("2025.0")
const modeloLimpo = (m: unknown) => String(m ?? '').trim().replace(/\.0$/, '') || null;
function rotuloTrator(t: TratorRevisoes) {
  return `${modeloLimpo(t.Modelo) || 'Trator'} …${String(t.Chassis).slice(-6)}`;
}

/** Todas as regras para um trator; cada uma vira uma candidata (a escolha final é em `escolherSugestoes`). */
export function candidatasDoTrator(t: TratorRevisoes, ctx: Contexto): Candidata[] {
  const chassis = String(t.Chassis || '').trim();
  const entrega = diaIso(t.Entrega);
  if (!chassis || !entrega || entrega > ctx.hoje) return [];
  if (/APREENDID|ROUBAD|DEVOLVID/i.test(String(t.Cidade || ''))) return [];
  const revs = revisoesDoTrator(t);
  const ultRev = maiorDia(revs.map((r) => r.dia));
  const ultLoc = ctx.localizacoes.get(chassis) || null;
  const ultVisita = maiorDia(ctx.visitas.filter((v) => v.nomes.some((n) => n && mesmoDono(t.Cliente, n))).map((v) => v.data.slice(0, 10)));
  const contato = maiorDia([ultRev, ultLoc, ultVisita]);
  const idade = diasEntre(entrega, ctx.hoje);
  const base = {
    chassis, modelo: modeloLimpo(t.Modelo), cliente_nome: t.Cliente?.trim() || null, cidade: t.Cidade?.trim() || null,
  };
  const quem = `${base.cliente_nome || 'cliente'}${base.cidade ? ` (${base.cidade})` : ''}`;
  const out: Candidata[] = [];
  const nova = (regra: Regra, periodo: string, titulo: string, motivo: string, alvo: 'trator' | 'cliente' = 'trator'): Candidata => ({
    regra, prioridade: PRIORIDADE[regra], alvo_tipo: alvo, ...base,
    chave: `${regra}:${alvo === 'cliente' ? chaveCliente(base.cliente_nome) : chassis}:${periodo}`,
    titulo, motivo, itens: itensDaRegra(regra), xp: 50,
  });

  const estimado = horimetroEstimado(entrega, revs, ctx.hoje);
  const prox = proximaRevisao(revs);
  if (estimado != null && prox != null && estimado >= prox - 50 && estimado <= prox + 300) {
    out.push(nova('revisao_chegando', String(prox), `Revisão de ${prox} h — ${rotuloTrator(t)}`,
      estimado >= prox
        ? `${quem}: pela média de uso desde a entrega, o trator deve estar com ~${estimado} h e a revisão de ${prox} h não foi anotada — provavelmente já passou. Conferir o horímetro e oferecer a revisão.`
        : `${quem}: pela média de uso desde a entrega, o trator deve estar com ~${estimado} h; a próxima revisão é a de ${prox} h. Conferir o horímetro e oferecer a revisão.`));
  }

  // o aniversário que passou há pouco ou o que vem (idade/365 erra por dia bissexto)
  for (const anos of [Math.floor(idade / 365), Math.floor(idade / 365) + 1]) {
    if (anos < 1) continue;
    const [a, m, d] = entrega.split('-').map(Number);
    const alvo = new Date(Date.UTC(a + anos, m - 1, Math.min(d, m === 2 ? 28 : d))).toISOString().slice(0, 10);
    const falta = diasEntre(ctx.hoje, alvo);
    if (falta >= -15 && falta <= 30) {
      out.push(nova('aniversario_entrega', String(a + anos), `${anos} ano${anos > 1 ? 's' : ''} de trator — ${rotuloTrator(t)}`,
        `${quem}: o trator faz ${anos} ano${anos > 1 ? 's' : ''} de entrega em ${fmtDia(alvo)}. Visita de pós-venda: como está o trator, satisfação, fotos.`));
      break;
    }
  }

  if (contato && diasEntre(contato, ctx.hoje) > 365) {
    const meses = Math.floor(diasEntre(contato, ctx.hoje) / 30);
    out.push(nova('cliente_sumido', contato.slice(0, 7), `Cliente sumido — ${base.cliente_nome || rotuloTrator(t)}`,
      `${quem}: último contato (revisão, visita ou localização) em ${fmtDia(contato)}, há ${meses} meses. Retomar o contato e saber como está.`, 'cliente'));
  }

  if (!contato && idade >= 180) {
    out.push(nova('trator_sem_noticia', 'sempre', `Trator sem notícia — ${rotuloTrator(t)}`,
      `${quem}: entregue em ${fmtDia(entrega)} e desde então nenhuma revisão anotada, localização ou visita ao dono. Ver o trator, o horímetro e ouvir operador e dono.`));
  }
  return out;
}

// ─── Escolha das sugestões do dia ──────────────────────────────────────────────
export interface QuestExistente {
  chave: string | null; status: string; chassis: string | null; cliente_nome: string | null;
  regra: string | null; alvo_tipo: string; updated_at: string; concluida_em: string | null;
}

/** Dias em que um alvo descartado/concluído não recebe sugestão nova da mesma regra. */
export const DESCANSO_DIAS = { descartada: 180, concluida: 365 };

export function escolherSugestoes(candidatas: Candidata[], existentes: QuestExistente[], limite: number, hoje: string): Candidata[] {
  const ativa = (s: string) => s === 'sugerida' || s === 'aberta';
  const chaves = new Set(existentes.map((e) => e.chave).filter(Boolean));
  const chassisOcupado = new Set(existentes.filter((e) => ativa(e.status) && e.chassis).map((e) => e.chassis));
  const clienteOcupado = new Set(existentes.filter((e) => ativa(e.status) && e.cliente_nome).map((e) => chaveCliente(e.cliente_nome)));
  const descansando = (c: Candidata) => existentes.some((e) => {
    if (e.regra !== c.regra) return false;
    const mesmoAlvo = c.alvo_tipo === 'cliente' ? chaveCliente(e.cliente_nome) === chaveCliente(c.cliente_nome) : e.chassis === c.chassis;
    if (!mesmoAlvo) return false;
    const quando = (e.concluida_em || e.updated_at || '').slice(0, 10);
    const dias = e.status === 'descartada' ? DESCANSO_DIAS.descartada : e.status === 'concluida' ? DESCANSO_DIAS.concluida : 0;
    return dias > 0 && !!quando && diasEntre(quando, hoje) < dias;
  });

  // RODÍZIO entre as regras (decisão 28/10): cada dia vem misturado — uma de
  // cada regra por volta, na ordem de prioridade — em vez de uma regra com
  // muitas candidatas (revisão) ocupar o limite inteiro por vários dias.
  const filas = new Map<Regra, Candidata[]>();
  for (const c of [...candidatas].sort((a, b) => a.prioridade - b.prioridade || a.chave.localeCompare(b.chave))) {
    const f = filas.get(c.regra);
    if (f) f.push(c); else filas.set(c.regra, [c]);
  }
  const out: Candidata[] = [];
  const usadosChassi = new Set<string>(), usadosCliente = new Set<string>();
  const cabe = (c: Candidata) => {
    if (chaves.has(c.chave) || descansando(c)) return false;
    const cli = chaveCliente(c.cliente_nome);
    // uma quest por trator e uma por cliente (o cliente sumido cobre todos os tratores dele)
    if (c.chassis && (chassisOcupado.has(c.chassis) || usadosChassi.has(c.chassis))) return false;
    if (c.alvo_tipo === 'cliente' && cli && (clienteOcupado.has(cli) || usadosCliente.has(cli))) return false;
    return true;
  };
  let andou = true;
  while (out.length < limite && andou) {
    andou = false;
    for (const fila of filas.values()) {
      if (out.length >= limite) break;
      while (fila.length) {
        const c = fila.shift() as Candidata;
        if (!cabe(c)) continue;
        out.push(c);
        if (c.chassis) usadosChassi.add(c.chassis);
        if (c.alvo_tipo === 'cliente') usadosCliente.add(chaveCliente(c.cliente_nome));
        andou = true;
        break;
      }
    }
  }
  return out;
}

// ─── Vendedor sugerido pela cidade ─────────────────────────────────────────────
const semAcento = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
/** "AGUDOS FAZ SAO DOMINGOS" / "PROMISSÃO/ X" / "Fartura - SP" → "AGUDOS" / "PROMISSAO" / "FARTURA". */
export function cidadeChave(texto: unknown): string {
  let t = semAcento(texto).split('/')[0];
  t = t.replace(/\s*[-(]\s*(SP|PR|MG|MS|GO|RJ|SC|RS)\s*\)?\s*$/, '').replace(/\s+(FAZ|FAZENDA|SITIO|BAIRRO)\b.*$/, '');
  return t.replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Vendedor que atende a cidade (vendedor_cidades); null se nenhum ou se mais de um (o supervisor escolhe). */
export function vendedorDaCidade(cidade: unknown, vendedorCidades: { vendedor_id: number; cidade: string }[]): number | null {
  const alvo = cidadeChave(cidade);
  if (!alvo) return null;
  const ids = [...new Set(vendedorCidades.filter((v) => cidadeChave(v.cidade) === alvo).map((v) => Number(v.vendedor_id)))];
  return ids.length === 1 ? ids[0] : null;
}
