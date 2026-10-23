"use client";
// Novidades do portal: histórico do que mudou nas telas que o usuário usa e, para
// o responsável de cada módulo, os rascunhos gerados a cada versão para revisar e publicar.
// Visual: docs/estilo-pos-newportal.md (components/conhecimento/estiloKB.tsx).

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ArtigoView from "@/components/conhecimento/Artigo";
import { AZUL, botao, campo, card, contador, CSS_KB, dataBR, Icone, IconeModulo, pilula, Selo, T1, T2, T3, tituloPagina, tituloSecao, vazio } from "@/components/conhecimento/estiloKB";
import { mdParaBlocos } from "@/lib/conhecimento/blocos";
import { acaoNovidade, criarNovidadeApi, ErroApi, listarNovidades, marcarNovidadesLidas, type NovidadeApi } from "@/lib/conhecimento/client";
import { corModulo, iconeModulo, MODULOS_KB, rotuloModulo } from "@/lib/conhecimento/modulos";

type Dados = Awaited<ReturnType<typeof listarNovidades>>;

export default function NovidadesPage() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [filtro, setFiltro] = useState("");

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

  // módulos presentes no histórico, com a contagem, para as pílulas de filtro
  const modulosHist = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of dados?.historico ?? []) m.set(n.modulo, (m.get(n.modulo) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => rotuloModulo(a[0]).localeCompare(rotuloModulo(b[0])));
  }, [dados]);

  // histórico agrupado pelo dia em que foi publicado
  const porDia = useMemo(() => {
    const g = new Map<string, NovidadeApi[]>();
    for (const n of dados?.historico ?? []) {
      if (filtro && n.modulo !== filtro) continue;
      const dia = (n.publicado_em || n.criado_em).slice(0, 10);
      (g.get(dia) ?? g.set(dia, []).get(dia)!).push(n);
    }
    return Array.from(g.entries());
  }, [dados, filtro]);

  return (
    <div style={{ padding: "20px 16px 40px", fontFamily: "Inter, system-ui, sans-serif", fontWeight: 400, color: T1 }}>
      <style>{CSS_KB}</style>
      <div style={{ fontSize: 13.5, marginBottom: 12 }}>
        <Link href="/conhecimento" style={{ color: AZUL, textDecoration: "none" }}><i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} />Base de conhecimento</Link>
      </div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <h1 style={tituloPagina}><Icone icone="fa-wand-magic-sparkles" cor={AZUL} /> O que mudou no portal</h1>
          <div style={{ fontSize: 13.5, color: T2, marginTop: 6 }}>Mudanças nas telas que você usa, da mais recente para a mais antiga.</div>
        </div>
        {podeCriar && (
          <button type="button" className="kb-btn" style={botao()} onClick={() => setCriando((v) => !v)}>
            <i className={`fa-solid ${criando ? "fa-xmark" : "fa-pen"}`} style={{ color: AZUL }} /> {criando ? "Cancelar" : "Escrever novidade"}
          </button>
        )}
      </div>

      {erro && <div style={{ ...card, padding: "12px 16px", background: "#fef3c7", color: "#92400e", fontSize: 13.5, marginBottom: 14 }}>{erro}</div>}

      {criando && <FormNovidade modulos={modulosParaCriar} aoSalvar={() => { setCriando(false); void carregar(); }} />}

      {dados && dados.rascunhos.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={tituloSecao}>
            <Icone icone="fa-hourglass-half" cor="#d97706" tam={32} /> Para você aprovar
            <span style={contador("#d97706")}>{dados.rascunhos.length}</span>
          </h2>
          <p style={{ fontSize: 13.5, color: T2, margin: "-2px 0 12px" }}>
            Rascunhos escritos pela IA a partir do que foi publicado no sistema. Ninguém vê até você publicar. Corrija o que não fizer sentido para quem usa a tela.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {dados.rascunhos.map((n) => <Rascunho key={n.id} n={n} aoMudar={carregar} />)}
          </div>
        </section>
      )}

      <section>
        <h2 style={tituloSecao}><Icone icone="fa-clock-rotate-left" cor={AZUL} tam={32} /> Histórico</h2>
        {modulosHist.length > 1 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <button type="button" onClick={() => setFiltro("")} style={pilula("#475569", !filtro)}>
              <i className="fa-solid fa-layer-group" style={{ color: "#475569" }} /> Todos
            </button>
            {modulosHist.map(([m, n]) => {
              const cor = corModulo(m);
              return (
                <button key={m} type="button" onClick={() => setFiltro(filtro === m ? "" : m)} style={pilula(cor, filtro === m)}>
                  <i className={`fa-solid ${iconeModulo(m)}`} style={{ color: cor }} /> {rotuloModulo(m)}
                  <span style={contador(cor)}>{n}</span>
                </button>
              );
            })}
          </div>
        )}
        {!dados ? <div style={vazio}>Carregando…</div> : porDia.length === 0 ? <div style={vazio}>Nenhuma novidade publicada ainda.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {porDia.map(([dia, lista]) => (
              <div key={dia}>
                <div style={{ fontSize: 13.5, color: T2, margin: "0 0 8px 2px" }}>{rotuloDia(dia)}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(420px, 100%), 1fr))", gap: 12, alignItems: "start" }}>
                  {lista.map((n) => (
                    <article key={n.id} className="kb-card kb-hover" style={{ ...card, ["--kb-cor" as string]: corModulo(n.modulo) }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <IconeModulo modulo={n.modulo} tam={40} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.3 }}>{n.titulo}</div>
                          <div style={{ fontSize: 12.5, color: T2, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                            <span style={{ color: corModulo(n.modulo) }}>{rotuloModulo(n.modulo)}</span>
                            {n.publicado_por_nome && <span>· {n.publicado_por_nome}</span>}
                          </div>
                        </div>
                        {!n.lida && <Selo cor="#dc2626">nova</Selo>}
                      </div>
                      <ArtigoView corpo={mdParaBlocos(n.texto)} compacto />
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function rotuloDia(dia: string) {
  const hoje = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
  if (dia === iso(hoje)) return "Hoje";
  if (dia === iso(ontem)) return "Ontem";
  const d = new Date(`${dia}T12:00:00`);
  const semana = d.toLocaleDateString("pt-BR", { weekday: "long" });
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${dataBR(dia)}`;
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
    <article style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <IconeModulo modulo={n.modulo} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: corModulo(n.modulo) }}>{rotuloModulo(n.modulo)}</div>
          <div style={{ fontSize: 12.5, color: T2 }}>{n.origem === "ia" ? "Rascunho da IA" : "Texto direto dos commits"} · {new Date(n.criado_em).toLocaleString("pt-BR")}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, color: T2 }}>Título</div>
          <input style={campo} value={tituloN} onChange={(e) => setTituloN(e.target.value)} placeholder="Título" />
          <div style={{ fontSize: 13, color: T2 }}>Texto</div>
          <textarea style={{ ...campo, resize: "vertical", minHeight: 130, lineHeight: 1.5 }} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="- uma mudança por linha" />
          <div style={{ fontSize: 12, color: T3 }}>Uma mudança por linha, começando com <code>- </code>.</div>
        </div>
        <div style={{ background: "var(--portal-bg-secondary, #f8fafc)", border: "1px solid var(--portal-border, #e2e8f0)", borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 13, color: T2, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}><i className="fa-solid fa-eye" /> Como o usuário vê</div>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8, color: T1 }}>{tituloN}</div>
          <ArtigoView corpo={mdParaBlocos(texto)} compacto />
        </div>
      </div>
      {n.commits.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button type="button" onClick={() => setVerCommits((v) => !v)} style={{ background: "none", border: "none", padding: 0, fontSize: 13, color: AZUL, cursor: "pointer", fontFamily: "inherit" }}>
            <i className={`fa-solid ${verCommits ? "fa-chevron-down" : "fa-chevron-right"}`} style={{ fontSize: 11, marginRight: 6 }} />
            De onde saiu ({n.commits.length} alteraç{n.commits.length > 1 ? "ões" : "ão"} no sistema)
          </button>
          {verCommits && <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5, color: T2 }}>{n.commits.map((c) => <li key={c.sha}><code>{c.sha}</code> {c.titulo}</li>)}</ul>}
        </div>
      )}
      {erro && <div style={{ marginTop: 10, fontSize: 13, color: "#991b1b" }}>{erro}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        <button type="button" style={botao(AZUL, true)} disabled={!!ocupado} onClick={() => agir("publicar")}>
          <i className="fa-solid fa-paper-plane" /> {ocupado === "publicar" ? "Publicando…" : "Publicar"}
        </button>
        <button type="button" className="kb-btn" style={botao()} disabled={!!ocupado} onClick={() => agir("salvar")}>
          <i className="fa-solid fa-floppy-disk" style={{ color: AZUL }} /> Salvar rascunho
        </button>
        <button type="button" className="kb-btn" style={{ ...botao("#dc2626"), marginLeft: "auto", color: "#b91c1c" }} disabled={!!ocupado} onClick={() => agir("descartar")}>
          <i className="fa-solid fa-trash-can" /> Descartar
        </button>
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
    <section style={{ ...card, marginBottom: 22 }}>
      <h2 style={tituloSecao}><Icone icone="fa-pen" cor={AZUL} tam={32} /> Nova novidade</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
        <label style={{ flex: "0 0 220px", maxWidth: "100%" }}>
          <div style={{ fontSize: 13, color: T2, marginBottom: 4 }}>Módulo</div>
          <select style={campo} value={modulo} onChange={(e) => setModulo(e.target.value)}>
            {modulos.map((m) => <option key={m} value={m}>{rotuloModulo(m)}</option>)}
          </select>
        </label>
        <label style={{ flex: "1 1 200px", minWidth: 0 }}>
          <div style={{ fontSize: 13, color: T2, marginBottom: 4 }}>Título</div>
          <input style={campo} value={tituloN} onChange={(e) => setTituloN(e.target.value)} placeholder="Título da novidade" />
        </label>
      </div>
      <div style={{ fontSize: 13, color: T2, marginBottom: 4 }}>Texto</div>
      <textarea style={{ ...campo, resize: "vertical", minHeight: 100 }} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="- uma mudança por linha" />
      {erro && <div style={{ marginTop: 8, fontSize: 13, color: "#991b1b" }}>{erro}</div>}
      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <button type="button" style={botao(AZUL, true)} disabled={ocupado} onClick={salvar}><i className="fa-solid fa-plus" /> Criar rascunho</button>
        <span style={{ fontSize: 12.5, color: T3 }}>Entra em “Para você aprovar”; só aparece para a equipe depois de publicar.</span>
      </div>
    </section>
  );
}
