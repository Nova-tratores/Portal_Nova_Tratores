// Todas as notas fiscais na Pasta Clientes (José, 15/10/2026): as de SAÍDA e de ENTRADA do
// cliente (pelo CNPJ/CPF da nota) e as das MÁQUINAS dele (pelo chassi que a nota cita —
// campo `maquina` de notas_fiscais_docs). Nota de máquina sem dono fica presa ao chassi e
// aparece na pasta de quem a máquina passar a ser. Regras puras (testadas).

export const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

/** "12345678000190" → "12.345.678/0001-90"; CPF → "123.456.789-01" (como o Omie grava nos projetos) */
export function mascararDoc(doc: string): string {
  const d = soDigitos(doc);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d;
}

/** Chassi/nº de série de um projeto: a coluna `chassis` ou o último pedaço do nome ("6075 MDI07502AN0002581"). */
export function chassiDoProjeto(p: { nome?: string | null; chassis?: string | null }): string | null {
  const limpa = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const c = limpa(String(p.chassis || ""));
  if (c.length >= 7 && /\d/.test(c)) return c;
  const ult = limpa(String(p.nome || "").trim().split(/\s+/).pop() || "");
  return ult.length >= 7 && /\d/.test(ult) && /[A-Z]|\d{8,}/.test(ult) ? ult : null;
}

/** Chassis únicos (sem repetir) de uma lista de projetos. */
export function chassisDosProjetos(ps: Array<{ nome?: string | null; chassis?: string | null }>): string[] {
  return [...new Set(ps.map(chassiDoProjeto).filter((c): c is string => !!c))];
}

/** Por que a nota está na pasta: do próprio cliente ou de uma máquina dele (qual chassi). */
export function motivoDaNota(n: { parte_doc?: string | null; maquina?: string | null }, doc: string, chassis: string[]): { via: "cliente" | "maquina"; chassi?: string } | null {
  if (doc && soDigitos(n.parte_doc) === soDigitos(doc)) return { via: "cliente" };
  const m = String(n.maquina || "").toUpperCase().replace(/[^A-Z0-9|]/g, "");
  const achado = chassis.find((c) => m.includes(c));
  return achado ? { via: "maquina", chassi: achado } : null;
}
