"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import TimelineRegistros from "@/components/feedbacks/TimelineRegistros";
import ModalPerfilCliente from "@/components/feedbacks/ModalPerfilCliente";
import ModalFeedback from "@/components/feedbacks/ModalFeedback";
import { listarClientesInfo, listarRegistros } from "@/lib/feedbacks/api";
import { clienteKey, TAGS_CLIENTE, TAG_NAO_CONTATAR } from "@/lib/feedbacks/types";
import type { ClienteInfo, FeedbackRegistro } from "@/lib/feedbacks/types";

interface ClienteAgregado {
  key: string;
  nome: string;
  codigoOmie: string | null;
  telefone: string | null;
  totalRegistros: number;
  totalCrm: number;
  totalRfm: number;
  notaMedia: number | null;
  ultimaData: string;
  registros: FeedbackRegistro[];
}

function agregar(registros: FeedbackRegistro[]): ClienteAgregado[] {
  const map = new Map<string, ClienteAgregado>();
  for (const r of registros) {
    const k = clienteKey(r.codigo_omie, r.nome);
    let agg = map.get(k);
    if (!agg) {
      agg = {
        key: k,
        nome: r.nome,
        codigoOmie: r.codigo_omie,
        telefone: r.telefone,
        totalRegistros: 0,
        totalCrm: 0,
        totalRfm: 0,
        notaMedia: null,
        ultimaData: "",
        registros: [],
      };
      map.set(k, agg);
    }
    agg.registros.push(r);
    agg.totalRegistros++;
    if (r.tipo === "crm") agg.totalCrm++; else agg.totalRfm++;
    if (!agg.telefone && r.telefone) agg.telefone = r.telefone;
    if (!agg.codigoOmie && r.codigo_omie) agg.codigoOmie = r.codigo_omie;
    const dRef = r.data_contato || r.data_servico || r.ultimo_servico || r.criado_em;
    if (dRef > agg.ultimaData) agg.ultimaData = dRef;
  }
  // Calcular nota média
  for (const agg of map.values()) {
    const notas = agg.registros.map((r) => r.nota).filter((n): n is number => n !== null && n !== undefined);
    agg.notaMedia = notas.length ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10 : null;
  }
  return Array.from(map.values()).sort((a, b) => b.ultimaData.localeCompare(a.ultimaData));
}

type Ordem = "recente" | "atendidos" | "nome" | "melhor_nota" | "pior_nota";
const ORDENS: { v: Ordem; label: string }[] = [
  { v: "recente", label: "Mais recente" },
  { v: "atendidos", label: "Mais atendidos" },
  { v: "nome", label: "Nome (A–Z)" },
  { v: "melhor_nota", label: "Melhor nota" },
  { v: "pior_nota", label: "Pior nota" },
];
function ordenar(lista: ClienteAgregado[], ordem: Ordem): ClienteAgregado[] {
  const arr = [...lista];
  switch (ordem) {
    case "atendidos":
      return arr.sort((a, b) => b.totalRegistros - a.totalRegistros || a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
    case "nome":
      return arr.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
    case "melhor_nota":
      return arr.sort((a, b) => (b.notaMedia ?? -1) - (a.notaMedia ?? -1) || b.ultimaData.localeCompare(a.ultimaData));
    case "pior_nota":
      return arr.sort((a, b) => (a.notaMedia ?? 99) - (b.notaMedia ?? 99) || b.ultimaData.localeCompare(a.ultimaData));
    case "recente":
    default:
      return arr.sort((a, b) => b.ultimaData.localeCompare(a.ultimaData));
  }
}

function StatusBolinha({ nota }: { nota: number | null }) {
  let cor = "#a3a3a3";
  if (nota !== null) {
    if (nota >= 8) cor = "#10b981";
    else if (nota >= 5) cor = "#f59e0b";
    else cor = "#dc2626";
  }
  return <div style={{ width: 8, height: 8, borderRadius: 4, background: cor, flexShrink: 0 }} />;
}

// Pílula de tag — cor da lista padrão; tags criadas usam cor neutra.
function TagPill({ tag }: { tag: string }) {
  const def = TAGS_CLIENTE.find((x) => x.tag === tag);
  const cor = def?.cor || (tag === TAG_NAO_CONTATAR ? "#991b1b" : "#475569");
  const label = def?.label || (tag === TAG_NAO_CONTATAR ? "Não contatar" : tag);
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
      background: `${cor}1a`, color: cor, border: `1px solid ${cor}55`,
    }}>
      {tag === TAG_NAO_CONTATAR ? "💀 " : ""}{label}
    </span>
  );
}

