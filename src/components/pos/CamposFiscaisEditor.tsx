"use client";
// Editor dos campos fiscais de um item de serviço, nas mesmas abas da Omie.
// Usado na janela de faturar (com o modelo como base e o valor atual da Omie ao
// lado) e na tela de modelos. Valores são strings da tela; quem chama valida com
// validarCampos (lib/pos/modelo-fiscal).
import { CAMPOS_FISCAIS, GRUPOS, mostrarValor, formatarNbs, type CamposFiscais } from "@/lib/pos/modelo-fiscal";

export type ValoresTela = Record<string, string>;

/** Campos do modelo → strings para os inputs (NBS formatado, alíquota com vírgula). */
export function paraTela(campos: CamposFiscais | null | undefined): ValoresTela {
  const out: ValoresTela = {};
  for (const [k, v] of Object.entries(campos || {})) {
    out[k] = k === "cNbs" ? formatarNbs(v) : typeof v === "number" ? String(v).replace(".", ",") : String(v);
  }
  return out;
}

/** Compara dois valores da tela do mesmo campo (NBS só dígitos, alíquota como número). */
function igual(chave: string, a: string | undefined, b: string | undefined): boolean {
  const n = (v: string | undefined) => {
    const t = String(v ?? "").trim();
    if (chave === "cNbs") return t.replace(/\D/g, "");
    if (/^n/.test(chave) && t) { const x = Number(t.replace(",", ".")); return Number.isFinite(x) ? String(x) : t; }
    return t.toUpperCase();
  };
  return n(a) === n(b);
}

export default function CamposFiscaisEditor({ valores, onChange, base, atuais, abertoInicial }: {
  valores: ValoresTela;
  onChange: (v: ValoresTela) => void;
  base?: ValoresTela | null;                                          // valores do modelo (destaca o que foi ajustado)
  atuais?: Record<string, string | number | null | "varia"> | null;  // o que a Omie tem hoje
  abertoInicial?: boolean;
}) {
  const set = (k: string, v: string) => onChange({ ...valores, [k]: v });
  const inp: React.CSSProperties = { width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #cbd5e1", fontSize: 12.5, background: "#fff", color: "#1e293b", boxSizing: "border-box" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {GRUPOS.map((g) => {
        const campos = CAMPOS_FISCAIS.filter((c) => c.grupo === g.id);
        const preenchidos = campos.filter((c) => String(valores[c.chave] ?? "").trim()).length;
        return (
          <details key={g.id} open={abertoInicial || preenchidos > 0} style={{ border: "1px solid #e2e8f0", borderRadius: 4 }}>
            <summary style={{ cursor: "pointer", padding: "7px 10px", fontSize: 12.5, fontWeight: 700, color: "#334155", background: "#f8fafc" }}>
              {g.rotulo}{preenchidos ? <span style={{ fontWeight: 600, color: "#0369A1" }}> · {preenchidos} preenchido(s)</span> : <span style={{ fontWeight: 500, color: "#94a3b8" }}> · usa o cadastro da Omie</span>}
            </summary>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8, padding: 10 }}>
              {campos.map((c) => {
                const v = valores[c.chave] ?? "";
                const ajustado = !!base && !igual(c.chave, v, base[c.chave]);
                return (
                  <label key={c.chave} style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11.5, color: "#475569" }} title={c.dica}>
                    <span style={{ fontWeight: 700 }}>
                      {c.rotulo}{ajustado && <span style={{ color: "#b45309" }}> · ajustado</span>}
                    </span>
                    {c.tipo === "sn" ? (
                      <select value={v} onChange={(e) => set(c.chave, e.target.value)} style={{ ...inp, borderColor: ajustado ? "#f59e0b" : "#cbd5e1" }}>
                        <option value="">— cadastro da Omie —</option>
                        <option value="S">Sim</option>
                        <option value="N">Não</option>
                      </select>
                    ) : (
                      <input value={v} onChange={(e) => set(c.chave, e.target.value)} inputMode={c.tipo === "aliquota" ? "decimal" : "text"}
                        placeholder={c.tipo === "aliquota" ? "0,00" : c.dica || ""} style={{ ...inp, borderColor: ajustado ? "#f59e0b" : "#cbd5e1" }} />
                    )}
                    {atuais && <span style={{ fontSize: 10.5, color: "#94a3b8" }}>Omie hoje: {mostrarValor(c.chave, atuais[c.chave])}</span>}
                  </label>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}
