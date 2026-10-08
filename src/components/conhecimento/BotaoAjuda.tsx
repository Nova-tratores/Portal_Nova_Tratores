"use client";
// Botão "?" do cabeçalho: abre a ajuda da tela em que a pessoa está, lida da base
// de conhecimento (artigos publicados cujas `telas` cobrem o pathname).
// Sem artigo para a tela — ou sem a migration aplicada — o botão não aparece.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HelpCircle, X } from "lucide-react";
import ArtigoView from "./Artigo";
import { artigosDaTelaApi, retornoDoLeitor } from "@/lib/conhecimento/client";
import type { Artigo } from "@/lib/conhecimento/artigos";
import { rotuloModulo } from "@/lib/conhecimento/modulos";

// Cache por tela, fora do componente: uma consulta por tela a cada 5 min, mesmo
// que o cabeçalho remonte. Falha (migration pendente, sem sessão) vira lista vazia.
type Entrada = { em: number; artigos: Artigo[]; podeEditar: boolean };
const cache = new Map<string, Entrada>();
const TTL = 5 * 60 * 1000;

const semAjuda = (pathname: string) => !pathname || pathname.startsWith("/conhecimento");

export default function BotaoAjuda({ estilo }: { estilo?: React.CSSProperties }) {
  const pathname = usePathname() || "";
  const [, forcar] = useState(0);
  // "aberto" e "expandido" guardam a tela em que foram ligados: trocar de tela fecha sozinho.
  const [abertoEm, setAbertoEm] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<{ tela: string; id: string } | null>(null);
  const [retorno, setRetorno] = useState<Record<string, string>>({});
  const [comentando, setComentando] = useState<string | null>(null);
  const [comentario, setComentario] = useState("");

  useEffect(() => {
    if (semAjuda(pathname)) return;
    const c = cache.get(pathname);
    if (c && Date.now() - c.em < TTL) return;
    let vivo = true;
    artigosDaTelaApi(pathname)
      .then((r) => cache.set(pathname, { em: Date.now(), artigos: r.artigos, podeEditar: r.podeEditar }))
      .catch(() => cache.set(pathname, { em: Date.now(), artigos: [], podeEditar: false }))
      .finally(() => { if (vivo) forcar((n) => n + 1); });
    return () => { vivo = false; };
  }, [pathname]);

  const aberto = abertoEm === pathname;

  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbertoEm(null); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto]);

  const abrirArtigo = useCallback((a: Artigo) => {
    setExpandido((atual) => (atual?.id === a.id ? null : { tela: pathname, id: a.id }));
    retornoDoLeitor(a.id, "leitura", { tela: pathname }).catch(() => {});
  }, [pathname]);

  const responder = useCallback(async (a: Artigo, tipo: "ajudou" | "nao_ajudou" | "desatualizado", texto?: string) => {
    try {
      await retornoDoLeitor(a.id, tipo, { tela: pathname, comentario: texto });
      setRetorno((r) => ({ ...r, [a.id]: tipo === "ajudou" ? "Obrigado!" : "Recebido. O responsável foi avisado." }));
    } catch {
      setRetorno((r) => ({ ...r, [a.id]: "Não consegui registrar agora." }));
    }
    setComentando(null); setComentario("");
  }, [pathname]);

  const entrada = semAjuda(pathname) ? undefined : cache.get(pathname);
  const artigos = entrada?.artigos ?? [];
  const podeEditar = entrada?.podeEditar ?? false;
  if (artigos.length === 0) return null;

  const idExpandido = expandido?.tela === pathname ? expandido.id : null;
  const fechar = () => setAbertoEm(null);

  return (
    <>
      <button type="button" onClick={() => { setAbertoEm(pathname); if (artigos.length === 1) abrirArtigo(artigos[0]); }} title="Ajuda desta tela" aria-label="Ajuda desta tela" style={estilo}>
        <HelpCircle size={20} />
      </button>

      {aberto && (
        <div onClick={fechar} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 3000, display: "flex", justifyContent: "flex-end" }}>
          <aside onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Ajuda desta tela"
            style={{ width: "min(520px, 100%)", height: "100%", background: "var(--portal-bg-card)", borderLeft: "1px solid var(--portal-border)", display: "flex", flexDirection: "column", boxShadow: "-18px 0 40px -18px rgba(0,0,0,0.35)" }}>
            <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--portal-border)" }}>
              <HelpCircle size={20} color="#0369a1" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "var(--portal-text)" }}>Ajuda desta tela</div>
                <div style={{ fontSize: 11, color: "var(--portal-text-muted)" }}>{artigos.length} artigo{artigos.length > 1 ? "s" : ""} · {rotuloModulo(artigos[0].modulo)}</div>
              </div>
              <button type="button" onClick={fechar} aria-label="Fechar" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--portal-text-muted)", display: "flex" }}><X size={20} /></button>
            </header>

            <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
              {artigos.map((a) => {
                const on = idExpandido === a.id;
                return (
                  <section key={a.id} style={{ borderBottom: "1px solid var(--portal-border)" }}>
                    <button type="button" onClick={() => abrirArtigo(a)} aria-expanded={on}
                      style={{ width: "100%", textAlign: "left", background: on ? "var(--portal-bg-subtle, #f8fafc)" : "transparent", border: "none", cursor: "pointer", padding: "12px 18px", display: "flex", alignItems: "center", gap: 10, color: "var(--portal-text)" }}>
                      <span style={{ fontSize: 12, width: 14 }}>{on ? "▾" : "▸"}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, display: "block" }}>{a.titulo}</span>
                        {a.resumo && !on && <span style={{ fontSize: 12, color: "var(--portal-text-secondary)", display: "block", marginTop: 2 }}>{a.resumo}</span>}
                      </span>
                    </button>
                    {on && (
                      <div style={{ padding: "4px 18px 16px clamp(18px, 6vw, 42px)" }}>
                        {a.revisao_pendente_desde && (
                          <div style={{ fontSize: 11, color: "#92400e", background: "#fef3c7", borderRadius: 8, padding: "4px 8px", marginBottom: 10, display: "inline-block" }}>
                            ⚠️ A tela mudou em {a.revisao_pendente_desde.slice(0, 10).split("-").reverse().join("/")}. Este texto pode estar desatualizado.
                          </div>
                        )}
                        <ArtigoView corpo={a.corpo} compacto />
                        <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px dashed var(--portal-border)", fontSize: 12, color: "var(--portal-text-secondary)" }}>
                          {retorno[a.id] ? (
                            <span>{retorno[a.id]}</span>
                          ) : comentando === a.id ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3} placeholder="O que está errado ou faltando?" autoFocus
                                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid var(--portal-border)", background: "var(--portal-bg-card)", color: "var(--portal-text)", fontSize: 12, fontFamily: "inherit", resize: "vertical" }} />
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <button type="button" onClick={() => responder(a, "desatualizado", comentario)} style={chip("#991b1b")}>Enviar: está desatualizado</button>
                                <button type="button" onClick={() => responder(a, "nao_ajudou", comentario)} style={chip("#475569")}>Enviar: não ajudou</button>
                                <button type="button" onClick={() => { setComentando(null); setComentario(""); }} style={chip("#94a3b8")}>Cancelar</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span>Isso ajudou?</span>
                              <button type="button" onClick={() => responder(a, "ajudou")} style={chip("#15803d")}>👍 Sim</button>
                              <button type="button" onClick={() => setComentando(a.id)} style={chip("#991b1b")}>👎 Não / está desatualizado</button>
                              <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--portal-text-muted)" }}>
                                v{a.versao}{a.publicado_em ? ` · ${a.publicado_em.slice(0, 10).split("-").reverse().join("/")}` : ""}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>

            <footer style={{ padding: "10px 18px", borderTop: "1px solid var(--portal-border)", display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12 }}>
              <Link href="/conhecimento" onClick={fechar} style={{ color: "#0369a1", fontWeight: 700, textDecoration: "none" }}>Buscar na base de conhecimento</Link>
              {podeEditar && idExpandido && (
                <Link href={`/conhecimento/editar/${idExpandido}`} onClick={fechar} style={{ color: "#475569", fontWeight: 700, textDecoration: "none", marginLeft: "auto" }}>✎ Editar este artigo</Link>
              )}
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}

function chip(cor: string): React.CSSProperties {
  return { fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, border: `1px solid ${cor}`, background: "transparent", color: cor, cursor: "pointer" };
}

/** Depois de publicar/editar um artigo, a próxima abertura do "?" relê a tela. */
export function limparCacheAjuda() {
  cache.clear();
}
