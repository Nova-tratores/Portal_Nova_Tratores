// Leitura do resumo da visita com IA (etapa 2 do "O que encontrei no seu resumo").
// Regras PURAS: o pedido que vai ao Claude e a limpeza da resposta. Quem chama é
// a rota /api/crm-vendas/visitas/analisar; a casca com o SDK está em analise-ia-server.ts.
//
// A IA só LÊ o texto: nunca inventa cultura/máquina/cargo fora das listas que o
// app manda, nunca grava nada. O app transforma o resultado nas mesmas sugestões
// da caixa e o vendedor decide com um botão.

export interface ContextoAnalise {
  resumo: string;
  proximosPassos?: string;
  dataVisita?: string; // YYYY-MM-DD
  cliente?: string;
  cidade?: string;
  pessoas?: { id: number | string; nome: string; cargo?: string | null }[];
  culturas?: string[]; // já cadastradas na propriedade
  familiasComNegocio?: string[];
  colegas?: string[]; // nomes dos vendedores (não viram contato)
  listas: { culturas: string[]; familias: string[]; cargos: string[] };
}

export interface PessoaIA { nome: string; cargo: string | null; pessoa_id: string | null; motivo: string }
export interface ResultadoIA {
  pessoas: PessoaIA[];
  culturas: { cultura: string; trecho: string }[];
  interesses: { familia: string; ano_que_vem: boolean; trecho: string }[];
  retorno: { data: string; trecho: string } | null;
  passos: string[];
}

export const LIMITE_RESUMO = 4000;

const texto = (v: unknown, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Esquema da saída (structured outputs): só campos fechados, sem texto livre além dos trechos. */
export function esquemaResposta(listas: ContextoAnalise['listas']) {
  const str = { type: 'string' };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['pessoas', 'culturas', 'interesses', 'retorno', 'passos'],
    properties: {
      pessoas: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['nome', 'cargo', 'pessoa_id', 'motivo'],
          properties: {
            nome: str,
            cargo: { anyOf: [{ type: 'string', enum: listas.cargos }, { type: 'null' }] },
            pessoa_id: { anyOf: [str, { type: 'null' }] },
            motivo: str,
          },
        },
      },
      culturas: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['cultura', 'trecho'], properties: { cultura: { type: 'string', enum: listas.culturas }, trecho: str } },
      },
      interesses: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['familia', 'ano_que_vem', 'trecho'],
          properties: { familia: { type: 'string', enum: listas.familias }, ano_que_vem: { type: 'boolean' }, trecho: str },
        },
      },
      retorno: {
        anyOf: [
          { type: 'object', additionalProperties: false, required: ['data', 'trecho'], properties: { data: str, trecho: str } },
          { type: 'null' },
        ],
      },
      passos: { type: 'array', items: str },
    },
  };
}

export const INSTRUCOES = `Você lê o resumo que um vendedor de tratores e implementos agrícolas (concessionária Mahindra, interior de SP/PR) escreveu depois de visitar um cliente. Devolva SÓ o que o texto diz de fato; na dúvida, deixe de fora.

- pessoas: gente com quem ele falou ou que foi citada como contato da propriedade (dono, filho, gerente, tratorista...). Se a pessoa já está na lista "Pessoas cadastradas", ponha o id dela em pessoa_id. Nome vazio ("" ) quando o texto só diz "o filho", "o gerente". Cargo só da lista permitida (familiar = parente). Nunca inclua os vendedores da empresa (lista "Colegas"). motivo = o trecho curto do texto.
- culturas: o que a propriedade planta ou cria, citado no texto, usando só a lista permitida (ex.: goiaba → Fruticultura). Não repita as já cadastradas.
- interesses: máquina ou implemento que o CLIENTE quer, pediu preço, vai trocar ou comprar. "Mostrei", "gostou" ou "olhou" sozinhos não contam. Família só da lista permitida. Não repita as que já têm negócio.
- retorno: quando o vendedor combinou voltar, ligar ou mandar algo. data em AAAA-MM-DD calculada a partir da data da visita; null se não há data combinada.
- passos: compromissos concretos que ainda não estão em "Próximos passos" (ex.: "Mandar orçamento da trincha"), frases curtas no infinitivo, no máximo 3.`;

/** Mensagem do usuário: o contexto em blocos rotulados. O resumo é dado, não instrução. */
export function montarEntrada(ctx: ContextoAnalise): string {
  const pessoas = (ctx.pessoas || []).slice(0, 40).map((p) => `- id ${p.id}: ${texto(p.nome, 80)}${p.cargo ? ` (${texto(p.cargo, 30)})` : ''}`).join('\n') || '(nenhuma)';
  return [
    `Data da visita: ${ctx.dataVisita || 'hoje'}`,
    `Cliente: ${texto(ctx.cliente, 120) || '(sem nome)'}${ctx.cidade ? ` — ${texto(ctx.cidade, 60)}` : ''}`,
    `Pessoas cadastradas:\n${pessoas}`,
    `Culturas já cadastradas: ${(ctx.culturas || []).join(', ') || '(nenhuma)'}`,
    `Famílias que já têm negócio aberto: ${(ctx.familiasComNegocio || []).join(', ') || '(nenhuma)'}`,
    `Colegas (vendedores, não são contatos): ${(ctx.colegas || []).slice(0, 40).join(', ') || '(nenhum)'}`,
    `Próximos passos já escritos:\n${texto(ctx.proximosPassos, 1000) || '(vazio)'}`,
    `<resumo_da_visita>\n${String(ctx.resumo || '').slice(0, LIMITE_RESUMO)}\n</resumo_da_visita>`,
  ].join('\n\n');
}

