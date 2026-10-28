"use client";
// Desenha o corpo de um artigo da base de conhecimento (blocos tipados).
// Sem HTML cru: o texto só aceita **negrito** e `código` (lib/conhecimento/blocos).

import { Fragment } from "react";
import { trechos, type Bloco } from "@/lib/conhecimento/blocos";

export function Texto({ children }: { children: string }) {
  return (
    <>
      {trechos(children).map((t, i) =>
        t.t === "b" ? <strong key={i} style={{ fontWeight: 500 }}>{t.v}</strong>
        : t.t === "code" ? <code key={i} style={{ background: "var(--portal-bg-subtle, #f1f5f9)", border: "1px solid var(--portal-border)", borderRadius: 5, padding: "0 5px", fontSize: "0.92em" }}>{t.v}</code>
        : <Fragment key={i}>{t.v}</Fragment>,
      )}
    </>
  );
}

const TOM: Record<string, { borda: string; fundo: string; texto: string; icone: string }> = {
  info: { borda: "#0ea5e9", fundo: "#e0f2fe", texto: "#075985", icone: "fa-circle-info" },
  atencao: { borda: "#f59e0b", fundo: "#fef3c7", texto: "#92400e", icone: "fa-triangle-exclamation" },
  perigo: { borda: "#dc2626", fundo: "#fee2e2", texto: "#991b1b", icone: "fa-ban" },
};

/** Vídeo do próprio portal/bucket toca aqui; link externo abre em outra aba. */
function ehArquivoDeVideo(url: string) {
  return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
}

export default function Artigo({ corpo, compacto = false }: { corpo: Bloco[]; compacto?: boolean }) {
  const fs = compacto ? 13 : 14;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compacto ? 10 : 14, fontSize: fs, lineHeight: 1.6, color: "var(--portal-text)" }}>
      {corpo.map((b, i) => {
        switch (b.tipo) {
          case "p":
            return <p key={i} style={{ margin: 0 }}><Texto>{b.texto}</Texto></p>;
          case "titulo":
            return <h3 key={i} style={{ margin: "6px 0 0", fontSize: fs + 2, fontWeight: 500 }}><Texto>{b.texto}</Texto></h3>;
          case "lista": {
            const Tag = b.ordenada ? "ol" : "ul";
            return (
              <Tag key={i} style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 4 }}>
                {b.itens.map((it, j) => (
                  <li key={j}>
                    <Texto>{it.texto}</Texto>
                    {it.sub && it.sub.length > 0 && (
                      <ul style={{ margin: "4px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2, opacity: 0.9 }}>
                        {it.sub.map((s, k) => <li key={k}><Texto>{s}</Texto></li>)}
                      </ul>
                    )}
                  </li>
                ))}
              </Tag>
            );
          }
          case "passos":
            return (
              <ol key={i} style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                {b.itens.map((it, j) => (
                  <li key={j} style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", gap: 10, alignItems: "start" }}>
                    <span style={{ width: 28, height: 28, borderRadius: 999, background: "color-mix(in srgb, #2563eb 10%, var(--portal-bg-card, #fefefe))", color: "#2563eb", border: "1px solid color-mix(in srgb, #2563eb 22%, transparent)", fontWeight: 500, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>{j + 1}</span>
                    <div>
                      <div style={{ fontWeight: 500 }}><Texto>{it.titulo}</Texto></div>
                      {it.texto && <div style={{ marginTop: 2 }}><Texto>{it.texto}</Texto></div>}
                      {it.dica && <div style={{ marginTop: 4, fontSize: fs - 1, color: "#92400e", background: "#fef3c7", borderRadius: 10, padding: "4px 10px", display: "inline-block" }}><i className="fa-solid fa-lightbulb" style={{ marginRight: 6 }} /><Texto>{it.dica}</Texto></div>}
                    </div>
                  </li>
                ))}
              </ol>
            );
          case "tabela":
            return (
              <div key={i} style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: fs - 1 }}>
                  <thead>
                    <tr>{b.colunas.map((c, j) => <th key={j} style={{ textAlign: "left", padding: "6px 10px", borderBottom: "1px solid var(--portal-border)", background: "var(--portal-bg-secondary, #f8fafc)", color: "var(--portal-text-secondary, #475569)", fontWeight: 400 }}><Texto>{c}</Texto></th>)}</tr>
                  </thead>
                  <tbody>
                    {b.linhas.map((l, j) => (
                      <tr key={j}>{l.map((c, k) => <td key={k} style={{ padding: "6px 10px", borderBottom: "1px solid var(--portal-border)", verticalAlign: "top" }}><Texto>{c}</Texto></td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "aviso": {
            const t = TOM[b.tom || "info"];
            return (
              <div key={i} style={{ border: `1px solid color-mix(in srgb, ${t.borda} 30%, transparent)`, background: t.fundo, color: t.texto, borderRadius: 12, padding: "10px 14px", display: "flex", gap: 10, alignItems: "baseline" }}>
                <i className={`fa-solid ${t.icone}`} style={{ color: t.borda }} /><span><Texto>{b.texto}</Texto></span>
              </div>
            );
          }
          case "termos":
            return (
              <dl key={i} style={{ margin: 0, display: "grid", gridTemplateColumns: "minmax(110px, auto) minmax(0, 1fr)", gap: "6px 14px" }}>
                {b.itens.map((it, j) => (
                  <Fragment key={j}>
                    <dt style={{ fontWeight: 500 }}>{it.termo}</dt>
                    <dd style={{ margin: 0 }}><Texto>{it.definicao}</Texto></dd>
                  </Fragment>
                ))}
              </dl>
            );
          case "imagem":
            return (
              <figure key={i} style={{ margin: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.url} alt={b.legenda || ""} style={{ maxWidth: "100%", borderRadius: 10, border: "1px solid var(--portal-border)" }} />
                {b.legenda && <figcaption style={{ fontSize: fs - 2, opacity: 0.7, marginTop: 4 }}>{b.legenda}</figcaption>}
              </figure>
            );
          case "video":
            return (
              <figure key={i} style={{ margin: 0 }}>
                {ehArquivoDeVideo(b.url)
                  ? <video src={b.url} controls preload="metadata" style={{ maxWidth: "100%", borderRadius: 10, border: "1px solid var(--portal-border)" }} />
                  : <a href={b.url} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}><i className="fa-solid fa-circle-play" style={{ marginRight: 6 }} />Assistir ao vídeo</a>}
                {b.legenda && <figcaption style={{ fontSize: fs - 2, opacity: 0.7, marginTop: 4 }}>{b.legenda}</figcaption>}
              </figure>
            );
          case "codigo":
            return <pre key={i} style={{ margin: 0, background: "var(--portal-bg-subtle, #f1f5f9)", border: "1px solid var(--portal-border)", borderRadius: 8, padding: "8px 12px", fontSize: fs - 1, whiteSpace: "pre-wrap" }}>{b.texto}</pre>;
        }
      })}
    </div>
  );
}