export default function ClientesPage() {
  const [registros, setRegistros] = useState<FeedbackRegistro[]>([]);
  const [info, setInfo] = useState<ClienteInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("recente");
  const [selecionadaKey, setSelecionadaKey] = useState<string | null>(null);

  const [modalPerfilAberto, setModalPerfilAberto] = useState(false);
  const [registroEdit, setRegistroEdit] = useState<FeedbackRegistro | null>(null);
  const [modalRegistroAberto, setModalRegistroAberto] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const [r, i] = await Promise.all([
        Promise.all([listarRegistros("crm"), listarRegistros("rfm")]).then((arr) => arr.flat()),
        listarClientesInfo(),
      ]);
      setRegistros(r);
      setInfo(i);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const agregados = useMemo(() => agregar(registros), [registros]);

  const infoPorKey = useMemo(() => {
    const m = new Map<string, ClienteInfo>();
    for (const i of info) m.set(i.cliente_key, i);
    return m;
  }, [info]);

  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    const base = q
      ? agregados.filter((c) => c.nome.toLowerCase().includes(q) || (c.codigoOmie || "").includes(q))
      : agregados;
    return ordenar(base, ordem);
  }, [agregados, filtro, ordem]);

  const selecionada = selecionadaKey ? agregados.find((c) => c.key === selecionadaKey) : null;
  const infoSelecionada = selecionadaKey ? infoPorKey.get(selecionadaKey) : null;

  function handlePerfilSalvo(salvo: ClienteInfo) {
    setInfo((prev) => {
      const idx = prev.findIndex((i) => i.cliente_key === salvo.cliente_key);
      if (idx === -1) return [salvo, ...prev];
      const novo = [...prev]; novo[idx] = salvo; return novo;
    });
  }
  function handleRegistroSalvo(salvo: FeedbackRegistro) {
    setRegistros((prev) => {
      const idx = prev.findIndex((r) => r.id === salvo.id);
      if (idx === -1) return [salvo, ...prev];
      const novo = [...prev]; novo[idx] = salvo; return novo;
    });
  }

  return (
    <div style={{ paddingTop: 20, fontFamily: "Inter, sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--portal-text)", margin: 0, marginBottom: 14 }}>
        📋 Histórico de atendimentos
      </h1>

      {erro && <div style={erroStyle}>Erro: {erro}</div>}

      {loading ? (
        <div style={vazioStyle}>Carregando…</div>
      ) : (
        <div style={layoutStyle}>
          {/* Sidebar — lista de clientes */}
          <aside style={sidebarStyle}>
            <input
              type="text"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="🔍 Buscar cliente…"
              style={inputBuscaStyle}
            />
            <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} style={selectOrdemStyle}>
              {ORDENS.map((o) => (
                <option key={o.v} value={o.v}>Ordenar: {o.label}</option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: "var(--portal-text-muted)", padding: "6px 4px", marginBottom: 4 }}>
              {filtrados.length} de {agregados.length} clientes
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", flex: 1, paddingRight: 4 }}>
              {filtrados.map((c) => {
                const ativa = selecionadaKey === c.key;
                return (
                  <button
                    key={c.key}
                    onClick={() => setSelecionadaKey(c.key)}
                    style={{
                      ...clienteItemStyle,
                      background: ativa ? "#fef2f2" : "transparent",
                      borderLeft: ativa ? "3px solid #dc2626" : "3px solid transparent",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <StatusBolinha nota={c.notaMedia} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--portal-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.nome}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--portal-text-muted)", paddingLeft: 16 }}>
                      {c.totalCrm}🔴 · {c.totalRfm}🟣
                      {c.notaMedia !== null && ` · ★ ${c.notaMedia}`}
                      {c.codigoOmie && ` · #${c.codigoOmie}`}
                    </div>
                  </button>
                );
              })}
              {filtrados.length === 0 && (
                <div style={{ padding: 16, textAlign: "center", color: "var(--portal-text-muted)", fontSize: 12 }}>
                  Nenhum cliente encontrado.
                </div>
              )}
            </div>
          </aside>

          {/* Conteúdo — perfil do selecionado */}
          <main style={mainStyle}>
            {!selecionada ? (
              <div style={{ padding: 60, textAlign: "center", color: "var(--portal-text-muted)", fontSize: 14, fontStyle: "italic" }}>
                Selecione um cliente à esquerda para ver perfil e histórico.
              </div>
            ) : (
              <>
                {/* Header do perfil */}
                <div style={perfilHeaderStyle}>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--portal-text)", margin: 0, marginBottom: 4 }}>
                      {selecionada.nome}
                    </h2>
                    <div style={{ fontSize: 12, color: "var(--portal-text-secondary)", display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {selecionada.telefone && <span>📞 {selecionada.telefone}</span>}
                      {selecionada.codigoOmie && <span>Omie #{selecionada.codigoOmie}</span>}
                      {infoSelecionada?.cidade && <span>📍 {infoSelecionada.cidade}</span>}
                      {infoSelecionada?.email && <span>✉ {infoSelecionada.email}</span>}
                    </div>
                    {infoSelecionada && infoSelecionada.tags.length > 0 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                        {infoSelecionada.tags.map((t) => <TagPill key={t} tag={t} />)}
                      </div>
                    )}
                  </div>
                  <button onClick={() => setModalPerfilAberto(true)} style={btnPrimario}>
                    ✎ Editar perfil
                  </button>
                </div>

                {/* Estatísticas rápidas */}
                <div style={statsGrid}>
                  <Stat icon="📊" label="Total" value={String(selecionada.totalRegistros)} />
                  <Stat icon="🔴" label="CRM" value={String(selecionada.totalCrm)} />
                  <Stat icon="🟣" label="RFM" value={String(selecionada.totalRfm)} />
                  <Stat icon="★" label="Nota média" value={selecionada.notaMedia !== null ? String(selecionada.notaMedia) : "—"} />
                </div>

                {/* Equipamentos do cliente — pasta (equipamentos) + os preenchidos nos atendimentos */}
                {(() => {
                  const norm = (s: string) => s.trim().toUpperCase();
                  const lista = Array.from(new Map(
                    [...(infoSelecionada?.equipamentos || []), ...selecionada.registros.map((r) => r.trator || "")]
                      .map((e) => (e || "").trim()).filter(Boolean)
                      .map((e) => [norm(e), e] as [string, string])
                  ).values());
                  if (lista.length === 0) return null;
                  return (
                    <div style={{ marginBottom: 20 }}>
                      <SecaoTitulo>🚜 Equipamentos ({lista.length})</SecaoTitulo>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                        {lista.map((e) => (
                          <span key={e} style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 8, background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }}>
                            🚜 {e}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Funcionários + Fazendas */}
                {infoSelecionada && (infoSelecionada.funcionarios.length > 0 || infoSelecionada.fazendas.length > 0) && (
                  <div style={infoExtraStyle}>
                    {infoSelecionada.funcionarios.length > 0 && (
                      <div>
                        <SecaoTitulo>👥 Funcionários ({infoSelecionada.funcionarios.length})</SecaoTitulo>
                        <ul style={listaSimplesStyle}>
                          {infoSelecionada.funcionarios.map((f, i) => (
                            <li key={i}>
                              <strong>{f.nome}</strong>
                              {f.cargo && ` · ${f.cargo}`}
                              {f.telefone && ` · 📞 ${f.telefone}`}
                              {f.fazenda && ` · 🌾 ${f.fazenda}`}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {infoSelecionada.fazendas.length > 0 && (
                      <div>
                        <SecaoTitulo>🌾 Fazendas ({infoSelecionada.fazendas.length})</SecaoTitulo>
                        {infoSelecionada.fazendas.map((fz, i) => (
                          <div key={i} style={fazendaItemStyle}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--portal-text)" }}>
                              {fz.nome} {fz.cidade && <span style={{ fontWeight: 400, color: "var(--portal-text-secondary)" }}>· {fz.cidade}</span>}
                            </div>
                            {fz.tratores.length > 0 && (
                              <ul style={{ ...listaSimplesStyle, marginTop: 4 }}>
                                {fz.tratores.map((t, ti) => <li key={ti}>🚜 {t}</li>)}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Timeline */}
                <div style={{ marginTop: 24 }}>
                  <SecaoTitulo>📅 Histórico</SecaoTitulo>
                  <div style={{ marginTop: 12 }}>
                    <TimelineRegistros
                      registros={selecionada.registros}
                      onEditar={(r) => { setRegistroEdit(r); setModalRegistroAberto(true); }}
                    />
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      )}

      {selecionada && (
        <ModalPerfilCliente
          aberto={modalPerfilAberto}
          nome={selecionada.nome}
          codigoOmie={selecionada.codigoOmie}
          info={infoSelecionada}
          onFechar={() => setModalPerfilAberto(false)}
          onSalvo={handlePerfilSalvo}
        />
      )}

      {registroEdit && (
        <ModalFeedback
          tipo={registroEdit.tipo}
          aberto={modalRegistroAberto}
          registro={registroEdit}
          onFechar={() => setModalRegistroAberto(false)}
          onSalvo={handleRegistroSalvo}
        />
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ background: "var(--portal-bg-card)", border: "1px solid var(--portal-border)", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--portal-text-muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--portal-text)" }}>{value}</div>
    </div>
  );
}

function SecaoTitulo({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 800, color: "var(--portal-text)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
      {children}
    </div>
  );
}

const layoutStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "320px 1fr",
  gap: 16,
  height: "calc(100vh - 220px)",
  minHeight: 500,
};
const sidebarStyle: React.CSSProperties = {
  background: "var(--portal-bg-card)",
  border: "1px solid var(--portal-border)",
  borderRadius: 12,
  padding: 12,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};
const mainStyle: React.CSSProperties = {
  background: "var(--portal-bg-card)",
  border: "1px solid var(--portal-border)",
  borderRadius: 12,
  padding: 24,
  overflowY: "auto",
};
const inputBuscaStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", marginBottom: 8,
  border: "1.5px solid var(--portal-border)", borderRadius: 10,
  fontSize: 13, background: "var(--portal-bg-card)", color: "var(--portal-text)",
  fontFamily: "Inter, sans-serif", outline: "none",
};
const selectOrdemStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", marginBottom: 4,
  border: "1.5px solid var(--portal-border)", borderRadius: 10,
  fontSize: 12, fontWeight: 600, background: "var(--portal-bg-card)", color: "var(--portal-text-secondary)",
  fontFamily: "Inter, sans-serif", outline: "none", cursor: "pointer",
};
const clienteItemStyle: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left",
  padding: "10px 12px", background: "transparent",
  border: "none", borderRadius: 8, cursor: "pointer",
  fontFamily: "Inter, sans-serif",
};
const perfilHeaderStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  gap: 16, marginBottom: 20, paddingBottom: 14,
  borderBottom: "1px solid var(--portal-border)",
};
const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 10, marginBottom: 20,
};
const infoExtraStyle: React.CSSProperties = {
  background: "#fafafa", border: "1px solid var(--portal-border)",
  borderRadius: 10, padding: 14, marginBottom: 4,
  display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14,
};
const listaSimplesStyle: React.CSSProperties = {
  margin: 0, paddingLeft: 18, fontSize: 12,
  color: "var(--portal-text-secondary)", lineHeight: 1.7,
};
const fazendaItemStyle: React.CSSProperties = {
  background: "#fff", border: "1px solid var(--portal-border)",
  borderRadius: 8, padding: "8px 12px", marginBottom: 6,
};
const btnPrimario: React.CSSProperties = {
  padding: "9px 18px", background: "linear-gradient(135deg, #dc2626, #b91c1c)",
  color: "#fff", border: "none", borderRadius: 10,
  fontSize: 13, fontWeight: 700, cursor: "pointer",
  boxShadow: "0 2px 8px rgba(185,28,28,0.25)", fontFamily: "Inter, sans-serif",
};
const vazioStyle: React.CSSProperties = {
  padding: 60, textAlign: "center", color: "var(--portal-text-muted)",
  fontSize: 14, fontStyle: "italic",
};
const erroStyle: React.CSSProperties = {
  marginBottom: 12, padding: "10px 14px",
  background: "#fee2e2", color: "#991b1b", borderRadius: 10, fontSize: 13,
};
