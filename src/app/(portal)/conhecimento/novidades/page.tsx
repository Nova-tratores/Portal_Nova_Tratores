"use client";
// Novidades do portal: histórico do que mudou nas telas que o usuário usa e, para
// o responsável de cada módulo, os rascunhos gerados a cada versão para revisar e publicar.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ArtigoView from "@/components/conhecimento/Artigo";
import { mdParaBlocos } from "@/lib/conhecimento/blocos";
import { acaoNovidade, criarNovidadeApi, ErroApi, listarNovidades, marcarNovidadesLidas, type NovidadeApi } from "@/lib/conhecimento/client";
import { corModulo, MODULOS_KB, rotuloModulo } from "@/lib/conhecimento/modulos";

type Dados = Awaited<ReturnType<typeof listarNovidades>>;

export default function NovidadesPage() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  // recarrega quando `rodada` muda; o estado só é escrito no retorno da consulta
  const [rodada, setRodada] = useState(0);
  const carregar = useCallback(() => setRodada((n) => n + 1), []);
  useEffect(() => {
    let vivo = true;
    listarNovidades()
      .then((r) => {
        if (!vivo) return;
        setDados(r); setErro(null);
        const naoLidas = r.historico.filter((n) => !n.lida).map((n) => n.id);
        if (naoLidas.length) marcarNovidadesLidas(naoLidas).catch(() => {});
      })
      .catch((e) => {
        if (vivo) setErro(e instanceof ErroApi && e.migracaoFaltando ? "As novidades ainda não foram instaladas no banco (sql/sistema-releases.sql)." : (e as Error).message);
      });
    return () => { vivo = false; };
  }, [rodada]);

  const podeCriar = !!dados && (dados.admin || dados.podePublicarEm.length > 0);
  const modulosParaCriar = dados?.admin ? MODULOS_KB.map((m) => m.id) : dados?.podePublicarEm ?? [];

  return (
    <div style={{ padding: "20px 12px 0", maxWidth: "calc(860px + 24px)", margin: "0 auto", fontFamily: "Inter, sans-serif" }}>
      <div style={{ fontSize: 12, marginBottom: 10 }}>
        <Link href="/conhecimento" style={{ color: "#0369a1", fontWeight: 700, textDecoration: "none" }}>← Base de conhecimento</Link>
      </div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--portal-text)" }}>🆕 O que mudou no portal</h1>
          <div style={{ fontSize: 12, color: "var(--portal-text-secondary)", marginTop: 2 }}>Mudanças nas telas que você usa, em ordem da mais recente.</div>
        </div>
        {podeCriar && <button type="button" style={btnSec} onClick={() => setCriando((v) => !v)}>{criando ? "Cancelar" : "+ Escrever novidade"}</button>}
      </div>

      {erro && <div style={{ padding: "12px 16px", borderRadius: 12, background: "#fef3c7", color: "#92400e", fontSize: 13, marginBottom: 14 }}>{erro}</div>}

      {criando && <FormNovidade modulos={modulosParaCriar} aoSalvar={() => { setCriando(false); void carregar(); }} />}

      {dados && dados.rascunhos.length > 0 && (
        <section style={{ marginBottom: 26 }}>
          <h2 style={titulo}>Para você aprovar ({dados.rascunhos.length})</h2>
          <p style={{ fontSize: 12, color: "var(--portal-text-secondary)", margin: "-4px 0 10px" }}>
            Rascunhos escritos pela IA a partir do que foi publicado no sistema. Ninguém vê até você publicar. Corrija o que não fizer sentido para quem usa a tela.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {dados.rascunhos.map((n) => <Rascunho key={n.id} n={n} aoMudar={carregar} />)}
          </div>
        </section>
      )}

      <section>
        <h2 style={titulo}>Histórico</h2>
        {!dados ? <div style={vazio}>Carregando…</div> : dados.historico.length === 0 ? <div style={vazio}>Nenhuma novidade publicada ainda.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {dados.historico.map((n) => (
              <article key={n.id} style={{ ...card, borderLeft: `4px solid ${corModulo(n.modulo)}` }}>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: corModulo(n.modulo), display: "flex", gap: 8 }}>
                  {rotuloModulo(n.modulo)}
                  <span style={{ color: "var(--portal-text-muted)", fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>
                    {n.publicado_em ? new Date(n.publicado_em).toLocaleDateString("pt-BR") : ""}{n.publicado_por_nome ? ` · ${n.publicado_por_nome}` : ""}
                  </span>
                  {!n.lida && <span style={{ color: "#dc2626" }}>nova</span>}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--portal-text)", margin: "3px 0 8px" }}>{n.titulo}</div>
                <ArtigoView corpo={mdParaBlocos(n.texto)} compacto />
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Rascunho({ n, aoMudar }: { n: NovidadeApi; aoMudar: () => void }) {
  const [tituloN, setTituloN] = useState(n.titulo);
  const [texto, setTexto] = useState(n.texto);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [verCommits, setVerCommits] = useState(false);

  async function agir(acao: "salvar" | "publicar" | "descartar") {
    if (acao === "descartar" && !confirm("Descartar esta novidade? Ninguém vai vê-la.")) return;
    setOcupado(acao); setErro(null);
    try { await acaoNovidade(n.id, acao, { titulo: tituloN, texto }); aoMudar(); }
    catch (e) { setErro((e as Error).message); }
    finally { setOcupado(null); }
  }

  return (
    <article style={{ ...card, borderLeft: `4px solid ${corModulo(n.modulo)}` }}>
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: corModulo(n.modulo), display: "flex", gap: 8, marginBottom: 6 }}>
        {rotuloModulo(n.modulo)}
        <span style={{ color: "var(--portal-text-muted)", fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>
          {n.origem === "ia" ? "rascunho da IA" : "texto direto dos commits"} · {new Date(n.criado_em).toLocaleString("pt-BR")}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input style={campo} value={tituloN} onChange={(e) => setTituloN(e.target.value)} placeholder="Título" />
          <textarea style={{ ...campo, resize: "vertical", minHeight: 110, lineHeight: 1.5 }} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="- uma mudança por linha" />
          <div style={{ fontSize: 11, color: "var(--portal-text-muted)" }}>Uma mudança por linha, começando com <code>- </code>.</div>
        </div>
        <div style={{ background: "var(--portal-bg-subtle, #f8fafc)", borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: "var(--portal-text-muted)", marginBottom: 6 }}>Como o usuário vê</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: "var(--portal-text)" }}>{tituloN}</div>
          <ArtigoView corpo={mdParaBlocos(texto)} compacto />
        </div>
      </div>
      {n.commits.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={() => setVerCommits((v) => !v)} style={{ background: "none", border: "none", padding: 0, fontSize: 11, color: "#0369a1", cursor: "pointer", fontWeight: 700 }}>
            {verCommits ? "▾" : "▸"} de onde saiu ({n.commits.length} alteraç{n.commits.length > 1 ? "ões" : "ão"} no sistema)
          </button>
          {verCommits && <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 11, color: "var(--portal-text-secondary)" }}>{n.commits.map((c) => <li key={c.sha}><code>{c.sha}</code> {c.titulo}</li>)}</ul>}
        </div>
      )}
      {erro && <div style={{ marginTop: 8, fontSize: 12, color: "#991b1b" }}>{erro}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        <button type="button" style={btnPrimario} disabled={!!ocupado} onClick={() => agir("publicar")}>{ocupado === "publicar" ? "Publicando…" : "Publicar"}</button>
        <button type="button" style={btnSec} disabled={!!ocupado} onClick={() => agir("salvar")}>Salvar rascunho</button>
        <button type="button" style={{ ...btnSec, marginLeft: "auto", color: "#991b1b" }} disabled={!!ocupado} onClick={() => agir("descartar")}>Descartar</button>
      </div>
    </article>
  );
}

