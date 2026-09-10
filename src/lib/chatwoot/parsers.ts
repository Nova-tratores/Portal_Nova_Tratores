// Funções PURAS sobre o que o NovaZap devolve — sem I/O, testáveis.
//
// Atributos por contato (custom_attributes, JSONB livre no fork):
//   tipo_contato   cliente | funcionario | fornecedor
//   cliente        "Nome (cód N)"          cliente_ref  "cod_cli:empresa"
//   cliente_cod    "N"                      cliente_cargo  Proprietário | Tratorista |
//                                                          Gerente | Financeiro | Funcionário
//   localizacao    link/coordenada (legado, 1 só)
//   localizacoes   [{nome, link}] — pode vir como array OU string JSON

import { normalizarTelefoneWa } from "@/lib/feedbacks/telefone";
import type { ContatoBruto, ConversaBruta } from "./cliente";
import { urlConversa } from "./config";

export interface Localizacao {
  nome: string;
  link: string;
}

export interface ResumoConversa {
  display_id: number;
  status: string;
  status_label: string;
  ultima_atividade: string | null; // ISO
  atendente: string | null;
  inbox: string | null;
  nao_lidas: number;
  url: string;
}

export interface ContatoWhatsapp {
  id: number;
  nome: string;
  cargo: string | null;
  telefone: string | null;
  telefone_wa: string | null;
  thumbnail: string | null;
  cliente_ref: string | null;
  localizacoes: Localizacao[];
  ultima_atividade: string | null; // ISO, do contato
  ultima_conversa: ResumoConversa | null;
}

export type SecaoWhatsapp =
  | { estado: "nao_configurado" }
  | { estado: "indisponivel"; motivo: string }
  | { estado: "sem_contatos"; codigos_consultados: string[] }
  | { estado: "ok"; contatos: ContatoWhatsapp[]; truncado: boolean; total: number; consultado_em: string };

export const ORDEM_CARGO = ["Proprietário", "Gerente", "Financeiro", "Tratorista", "Funcionário"];

const STATUS_LABEL: Record<string, string> = {
  open: "Aberta",
  pending: "Pendente",
  resolved: "Resolvida",
  snoozed: "Adiada",
};

function semAcento(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function attrs(c: ContatoBruto): Record<string, unknown> {
  return (c.custom_attributes && typeof c.custom_attributes === "object" ? c.custom_attributes : {}) as Record<string, unknown>;
}

/** Parte antes do `:` de `cliente_ref` ("123:Nova Tratores" → "123"). */
export function codigoDoClienteRef(ref: unknown): string | null {
  const s = String(ref ?? "").trim();
  if (!s) return null;
  const cod = s.split(":")[0].trim();
  return cod || null;
}

/**
 * Mantém só os contatos que pertencem ao cliente: código do `cliente_ref` OU
 * `cliente_cod` dentro da lista de códigos Omie (match EXATO — a busca do
 * NovaZap é ILIKE e "123:" também casa "4123:"). Exclui funcionário e
 * fornecedor e deduplica por id.
 *
 * A empresa do `cliente_ref` é ignorada de propósito: o código Omie não se
 * repete entre as contas neste cadastro.
 */
export function filtrarContatosDoCliente(contatos: ContatoBruto[], codigos: string[]): ContatoBruto[] {
  const alvo = new Set(codigos.map((c) => String(c).trim()).filter(Boolean));
  const vistos = new Set<number>();
  const out: ContatoBruto[] = [];
  for (const c of contatos) {
    if (!c || c.id == null || vistos.has(c.id)) continue;
    const a = attrs(c);
    const tipo = semAcento(a.tipo_contato);
    if (tipo === "funcionario" || tipo === "fornecedor") continue;
    const cod = codigoDoClienteRef(a.cliente_ref);
    const codDireto = String(a.cliente_cod ?? "").trim();
    if ((cod && alvo.has(cod)) || (codDireto && alvo.has(codDireto))) {
      vistos.add(c.id);
      out.push(c);
    }
  }
  return out;
}

/** `localizacoes` (array | string JSON | string solta) + legado `localizacao`. */
export function normalizarLocalizacoes(a: Record<string, unknown>): Localizacao[] {
  const raw = a.localizacoes;
  let lista: unknown[] = [];
  if (Array.isArray(raw)) lista = raw;
  else if (typeof raw === "string" && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      lista = Array.isArray(p) ? p : [{ nome: raw.trim(), link: "" }];
    } catch {
      lista = [{ nome: raw.trim(), link: "" }];
    }
  }
  const out: Localizacao[] = [];
  for (const item of lista) {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const nome = String(o.nome ?? "").trim();
    const link = String(o.link ?? "").trim();
    if (!nome && !link) continue;
    out.push({ nome: nome || "Localização", link });
  }
  const legado = String(a.localizacao ?? "").trim();
  if (out.length === 0 && legado) out.push({ nome: "Localização", link: legado });
  return out;
}

