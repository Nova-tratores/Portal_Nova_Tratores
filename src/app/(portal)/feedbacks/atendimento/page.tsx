"use client";
// Fila de atendimento: quem ligar hoje, em ordem. Uma linha por cliente,
// juntando os motivos automáticos (oportunidades) e os atendimentos em aberto.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { authHeaders } from "@/lib/auth/client";
import { iniciarChamadaApi } from "@/lib/feedbacks/atendimento/chamada-client";
import Toast, { type ToastMsg } from "@/components/feedbacks/atendimento/Toast";
import ModalConfirmarCaveira from "@/components/feedbacks/ModalConfirmarCaveira";
import { marcarNaoContatar, reativarContato } from "@/lib/feedbacks/caveira";
import { useAuditLog } from "@/hooks/useAuditLog";
import styles from "@/components/feedbacks/feedbacks.module.css";
import { COR_ATENDIMENTO } from "@/components/feedbacks/atendimento/Cockpit";
import { REGRA_ROTULO, fmtDataBR, haQuanto } from "@/lib/feedbacks/atendimento/rotulos";
import type { LinhaFila } from "@/lib/feedbacks/atendimento/puro";
import type { RegraOportunidade } from "@/lib/feedbacks/types";
import { emojiHumor } from "@/lib/feedbacks/atendimento/retorno";
import { lerAreas, regrasDaFuncao, TODAS_REGRAS, type Areas } from "@/lib/feedbacks/atendimento/areas";

type Chip = "urgentes" | "em_atendimento" | "sem_telefone" | "caveira" | "minha_area";

