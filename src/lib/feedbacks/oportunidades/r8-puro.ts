// R8 — parte PURA (sem I/O): o que falta num cadastro, e-mail interno da
// loja, rótulos. Importável por testes e pela ficha do cockpit.

export interface ParametrosR8 {
  emails_internos?: string[]; // e-mails da loja usados como preenchimento
  dominios_internos?: string[]; // ex.: ["novatratores"]
  somente_com_atividade?: boolean; // default true
  atividade_meses?: number; // default 24
  recente_meses?: number; // default 6 → prioridade Normal
}

export const R8_PADRAO: Required<ParametrosR8> = {
  emails_internos: ["rodrigo.novatratores@gmail.com", "posvendas.novatratores@gmail.com", "zezo.piraju@gmail.com"],
  dominios_internos: ["novatratores"],
  somente_com_atividade: true,
  atividade_meses: 24,
  recente_meses: 6,
};

export type Faltando = "telefone" | "email" | "email_interno";

/** Puro: o que falta neste cadastro (vazio = completo). */
export function faltandoNoCadastro(
  c: { telefone?: string | null; email?: string | null },
  p: Pick<ParametrosR8, "emails_internos" | "dominios_internos"> = {}
): Faltando[] {
  const out: Faltando[] = [];
  if (!String(c.telefone ?? "").replace(/\D/g, "")) out.push("telefone");
  const email = String(c.email ?? "").trim().toLowerCase();
  if (!email) out.push("email");
  else if (emailEhInterno(email, p)) out.push("email_interno");
  return out;
}

export function emailEhInterno(email: string | null | undefined, p: Pick<ParametrosR8, "emails_internos" | "dominios_internos"> = {}): boolean {
  const e = String(email ?? "").trim().toLowerCase();
  if (!e) return false;
  const lista = (p.emails_internos ?? R8_PADRAO.emails_internos).map((x) => x.toLowerCase());
  if (lista.includes(e)) return true;
  const dominios = p.dominios_internos ?? R8_PADRAO.dominios_internos;
  const dom = e.split("@")[1] ?? "";
  return dominios.some((d) => dom.includes(d.toLowerCase()));
}

export function rotuloFaltando(f: Faltando): string {
  return f === "telefone" ? "telefone" : f === "email" ? "e-mail" : "e-mail (hoje está com e-mail da loja)";
}
