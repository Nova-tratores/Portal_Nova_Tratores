// ÚLTIMO SERVIÇO do cliente no RFM (José, 23/10/2026: "o histórico de serviços no RFM, pra ver se ele
// gostou do último serviço, ou se não tem feedback do último serviço, mas tem que mostrar tudo do
// último serviço"). Puro: recebe as OS do espelho Omie e os registros de CRM do cliente e diz qual foi
// o último serviço, tudo o que tem nele e o feedback que o CRM pegou daquele serviço (se pegou).
import type { HistOS } from "./historico-cliente";
import type { FeedbackRegistro } from "./types";
import { contaDaEmpresa, lerDescricao, tecnicosDaOS } from "./crm-automatico";

export interface ItemServico { desc: string; qtd: number; valor: number; total: number; tipo: "hora" | "km" | "outro" }

export interface UltimoServico {
  numOs: string | null;
  osRef: string | null;          // 'NOVA:5395'
  empresa: string | null;
  data: string | null;           // faturamento ou abertura (YYYY-MM-DD)
  faturada: boolean;
  situacao: string | null;
  valor: number | null;
  numNf: string | null;
  linkNf: string | null;
  modelo: string | null;
  chassi: string | null;
  horimetro: string | null;
  solicitacao: string | null;
  realizado: string | null;
  tecnico: string | null;
  itens: ItemServico[];
  /** quantas OS o cliente tem no histórico */
  totalOS: number;
}

export type FeedbackDoServico =
  | { tipo: "respondeu"; registro: FeedbackRegistro }
  | { tipo: "sem_resposta"; registro: FeedbackRegistro }  // ligaram e não conseguiram falar
  | { tipo: "aberto"; registro: FeedbackRegistro }        // ligação na fila, ainda não feita
  | { tipo: "arquivado"; registro: FeedbackRegistro }
  | { tipo: "nenhum" };                                   // o serviço nunca entrou no CRM

const ETAPA: Record<string, string> = { "10": "Em aberto", "20": "Parcial", "30": "Executada", "50": "Faturando", "60": "Faturada", "70": "Devolvida" };
const iso = (s: string | null | undefined): string | null => {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null;
};
const DIA = 86_400_000;

/** Linhas de serviço da OS (JSON do Omie). A 1ª linha costuma repetir a descrição (valor 0,000001) — sai. */
export function itensDaOS(servicos: string | null | undefined): ItemServico[] {
  let lista: unknown;
  try { lista = JSON.parse(String(servicos || "[]")); } catch { return []; }
  if (!Array.isArray(lista)) return [];
  const out: ItemServico[] = [];
  for (const s of lista as Array<Record<string, unknown>>) {
    const desc = String(s?.desc || "").trim();
    const qtd = Number(s?.qtd) || 0;
    const valor = Number(s?.valor) || 0;
    if (!desc || /modelo\s*:/i.test(desc) || valor < 0.01) continue;
    const tipo: ItemServico["tipo"] = /hora/i.test(desc) ? "hora" : /km|deslocamento/i.test(desc) ? "km" : "outro";
    out.push({ desc, qtd, valor, total: Math.round(qtd * valor * 100) / 100, tipo });
  }
  return out;
}

const cancelada = (o: HistOS) => /cancel/i.test(String(o.status || "")) || o.etapa === "70";

/** A OS mais recente que não foi cancelada (faturada de preferência pela data de faturamento). */
export function ultimaOS(os: HistOS[]): HistOS | null {
  const validas = os.filter((o) => !cancelada(o));
  if (!validas.length) return null;
  const data = (o: HistOS) => iso(o.data_faturamento) || iso(o.data_inclusao) || "";
  return [...validas].sort((a, b) => data(b).localeCompare(data(a)) || Number(b.num_os || 0) - Number(a.num_os || 0))[0];
}

export function montarUltimoServico(os: HistOS[]): UltimoServico | null {
  const o = ultimaOS(os);
  if (!o) return null;
  const d = lerDescricao(o.descricao);
  const conta = contaDaEmpresa(o.empresa);
  const numOs = o.num_os ? String(Number(o.num_os) || o.num_os) : null;
  return {
    numOs,
    osRef: conta && numOs ? `${conta}:${numOs}` : null,
    empresa: o.empresa,
    data: iso(o.data_faturamento) || iso(o.data_inclusao),
    faturada: o.etapa === "60" || /fatur/i.test(String(o.status || "")),
    situacao: o.status || ETAPA[o.etapa || ""] || o.etapa,
    valor: o.valor_total,
    numNf: o.num_nf || null,
    linkNf: o.link_nf || null,
    modelo: d.modelo || null,
    chassi: d.chassi || null,
    horimetro: d.horimetro || null,
    solicitacao: d.solicitacao || null,
    realizado: d.realizado || null,
    tecnico: tecnicosDaOS(o.vendedor),
    itens: itensDaOS(o.servicos),
    totalOS: os.filter((x) => !cancelada(x)).length,
  };
}

/**
 * O feedback que o CRM pegou DESTE serviço: o registro com a mesma OS (os_ref) ou, nos antigos sem
 * OS, o registro de CRM com data do serviço até 20 dias da data da OS.
 */
export function feedbackDoServico(u: UltimoServico | null, crms: FeedbackRegistro[]): FeedbackDoServico {
  if (!u) return { tipo: "nenhum" };
  const doCrm = crms.filter((r) => r.tipo === "crm");
  let r = u.osRef ? doCrm.find((x) => x.os_ref === u.osRef) : undefined;
  if (!r && u.data) {
    const t = Date.parse(`${u.data}T12:00:00`);
    const perto = doCrm
      .map((x) => ({ x, d: Math.abs(Date.parse(`${iso(x.faturado_em || x.data_servico) || ""}T12:00:00`) - t) }))
      .filter((p) => Number.isFinite(p.d) && p.d <= 20 * DIA)
      .sort((a, b) => a.d - b.d);
    r = perto[0]?.x;
  }
  if (!r) return { tipo: "nenhum" };
  const respondeu = r.nota != null || (r.status_cliente && r.status_cliente !== "Aguardando") || !!r.feedback?.trim() || !!r.nps;
  if (r.status_atendimento === "concluido" && respondeu) return { tipo: "respondeu", registro: r };
  // concluído sem nada anotado conta como "sem feedback"
  if (r.status_atendimento === "sem_resposta" || r.sem_resposta) return { tipo: "sem_resposta", registro: r };
  if (r.status_atendimento === "arquivado") return { tipo: "arquivado", registro: r };
  if (r.status_atendimento === "concluido") return { tipo: "nenhum" };
  return { tipo: "aberto", registro: r };
}
