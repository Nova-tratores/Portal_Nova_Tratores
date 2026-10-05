"use client";
// Editor do corpo de um artigo: lista de blocos tipados, cada um com seu formulário.
// Lista, tabela e termos são editados como texto simples (uma linha por item) —
// mais rápido de digitar e de colar do que um campo por célula.

import { useState } from "react";
import { blocoVazio, TIPOS_BLOCO, type Bloco, type ItemLista, type TipoBloco } from "@/lib/conhecimento/blocos";

// ---- texto ↔ estrutura -------------------------------------------------------
const listaParaTexto = (itens: ItemLista[]) => itens.map((i) => [i.texto, ...(i.sub ?? []).map((s) => `  ${s}`)].join("\n")).join("\n");
function textoParaLista(t: string): ItemLista[] {
  const out: ItemLista[] = [];
  for (const l of t.split("\n")) {
    if (!l.trim()) continue;
    if (/^\s{2,}/.test(l) && out.length) (out[out.length - 1].sub ??= []).push(l.trim());
    else out.push({ texto: l.trim() });
  }
  return out.length ? out : [{ texto: "" }];
}
const tabelaParaTexto = (b: Extract<Bloco, { tipo: "tabela" }>) => [b.colunas, ...b.linhas].map((l) => l.join(" | ")).join("\n");
function textoParaTabela(t: string): { colunas: string[]; linhas: string[][] } {
  const ls = t.split("\n").filter((l) => l.trim()).map((l) => l.split("|").map((c) => c.trim()));
  const colunas = ls[0] ?? [""];
  return { colunas, linhas: ls.slice(1).map((l) => colunas.map((_, i) => l[i] ?? "")) };
}
const termosParaTexto = (itens: { termo: string; definicao: string }[]) => itens.map((i) => `${i.termo}: ${i.definicao}`).join("\n");
function textoParaTermos(t: string) {
  return t.split("\n").filter((l) => l.trim()).map((l) => {
    const i = l.indexOf(":");
    return i < 0 ? { termo: l.trim(), definicao: "" } : { termo: l.slice(0, i).trim(), definicao: l.slice(i + 1).trim() };
  });
}

const campo: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--portal-border)", background: "var(--portal-bg-card)",
  color: "var(--portal-text)", fontSize: 13, fontFamily: "inherit", outline: "none",
};
const area: React.CSSProperties = { ...campo, resize: "vertical", lineHeight: 1.5 };
const mini: React.CSSProperties = { fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--portal-border)", background: "transparent", color: "var(--portal-text-secondary)", cursor: "pointer" };
const dica: React.CSSProperties = { fontSize: 11, color: "var(--portal-text-muted)", marginTop: 4 };

/**
 * `versao` muda quando o corpo é trocado por inteiro de fora (carregou, IA, conversão).
 * Junto com a geração interna (mover/remover/inserir) forma a chave dos blocos: as
 * áreas de texto guardam o que a pessoa digitou e só remontam quando a estrutura muda.
 */
export default function EditorBlocos({ corpo, onChange, versao = 0 }: { corpo: Bloco[]; onChange: (c: Bloco[]) => void; versao?: number }) {
  const [ger, setGer] = useState(0);
  const estrutural = (c: Bloco[]) => { setGer((g) => g + 1); onChange(c); };
  const troca = (i: number, b: Bloco) => onChange(corpo.map((x, j) => (j === i ? b : x)));
  const remove = (i: number) => estrutural(corpo.filter((_, j) => j !== i));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= corpo.length) return;
    const c = [...corpo];
    [c[i], c[j]] = [c[j], c[i]];
    estrutural(c);
  };
  const insere = (tipo: TipoBloco) => estrutural([...corpo, blocoVazio(tipo)]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {corpo.map((b, i) => (
        <div key={`${versao}-${ger}-${i}`} style={{ border: "1px solid var(--portal-border)", borderRadius: 12, padding: 10, background: "var(--portal-bg-card)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--portal-text-muted)", flex: 1 }}>
              {TIPOS_BLOCO.find((t) => t.tipo === b.tipo)?.rotulo}
            </span>
            <button type="button" style={mini} onClick={() => move(i, -1)} disabled={i === 0} title="Subir">▲</button>
            <button type="button" style={mini} onClick={() => move(i, 1)} disabled={i === corpo.length - 1} title="Descer">▼</button>
            <button type="button" style={{ ...mini, color: "#991b1b", borderColor: "#fecaca" }} onClick={() => remove(i)} title="Remover bloco">✕</button>
          </div>
          <CamposDoBloco b={b} onChange={(n) => troca(i, n)} />
        </div>
      ))}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "8px 0" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--portal-text-muted)" }}>Adicionar:</span>
        {TIPOS_BLOCO.map((t) => (
          <button key={t.tipo} type="button" style={mini} onClick={() => insere(t.tipo)}>+ {t.rotulo}</button>
        ))}
      </div>
      <div style={dica}>No texto: <code>**negrito**</code> para nomes de botão e campo, <code>`assim`</code> para texto fixo.</div>
    </div>
  );
}