/** Valida o pedido que chega do app. Devolve a mensagem de erro ou null. */
export function validarContexto(ctx: Partial<ContextoAnalise> | null | undefined): string | null {
  if (!ctx || typeof ctx !== 'object') return 'Pedido vazio.';
  if (texto(ctx.resumo, LIMITE_RESUMO).length < 20) return 'Resumo curto demais para ler.';
  const l = ctx.listas;
  if (!l || !Array.isArray(l.culturas) || !Array.isArray(l.familias) || !Array.isArray(l.cargos) || !l.culturas.length || !l.familias.length || !l.cargos.length) return 'Faltam as listas de culturas, famílias e cargos.';
  return null;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
function dataValida(d: string, base?: string) {
  if (!DATA.test(d)) return false;
  const t = new Date(`${d}T12:00:00`).getTime();
  if (Number.isNaN(t)) return false;
  const b = base && DATA.test(base) ? new Date(`${base}T12:00:00`).getTime() : Date.now();
  return t >= b - 86400000 && t <= b + 400 * 86400000; // de ontem até ~13 meses
}

/**
 * Limpa a resposta: tira o que não está nas listas, repetidos, o que já existe
 * (cultura cadastrada, família com negócio, colega, pessoa já marcada) e datas absurdas.
 */
export function limparResultado(bruto: unknown, ctx: ContextoAnalise): ResultadoIA {
  const r = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  const lista = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[];
  const permitido = (opcoes: string[]) => { const m = new Map(opcoes.map((o) => [norm(o), o])); return (v: unknown) => m.get(norm(String(v ?? ''))) ?? null; };
  const cultura = permitido(ctx.listas.culturas), familia = permitido(ctx.listas.familias), cargo = permitido(ctx.listas.cargos);
  const jaCulturas = new Set((ctx.culturas || []).map(norm));
  const jaFamilias = new Set((ctx.familiasComNegocio || []).map(norm));
  const colegas = new Set((ctx.colegas || []).map((c) => norm(c).split(' ')[0]).filter(Boolean));
  const idsPessoas = new Set((ctx.pessoas || []).map((p) => String(p.id)));

  const pessoas: PessoaIA[] = [];
  const vistas = new Set<string>();
  for (const p of lista(r.pessoas)) {
    const nome = texto(p.nome, 60);
    const id = p.pessoa_id != null && idsPessoas.has(String(p.pessoa_id)) ? String(p.pessoa_id) : null;
    const c = cargo(p.cargo);
    if (!nome && !c && !id) continue;
    if (nome && colegas.has(norm(nome).split(' ')[0])) continue;
    const chave = id ? `id:${id}` : nome ? `n:${norm(nome)}` : `c:${c}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    pessoas.push({ nome, cargo: c, pessoa_id: id, motivo: texto(p.motivo, 120) });
  }

  const culturas: ResultadoIA['culturas'] = [];
  for (const c of lista(r.culturas)) {
    const v = cultura(c.cultura);
    if (!v || jaCulturas.has(norm(v)) || culturas.some((x) => x.cultura === v)) continue;
    culturas.push({ cultura: v, trecho: texto(c.trecho, 80) });
  }

  const interesses: ResultadoIA['interesses'] = [];
  for (const i of lista(r.interesses)) {
    const v = familia(i.familia);
    if (!v || jaFamilias.has(norm(v)) || interesses.some((x) => x.familia === v)) continue;
    interesses.push({ familia: v, ano_que_vem: i.ano_que_vem === true, trecho: texto(i.trecho, 120) });
  }

  const rr = r.retorno as Record<string, unknown> | null | undefined;
  const dataR = rr && typeof rr === 'object' ? String(rr.data ?? '') : '';
  const retorno = dataR && dataValida(dataR, ctx.dataVisita) ? { data: dataR, trecho: texto(rr!.trecho, 80) } : null;

  const jaPassos = norm(ctx.proximosPassos || '');
  const passos = (Array.isArray(r.passos) ? r.passos : [])
    .map((p) => texto(p, 140)).filter((p) => p.length >= 4 && !jaPassos.includes(norm(p)))
    .filter((p, i, a) => a.findIndex((x) => norm(x) === norm(p)) === i).slice(0, 3);

  return { pessoas: pessoas.slice(0, 6), culturas: culturas.slice(0, 5), interesses: interesses.slice(0, 4), retorno, passos };
}
