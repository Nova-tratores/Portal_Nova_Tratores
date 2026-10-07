"use client";
// Modal "histórico da máquina" do cockpit: linha do tempo por chassi (entrega,
// revisões, cheques, OS do portal e da Omie, PPV/PV, garantias, requisições,
// atendimentos, observações, CRM). Abre por cima da ficha — a ligação em curso
// continua. Links seguem as regras de links.ts (tela com módulo, PDF sem).
import { useEffect, useMemo, useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import styles from "../feedbacks.module.css";
import { fmtDataBR, fmtMoeda, haQuanto } from "@/lib/feedbacks/atendimento/rotulos";
import { TIPO_EVENTO_ROTULO, type EventoMaquina, type RefEvento, type TipoEvento } from "@/lib/feedbacks/atendimento/maquina";
import type { HistoricoMaquina } from "@/lib/feedbacks/atendimento/maquina-db";
import { linkGarantia, linkNF, linkOS, linkPPV, linkPV, linkProjeto, linkRequisicao, type Acesso, type LinkDoc } from "@/lib/feedbacks/atendimento/links";
import type { Maquina } from "@/lib/feedbacks/atendimento/puro";

interface Props {
  maquina: Maquina;
  acesso: Acesso;
  onFechar: () => void;
  onAbrirDocumento?: (tipo: string, id: string) => void;
}

const cache = new Map<string, HistoricoMaquina>();
// uma requisição por chassi de cada vez (StrictMode em dev dispara o efeito 2x)
const emVoo = new Map<string, Promise<HistoricoMaquina>>();

async function buscarHistorico(chassi: string, qs: URLSearchParams): Promise<HistoricoMaquina> {
  const pendente = emVoo.get(chassi);
  if (pendente) return pendente;
  const p = (async () => {
    const r = await fetch(`/api/feedbacks/atendimento/maquina?${qs.toString()}`, { headers: await authHeaders(), cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.erro || `HTTP ${r.status}`);
    return j as HistoricoMaquina;
  })();
  emVoo.set(chassi, p);
  try { return await p; } finally { emVoo.delete(chassi); }
}

export default function ModalHistoricoMaquina({ maquina, acesso, onFechar, onAbrirDocumento }: Props) {
  const chassi = (maquina.chassi || "").trim().toUpperCase();
  const [dados, setDados] = useState<HistoricoMaquina | null>(cache.get(chassi) ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [filtro, setFiltro] = useState<Set<TipoEvento>>(new Set());
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!chassi) return;
    if (tentativa === 0 && cache.has(chassi)) { setDados(cache.get(chassi)!); return; }
    let vivo = true;
    setCarregando(true);
    setErro(null);
    const qs = new URLSearchParams({ chassi });
    if (maquina.projeto) { qs.set("projeto", maquina.projeto.nome); qs.set("empresa", maquina.projeto.empresa); }
    (async () => {
      try {
        const j = await buscarHistorico(chassi, qs);
        if (!vivo) return;
        cache.set(chassi, j);
        setDados(j);
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : "falha ao carregar");
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [chassi, tentativa, maquina.projeto]);

  // Esc fecha
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onFechar]);

  const tiposPresentes = useMemo(() => {
    const c = new Map<TipoEvento, number>();
    for (const e of dados?.eventos ?? []) c.set(e.tipo, (c.get(e.tipo) ?? 0) + 1);
    return [...c.entries()];
  }, [dados]);
  const eventos = useMemo(() => (dados?.eventos ?? []).filter((e) => filtro.size === 0 || filtro.has(e.tipo)), [dados, filtro]);

  const m = dados?.maquina ?? null;
  const modelo = maquina.modelo || m?.modelo || "Máquina";
  const entrega = maquina.entrega || m?.entrega || null;
  const proxima = maquina.proxima_revisao || m?.proxima_revisao || null;
  const ultima = maquina.ultima_revisao || m?.ultima_revisao || null;
  const projeto = maquina.projeto ?? dados?.projetos?.[0] ?? null;
  const hrefProjeto = linkProjeto(projeto);

  return (
    <div style={overlay} onClick={onFechar} role="dialog" aria-modal="true" aria-label={`Histórico da máquina ${modelo}`}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <header style={cabecalho}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, textTransform: "uppercase", letterSpacing: 0.8 }}>🚜 Histórico da máquina</div>
            <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2, marginTop: 2 }}>{modelo}</div>
            <div style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 13, opacity: 0.9 }}>{chassi || "sem chassi"}</div>
          </div>
          <button type="button" onClick={onFechar} style={btnFechar} aria-label="Fechar">✕</button>
        </header>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, padding: "10px 18px", borderBottom: "1px solid var(--portal-border)", fontSize: 12 }}>
          <Dado rotulo="Entrega" valor={entrega ? `${fmtDataBR(entrega)} (${haQuanto(entrega)})` : "—"} />
          <Dado rotulo="Última revisão" valor={ultima ? `${ultima.rotulo} · ${fmtDataBR(ultima.data)}${ultima.horimetro != null ? ` · ${ultima.horimetro} h` : ""}` : "nenhuma registrada"} />
          <Dado rotulo="Próxima revisão" valor={proxima ? `${proxima.horas} h · ${proxima.data_estimada ? fmtDataBR(proxima.data_estimada) : "sem estimativa"}${proxima.atrasada ? " · ATRASADA" : ""}` : "—"} cor={proxima?.atrasada ? "#b91c1c" : undefined} />
          <Dado rotulo="Horímetro mais recente" valor={dados?.horimetro_recente ? `${dados.horimetro_recente.valor} h · ${fmtDataBR(dados.horimetro_recente.data)} (${dados.horimetro_recente.origem.toLowerCase()})` : "—"} />
          {(maquina.vendedor || m?.vendedor) && <Dado rotulo="Vendedor" valor={maquina.vendedor || m?.vendedor || ""} />}
          {maquina.dono_tratores && <Dado rotulo="No controle de revisões" valor={maquina.dono_tratores} cor="#92400e" />}
          {maquina.crm && <Dado rotulo="CRM" valor={[maquina.crm.tipo, maquina.crm.ano && `ano ${maquina.crm.ano}`, maquina.crm.estado && `estado ${maquina.crm.estado}`, maquina.crm.horimetro != null && `${maquina.crm.horimetro} h`].filter(Boolean).join(" · ")} />}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            {maquina.fontes.map((f) => <span key={f} className={styles.pill} style={{ background: "#e0f2fe", color: "#075985" }}>{FONTE_ROTULO[f]}</span>)}
          </div>
        </div>

        <div style={corpo}>
          {carregando && !dados ? (
            <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>Montando o histórico…</p>
          ) : erro ? (
            <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 10, padding: "8px 12px", fontSize: 12 }}>
              Não carregou: {erro}. <button type="button" onClick={() => setTentativa((t) => t + 1)} style={btn("#991b1b")}>Tentar de novo</button>
            </div>
          ) : !dados ? null : (
            <>
              {tiposPresentes.length > 1 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
                  <button type="button" onClick={() => setFiltro(new Set())} className={styles.pill} style={{ ...chip, background: filtro.size === 0 ? "#111" : "var(--portal-bg)", color: filtro.size === 0 ? "#fff" : "inherit" }}>Tudo ({dados.eventos.length})</button>
                  {tiposPresentes.map(([t, n]) => {
                    const r = TIPO_EVENTO_ROTULO[t];
                    const on = filtro.has(t);
                    return (
                      <button key={t} type="button" className={styles.pill} style={{ ...chip, background: on ? r.cor : "var(--portal-bg)", color: on ? "#fff" : "inherit", borderColor: r.cor }}
                        onClick={() => setFiltro((s) => { const n2 = new Set(s); if (n2.has(t)) n2.delete(t); else n2.add(t); return n2; })}>
                        {r.emoji} {r.rotulo} ({n})
                      </button>
                    );
                  })}
                </div>
              )}
              {eventos.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>Nenhum registro encontrado para este chassi{Object.keys(dados.erros).length ? ` (não carregou: ${Object.keys(dados.erros).join(", ")})` : ""}.</p>
              ) : (
                <ol style={{ listStyle: "none", margin: 0, padding: 0, position: "relative" }}>
                  {eventos.map((e) => <Evento key={e.id} e={e} acesso={acesso} onAbrir={onAbrirDocumento} />)}
                </ol>
              )}
              {Object.keys(dados.erros).length > 0 && eventos.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: "#92400e" }}>Não carregou: {Object.keys(dados.erros).join(", ")}. <button type="button" onClick={() => setTentativa((t) => t + 1)} style={btn("#92400e")}>Tentar de novo</button></div>
              )}
            </>
          )}
        </div>

        <footer style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", padding: "10px 18px", borderTop: "1px solid var(--portal-border)", fontSize: 12 }}>
          <span style={{ opacity: 0.6 }}>{dados ? `${dados.eventos.length} registro${dados.eventos.length === 1 ? "" : "s"} · montado ${new Date(dados.gerado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
          <div style={{ display: "flex", gap: 8 }}>
            {hrefProjeto && <a href={hrefProjeto} target="_blank" rel="noopener noreferrer" style={btn("#0369a1")} onClick={() => onAbrirDocumento?.("projeto", projeto?.nome || "")}>Ficha completa do projeto ↗</a>}
            <button type="button" onClick={onFechar} style={btn("#475569")}>Fechar</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

const FONTE_ROTULO: Record<Maquina["fonte"], string> = { tratores: "controle de revisões", projeto: "projeto Omie", os: "citada em OS/PPV", crm: "CRM de vendas", pasta: "anotado na pasta" };

/** Resolve a referência do evento em links (documento + NF). */
export function linksDoEvento(ref: RefEvento, acesso: Acesso): LinkDoc[] {
  const out: LinkDoc[] = [];
  switch (ref.tipo) {
    case "os": {
      const l = linkOS(ref, acesso); if (l) out.push(l);
      const nf = linkNF(ref.link_nf, ref.nf); if (nf) out.push(nf);
      break;
    }
    case "ppv": { const l = linkPPV(ref.id, acesso); if (l) out.push(l); break; }
    case "pv": {
      const l = linkPV(ref); if (l) out.push(l);
      const nf = linkNF(ref.link_nf, ref.nf); if (nf) out.push(nf);
      break;
    }
    case "garantia": { const h = linkGarantia(ref.id); if (h) out.push({ href: h, titulo: "Abrir garantia", tipo: "tela" }); break; }
    case "requisicao": { const h = linkRequisicao(ref.id); if (h) out.push({ href: h, titulo: "Abrir requisição", tipo: "tela" }); break; }
    case "url": out.push({ href: ref.href, titulo: ref.rotulo, tipo: "pdf" }); break;
    default: break;
  }
  return out;
}

function Evento({ e, acesso, onAbrir }: { e: EventoMaquina; acesso: Acesso; onAbrir?: (tipo: string, id: string) => void }) {
  const r = TIPO_EVENTO_ROTULO[e.tipo];
  const links = linksDoEvento(e.ref, acesso);
  return (
    <li style={{ display: "grid", gridTemplateColumns: "92px 18px 1fr", gap: 8, alignItems: "start", padding: "6px 0" }}>
      <div style={{ fontSize: 12, textAlign: "right", paddingTop: 2 }}>
        <div style={{ fontWeight: 700 }}>{e.data ? fmtDataBR(e.data) : "—"}</div>
        {e.data && <div style={{ fontSize: 10, opacity: 0.55 }}>{haQuanto(e.data)}</div>}
      </div>
      <div style={{ position: "relative", height: "100%", display: "flex", justifyContent: "center" }}>
        <span style={{ width: 12, height: 12, borderRadius: 999, background: r.cor, marginTop: 4, boxShadow: "0 0 0 3px var(--portal-bg-card)", zIndex: 1 }} />
        <span style={{ position: "absolute", top: 16, bottom: -12, width: 2, background: "var(--portal-border)" }} />
      </div>
      <div style={{ border: "1px solid var(--portal-border)", borderLeft: `4px solid ${r.cor}`, borderRadius: 10, padding: "6px 10px", minWidth: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "baseline" }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: r.cor, textTransform: "uppercase", letterSpacing: 0.5 }}>{r.emoji} {r.rotulo}</span>
          <strong style={{ fontSize: 13 }}>{e.titulo}</strong>
          {e.status && <span className={styles.pill} style={{ background: "#f1f5f9", color: "#334155" }}>{e.status}</span>}
          {e.horimetro != null && <span className={styles.pill} style={{ background: "#ecfeff", color: "#155e75" }}>⏱ {e.horimetro} h</span>}
          {e.valor != null && e.valor !== 0 && <span style={{ fontSize: 12, fontWeight: 700, marginLeft: "auto" }}>{fmtMoeda(e.valor)}</span>}
        </div>
        {e.detalhe && <div style={{ fontSize: 12, marginTop: 3, lineHeight: 1.45 }}>{e.detalhe}</div>}
        {(e.quem || e.ligados.length > 0 || links.length > 0) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 4, fontSize: 11 }}>
            {e.quem && <span style={{ opacity: 0.7 }}>👤 {e.quem}</span>}
            {e.ligados.map((l) => <span key={l} className={styles.pill} style={{ background: "#f5f3ff", color: "#5b21b6" }}>🔗 {l}</span>)}
            {links.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" title={l.titulo} onClick={() => onAbrir?.(e.tipo, e.id)}
                style={{ fontWeight: 700, color: l.tipo === "nf" ? "#047857" : r.cor, textDecoration: "none", border: `1px solid ${l.tipo === "nf" ? "#047857" : r.cor}`, borderRadius: 999, padding: "1px 8px" }}>
                {l.tipo === "nf" ? "📄 NF" : l.tipo === "pdf" ? "📄 PDF" : "Abrir"} ↗
              </a>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function Dado({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.6, textTransform: "uppercase", letterSpacing: 0.4 }}>{rotulo}</div>
      <div style={{ fontWeight: 600, color: cor }}>{valor}</div>
    </div>
  );
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 };
const modal: React.CSSProperties = { background: "var(--portal-bg-card)", color: "var(--portal-text)", borderRadius: 16, width: "min(960px, 100%)", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px -20px rgba(0,0,0,0.5)", overflow: "hidden" };
const cabecalho: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "14px 18px", background: "#0369a1", color: "#fff" };
const corpo: React.CSSProperties = { padding: "12px 18px", overflowY: "auto", flex: 1 };
const chip: React.CSSProperties = { cursor: "pointer", border: "1px solid var(--portal-border)", fontSize: 11 };
const btnFechar: React.CSSProperties = { background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 999, width: 30, height: 30, cursor: "pointer", fontSize: 14, flexShrink: 0 };
function btn(cor: string): React.CSSProperties {
  return { fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 999, border: `1px solid ${cor}`, background: "transparent", color: cor, cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap" };
}
