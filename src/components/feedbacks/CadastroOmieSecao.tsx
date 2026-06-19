"use client";
import { useEffect, useRef, useState } from "react";
import { buscarCadastroOmie, salvarCadastroOmie, type CadastroOmieDados } from "@/lib/feedbacks/api";
import { useAuditLog } from "@/hooks/useAuditLog";

interface Props {
  codigoOmie: string | null;
  nome: string;
  cor: string;
}

const VAZIO: CadastroOmieDados = {
  telefone1: "", telefone2: "", fax: "", email: "",
  endereco: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "", cep: "",
};

// Seção "Dados cadastrais (Omie)" do atendimento: telefones/fax/endereço.
// Carrega sob demanda (ConsultarCliente) e grava no Omie (AlterarCliente).
export default function CadastroOmieSecao({ codigoOmie, nome, cor }: Props) {
  const { log } = useAuditLog();
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erroLoad, setErroLoad] = useState<string | null>(null);
  const [dados, setDados] = useState<CadastroOmieDados>(VAZIO);
  const baseRef = useRef<CadastroOmieDados>(VAZIO);
  const carregadoRef = useRef(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  // Reseta quando troca de cliente.
  useEffect(() => {
    setAberto(false); carregadoRef.current = false;
    setDados(VAZIO); baseRef.current = VAZIO; setErroLoad(null); setMsg(null);
  }, [codigoOmie]);

  async function expandir() {
    const novo = !aberto;
    setAberto(novo);
    if (novo && !carregadoRef.current && codigoOmie) {
      carregadoRef.current = true;
      setCarregando(true); setErroLoad(null);
      try {
        const c = await buscarCadastroOmie(codigoOmie);
        setDados(c.cadastro); baseRef.current = c.cadastro;
      } catch (e) {
        setErroLoad(e instanceof Error ? e.message : String(e));
        carregadoRef.current = false; // permite tentar de novo
      } finally {
        setCarregando(false);
      }
    }
  }

  const upd = (k: keyof CadastroOmieDados, v: string) => { setDados((d) => ({ ...d, [k]: v })); setMsg(null); };
  const mudou = JSON.stringify(dados) !== JSON.stringify(baseRef.current);

  async function salvar() {
    if (!codigoOmie) return;
    setSalvando(true); setMsg(null);
    try {
      await salvarCadastroOmie(codigoOmie, dados);
      const alterados = (Object.keys(dados) as (keyof CadastroOmieDados)[]).filter((k) => dados[k] !== baseRef.current[k]);
      baseRef.current = dados;
      void log({
        sistema: "feedbacks", acao: "cadastro_omie", entidade: "cliente",
        entidade_id: `omie_${codigoOmie}`, entidade_label: nome,
        detalhes: { campos: alterados },
      });
      setMsg({ tipo: "ok", texto: "Cadastro atualizado no Omie." });
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ border: "1.5px solid var(--portal-border)", borderRadius: 10, overflow: "hidden" }}>
      <button type="button" onClick={expandir} style={{ ...toggleBtn, color: cor }}>
        <span>📇 Dados cadastrais (Omie)</span>
        <span style={{ fontSize: 12 }}>{aberto ? "▴" : "▾"}</span>
      </button>

      {aberto && (
        <div style={{ padding: "12px 14px", borderTop: "1px solid var(--portal-border)" }}>
          {!codigoOmie ? (
            <div style={nota}>Selecione um cliente do Omie para editar os dados cadastrais.</div>
          ) : carregando ? (
            <div style={nota}>Carregando do Omie…</div>
          ) : erroLoad ? (
            <div style={{ ...nota, color: "#991b1b" }}>⚠ {erroLoad} <button onClick={expandir} style={linkBtn}>tentar de novo</button></div>
          ) : (
            <>
              <div style={grid3}>
                <Campo label="Telefone 1"><input value={dados.telefone1} onChange={(e) => upd("telefone1", e.target.value)} placeholder="(14) 99999-9999" style={inp} /></Campo>
                <Campo label="Telefone 2"><input value={dados.telefone2} onChange={(e) => upd("telefone2", e.target.value)} placeholder="(14) 99999-9999" style={inp} /></Campo>
                <Campo label="Fax"><input value={dados.fax} onChange={(e) => upd("fax", e.target.value)} style={inp} /></Campo>
              </div>
              <Campo label="E-mail"><input value={dados.email} onChange={(e) => upd("email", e.target.value)} style={inp} /></Campo>
              <div style={grid2end}>
                <Campo label="Endereço"><input value={dados.endereco} onChange={(e) => upd("endereco", e.target.value)} style={inp} /></Campo>
                <Campo label="Número"><input value={dados.numero} onChange={(e) => upd("numero", e.target.value)} style={inp} /></Campo>
              </div>
              <div style={grid3}>
                <Campo label="Bairro"><input value={dados.bairro} onChange={(e) => upd("bairro", e.target.value)} style={inp} /></Campo>
                <Campo label="Cidade"><input value={dados.cidade} onChange={(e) => upd("cidade", e.target.value)} style={inp} /></Campo>
                <Campo label="UF"><input value={dados.estado} maxLength={2} onChange={(e) => upd("estado", e.target.value.toUpperCase())} style={inp} /></Campo>
              </div>
              <div style={grid2end}>
                <Campo label="Complemento"><input value={dados.complemento} onChange={(e) => upd("complemento", e.target.value)} style={inp} /></Campo>
                <Campo label="CEP"><input value={dados.cep} onChange={(e) => upd("cep", e.target.value)} style={inp} /></Campo>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 4 }}>
                {msg ? (
                  <span style={{ fontSize: 11, fontWeight: 600, color: msg.tipo === "ok" ? "#065f46" : "#991b1b" }}>
                    {msg.tipo === "ok" ? "✓ " : "⚠ "}{msg.texto}
                  </span>
                ) : <span style={{ fontSize: 11, color: "var(--portal-text-muted)" }}>Grava direto no cadastro do Omie.</span>}
                <button
                  onClick={salvar}
                  disabled={salvando || !mudou}
                  style={{ padding: "8px 16px", borderRadius: 9, border: "none", fontSize: 12, fontWeight: 700, color: "#fff", background: cor, whiteSpace: "nowrap", opacity: salvando || !mudou ? 0.5 : 1, cursor: salvando || !mudou ? "default" : "pointer" }}
                >
                  {salvando ? "Salvando…" : "Salvar no Omie"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={lbl}>{label}</div>
      {children}
    </div>
  );
}

const toggleBtn: React.CSSProperties = {
  width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "10px 14px", background: "var(--portal-bg-card)", border: "none",
  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "Inter, sans-serif",
};
const grid3: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 };
const grid2end: React.CSSProperties = { display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 };
const lbl: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "var(--portal-text-secondary)",
  textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4,
};
const inp: React.CSSProperties = {
  width: "100%", padding: "8px 12px", border: "1.5px solid var(--portal-border)", borderRadius: 9,
  fontSize: 13, background: "var(--portal-bg-card)", color: "var(--portal-text)", fontFamily: "Inter, sans-serif", outline: "none",
};
const nota: React.CSSProperties = { fontSize: 12, color: "var(--portal-text-muted)", fontStyle: "italic" };
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 12, textDecoration: "underline", padding: 0 };