function isoDe(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? new Date(v * 1000).toISOString() : null;
  const n = Number(v);
  if (Number.isFinite(n) && String(v).trim() !== "") return new Date(n * 1000).toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function resumirConversa(c: ConversaBruta, inboxes: Map<number, string> = new Map()): ResumoConversa {
  const status = String(c.status ?? "").toLowerCase();
  return {
    display_id: Number(c.id),
    status,
    status_label: STATUS_LABEL[status] ?? (status ? status[0].toUpperCase() + status.slice(1) : "—"),
    ultima_atividade: isoDe(c.last_activity_at),
    atendente: c.meta?.assignee?.name?.trim() || null,
    inbox: c.inbox_id != null ? inboxes.get(Number(c.inbox_id)) ?? null : null,
    nao_lidas: Number(c.unread_count ?? 0) || 0,
    url: urlConversa(Number(c.id)),
  };
}

export function paraContatoWhatsapp(c: ContatoBruto, ultima: ConversaBruta | null, inboxes?: Map<number, string>): ContatoWhatsapp {
  const a = attrs(c);
  const cargo = String(a.cliente_cargo ?? "").trim() || null;
  const telefone = String(c.phone_number ?? a.cliente_telefone ?? "").trim() || null;
  return {
    id: Number(c.id),
    nome: String(c.name ?? "").trim() || "(sem nome)",
    cargo,
    telefone,
    telefone_wa: normalizarTelefoneWa(telefone),
    thumbnail: String(c.thumbnail ?? "").trim() || null,
    cliente_ref: String(a.cliente_ref ?? "").trim() || null,
    localizacoes: normalizarLocalizacoes(a),
    ultima_atividade: isoDe(c.last_activity_at),
    ultima_conversa: ultima ? resumirConversa(ultima, inboxes) : null,
  };
}

/** Proprietário primeiro, depois a ordem de ORDEM_CARGO; desconhecido por último; empate = atividade mais recente. */
export function ordenarPorCargo<T extends { cargo: string | null; ultima_atividade: string | null }>(contatos: T[]): T[] {
  const posicao = (cargo: string | null) => {
    if (!cargo) return ORDEM_CARGO.length;
    const i = ORDEM_CARGO.findIndex((c) => semAcento(c) === semAcento(cargo));
    return i === -1 ? ORDEM_CARGO.length : i;
  };
  return [...contatos].sort((a, b) => {
    const d = posicao(a.cargo) - posicao(b.cargo);
    if (d !== 0) return d;
    return (b.ultima_atividade ?? "").localeCompare(a.ultima_atividade ?? "");
  });
}

// -----------------------------------------------------------------------------
// Contatos por CARGO (aba /feedbacks/atendimento/contatos)
// -----------------------------------------------------------------------------
export const CARGOS_CLIENTE = ["Proprietário", "Tratorista", "Gerente", "Financeiro", "Funcionário"];

export interface ContatoPorCargo {
  id: number;
  nome: string;
  cargo: string;
  telefone: string | null;
  telefone_wa: string | null;
  cliente: string | null; // rótulo "Nome (cód N)" sem o "(cód N)"
  cliente_cod: string | null;
  cliente_key: string | null; // omie_<cod> quando vinculado
  localizacoes: Localizacao[];
}

/** Filtra exato por `cliente_cargo` (a busca do NovaZap é ILIKE no JSON inteiro), dedup por id, ordena por cargo → nome. */
export function contatosPorCargo(contatos: ContatoBruto[], cargos: string[] = CARGOS_CLIENTE): ContatoPorCargo[] {
  const alvo = new Map(cargos.map((c) => [semAcento(c), c] as const));
  const vistos = new Set<number>();
  const out: ContatoPorCargo[] = [];
  for (const c of contatos) {
    if (!c || c.id == null || vistos.has(c.id)) continue;
    const a = attrs(c);
    if (semAcento(a.tipo_contato) === "funcionario" || semAcento(a.tipo_contato) === "fornecedor") continue;
    const cargo = alvo.get(semAcento(a.cliente_cargo));
    if (!cargo) continue;
    vistos.add(c.id);
    const cod = codigoDoClienteRef(a.cliente_ref) ?? (String(a.cliente_cod ?? "").trim() || null);
    const telefone = String(c.phone_number ?? a.cliente_telefone ?? "").trim() || null;
    out.push({
      id: Number(c.id),
      nome: String(c.name ?? "").trim() || "(sem nome)",
      cargo,
      telefone,
      telefone_wa: normalizarTelefoneWa(telefone),
      cliente: String(a.cliente ?? "").replace(/\s*\(cód[^)]*\)\s*$/i, "").trim() || null,
      cliente_cod: cod,
      cliente_key: cod ? `omie_${cod}` : null,
      localizacoes: normalizarLocalizacoes(a),
    });
  }
  const pos = (cg: string) => { const i = CARGOS_CLIENTE.indexOf(cg); return i === -1 ? 99 : i; };
  return out.sort((x, y) => pos(x.cargo) - pos(y.cargo) || x.nome.localeCompare(y.nome, "pt-BR"));
}
