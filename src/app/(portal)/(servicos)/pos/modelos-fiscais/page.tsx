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
  const { pode, loading } = usePermissoes(userProfile?.id);
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
  if (!pode("pos", "modelos_fiscais")) return <SemPermissao />;

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

  const card: React.CSSProperties = { background: "var(--surface, #fff)", border: "1px solid var(--portal-border, #e2e8f0)", borderRadius: 6, padding: 14 };
  const btn = (cor: string): React.CSSProperties => ({ padding: "7px 12px", borderRadius: 4, border: "none", background: cor, color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: "pointer" });
  const inp: React.CSSProperties = { padding: "7px 9px", borderRadius: 4, border: "1px solid #cbd5e1", fontSize: 13, background: "#fff", color: "#1e293b", boxSizing: "border-box" };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "18px 16px 60px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Modelos fiscais da NFS-e</h1>
        <div style={{ fontSize: 13, color: "var(--portal-text-muted, #64748b)", marginTop: 4 }}>
          Impostos e códigos aplicados nos itens de serviço da OS na hora de faturar. Campo vazio = vale o cadastro do serviço na Omie.
          O cliente usa o modelo vinculado a ele; sem vínculo, o modelo marcado como <strong>padrão</strong>.
        </div>
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
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 800, flex: 1 }}>Modelos</div>
          <button style={btn("#0369A1")} onClick={() => setEditando({ id: null, nome: "", descricao: "", padrao: !dados?.modelos.length, valores: {} })}>+ Novo modelo</button>
        </div>
        {!dados?.modelos.length && <div style={{ fontSize: 13, color: "#64748b" }}>Nenhum modelo ainda. Comece pelo &quot;Padrão&quot; (ex.: CST 000 para o NBS dos serviços) e depois os especiais, como &quot;Prefeitura&quot;.</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
          {(dados?.modelos || []).map((m) => {
            const preenchidos = CAMPOS_FISCAIS.filter((c) => m.campos[c.chave] !== undefined);
            const clientes = dados?.vinculos.filter((v) => v.modeloId === m.id).length || 0;
            return (
              <div key={m.id} style={{ border: "1px solid var(--portal-border, #e2e8f0)", borderLeft: `4px solid ${m.padrao ? "#0369A1" : "#94a3b8"}`, borderRadius: 4, padding: 10, fontSize: 12.5 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{m.nome}{m.padrao && <span style={{ fontSize: 11, color: "#0369A1" }}> · padrão</span>}</div>
                {m.descricao && <div style={{ color: "#64748b", marginTop: 2 }}>{m.descricao}</div>}
                <div style={{ marginTop: 6, color: "#475569" }}>
                  {preenchidos.length ? preenchidos.slice(0, 6).map((c) => `${c.rotulo}: ${mostrarValor(c.chave, m.campos[c.chave])}`).join(" · ") : "Sem campos (usa tudo do cadastro da Omie)"}
                  {preenchidos.length > 6 && ` · +${preenchidos.length - 6}`}
                </div>
                <div style={{ marginTop: 6, color: "#64748b" }}>{clientes} cliente(s) vinculado(s){m.atualizadoPor ? ` · por ${m.atualizadoPor}` : ""}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button style={btn("#334155")} onClick={() => setEditando({ id: m.id, nome: m.nome, descricao: m.descricao || "", padrao: m.padrao, valores: paraTela(m.campos) })}>Editar</button>
                  <button style={{ ...btn("#f1f5f9"), color: "#b91c1c" }} onClick={() => desativar(m)}>Desativar</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------------- editor ---------------- */}
      {editando && (
        <div id="editor-modelo" style={{ ...card, borderColor: "#0369A1", scrollMarginTop: 90 }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>{editando.id ? `Editar "${editando.nome}"` : "Novo modelo"}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
            <input style={{ ...inp, flex: "1 1 220px" }} placeholder="Nome (ex.: Prefeitura)" value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} />
            <input style={{ ...inp, flex: "2 1 320px" }} placeholder="Quando usar (opcional)" value={editando.descricao} onChange={(e) => setEditando({ ...editando, descricao: e.target.value })} />
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" checked={editando.padrao} onChange={(e) => setEditando({ ...editando, padrao: e.target.checked })} /> Padrão (cliente sem modelo)
            </label>
          </div>
          <CamposFiscaisEditor valores={editando.valores} onChange={(v) => setEditando({ ...editando, valores: v })} abertoInicial />
          {validacao.erros.length > 0 && <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 12.5 }}>{validacao.erros.join(" ")}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button style={btn(validacao.erros.length || !editando.nome.trim() ? "#94a3b8" : "#0369A1")} disabled={salvando || !!validacao.erros.length || !editando.nome.trim()} onClick={salvar}>
              {salvando ? "Salvando…" : "Salvar modelo"}
            </button>
            <button style={{ ...btn("#f1f5f9"), color: "#334155" }} onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ---------------- clientes ---------------- */}
      <div style={card}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>Modelo de cada cliente</div>
        <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 10 }}>Também dá para vincular direto na janela de faturar (&quot;Usar sempre este modelo para este cliente&quot;).</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
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
        {!dados?.vinculos.length ? <div style={{ fontSize: 13, color: "#64748b" }}>Nenhum cliente com modelo próprio — todos usam o padrão.</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr style={{ textAlign: "left", color: "#64748b" }}><th style={{ padding: 6 }}>Cliente</th><th style={{ padding: 6 }}>CNPJ/CPF</th><th style={{ padding: 6 }}>Modelo</th><th /></tr></thead>
            <tbody>
              {dados.vinculos.map((v) => (
                <tr key={v.documento} style={{ borderTop: "1px solid var(--portal-border, #e2e8f0)" }}>
                  <td style={{ padding: 6 }}>{v.clienteNome || "—"}</td>
                  <td style={{ padding: 6 }}>{fmtDoc(v.documento)}</td>
                  <td style={{ padding: 6 }}>
                    <select style={{ ...inp, padding: "4px 6px", fontSize: 12.5 }} value={v.modeloId} onChange={(e) => vincular(v.documento, e.target.value, v.clienteNome)}>
                      {(dados.modelos || []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                      {!dados.modelos.some((m) => m.id === v.modeloId) && <option value={v.modeloId}>{nomeModelo(v.modeloId)}</option>}
                    </select>
                  </td>
                  <td style={{ padding: 6, textAlign: "right" }}>
                    <button style={{ ...btn("#f1f5f9"), color: "#b91c1c", padding: "4px 8px" }} onClick={() => { if (confirm("Tirar o modelo deste cliente? Ele volta a usar o padrão.")) void vincular(v.documento, null, null); }}>Tirar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
