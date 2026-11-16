"use client";
// Modelos fiscais da NFS-e (impostos dos itens de serviço da OS) + modelo de cada
// cliente. Aplicados na janela de faturar a OS. Permissão explícita
// pos:modelos_fiscais (o acesso total do POS não concede). Regras dos campos:
// lib/pos/modelo-fiscal.ts · banco: sql/pos-modelos-fiscais.sql
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";
import SemPermissao from "@/components/SemPermissao";
import { authHeaders } from "@/lib/auth/client";
import { validarCampos, CAMPOS_FISCAIS, mostrarValor, type CamposFiscais } from "@/lib/pos/modelo-fiscal";
import CamposFiscaisEditor, { paraTela, type ValoresTela } from "@/components/pos/CamposFiscaisEditor";
import LevantamentoFiscal from "@/components/pos/LevantamentoFiscal";

interface Modelo { id: string; nome: string; descricao: string | null; campos: CamposFiscais; padrao: boolean; atualizadoPor: string | null; atualizadoEm: string }
interface Vinculo { documento: string; modeloId: string; clienteNome: string | null; atualizadoPor: string | null }
type Dados = { modelos: Modelo[]; vinculos: Vinculo[]; podeGerenciar: boolean };

async function chamar<T>(url: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  const r = await fetch(url, {
    method: init.method || "GET",
    headers: { ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}), ...(await authHeaders()) },
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Falha (${r.status})`);
  return j as T;
}

const fmtDoc = (d: string) => d.length === 14
  ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  : d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d;

export default function ModelosFiscaisPage() {
  const { userProfile } = useAuth();
  const { pode, isDev, loading } = usePermissoes(userProfile?.id);
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<{ id: string | null; nome: string; descricao: string; padrao: boolean; valores: ValoresTela } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [novoVinc, setNovoVinc] = useState({ documento: "", clienteNome: "", modeloId: "" });

  const recarregar = async () => {
    try { setDados(await chamar<Dados>("/api/pos/modelos-fiscais")); setErro(""); }
    catch (e) { setErro(e instanceof Error ? e.message : "Erro ao carregar"); }
  };

  useEffect(() => {
    let cancel = false;
    chamar<Dados>("/api/pos/modelos-fiscais")
      .then((d) => { if (!cancel) setDados(d); })
      .catch((e) => { if (!cancel) setErro(e instanceof Error ? e.message : "Erro ao carregar"); });
    return () => { cancel = true; };
  }, []);

  const validacao = useMemo(() => validarCampos(editando?.valores || {}), [editando]);
  const nomeModelo = (id: string) => dados?.modelos.find((m) => m.id === id)?.nome || "—";

  if (loading) return null;
  if (!isDev && !pode("pos", "modelos_fiscais")) return <SemPermissao />;

  const salvar = async () => {
    if (!editando) return;
    setSalvando(true);
    try {
      await chamar("/api/pos/modelos-fiscais", { method: "POST", json: { id: editando.id, nome: editando.nome, descricao: editando.descricao, padrao: editando.padrao, campos: validacao.campos } });
      setEditando(null);
      await recarregar();
    } catch (e) { alert(e instanceof Error ? e.message : "Erro ao salvar"); }
    setSalvando(false);
  };
  const desativar = async (m: Modelo) => {
    const n = dados?.vinculos.filter((v) => v.modeloId === m.id).length || 0;
    if (!confirm(`Desativar o modelo "${m.nome}"?${n ? ` ${n} cliente(s) vinculado(s) voltam a usar o padrão.` : ""}`)) return;
    try { await chamar(`/api/pos/modelos-fiscais?id=${encodeURIComponent(m.id)}`, { method: "DELETE" }); await recarregar(); }
    catch (e) { alert(e instanceof Error ? e.message : "Erro"); }
  };
  const vincular = async (documento: string, modeloId: string | null, clienteNome: string | null) => {
    try { await chamar("/api/pos/modelos-fiscais/vinculos", { method: "POST", json: { documento, modeloId, clienteNome } }); await recarregar(); return true; }
    catch (e) { alert(e instanceof Error ? e.message : "Erro"); return false; }
  };

  // estilo POS NewPortal (José, 16/11/2026): cartão branco cantos 16, sem negrito, ícone em quadradinho, sem faixa lateral
  const card: React.CSSProperties = { background: "var(--surface, #fff)", border: "1px solid var(--border, #e7e2da)", borderRadius: 16, padding: 18 };
  const btn = (cor: string): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: 7, height: 36, padding: "0 14px", borderRadius: 9, border: "none", background: cor, color: "#fefefe", fontWeight: 500, fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" });
  const btnLeve = (cor = "#334155"): React.CSSProperties => ({ ...btn("var(--surface, #fff)"), color: cor, border: "1px solid var(--border, #dfe3ea)" });
  const inp: React.CSSProperties = { height: 38, padding: "0 11px", borderRadius: 9, border: "1px solid #dfe3ea", fontSize: 14, background: "var(--surface, #fff)", color: "var(--portal-text, #1e293b)", boxSizing: "border-box", fontFamily: "inherit", margin: 0 };
  const titulo = (ic: string, cor: string, t: string, sub?: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
      <span style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", flexShrink: 0, color: cor, background: `color-mix(in srgb, ${cor} 11%, var(--surface, #fff))` }}><i className={`fas ${ic}`} /></span>
      <span style={{ display: "grid", minWidth: 0, lineHeight: 1.3 }}>
        <span style={{ fontSize: 16, fontWeight: 500, color: "var(--portal-text, #0f172a)" }}>{t}</span>
        {sub && <span style={{ fontSize: 13, color: "var(--portal-text-muted, #64748b)" }}>{sub}</span>}
      </span>
    </div>
  );

  return (
    <div className="mf" style={{ padding: "20px 24px 60px", display: "flex", flexDirection: "column", gap: 16, color: "var(--portal-text, #0f172a)" }}>
      <style>{`.mf b, .mf strong { font-weight: 500 } @media (max-width: 768px) { .mf { padding: 14px 16px 40px !important } .mf-linha > * { flex-basis: 100% !important; width: 100% !important } }`}</style>
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {titulo("fa-file-invoice-dollar", "#0369A1", "Modelos fiscais da NFS-e",
          "Impostos e códigos que vão nos itens de serviço da OS na hora de faturar. Campo vazio = vale o cadastro do serviço no Omie. Cliente sem modelo próprio usa o modelo padrão.")}
      </div>
      {erro && <div style={{ ...card, borderColor: "#fecaca", color: "#b91c1c" }}>{erro}</div>}

      <LevantamentoFiscal
        modelos={dados?.modelos || []}
        onCriarModelo={(campos, nome) => {
          setEditando({
            id: null, nome, descricao: "Criado a partir do levantamento das OS faturadas na Omie",
            padrao: nome === "Padrão" && !dados?.modelos.some((m) => m.padrao), valores: paraTela(campos),
          });
          setTimeout(() => document.getElementById("editor-modelo")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
        }}
        onVincular={async (clientes, modeloId) => {
          let falhas = 0;
          for (const c of clientes) {
            try { await chamar("/api/pos/modelos-fiscais/vinculos", { method: "POST", json: { documento: c.documento, modeloId, clienteNome: c.nome } }); }
            catch { falhas++; }
          }
          await recarregar();
          alert(falhas ? `${clientes.length - falhas} vinculado(s); ${falhas} falharam.` : `${clientes.length} cliente(s) vinculado(s).`);
        }}
      />

      {/* ---------------- modelos ---------------- */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          {titulo("fa-layer-group", "#7c3aed", "Modelos", `${dados?.modelos.length || 0} ativo(s)`)}
          <button style={btn("#0369A1")} onClick={() => setEditando({ id: null, nome: "", descricao: "", padrao: !dados?.modelos.length, valores: {} })}><i className="fas fa-plus" style={{ fontSize: 11 }} /> Novo modelo</button>
        </div>
        {!dados?.modelos.length && <div style={{ fontSize: 13.5, color: "#64748b" }}>Nenhum modelo ainda. Comece pelo &quot;Padrão&quot; (ex.: CST 000 para o NBS dos serviços) e depois os especiais, como &quot;Prefeitura&quot;.</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))", gap: 10 }}>
          {(dados?.modelos || []).map((m) => {
            const preenchidos = CAMPOS_FISCAIS.filter((c) => m.campos[c.chave] !== undefined);
            const clientes = dados?.vinculos.filter((v) => v.modeloId === m.id).length || 0;
            return (
              <div key={m.id} style={{ border: `1px solid ${m.padrao ? "color-mix(in srgb, #0369A1 35%, var(--border, #e2e8f0))" : "var(--border, #e2e8f0)"}`, borderRadius: 13, padding: 14, fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15, flex: 1, minWidth: 0 }}>{m.nome}</span>
                  {m.padrao && <span style={{ fontSize: 12, padding: "2px 9px", borderRadius: 999, background: "color-mix(in srgb, #0369A1 10%, var(--surface, #fff))", color: "#0369A1" }}>padrão</span>}
                </div>
                {m.descricao && <div style={{ color: "#64748b" }}>{m.descricao}</div>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {preenchidos.length
                    ? preenchidos.slice(0, 6).map((c) => <span key={c.chave} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, background: "var(--portal-bg-secondary, #f1f5f9)", color: "#475569" }}>{c.rotulo}: {mostrarValor(c.chave, m.campos[c.chave])}</span>)
                    : <span style={{ color: "#94a3b8" }}>Sem campos (usa tudo do cadastro do Omie)</span>}
                  {preenchidos.length > 6 && <span style={{ fontSize: 12, color: "#94a3b8", alignSelf: "center" }}>+{preenchidos.length - 6}</span>}
                </div>
                <div style={{ color: "#64748b", fontSize: 12.5 }}>{clientes} cliente(s) vinculado(s){m.atualizadoPor ? ` · por ${m.atualizadoPor}` : ""}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <button style={btnLeve()} onClick={() => setEditando({ id: m.id, nome: m.nome, descricao: m.descricao || "", padrao: m.padrao, valores: paraTela(m.campos) })}><i className="fas fa-pen" style={{ fontSize: 11 }} /> Editar</button>
                  <button style={btnLeve("#b91c1c")} onClick={() => desativar(m)}>Desativar</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------------- editor ---------------- */}
      {editando && (
        <div id="editor-modelo" style={{ ...card, borderColor: "#0369A1", scrollMarginTop: 90 }}>
          <div style={{ marginBottom: 14 }}>{titulo("fa-pen-to-square", "#0369A1", editando.id ? `Editar "${editando.nome}"` : "Novo modelo", "Deixe vazio o que deve vir do cadastro do serviço no Omie")}</div>
          <div className="mf-linha" style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
            <input style={{ ...inp, flex: "1 1 220px" }} placeholder="Nome (ex.: Prefeitura)" value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} />
            <input style={{ ...inp, flex: "2 1 320px" }} placeholder="Quando usar (opcional)" value={editando.descricao} onChange={(e) => setEditando({ ...editando, descricao: e.target.value })} />
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, minHeight: 38 }}>
              <input type="checkbox" checked={editando.padrao} onChange={(e) => setEditando({ ...editando, padrao: e.target.checked })} /> Padrão (cliente sem modelo)
            </label>
          </div>
          <CamposFiscaisEditor valores={editando.valores} onChange={(v) => setEditando({ ...editando, valores: v })} abertoInicial />
          {validacao.erros.length > 0 && <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>{validacao.erros.join(" ")}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={btn(validacao.erros.length || !editando.nome.trim() ? "#94a3b8" : "#0369A1")} disabled={salvando || !!validacao.erros.length || !editando.nome.trim()} onClick={salvar}>
              <i className={`fas ${salvando ? "fa-spinner fa-spin" : "fa-check"}`} style={{ fontSize: 12 }} /> {salvando ? "Salvando…" : "Salvar modelo"}
            </button>
            <button style={btnLeve()} onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ---------------- clientes ---------------- */}
      <div style={card}>
        <div style={{ marginBottom: 14 }}>{titulo("fa-users", "#047857", "Modelo de cada cliente", "Também dá para vincular na janela de faturar (\"Usar sempre este modelo para este cliente\")")}</div>
        <div className="mf-linha" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          <input style={{ ...inp, width: 190 }} placeholder="CNPJ/CPF" value={novoVinc.documento} onChange={(e) => setNovoVinc({ ...novoVinc, documento: e.target.value })} />
          <input style={{ ...inp, flex: "1 1 220px" }} placeholder="Nome do cliente (opcional)" value={novoVinc.clienteNome} onChange={(e) => setNovoVinc({ ...novoVinc, clienteNome: e.target.value })} />
          <select style={inp} value={novoVinc.modeloId} onChange={(e) => setNovoVinc({ ...novoVinc, modeloId: e.target.value })}>
            <option value="">Modelo…</option>
            {(dados?.modelos || []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
          <button style={btn("#0369A1")} disabled={!novoVinc.documento || !novoVinc.modeloId}
            onClick={async () => { if (await vincular(novoVinc.documento, novoVinc.modeloId, novoVinc.clienteNome || null)) setNovoVinc({ documento: "", clienteNome: "", modeloId: "" }); }}>
            Vincular
          </button>
        </div>
        {!dados?.vinculos.length ? <div style={{ fontSize: 13.5, color: "#64748b" }}>Nenhum cliente com modelo próprio. Todos usam o padrão.</div> : (
          <div style={{ border: "1px solid var(--border, #edf0f4)", borderRadius: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 560 }}>
            <thead><tr style={{ textAlign: "left", color: "#64748b", background: "var(--portal-bg-secondary, #f8fafc)" }}>
              <th style={{ padding: "10px 12px", fontWeight: 400, fontSize: 12.5 }}>Cliente</th><th style={{ padding: "10px 12px", fontWeight: 400, fontSize: 12.5 }}>CNPJ/CPF</th><th style={{ padding: "10px 12px", fontWeight: 400, fontSize: 12.5 }}>Modelo</th><th />
            </tr></thead>
            <tbody>
              {dados.vinculos.map((v) => (
                <tr key={v.documento} style={{ borderTop: "1px solid var(--border, #f1f5f9)" }}>
                  <td style={{ padding: "8px 12px" }}>{v.clienteNome || "—"}</td>
                  <td style={{ padding: "8px 12px", color: "#475569", whiteSpace: "nowrap" }}>{fmtDoc(v.documento)}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <select style={{ ...inp, height: 34, fontSize: 13.5 }} value={v.modeloId} onChange={(e) => vincular(v.documento, e.target.value, v.clienteNome)}>
                      {(dados.modelos || []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                      {!dados.modelos.some((m) => m.id === v.modeloId) && <option value={v.modeloId}>{nomeModelo(v.modeloId)}</option>}
                    </select>
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>
                    <button style={{ ...btnLeve("#b91c1c"), height: 32 }} onClick={() => { if (confirm("Tirar o modelo deste cliente? Ele volta a usar o padrão.")) void vincular(v.documento, null, null); }}>Tirar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
