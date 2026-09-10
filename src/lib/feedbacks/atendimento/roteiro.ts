// Roteiro de ligação — parte PURA. Resolve as variáveis dos templates de
// feedback_script com os dados da ficha; lista FECHADA de variáveis, cada uma
// com frase alternativa quando o dado falta. Nunca deixa "{x}" cru.

import type { ContextoAtendimento } from "./contexto";
import { fmtDataBR, haQuanto } from "./rotulos";
import type { RegraOportunidade } from "@/lib/feedbacks/types";

export type Etapa = "apresentacao" | "argumentacao" | "objecao";
export const ETAPAS: { valor: Etapa; rotulo: string; emoji: string }[] = [
  { valor: "apresentacao", rotulo: "Apresentação", emoji: "👋" },
  { valor: "argumentacao", rotulo: "Argumentação", emoji: "💬" },
  { valor: "objecao", rotulo: "Se o cliente disser…", emoji: "🛡️" },
];

export interface Script {
  id: number;
  regra: RegraOportunidade | "geral";
  etapa: Etapa;
  titulo: string;
  template: string;
  ordem: number;
  versao: number;
}

export type Variavel = "nome" | "primeiro_nome" | "trator" | "horimetro" | "ultima_os_data" | "ultima_os_desc" | "proxima_revisao" | "dias_sem_contato" | "atendente";

export const VARIAVEIS: Record<Variavel, { descricao: string; fallback: string }> = {
  nome:             { descricao: "nome do cliente",                fallback: "senhor(a)" },
  primeiro_nome:    { descricao: "primeiro nome do cliente",       fallback: "o(a) senhor(a)" },
  trator:           { descricao: "máquina (modelo + chassi)",      fallback: "seu trator" },
  horimetro:        { descricao: "último horímetro registrado",    fallback: "o horímetro que estiver marcando" },
  ultima_os_data:   { descricao: "data do último serviço",         fallback: "a última vez" },
  ultima_os_desc:   { descricao: "descrição do último serviço",    fallback: "o último serviço" },
  proxima_revisao:  { descricao: "próxima revisão (horas + data)", fallback: "a próxima revisão" },
  dias_sem_contato: { descricao: "dias desde o último contato",    fallback: "um bom tempo" },
  atendente:        { descricao: "quem está ligando",              fallback: "a equipe" },
};

export type Dados = Partial<Record<Variavel, string | null | undefined>>;

export interface TextoResolvido {
  texto: string;
  faltando: Variavel[]; // variáveis que caíram no fallback
  desconhecidas: string[]; // {x} fora da lista (removidas)
}

const RE_VAR = /\{([a-z_]+)\}/g;

export function resolverTemplate(template: string, dados: Dados): TextoResolvido {
  const faltando = new Set<Variavel>();
  const desconhecidas = new Set<string>();
  const texto = String(template ?? "")
    .replace(RE_VAR, (_m, chave: string) => {
      if (!(chave in VARIAVEIS)) {
        desconhecidas.add(chave);
        return "";
      }
      const v = chave as Variavel;
      const valor = (dados[v] ?? "").toString().trim();
      if (valor) return valor;
      faltando.add(v);
      return VARIAVEIS[v].fallback;
    })
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();
  return { texto, faltando: [...faltando], desconhecidas: [...desconhecidas] };
}

/** Nome próprio em Title Case ("LAERTE PELOSINI FILHO" → "Laerte Pelosini Filho"). */
export function nomeBonito(nome: string | null | undefined): string {
  const limpo = String(nome ?? "").trim().replace(/\s+/g, " ");
  if (!limpo) return "";
  const prep = new Set(["de", "da", "do", "das", "dos", "e"]);
  return limpo
    .toLowerCase()
    .split(" ")
    .map((p, i) => (i > 0 && prep.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/** Monta as variáveis a partir da ficha do cockpit. */
export function dadosDoContexto(ctx: ContextoAtendimento | null, atendenteNome: string | null | undefined): Dados {
  if (!ctx) return { atendente: atendenteNome ?? null };
  const nome = nomeBonito(ctx.identidade?.nome || ctx.nome);
  const maquina = ctx.maquinas?.[0] ?? null;
  const trator = maquina ? [maquina.modelo, maquina.chassi].filter(Boolean).join(" · ") : null;
  const horimetro = maquina?.ultima_revisao?.horimetro != null ? `${maquina.ultima_revisao.horimetro} h` : null;
  const prox = maquina?.proxima_revisao;
  const proxima = prox ? `${prox.horas} h${prox.data_estimada ? ` (${prox.atrasada ? "atrasada desde" : "prevista para"} ${fmtDataBR(prox.data_estimada)})` : ""}` : null;
  const os = ctx.servicos?.[0] ?? null;
  const ultimoAtend = ctx.atendimentos?.[0]?.data ?? null;
  const ultimoServico = os?.data ?? null;
  const ultimoContato = [ultimoAtend, ultimoServico].filter(Boolean).sort().pop() ?? null;
  const dias = ultimoContato ? diasDesde(ultimoContato) : null;
  return {
    nome: nome || null,
    primeiro_nome: nome ? nome.split(" ")[0] : null,
    trator,
    horimetro,
    ultima_os_data: os?.data ? fmtDataBR(os.data) : null,
    ultima_os_desc: os?.descricao ? encurtar(os.descricao, 80) : null,
    proxima_revisao: proxima,
    dias_sem_contato: dias != null ? String(dias) : null,
    atendente: atendenteNome ? nomeBonito(atendenteNome).split(" ")[0] : null,
  };
}

function diasDesde(iso: string): number | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((hoje.getTime() - d.getTime()) / 86400000));
}

function encurtar(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
}

export interface RoteiroMontado {
  etapa: Etapa;
  rotulo: string;
  emoji: string;
  itens: { id: number; titulo: string; regra: Script["regra"]; texto: string; faltando: Variavel[] }[];
}

/**
 * Escolhe os scripts que valem para esta ligação: 'geral' sempre; argumentação
 * só das regras presentes nos motivos (se nenhuma, mostra todas as
 * argumentações como referência). Ordena por etapa → ordem.
 */
export function montarRoteiro(scripts: Script[], regrasPresentes: string[], dados: Dados): RoteiroMontado[] {
  const presentes = new Set(regrasPresentes);
  const escolhidos = scripts.filter((s) => s.regra === "geral" || presentes.size === 0 || presentes.has(s.regra));
  return ETAPAS.map((e) => ({
    etapa: e.valor,
    rotulo: e.rotulo,
    emoji: e.emoji,
    itens: escolhidos
      .filter((s) => s.etapa === e.valor)
      .sort((a, b) => a.ordem - b.ordem || a.id - b.id)
      .map((s) => {
        const r = resolverTemplate(s.template, dados);
        return { id: s.id, titulo: s.titulo, regra: s.regra, texto: r.texto, faltando: r.faltando };
      }),
  })).filter((e) => e.itens.length > 0);
}

export { haQuanto };
