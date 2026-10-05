"use client";
// Leitura de um artigo publicado da base de conhecimento.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ArtigoView from "@/components/conhecimento/Artigo";
import { obterArtigo, retornoDoLeitor, type ArtigoResposta } from "@/lib/conhecimento/client";
import { corModulo, rotuloModulo } from "@/lib/conhecimento/modulos";

export default function ArtigoPage() {
  const { slug } = useParams<{ slug: string }>();
  const [dados, setDados] = useState<ArtigoResposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [retorno, setRetorno] = useState<string | null>(null);
  const [comentando, setComentando] = useState(false);
  const [comentario, setComentario] = useState("");

  useEffect(() => {
    let vivo = true;
    obterArtigo(slug).then((r) => {
      if (!vivo) return;
      setDados(r);
      retornoDoLeitor(r.artigo.id, "leitura", { tela: "/conhecimento" }).catch(() => {});
    }).catch((e) => { if (vivo) setErro((e as Error).message); });
    return () => { vivo = false; };
  }, [slug]);

  const responder = useCallback(async (tipo: "ajudou" | "nao_ajudou" | "desatualizado") => {
    if (!dados) return;
    try {
      await retornoDoLeitor(dados.artigo.id, tipo, { comentario, tela: "/conhecimento" });
      setRetorno(tipo === "ajudou" ? "Obrigado!" : "Recebido. O responsável foi avisado.");
    } catch { setRetorno("Não consegui registrar agora."); }
    setComentando(false);
  }, [dados, comentario]);

  if (erro) return <div style={{ padding: 40, color: "#991b1b" }}>{erro} · <Link href="/conhecimento">voltar</Link></div>;
  if (!dados) return <div style={{ padding: 40, color: "var(--portal-text-muted)" }}>Carregando…</div>;
  const a = dados.artigo;

  return (
    <div style={{ paddingTop: 20, maxWidth: 860, margin: "0 auto", fontFamily: "Inter, sans-serif" }}>
      <div style={{ fontSize: 12, marginBottom: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Link href="/conhecimento" style={{ color: "#0369a1", fontWeight: 700, textDecoration: "none" }}>← Base de conhecimento</Link>
        <span style={{ color: corModulo(a.modulo), fontWeight: 700 }}>· {rotuloModulo(a.modulo)}</span>
        {a.telas.map((t) => <Link key={t} href={t} style={{ border: "1px solid var(--portal-border)", borderRadius: 6, padding: "1px 6px", color: "var(--portal-text-secondary)", textDecoration: "none" }}>abrir {t}</Link>)}
        {dados.podeEditar && <Link href={`/conhecimento/editar/${a.id}`} style={{ marginLeft: "auto", color: "#475569", fontWeight: 700, textDecoration: "none" }}>✎ Editar</Link>}
      </div>

      <article style={{ background: "var(--portal-bg-card)", border: "1px solid var(--portal-border)", borderRadius: 16, padding: "22px 26px" }}>
        {a.status !== "publicado" && (
          <div style={{ fontSize: 12, color: "#92400e", background: "#fef3c7", borderRadius: 8, padding: "6px 10px", marginBottom: 12 }}>
            Este artigo ainda não foi publicado: só quem edita o módulo consegue ver.
          </div>
        )}
        {a.revisao_pendente_desde && (
          <div style={{ fontSize: 12, color: "#991b1b", background: "#fee2e2", borderRadius: 8, padding: "6px 10px", marginBottom: 12 }}>
            ⚠️ A tela mudou em {a.revisao_pendente_desde.slice(0, 10).split("-").reverse().join("/")}. Este texto pode estar desatualizado.
          </div>
        )}
        <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 800, color: "var(--portal-text)" }}>{a.titulo}</h1>
        {a.resumo && <p style={{ margin: "0 0 18px", fontSize: 14, color: "var(--portal-text-secondary)" }}>{a.resumo}</p>}
        <ArtigoView corpo={a.corpo} />

        <footer style={{ marginTop: 24, paddingTop: 14, borderTop: "1px dashed var(--portal-border)", fontSize: 12, color: "var(--portal-text-secondary)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {retorno ? <span>{retorno}</span> : comentando ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
              <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3} placeholder="O que está errado ou faltando?" autoFocus
                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid var(--portal-border)", background: "var(--portal-bg-card)", color: "var(--portal-text)", fontSize: 12, fontFamily: "inherit" }} />
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={() => responder("desatualizado")} style={chip("#991b1b")}>Enviar: está desatualizado</button>
                <button type="button" onClick={() => responder("nao_ajudou")} style={chip("#475569")}>Enviar: não ajudou</button>
                <button type="button" onClick={() => setComentando(false)} style={chip("#94a3b8")}>Cancelar</button>
              </div>
            </div>
          ) : (
            <>
              <span>Isso ajudou?</span>
              <button type="button" onClick={() => responder("ajudou")} style={chip("#15803d")}>👍 Sim</button>
              <button type="button" onClick={() => setComentando(true)} style={chip("#991b1b")}>👎 Não / está desatualizado</button>
            </>
          )}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--portal-text-muted)" }}>
            v{a.versao}{a.publicado_em ? ` · publicado em ${a.publicado_em.slice(0, 10).split("-").reverse().join("/")}` : ""}{a.publicado_por_nome ? ` por ${a.publicado_por_nome}` : ""}{dados.responsavel ? ` · responsável: ${dados.responsavel}` : ""}
          </span>
        </footer>
      </article>
    </div>
  );
}

function chip(cor: string): React.CSSProperties {
  return { fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, border: `1px solid ${cor}`, background: "transparent", color: cor, cursor: "pointer" };
}