export default function FilaAtendimentoPage() {
  const router = useRouter();
  const search = useSearchParams();
  const { userProfile } = useAuth();
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [atendendo, setAtendendo] = useState<string | null>(null);
  const { log } = useAuditLog();
  const [modo, setModo] = useState<"cards" | "lista">(() => {
    try { return (localStorage.getItem("fila-modo") as "cards" | "lista") || "cards"; } catch { return "cards"; }
  });
  const trocarModo = (m: "cards" | "lista") => { setModo(m); try { localStorage.setItem("fila-modo", m); } catch { /* sem storage */ } };
  const [caveiraAlvo, setCaveiraAlvo] = useState<LinhaFila | null>(null);
  const [caveiraProcessando, setCaveiraProcessando] = useState(false);
  const [linhas, setLinhas] = useState<LinhaFila[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [chips, setChips] = useState<Set<Chip>>(new Set());
  const [areas, setAreas] = useState<Areas | null>(null);
  // motivos (regras) escolhidos — OR entre eles; vazio = todos. Aceita ?regra=R5_pecas,R8_cadastro
  const [regras, setRegras] = useState<Set<RegraOportunidade>>(() => {
    const q = (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("regra") : null) || "";
    return new Set(q.split(",").filter((r): r is RegraOportunidade => (TODAS_REGRAS as string[]).includes(r)));
  });

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/feedbacks/atendimento/fila", { headers: await authHeaders(), cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.erro || `HTTP ${res.status}`);
      setLinhas(data.linhas as LinhaFila[]);
      setAreas(lerAreas(data.areas));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro ao carregar a fila");
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  // volta do cockpit com o resultado da ligação
  useEffect(() => {
    const ok = search.get("ok");
    if (ok) { setToast({ tipo: "ok", texto: ok }); router.replace("/feedbacks/atendimento"); }
  }, [search, router]);

  const atender = useCallback(async (l: LinhaFila) => {
    setAtendendo(l.cliente_key);
    try {
      await iniciarChamadaApi({ cliente_key: l.cliente_key, telefone: l.telefone });
      router.push(`/feedbacks/atendimento/${encodeURIComponent(l.cliente_key)}`);
    } catch (e) {
      setToast({ tipo: "erro", texto: (e as Error).message });
      setAtendendo(null);
      void carregar();
    }
  }, [router, carregar]);

  // 💀 Não contatar / reativar — mesma regra do CRM (lib caveira.ts)
  const pedirCaveira = (l: LinhaFila) => {
    if (l.caveira) {
      const msg = l.codigo_omie ? `Reativar contato com "${l.nome}"?\n\nRemove "Não contatar" e reativa o cadastro no Omie.` : `Reativar contato com "${l.nome}"?\n\nRemove a marca "Não contatar".`;
      if (!confirm(msg)) return;
      reativarContato({ clienteKey: l.cliente_key, codigoOmie: l.codigo_omie, nome: l.nome, tagsAtuais: l.tags }, log)
        .then(() => { setToast({ tipo: "ok", texto: `${l.nome}: contato reativado.` }); void carregar(); })
        .catch((e) => setToast({ tipo: "erro", texto: (e as Error).message }));
      return;
    }
    setCaveiraAlvo(l);
  };
  const aplicarCaveira = async (inativarOmie: boolean) => {
    if (!caveiraAlvo) return;
    setCaveiraProcessando(true);
    try {
      await marcarNaoContatar({ clienteKey: caveiraAlvo.cliente_key, codigoOmie: caveiraAlvo.codigo_omie, nome: caveiraAlvo.nome, tagsAtuais: caveiraAlvo.tags }, inativarOmie, log);
      setToast({ tipo: "ok", texto: `${caveiraAlvo.nome}: marcado como "Não contatar"${inativarOmie ? " e inativado no Omie" : ""}.` });
      setCaveiraAlvo(null);
      void carregar();
    } catch (e) {
      setToast({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setCaveiraProcessando(false);
    }
  };

  const toggle = (c: Chip) => setChips((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  const minhaArea = useMemo(() => regrasDaFuncao(userProfile?.funcao, areas ?? undefined), [userProfile?.funcao, areas]);
  const toggleRegra = (r: RegraOportunidade) => setRegras((s) => { const n = new Set(s); if (n.has(r)) n.delete(r); else n.add(r); return n; });
  const regrasPresentes = useMemo(() => TODAS_REGRAS.filter((r) => linhas.some((l) => l.regras.includes(r))), [linhas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (!chips.has("caveira") && l.caveira) return false;
      if (regras.size > 0 && !l.regras.some((r) => regras.has(r as RegraOportunidade))) return false;
      if (chips.has("minha_area") && minhaArea && !l.regras.some((r) => minhaArea.regras.includes(r as RegraOportunidade))) return false;
      if (chips.has("urgentes") && l.prioridade !== "Urgente") return false;
      if (chips.has("em_atendimento") && !l.em_atendimento_por) return false;
      if (chips.has("sem_telefone") && l.telefone) return false;
      if (q && !l.nome.toLowerCase().includes(q) && !(l.codigo_omie || "").includes(q)) return false;
      return true;
    });
  }, [linhas, busca, chips, regras, minhaArea]);

  const contagem = (c: Chip) => linhas.filter((l) =>
    c === "urgentes" ? l.prioridade === "Urgente" && !l.caveira :
    c === "em_atendimento" ? !!l.em_atendimento_por :
    c === "sem_telefone" ? !l.telefone && !l.caveira :
    c === "minha_area" ? (!!minhaArea && !l.caveira && l.regras.some((r) => minhaArea.regras.includes(r as RegraOportunidade))) : l.caveira).length;
  const contagemRegra = (r: RegraOportunidade) => linhas.filter((l) => !l.caveira && l.regras.includes(r)).length;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "12px 0" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>📞 Quem ligar hoje</h1>
          <div style={{ fontSize: 12, opacity: 0.65 }}>{carregando ? "montando a fila…" : `${filtradas.length} de ${linhas.length} clientes na fila`}</div>
        </div>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente ou código…"
          style={{ marginLeft: "auto", padding: "8px 12px", borderRadius: 999, border: "1px solid var(--portal-border)", fontSize: 13, minWidth: 260, background: "var(--portal-bg-card)" }}
        />
        <div style={{ display: "inline-flex", border: "1px solid var(--portal-border)", borderRadius: 999, overflow: "hidden" }}>
          <button type="button" onClick={() => trocarModo("cards")} style={{ ...btnChip(modo === "cards" ? COR_ATENDIMENTO : "#64748b", modo === "cards"), border: 0, borderRadius: 0 }}>▤ Cards</button>
          <button type="button" onClick={() => trocarModo("lista")} style={{ ...btnChip(modo === "lista" ? COR_ATENDIMENTO : "#64748b", modo === "lista"), border: 0, borderRadius: 0 }}>☰ Lista</button>
        </div>
        <Link href="/feedbacks/atendimento/contatos" style={{ ...btnChip("#64748b", false), textDecoration: "none" }}>👥 Contatos por cargo</Link>
        <button type="button" onClick={carregar} disabled={carregando} style={btnChip(COR_ATENDIMENTO, false)}>↻</button>
      </header>

      {/* motivo (regra) — OR entre os escolhidos */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, opacity: 0.6, fontWeight: 700 }}>Motivo:</span>
        {minhaArea && (
          <button type="button" onClick={() => toggle("minha_area")} title={`Sua área (${minhaArea.area}): ${minhaArea.regras.map((r) => REGRA_ROTULO[r]?.titulo ?? r).join(", ")}`} style={btnChip(chips.has("minha_area") ? "#16a34a" : "#16a34a", chips.has("minha_area"))}>
            ⭐ Minha área · {minhaArea.area} ({contagem("minha_area")})
          </button>
        )}
        {regrasPresentes.map((r) => {
          const rot = REGRA_ROTULO[r];
          const ativo = regras.has(r);
          return (
            <button key={r} type="button" onClick={() => toggleRegra(r)} style={btnChip(ativo ? (rot?.cor ?? COR_ATENDIMENTO) : "#64748b", ativo)}>
              {rot?.emoji} {rot?.titulo ?? r} ({contagemRegra(r)})
            </button>
          );
        })}
        {regras.size > 0 && <button type="button" onClick={() => setRegras(new Set())} style={{ ...btnChip("#64748b", false), border: 0 }}>limpar</button>}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {([
          ["urgentes", "🔴 Urgentes"],
          ["em_atendimento", "🎧 Em atendimento"],
          ["sem_telefone", "☎️ Sem telefone"],
          ["caveira", "💀 Mostrar “não contatar”"],
        ] as [Chip, string][]).map(([c, rotulo]) => (
          <button key={c} type="button" onClick={() => toggle(c)} style={btnChip(chips.has(c) ? COR_ATENDIMENTO : "#64748b", chips.has(c))}>
            {rotulo} <span style={{ opacity: 0.75 }}>({contagem(c)})</span>
          </button>
        ))}
      </div>

      {erro && <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 10, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>{erro}</div>}

      {carregando && linhas.length === 0 ? (
        <div style={{ opacity: 0.6, fontSize: 13 }}>Carregando…</div>
      ) : filtradas.length === 0 ? (
        <div className={styles.card} style={{ ["--fb-accent" as string]: COR_ATENDIMENTO, textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 28 }}>✨</div>
          <div style={{ fontWeight: 700 }}>Ninguém na fila com esse filtro.</div>
        </div>
      ) : modo === "lista" ? (
        <Lista linhas={filtradas} meuId={userProfile?.id ?? null} atendendo={atendendo} onAtender={atender} onCaveira={pedirCaveira} />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {filtradas.map((l) => <Item key={l.cliente_key} l={l} meuId={userProfile?.id ?? null} atendendo={atendendo === l.cliente_key} onAtender={atender} />)}
        </ul>
      )}
      <Toast msg={toast} onFechar={() => setToast(null)} ms={8000} />
      <ModalConfirmarCaveira
        aberto={!!caveiraAlvo}
        nome={caveiraAlvo?.nome || ""}
        codigoOmie={caveiraAlvo?.codigo_omie ?? null}
        processando={caveiraProcessando}
        onFechar={() => { if (!caveiraProcessando) setCaveiraAlvo(null); }}
        onApenasNaoContatar={() => void aplicarCaveira(false)}
        onInativarOmie={() => void aplicarCaveira(true)}
      />
    </div>
  );
}

// Modo LISTA: uma tabela com as informações principais e as ações na linha.
function Lista({ linhas, meuId, atendendo, onAtender, onCaveira }: { linhas: LinhaFila[]; meuId: string | null; atendendo: string | null; onAtender: (l: LinhaFila) => void; onCaveira: (l: LinhaFila) => void }) {
  return (
    <div className={styles.card} style={{ ["--fb-accent" as string]: COR_ATENDIMENTO, padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ textAlign: "left", fontSize: 11, opacity: 0.65, background: "var(--portal-bg)" }}>
            <th style={th}>Cliente</th><th style={th}>Prior.</th><th style={th}>Motivos</th><th style={th}>Telefone</th><th style={th}>E-mail</th><th style={th}>Cidade</th><th style={th}>Último contato</th><th style={th}>Tags</th><th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const deOutro = !!l.em_atendimento_id && l.em_atendimento_id !== meuId;
            const minha = !!l.em_atendimento_id && l.em_atendimento_id === meuId;
            const prio = l.prioridade === "Urgente" ? { bg: "#fee2e2", fg: "#b91c1c" } : l.prioridade === "Normal" ? { bg: "#fef3c7", fg: "#92400e" } : { bg: "#f0fdf4", fg: "#15803d" };
            const tagsVisiveis = l.tags.filter((t) => t !== "Não contatar" && !["Cliente", "Fornecedor", "Funcionário"].includes(t));
            return (
              <tr key={l.cliente_key} style={{ borderTop: "1px solid var(--portal-border)", opacity: l.caveira ? 0.6 : 1 }}>
                <td style={td}>
                  <Link href={`/feedbacks/atendimento/${encodeURIComponent(l.cliente_key)}`} style={{ color: "inherit", fontWeight: 700, textDecoration: "none" }}>{l.caveira && "💀 "}{l.nome}</Link>
                  <div style={{ fontSize: 10, opacity: 0.55 }}>{l.codigo_omie ? `#${l.codigo_omie}` : "sem código"}{l.em_atendimento_por ? ` · 🎧 ${l.em_atendimento_por}` : ""}{l.ultimo_humor != null ? ` ${emojiHumor(l.ultimo_humor)}` : ""}</div>
                </td>
                <td style={td}><span className={styles.pill} style={{ background: prio.bg, color: prio.fg, textTransform: "uppercase" }}>{l.prioridade}</span></td>
                <td style={{ ...td, fontSize: 15, letterSpacing: 2 }} title={l.regras.map((r) => REGRA_ROTULO[r as RegraOportunidade]?.titulo ?? r).join(" · ")}>
                  {l.regras.map((r) => REGRA_ROTULO[r as RegraOportunidade]?.emoji ?? "•").join("")}{l.registros_abertos > 0 ? "📋" : ""}
                </td>
                <td style={{ ...td, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{l.telefone ?? <span style={{ opacity: 0.5 }}>—</span>}</td>
                <td style={{ ...td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.email ?? ""}>{l.email ?? <span style={{ opacity: 0.5 }}>—</span>}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{l.cidade ?? <span style={{ opacity: 0.5 }}>—</span>}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{l.ultimo_contato ? `${fmtDataBR(l.ultimo_contato)} · ${haQuanto(l.ultimo_contato)}` : <span style={{ opacity: 0.5 }}>nunca</span>}</td>
                <td style={td}>{tagsVisiveis.length ? tagsVisiveis.map((t) => <span key={t} className={styles.pill} style={{ background: "#e0e7ff", color: "#3730a3", marginRight: 3 }}>{t}</span>) : <span style={{ opacity: 0.4 }}>—</span>}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  {deOutro ? (
                    <span style={{ fontSize: 11, color: "#3730a3" }}>🎧 com {l.em_atendimento_por}</span>
                  ) : (
                    <button type="button" disabled={atendendo === l.cliente_key} onClick={() => onAtender(l)} style={{ ...btnChip(minha ? "#16a34a" : COR_ATENDIMENTO, true), padding: "4px 10px" }}>{minha ? "Continuar" : "Atender"}</button>
                  )}
                  {" "}
                  <button type="button" onClick={() => onCaveira(l)} title={l.caveira ? "Reativar contato (tira a marca Não contatar)" : "Marcar como Não contatar (caveira)"} style={{ ...btnChip(l.caveira ? "#16a34a" : "#111", false), padding: "4px 8px" }}>
                    {l.caveira ? "✅ Reativar" : "💀"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 700, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px", verticalAlign: "top" };

function Item({ l, meuId, atendendo, onAtender }: { l: LinhaFila; meuId: string | null; atendendo: boolean; onAtender: (l: LinhaFila) => void }) {
  const deOutro = !!l.em_atendimento_id && l.em_atendimento_id !== meuId;
  const minha = !!l.em_atendimento_id && l.em_atendimento_id === meuId;
  const prio = l.prioridade === "Urgente" ? { bg: "#fee2e2", fg: "#b91c1c" } : l.prioridade === "Normal" ? { bg: "#fef3c7", fg: "#92400e" } : { bg: "#f0fdf4", fg: "#15803d" };
  return (
    <li className={styles.card} style={{ ["--fb-accent" as string]: l.caveira ? "#111" : prio.fg, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "center", padding: "12px 16px", opacity: l.caveira ? 0.7 : 1 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 15 }}>{l.caveira && "💀 "}{l.nome}</strong>
          <span className={styles.pill} style={{ background: prio.bg, color: prio.fg, textTransform: "uppercase" }}>{l.prioridade}</span>
          {l.codigo_omie && <span style={{ fontSize: 11, opacity: 0.6 }}>#{l.codigo_omie}</span>}
          {l.ultimo_humor != null && <span title={`Humor na última ligação: ${l.ultimo_humor}/5`} style={{ fontSize: 16 }}>{emojiHumor(l.ultimo_humor)}</span>}
          {l.em_atendimento_por && <span className={styles.pill} style={{ background: "#e0e7ff", color: "#3730a3" }}>🎧 {l.em_atendimento_por}</span>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          {l.regras.map((r) => {
            const rot = REGRA_ROTULO[r as RegraOportunidade];
            return <span key={r} className={styles.pill} style={{ background: `${rot?.cor ?? "#999"}22`, color: rot?.cor ?? "#333" }}>{rot?.emoji} {rot?.titulo ?? r}</span>;
          })}
          {l.registros_abertos > 0 && <span className={styles.pill} style={{ background: "#f1f5f9", color: "#334155" }}>📋 {l.registros_abertos} atendimento{l.registros_abertos > 1 ? "s" : ""} em aberto</span>}
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
          {l.telefone ? `☎️ ${l.telefone}` : "☎️ sem telefone"}
          {l.ultimo_contato ? ` · último contato ${fmtDataBR(l.ultimo_contato)} (${haQuanto(l.ultimo_contato)})` : " · nunca contatado pelo CRM"}
          {l.mais_antiga && ` · na fila desde ${fmtDataBR(l.mais_antiga)}`}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 4 }}>
        {deOutro ? (
          <span title="Outra pessoa está em ligação com este cliente" style={{ padding: "10px 18px", borderRadius: 999, background: "#e0e7ff", color: "#3730a3", fontWeight: 800, fontSize: 13, whiteSpace: "nowrap", textAlign: "center" }}>
            🎧 com {l.em_atendimento_por}
          </span>
        ) : (
          <button type="button" disabled={atendendo} onClick={() => onAtender(l)} style={{ padding: "10px 18px", borderRadius: 999, background: minha ? "#16a34a" : COR_ATENDIMENTO, color: "#fff", fontWeight: 800, border: 0, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>
            {atendendo ? "Abrindo…" : minha ? "Continuar ligação →" : "Atender →"}
          </button>
        )}
        <Link href={`/feedbacks/atendimento/${encodeURIComponent(l.cliente_key)}`} style={{ fontSize: 11, textAlign: "center", color: "#64748b", textDecoration: "none" }}>só ver a ficha</Link>
      </div>
    </li>
  );
}

function btnChip(cor: string, ativo: boolean): React.CSSProperties {
  return { fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 999, border: `1px solid ${cor}`, background: ativo ? cor : "transparent", color: ativo ? "#fff" : cor, cursor: "pointer" };
}
