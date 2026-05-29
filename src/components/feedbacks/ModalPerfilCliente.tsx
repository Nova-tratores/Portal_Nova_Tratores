"use client";
import { useEffect, useState } from "react";
import { upsertClienteInfo } from "@/lib/feedbacks/api";
import { clienteKey } from "@/lib/feedbacks/types";
import type { ClienteInfo, Fazenda, Funcionario } from "@/lib/feedbacks/types";

interface Props {
  aberto: boolean;
  nome: string;
  codigoOmie: string | null;
  info?: ClienteInfo | null;
  onFechar: () => void;
  onSalvo: (info: ClienteInfo) => void;
}

interface FormState {
  cidade: string;
  email: string;
  funcionarios: Funcionario[];
  fazendas: Fazenda[];
}

const FUNC_VAZIO: Funcionario = { nome: "", cargo: "", telefone: "", fazenda: "" };
const FAZENDA_VAZIA: Fazenda = { nome: "", cidade: "", tratores: [] };

export default function ModalPerfilCliente({ aberto, nome, codigoOmie, info, onFechar, onSalvo }: Props) {
  const [form, setForm] = useState<FormState>({
    cidade: info?.cidade || "",
    email: info?.email || "",
    funcionarios: info?.funcionarios || [],
    fazendas: info?.fazendas || [],
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (aberto) {
      setForm({
        cidade: info?.cidade || "",
        email: info?.email || "",
        funcionarios: info?.funcionarios || [],
        fazendas: info?.fazendas || [],
      });
      setErro(null);
    }
  }, [aberto, info]);

  if (!aberto) return null;

  function updFunc(i: number, patch: Partial<Funcionario>) {
    setForm((f) => ({
      ...f,
      funcionarios: f.funcionarios.map((fn, idx) => idx === i ? { ...fn, ...patch } : fn),
    }));
  }
  function removerFunc(i: number) {
    setForm((f) => ({ ...f, funcionarios: f.funcionarios.filter((_, idx) => idx !== i) }));
  }
  function adicionarFunc() {
    setForm((f) => ({ ...f, funcionarios: [...f.funcionarios, { ...FUNC_VAZIO }] }));
  }

  function updFazenda(i: number, patch: Partial<Fazenda>) {
    setForm((f) => ({
      ...f,
      fazendas: f.fazendas.map((fz, idx) => idx === i ? { ...fz, ...patch } : fz),
    }));
  }
  function removerFazenda(i: number) {
    setForm((f) => ({ ...f, fazendas: f.fazendas.filter((_, idx) => idx !== i) }));
  }
  function adicionarFazenda() {
    setForm((f) => ({ ...f, fazendas: [...f.fazendas, { ...FAZENDA_VAZIA, tratores: [] }] }));
  }
  function adicionarTrator(fazendaIdx: number) {
    updFazenda(fazendaIdx, { tratores: [...form.fazendas[fazendaIdx].tratores, ""] });
  }
  function updTrator(fazendaIdx: number, tratorIdx: number, val: string) {
    const novos = [...form.fazendas[fazendaIdx].tratores];
    novos[tratorIdx] = val;
    updFazenda(fazendaIdx, { tratores: novos });
  }
  function removerTrator(fazendaIdx: number, tratorIdx: number) {
    const novos = form.fazendas[fazendaIdx].tratores.filter((_, i) => i !== tratorIdx);
    updFazenda(fazendaIdx, { tratores: novos });
  }

  async function handleSalvar() {
    setSalvando(true);
    setErro(null);
    try {
      const key = clienteKey(codigoOmie, nome);
      const salvo = await upsertClienteInfo({
        cliente_key: key,
        codigo_omie: codigoOmie,
        nome,
        cidade: form.cidade.trim() || null,
        email: form.email.trim() || null,
        funcionarios: form.funcionarios.filter((f) => f.nome || f.cargo || f.telefone || f.fazenda),
        fazendas: form.fazendas
          .filter((fz) => fz.nome || fz.cidade || fz.tratores.length)
          .map((fz) => ({ ...fz, tratores: fz.tratores.filter(Boolean) })),
      });
      onSalvo(salvo);
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onFechar}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <header style={headerStyle}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, textTransform: "uppercase", letterSpacing: 0.8 }}>
              👤 Perfil estendido
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: "4px 0 0" }}>{nome}</h2>
          </div>
          <button onClick={onFechar} style={btnFecharStyle}>✕</button>
        </header>

        <div style={bodyStyle}>
          {erro && <div style={erroStyle}>{erro}</div>}

          {/* Dados de contato */}
          <div style={secaoStyle}>
            <SecaoTitulo>Contato</SecaoTitulo>
            <Row>
              <Field label="Cidade">
                <input type="text" value={form.cidade} onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value }))} style={inputStyle} />
              </Field>
              <Field label="E-mail">
                <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} style={inputStyle} />
              </Field>
            </Row>
          </div>

          {/* Funcionários */}
          <div style={secaoStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <SecaoTitulo>Funcionários ({form.funcionarios.length})</SecaoTitulo>
              <button type="button" onClick={adicionarFunc} style={btnAdicionar}>+ Adicionar</button>
            </div>
            {form.funcionarios.map((fn, i) => (
              <div key={i} style={linhaStyle}>
                <input type="text" placeholder="Nome" value={fn.nome} onChange={(e) => updFunc(i, { nome: e.target.value })} style={inputStyle} />
                <input type="text" placeholder="Cargo" value={fn.cargo} onChange={(e) => updFunc(i, { cargo: e.target.value })} style={inputStyle} />
                <input type="text" placeholder="Telefone" value={fn.telefone} onChange={(e) => updFunc(i, { telefone: e.target.value })} style={inputStyle} />
                <input type="text" placeholder="Fazenda" value={fn.fazenda} onChange={(e) => updFunc(i, { fazenda: e.target.value })} style={inputStyle} />
                <button type="button" onClick={() => removerFunc(i)} style={btnRemover}>✕</button>
              </div>
            ))}
            {form.funcionarios.length === 0 && (
              <div style={vazioInternoStyle}>Nenhum funcionário cadastrado.</div>
            )}
          </div>

          {/* Fazendas */}
          <div style={secaoStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <SecaoTitulo>Fazendas ({form.fazendas.length})</SecaoTitulo>
              <button type="button" onClick={adicionarFazenda} style={btnAdicionar}>+ Adicionar</button>
            </div>
            {form.fazendas.map((fz, fi) => (
              <div key={fi} style={fazendaCardStyle}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, marginBottom: 8 }}>
                  <input type="text" placeholder="Nome da fazenda" value={fz.nome} onChange={(e) => updFazenda(fi, { nome: e.target.value })} style={inputStyle} />
                  <input type="text" placeholder="Cidade" value={fz.cidade} onChange={(e) => updFazenda(fi, { cidade: e.target.value })} style={inputStyle} />
                  <button type="button" onClick={() => removerFazenda(fi)} style={btnRemover}>✕</button>
                </div>
                <div style={{ paddingLeft: 12, borderLeft: "2px solid #e5e5e5" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--portal-text-secondary)" }}>
                      Tratores ({fz.tratores.length})
                    </span>
                    <button type="button" onClick={() => adicionarTrator(fi)} style={{ ...btnAdicionar, fontSize: 11, padding: "4px 10px" }}>
                      + Trator
                    </button>
                  </div>
                  {fz.tratores.map((t, ti) => (
                    <div key={ti} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                      <input type="text" placeholder="Modelo / chassi" value={t} onChange={(e) => updTrator(fi, ti, e.target.value)} style={inputStyle} />
                      <button type="button" onClick={() => removerTrator(fi, ti)} style={btnRemover}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {form.fazendas.length === 0 && (
              <div style={vazioInternoStyle}>Nenhuma fazenda cadastrada.</div>
            )}
          </div>
        </div>

        <footer style={footerStyle}>
          <button onClick={onFechar} style={btnGhostStyle} disabled={salvando}>Cancelar</button>
          <button onClick={handleSalvar} disabled={salvando} style={{ ...btnPrimaryStyle, opacity: salvando ? 0.6 : 1, cursor: salvando ? "wait" : "pointer" }}>
            {salvando ? "Salvando…" : "Salvar perfil"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--portal-text-muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
function SecaoTitulo({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 800, color: "var(--portal-text)", textTransform: "uppercase", letterSpacing: 0.6 }}>
      {children}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 9999, padding: 16, fontFamily: "Inter, sans-serif",
};
const modalStyle: React.CSSProperties = {
  background: "#fff", width: "100%", maxWidth: 820, maxHeight: "92vh",
  borderRadius: 14, display: "flex", flexDirection: "column",
  boxShadow: "0 25px 60px rgba(0,0,0,0.3)", overflow: "hidden",
};
const headerStyle: React.CSSProperties = {
  padding: "18px 24px", borderBottom: "1px solid var(--portal-border)",
  display: "flex", justifyContent: "space-between", alignItems: "center",
  background: "linear-gradient(135deg, #991b1b, #7f1d1d)", color: "#fff",
};
const bodyStyle: React.CSSProperties = { padding: 24, overflowY: "auto", flex: 1 };
const footerStyle: React.CSSProperties = {
  padding: "14px 24px", borderTop: "1px solid var(--portal-border)",
  display: "flex", justifyContent: "flex-end", gap: 10, background: "#fafafa",
};
const secaoStyle: React.CSSProperties = { marginBottom: 24 };
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px",
  border: "1.5px solid var(--portal-border)", borderRadius: 8,
  fontSize: 12, background: "var(--portal-bg-card)", color: "var(--portal-text)",
  fontFamily: "Inter, sans-serif", outline: "none",
};
const linhaStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.4fr 1fr 1fr 1fr auto",
  gap: 8, marginBottom: 6, alignItems: "center",
};
const fazendaCardStyle: React.CSSProperties = {
  background: "#fafafa", border: "1px solid var(--portal-border)",
  borderRadius: 10, padding: 12, marginBottom: 10,
};
const btnAdicionar: React.CSSProperties = {
  background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c",
  padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
  fontFamily: "Inter, sans-serif",
};
const btnRemover: React.CSSProperties = {
  background: "#fee2e2", border: "none", color: "#991b1b",
  width: 32, height: 32, borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer",
};
const btnFecharStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)", color: "#fff", border: "none",
  width: 32, height: 32, borderRadius: 8, fontSize: 16, cursor: "pointer", fontWeight: 700,
};
const btnGhostStyle: React.CSSProperties = {
  padding: "10px 22px", background: "#fff",
  border: "1.5px solid var(--portal-border)", color: "var(--portal-text-secondary)",
  borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer",
  fontFamily: "Inter, sans-serif",
};
const btnPrimaryStyle: React.CSSProperties = {
  padding: "10px 26px", background: "linear-gradient(135deg, #dc2626, #b91c1c)",
  color: "#fff", border: "none", borderRadius: 10,
  fontSize: 13, fontWeight: 700, boxShadow: "0 2px 8px rgba(185,28,28,0.25)",
  fontFamily: "Inter, sans-serif",
};
const erroStyle: React.CSSProperties = {
  background: "#fee2e2", color: "#991b1b", padding: "10px 14px",
  borderRadius: 10, fontSize: 13, marginBottom: 14,
};
const vazioInternoStyle: React.CSSProperties = {
  padding: "10px 14px", textAlign: "center", color: "var(--portal-text-muted)",
  fontSize: 12, fontStyle: "italic",
};