/** Área de texto que guarda o que foi digitado (linha em branco, espaço no fim) e avisa a estrutura a cada tecla. */
function AreaEstruturada({ inicial, aoMudar, placeholder, mono }: { inicial: string; aoMudar: (texto: string) => void; placeholder: string; mono?: boolean }) {
  const [texto, setTexto] = useState(inicial);
  return (
    <textarea style={mono ? { ...area, fontFamily: "monospace" } : area} rows={Math.max(3, texto.split("\n").length + 1)} value={texto} placeholder={placeholder}
      onChange={(e) => { setTexto(e.target.value); aoMudar(e.target.value); }} />
  );
}

function CamposDoBloco({ b, onChange }: { b: Bloco; onChange: (b: Bloco) => void }) {
  switch (b.tipo) {
    case "p":
      return <textarea style={area} rows={3} value={b.texto} onChange={(e) => onChange({ ...b, texto: e.target.value })} placeholder="Texto do parágrafo" />;
    case "titulo":
      return <input style={campo} value={b.texto} onChange={(e) => onChange({ ...b, texto: e.target.value })} placeholder="Subtítulo" />;
    case "codigo":
      return <textarea style={{ ...area, fontFamily: "monospace" }} rows={3} value={b.texto} onChange={(e) => onChange({ ...b, texto: e.target.value })} placeholder="Texto fixo (mensagem do sistema, exemplo…)" />;
    case "aviso":
      return (
        <div style={{ display: "grid", gridTemplateColumns: "140px minmax(0,1fr)", gap: 8 }}>
          <select style={campo} value={b.tom || "info"} onChange={(e) => onChange({ ...b, tom: e.target.value as "info" | "atencao" | "perigo" })}>
            <option value="info">Informação</option>
            <option value="atencao">Atenção</option>
            <option value="perigo">Não faça</option>
          </select>
          <textarea style={area} rows={2} value={b.texto} onChange={(e) => onChange({ ...b, texto: e.target.value })} placeholder="Texto do aviso" />
        </div>
      );
    case "lista":
      return (
        <div>
          <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
            <input type="checkbox" checked={!!b.ordenada} onChange={(e) => onChange({ ...b, ordenada: e.target.checked })} /> Numerada
          </label>
          <AreaEstruturada inicial={listaParaTexto(b.itens)} aoMudar={(t) => onChange({ ...b, itens: textoParaLista(t) })} placeholder="Um item por linha" />
          <div style={dica}>Um item por linha. Linha começando com dois espaços vira sub-item do anterior.</div>
        </div>
      );
    case "passos":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {b.itens.map((it, i) => {
            const set = (p: Partial<typeof it>) => onChange({ ...b, itens: b.itens.map((x, j) => (j === i ? { ...x, ...p } : x)) });
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr) auto", gap: 8, alignItems: "start" }}>
                <span style={{ fontWeight: 800, fontSize: 13, paddingTop: 8 }}>{i + 1}.</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <input style={campo} value={it.titulo} onChange={(e) => set({ titulo: e.target.value })} placeholder="O que fazer" />
                  <textarea style={area} rows={2} value={it.texto ?? ""} onChange={(e) => set({ texto: e.target.value })} placeholder="Detalhe (opcional)" />
                  <input style={campo} value={it.dica ?? ""} onChange={(e) => set({ dica: e.target.value })} placeholder="Dica (opcional)" />
                </div>
                <button type="button" style={{ ...mini, marginTop: 6 }} onClick={() => onChange({ ...b, itens: b.itens.filter((_, j) => j !== i) })} disabled={b.itens.length === 1}>✕</button>
              </div>
            );
          })}
          <button type="button" style={{ ...mini, alignSelf: "flex-start" }} onClick={() => onChange({ ...b, itens: [...b.itens, { titulo: "" }] })}>+ passo</button>
        </div>
      );
    case "tabela":
      return (
        <div>
          <AreaEstruturada mono inicial={tabelaParaTexto(b)} aoMudar={(t) => onChange({ tipo: "tabela", ...textoParaTabela(t) })} placeholder="Coluna A | Coluna B" />
          <div style={dica}>Primeira linha = cabeçalho. Uma linha por registro. Separe as colunas com <code>|</code>.</div>
        </div>
      );
    case "termos":
      return (
        <div>
          <AreaEstruturada inicial={termosParaTexto(b.itens)} aoMudar={(t) => onChange({ ...b, itens: textoParaTermos(t) })} placeholder="Termo: o que significa" />
          <div style={dica}>Uma linha por termo, no formato <code>Termo: definição</code>.</div>
        </div>
      );
    case "imagem":
    case "video":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input style={campo} value={b.url} onChange={(e) => onChange({ ...b, url: e.target.value })} placeholder={b.tipo === "imagem" ? "Endereço da imagem (https://…)" : "Endereço do vídeo (https://…)"} />
          <input style={campo} value={b.legenda ?? ""} onChange={(e) => onChange({ ...b, legenda: e.target.value })} placeholder="Legenda (opcional)" />
        </div>
      );
  }
}
