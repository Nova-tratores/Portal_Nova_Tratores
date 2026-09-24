"use client";

// Botão "Projetos" do header do POS: busca de tratores com filtros COMBINÁVEIS
// (modelo + cliente + final do chassis) e, clicando num resultado, um modal com
// a ficha resumida do projeto (dono, números, últimas OSs/PVs e notas).
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { authHeaders } from "@/lib/auth/client";

interface ProjetoRow {
  chassis: string;
  modelo: string;
  projeto: string;
  empresa: string;
  cliente: string;
  cnpj: string;
  codCli: number | null;
}

const din = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (d: string | null | undefined) => {
  const s = String(d || "").slice(0, 10);
  return s.includes("-") ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : (s || "—");
};

export default function ProjetosBusca() {
  const [aberto, setAberto] = useState(false);
  const [fModelo, setFModelo] = useState("");
  const [fCliente, setFCliente] = useState("");
  const [fChassi, setFChassi] = useState("");
  const [resultados, setResultados] = useState<ProjetoRow[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ficha do projeto clicado
  const [sel, setSel] = useState<ProjetoRow | null>(null);
  const [ficha, setFicha] = useState<any>(null);
  const [fichaCarregando, setFichaCarregando] = useState(false);

  const buscar = async (m: string, c: string, ch: string) => {
    if (!m.trim() && !c.trim() && !ch.trim()) { setResultados(null); return; }
    setBuscando(true); setErro("");
    try {
      const p = new URLSearchParams();
      if (m.trim()) p.set("modelo", m.trim());
      if (c.trim()) p.set("cliente", c.trim());
      if (ch.trim()) p.set("chassi", ch.trim());
      const r = await fetch(`/api/pos/projetos?${p}`, { headers: await authHeaders(), cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setResultados(j.projetos || []);
    } catch (e) { setErro(e instanceof Error ? e.message : "falha na busca"); }
    setBuscando(false);
  };

  // Busca AO DIGITAR em qualquer um dos 3 campos (combinados por E)
  const aoDigitar = (campo: "modelo" | "cliente" | "chassi", v: string) => {
    const m = campo === "modelo" ? v : fModelo;
    const c = campo === "cliente" ? v : fCliente;
    const ch = campo === "chassi" ? v : fChassi;
    if (campo === "modelo") setFModelo(v);
    if (campo === "cliente") setFCliente(v);
    if (campo === "chassi") setFChassi(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => buscar(m, c, ch), 400);
  };

  const abrirFicha = async (row: ProjetoRow) => {
    setSel(row); setFicha(null);
    if (!row.projeto) return;
    setFichaCarregando(true);
    try {
      const r = await fetch(`/api/clientes/projeto?nome=${encodeURIComponent(row.projeto)}&empresa=${encodeURIComponent(row.empresa || "Nova Tratores")}`, { cache: "no-store" });
      const j = await r.json();
      if (r.ok && !j.error) setFicha(j);
    } catch { /* ficha resumida fica só com o que veio da busca */ }
    setFichaCarregando(false);
  };

  const fecharTudo = () => { setAberto(false); setSel(null); setFicha(null); };
  const inputEstilo = { width: "100%", boxSizing: "border-box" as const, fontSize: 13.5, padding: "9px 12px", border: "1px solid var(--border, #CBD5E1)", borderRadius: 9 };
  const rotulo = { fontSize: 10.5, fontWeight: 700 as const, textTransform: "uppercase" as const, letterSpacing: 0.4, color: "#94A3B8", marginBottom: 3 };

  const dono = ficha?.donos?.[0] || null;

  return (
    <div style={{ marginRight: "auto" }}>
      <button onClick={() => setAberto(true)} title="Buscar tratores por modelo, cliente e final do chassis"
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 10, border: "1.5px solid var(--border, #E4D9C8)", background: "#fff", cursor: "pointer", color: "#111827", fontWeight: 700, fontSize: 13 }}>
        <i className="fas fa-tractor" style={{ color: "#0369A1" }} /> Projetos
      </button>

      {aberto && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 100003, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={fecharTudo}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--surface, #fff)", border: "1px solid var(--border, #E2E8F0)", borderRadius: 16, width: sel ? 640 : 560, maxWidth: "94vw", maxHeight: "84vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.45)" }}>
            <div style={{ padding: "13px 18px", borderBottom: "1px solid var(--border, #E2E8F0)", display: "flex", alignItems: "center", gap: 10 }}>
              {sel && (
                <button onClick={() => { setSel(null); setFicha(null); }} title="Voltar pra busca"
                  style={{ border: "none", background: "transparent", color: "#0369A1", cursor: "pointer", fontSize: 15 }}>
                  <i className="fas fa-arrow-left" />
                </button>
              )}
              <i className="fas fa-tractor" style={{ color: "#0369A1" }} />
              <b style={{ fontSize: 14.5, color: "var(--texto, #0f172a)", flex: 1 }}>
                {sel ? `${sel.modelo || "Trator"} — ${sel.chassis}` : "Buscar projetos (tratores)"}
              </b>
              <button onClick={fecharTudo} style={{ border: "none", background: "transparent", color: "#94A3B8", cursor: "pointer", fontSize: 17 }}>×</button>
            </div>

            {!sel ? (
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={rotulo}>Modelo</div>
                    <input value={fModelo} onChange={(e) => aoDigitar("modelo", e.target.value)} placeholder="ex.: 6060" autoFocus style={inputEstilo} />
                  </div>
                  <div>
                    <div style={rotulo}>Cliente</div>
                    <input value={fCliente} onChange={(e) => aoDigitar("cliente", e.target.value)} placeholder="nome ou CNPJ" style={inputEstilo} />
                  </div>
                  <div>
                    <div style={rotulo}>Final do chassis</div>
                    <input value={fChassi} onChange={(e) => aoDigitar("chassi", e.target.value)} placeholder="ex.: 0743" style={inputEstilo} />
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: "#94A3B8" }}>
                  Dá pra combinar os filtros: modelo + cliente, cliente + final do chassis… Vai aparecendo conforme você digita. Clica num trator pra abrir a ficha dele.
                </div>
                {erro && <div style={{ color: "#B91C1C", fontWeight: 600, fontSize: 12.5 }}>{erro}</div>}
                {buscando && <div style={{ color: "#0369A1", fontWeight: 600, fontSize: 13 }}><i className="fas fa-spinner fa-spin" /> Buscando…</div>}
                {resultados && !buscando && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {resultados.length === 0 && <div style={{ color: "#94A3B8", fontSize: 13, textAlign: "center", padding: 10 }}>Nenhum trator encontrado com esses filtros.</div>}
                    {resultados.map((r) => (
                      <button key={`${r.chassis}|${r.empresa}`} onClick={() => abrirFicha(r)}
                        style={{ textAlign: "left", display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--border, #E2E8F0)", borderRadius: 10, padding: "9px 12px", background: "transparent", cursor: "pointer" }}>
                        <i className="fas fa-tractor" style={{ color: "#0369A1", fontSize: 15 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, color: "var(--texto, #1e293b)", fontSize: 13.5 }}>
                            {r.modelo || "Modelo?"} <span style={{ fontWeight: 600, color: "#64748B", fontFamily: "monospace", fontSize: 12.5 }}>{r.chassis}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.cliente || "sem cliente"}{r.projeto ? ` · projeto ${r.projeto}` : ""}{r.empresa ? ` · ${r.empresa}` : ""}
                          </div>
                        </div>
                        <i className="fas fa-chevron-right" style={{ color: "#CBD5E1", fontSize: 11 }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", fontSize: 13 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {sel.projeto && <span style={{ background: "rgba(56,189,248,0.15)", border: "1px solid #7DD3FC", color: "#075985", borderRadius: 7, padding: "3px 9px", fontSize: 11.5, fontWeight: 700 }}>Projeto {sel.projeto}</span>}
                  {sel.empresa && <span style={{ background: "var(--surface-2, #F8FAFC)", border: "1px solid var(--border, #E2E8F0)", color: "#64748B", borderRadius: 7, padding: "3px 9px", fontSize: 11.5, fontWeight: 700 }}>{sel.empresa}</span>}
                </div>

                <div style={{ border: "1px solid var(--border, #E2E8F0)", borderRadius: 10, padding: "9px 12px" }}>
                  <div style={rotulo}>Cliente (dono atual)</div>
                  <div style={{ fontWeight: 800, color: "var(--texto, #1e293b)" }}>{dono?.nome || sel.cliente || "—"}</div>
                  <div style={{ fontSize: 12, color: "#64748B" }}>
                    {[dono?.cnpj_cpf || sel.cnpj, dono ? [dono.cidade, dono.estado].filter(Boolean).join("/") : "", dono?.telefone].filter(Boolean).join(" · ") || "sem mais dados"}
                  </div>
                </div>

                {fichaCarregando && <div style={{ color: "#0369A1", fontWeight: 600 }}><i className="fas fa-spinner fa-spin" /> Buscando OSs, peças e notas do projeto…</div>}

                {ficha && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                      {[
                        { label: "OSs", valor: String(ficha.resumo?.total_os ?? 0) },
                        { label: "Faturadas", valor: String(ficha.resumo?.os_faturadas ?? 0) },
                        { label: "Serviços", valor: din(ficha.resumo?.valor_total_os) },
                        { label: "PVs", valor: String(ficha.resumo?.total_pv ?? 0) },
                        { label: "Peças", valor: din(ficha.resumo?.valor_total_pv) },
                      ].map((t) => (
                        <div key={t.label} style={{ background: "var(--surface-2, #F8FAFC)", border: "1px solid var(--border, #E2E8F0)", borderRadius: 9, padding: "7px 9px" }}>
                          <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>{t.label}</div>
                          <div style={{ fontWeight: 800, color: "var(--texto, #1e293b)", fontSize: 12.5, whiteSpace: "nowrap" }}>{t.valor}</div>
                        </div>
                      ))}
                    </div>

                    {(ficha.ordens?.length ?? 0) > 0 && (
                      <div>
                        <div style={rotulo}>Últimas ordens de serviço</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {ficha.ordens.slice(0, 8).map((os: any) => (
                            <div key={`${os.num_os}-${os.empresa}`} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--border, #E2E8F0)", borderRadius: 8, padding: "6px 10px", fontSize: 12.5 }}>
                              <b style={{ color: "#0369A1" }}>OS {os.num_os}</b>
                              <span style={{ color: "#64748B" }}>{dataBR(os.data_previsao || os.data_inclusao)}</span>
                              <span style={{ flex: 1, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{os.cliente_nome || ""}</span>
                              {os.cancelada ? <span style={{ color: "#B91C1C", fontWeight: 700, fontSize: 11 }}>cancelada</span>
                                : os.faturada ? <span style={{ color: "#15803D", fontWeight: 700, fontSize: 11 }}>faturada</span>
                                : <span style={{ color: "#B45309", fontWeight: 700, fontSize: 11 }}>{os.status || "aberta"}</span>}
                              <b style={{ color: "var(--texto, #1e293b)" }}>{din(os.valor_total)}</b>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(ficha.pedidos_venda?.length ?? 0) > 0 && (
                      <div>
                        <div style={rotulo}>Últimos pedidos de venda (peças)</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {ficha.pedidos_venda.slice(0, 5).map((pv: any) => (
                            <div key={`${pv.num_pedido}-${pv.empresa}`} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--border, #E2E8F0)", borderRadius: 8, padding: "6px 10px", fontSize: 12.5 }}>
                              <b style={{ color: "#C2410C" }}>PV {pv.num_pedido}</b>
                              <span style={{ color: "#64748B" }}>{dataBR(pv.data_previsao || pv.data_inclusao)}</span>
                              <span style={{ flex: 1, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pv.cliente_nome || ""}</span>
                              <b style={{ color: "var(--texto, #1e293b)" }}>{din(pv.valor_total)}</b>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(ficha.notas_fiscais?.length ?? 0) > 0 && (
                      <div>
                        <div style={rotulo}>Notas fiscais ({ficha.notas_fiscais.length})</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {ficha.notas_fiscais.slice(0, 4).map((nf: any, i: number) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, border: "1px solid var(--border, #E2E8F0)", borderRadius: 8, padding: "6px 10px" }}>
                              <b style={{ color: "#0369A1" }}>{nf.tipo} {nf.numero}</b>
                              <span style={{ flex: 1, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nf.origem}</span>
                              <b>{din(nf.valor)}</b>
                              {nf.link && <a href={nf.link} target="_blank" rel="noreferrer" style={{ color: "#0369A1", fontWeight: 700 }}><i className="fas fa-external-link-alt" /></a>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {!fichaCarregando && !ficha && sel.projeto && (
                  <div style={{ color: "#94A3B8", fontSize: 12.5 }}>Não consegui carregar a ficha completa agora — os dados acima vieram da busca.</div>
                )}
                {!sel.projeto && <div style={{ color: "#94A3B8", fontSize: 12.5 }}>Este chassis não tem projeto vinculado — sem histórico pra mostrar.</div>}

                <div style={{ display: "flex", gap: 8 }}>
                  {sel.projeto && (
                    <a href={`/clientes/projeto?nome=${encodeURIComponent(sel.projeto)}&empresa=${encodeURIComponent(sel.empresa || "Nova Tratores")}`} target="_blank" rel="noreferrer"
                      style={{ flex: 1, textAlign: "center", background: "linear-gradient(135deg, #38BDF8, #0369A1)", color: "#111111", borderRadius: 9, padding: "9px 12px", fontWeight: 800, fontSize: 12.5, textDecoration: "none" }}>
                      <i className="fas fa-folder-open" style={{ marginRight: 6 }} />Ver ficha completa do projeto
                    </a>
                  )}
                  {(dono?.cod_cli || sel.codCli) && (
                    <a href={`/clientes?cod=${dono?.cod_cli || sel.codCli}&doc=${encodeURIComponent(dono?.cnpj_cpf || sel.cnpj || "")}`} target="_blank" rel="noreferrer"
                      style={{ flex: 1, textAlign: "center", border: "1.5px solid #0369A1", color: "#0369A1", borderRadius: 9, padding: "9px 12px", fontWeight: 800, fontSize: 12.5, textDecoration: "none" }}>
                      <i className="fas fa-user" style={{ marginRight: 6 }} />Pasta do cliente
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