function FormNovidade({ modulos, aoSalvar }: { modulos: string[]; aoSalvar: () => void }) {
  const [modulo, setModulo] = useState(modulos[0] || "pos");
  const [tituloN, setTituloN] = useState("");
  const [texto, setTexto] = useState("- ");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  async function salvar() {
    setOcupado(true); setErro(null);
    try { await criarNovidadeApi({ modulo, titulo: tituloN, texto }); aoSalvar(); }
    catch (e) { setErro((e as Error).message); }
    finally { setOcupado(false); }
  }
  return (
    <section style={{ ...card, marginBottom: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <select style={{ ...campo, flex: "0 0 200px", maxWidth: "100%" }} value={modulo} onChange={(e) => setModulo(e.target.value)}>
          {modulos.map((m) => <option key={m} value={m}>{rotuloModulo(m)}</option>)}
        </select>
        <input style={{ ...campo, flex: "1 1 160px", minWidth: 0 }} value={tituloN} onChange={(e) => setTituloN(e.target.value)} placeholder="Título da novidade" />
      </div>
      <textarea style={{ ...campo, resize: "vertical", minHeight: 90 }} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="- uma mudança por linha" />
      {erro && <div style={{ marginTop: 6, fontSize: 12, color: "#991b1b" }}>{erro}</div>}
      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" style={btnPrimario} disabled={ocupado} onClick={salvar}>Criar rascunho</button>
        <span style={{ fontSize: 11, color: "var(--portal-text-muted)" }}>Entra em “Para você aprovar”; só aparece para a equipe depois de publicar.</span>
      </div>
    </section>
  );
}

const card: React.CSSProperties = { background: "var(--portal-bg-card)", border: "1px solid var(--portal-border)", borderRadius: 12, padding: "12px 14px" };
const campo: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--portal-border)", background: "var(--portal-bg-card)", color: "var(--portal-text)", fontSize: 13, fontFamily: "inherit", outline: "none" };
const titulo: React.CSSProperties = { fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--portal-text-secondary)", margin: "0 0 10px" };
const btnPrimario: React.CSSProperties = { padding: "8px 16px", background: "#0369a1", color: "#fefefe", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const btnSec: React.CSSProperties = { padding: "7px 14px", background: "transparent", color: "var(--portal-text)", border: "1.5px solid var(--portal-border)", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const vazio: React.CSSProperties = { padding: 40, textAlign: "center", color: "var(--portal-text-muted)", fontSize: 14, fontStyle: "italic" };
