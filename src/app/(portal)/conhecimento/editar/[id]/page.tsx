"use client";
// Editor de artigo da base de conhecimento. `/conhecimento/editar/novo?modulo=pos&tela=/pos`
// cria; `/conhecimento/editar/<id>` edita. Salvar nunca muda o que o leitor vê:
// quem publica é o responsável do módulo (ou admin).

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import ArtigoView from "@/components/conhecimento/Artigo";
import EditorBlocos from "@/components/conhecimento/EditorBlocos";
import { limparCacheAjuda } from "@/components/conhecimento/BotaoAjuda";
import { conteudoEmEdicao, TIPOS_ARTIGO, type Artigo, type Conteudo, type TipoArtigo } from "@/lib/conhecimento/artigos";
import type { Bloco } from "@/lib/conhecimento/blocos";
import { acaoArtigo, criarArtigo, ErroApi, obterArtigo, rascunhar, type ArtigoResposta } from "@/lib/conhecimento/client";
import { MODULOS_KB, rotuloModulo } from "@/lib/conhecimento/modulos";

export default function Page() {
  return <Suspense fallback={null}><EditorPage /></Suspense>;
}

function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const novo = id === "novo";
  const search = useSearchParams();
  const router = useRouter();

  const [dados, setDados] = useState<ArtigoResposta | null>(null);
  const [modulo, setModulo] = useState(search.get("modulo") || "pos");
  const [titulo, setTitulo] = useState("");
  const [resumo, setResumo] = useState("");
  const [tipo, setTipo] = useState<TipoArtigo>("tela");
  const [telas, setTelas] = useState(search.get("tela") || "");
  const [tags, setTags] = useState("");
  const [ordem, setOrdem] = useState(0);
  const [corpo, setCorpo] = useState<Bloco[]>([]);
  const [versaoCorpo, setVersaoCorpo] = useState(0);
  const [sujo, setSujo] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [previa, setPrevia] = useState(true);
  // publicar
  const [resumoMudanca, setResumoMudanca] = useState("");
  const [relevante, setRelevante] = useState(false);
  // IA
  const [iaAberta, setIaAberta] = useState(false);
  const [material, setMaterial] = useState("");
  const [instrucao, setInstrucao] = useState("");

  const aplicarConteudo = useCallback((c: Conteudo) => {
    setTitulo(c.titulo); setResumo(c.resumo ?? ""); setTipo(c.tipo); setTelas(c.telas.join(", ")); setTags(c.tags.join(", ")); setOrdem(c.ordem);
    setCorpo(c.corpo); setVersaoCorpo((v) => v + 1); setSujo(false);
  }, []);

  const carregar = useCallback(async () => {
    if (novo) return;
    try {
      const r = await obterArtigo(id);
      setDados(r); setModulo(r.artigo.modulo); aplicarConteudo(conteudoEmEdicao(r.artigo));
    } catch (e) {
      setAviso({ tipo: "erro", texto: e instanceof ErroApi && e.migracaoFaltando ? "A base de conhecimento ainda não foi instalada no banco." : (e as Error).message });
    }
  }, [id, novo, aplicarConteudo]);

  useEffect(() => { void carregar(); }, [carregar]);

  useEffect(() => {
    if (!sujo) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sujo]);

  const conteudo = useMemo(() => ({
    titulo, resumo: resumo || null, tipo, corpo, ordem,
    telas: telas.split(",").map((t) => t.trim()).filter(Boolean),
    tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
  }), [titulo, resumo, tipo, corpo, ordem, telas, tags]);

  const marcar = <T,>(set: (v: T) => void) => (v: T) => { set(v); setSujo(true); };

  async function executar(nome: string, fn: () => Promise<void>) {
    setOcupado(nome); setAviso(null);
    try { await fn(); } catch (e) { setAviso({ tipo: "erro", texto: (e as Error).message }); } finally { setOcupado(null); }
  }

  const salvar = () => executar("salvar", async () => {
    if (novo) {
      const r = await criarArtigo({ ...conteudo, modulo });
      setSujo(false);
      router.replace(`/conhecimento/editar/${r.artigo.id}`);
      return;
    }
    const r = await acaoArtigo(id, { acao: "salvar", ...conteudo });
    setSujo(false);
    setAviso({ tipo: "ok", texto: dados?.podePublicar ? "Rascunho salvo. Publique quando estiver pronto." : `Rascunho salvo. ${dados?.responsavel || "O responsável"} foi avisado para aprovar.` });
    if (r.artigo) setDados((d) => (d ? { ...d, artigo: r.artigo as Artigo } : d));
  });

  const publicar = () => executar("publicar", async () => {
    const r = await acaoArtigo(id, { acao: "publicar", ...conteudo, resumo_mudanca: resumoMudanca, relevante });
    setSujo(false); setResumoMudanca(""); setRelevante(false);
    limparCacheAjuda(); // o "?" das telas relê na próxima abertura
    setAviso({ tipo: "ok", texto: `Publicado (versão ${r.artigo?.versao}). Já aparece no botão "?" das telas ${conteudo.telas.join(", ") || "ligadas"}.` });
    await carregar();
  });

  const simples = (acao: "descartar" | "arquivar" | "reabrir", confirmar: string) => () => {
    if (!confirm(confirmar)) return;
    void executar(acao, async () => { await acaoArtigo(id, { acao }); await carregar(); setAviso({ tipo: "ok", texto: "Feito." }); });
  };

  const emDia = () => executar("revisado", async () => {
    await acaoArtigo(id, { acao: "revisado" });
    limparCacheAjuda();
    await carregar();
    setAviso({ tipo: "ok", texto: "Marcado como em dia. O aviso de \"pode estar desatualizado\" saiu do artigo." });
  });

  const gerar = (modo: "ia" | "converter") => executar(modo, async () => {
    if (corpo.length && !confirm("Isso substitui o conteúdo atual do artigo. Continuar?")) return;
    const r = await rascunhar({ modo, material, titulo: titulo || undefined, tela: conteudo.telas[0], instrucao: instrucao || undefined });
    if (modo === "ia") { if (r.titulo && !titulo) setTitulo(r.titulo); if (r.resumo && !resumo) setResumo(r.resumo); }
    setCorpo(r.corpo); setVersaoCorpo((v) => v + 1); setSujo(true); setIaAberta(false);
    setAviso({ tipo: "ok", texto: modo === "ia" ? "Rascunho gerado pela IA. Revise antes de salvar: a IA só escreve com base no material colado." : "Texto convertido em blocos." });
  });

  const a = dados?.artigo;
  const podePublicar = novo ? false : !!dados?.podePublicar;
  const estado = novo ? "novo" : a?.status === "arquivado" ? "arquivado" : a?.status === "rascunho" ? "rascunho" : a?.rascunho ? "edicao" : "publicado";

  return (
    <div style={{ paddingTop: 20, maxWidth: 1280, margin: "0 auto", fontFamily: "Inter, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12, fontSize: 12 }}>
        <Link href="/conhecimento" style={{ color: "#0369a1", fontWeight: 700, textDecoration: "none" }}>← Base de conhecimento</Link>
        {a && a.status === "publicado" && <Link href={`/conhecimento/${a.slug}`} style={{ color: "var(--portal-text-secondary)", textDecoration: "none" }}>ver como leitor</Link>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          {estado === "novo" && <Selo cor="#475569" bg="#f1f5f9">novo artigo</Selo>}
          {estado === "rascunho" && <Selo cor="#92400e" bg="#fef3c7">rascunho · nunca publicado</Selo>}
          {estado === "edicao" && <Selo cor="#1e40af" bg="#dbeafe">edição pendente · leitor vê a v{a?.versao}</Selo>}
          {estado === "publicado" && <Selo cor="#15803d" bg="#d1fae5">publicado · v{a?.versao}</Selo>}
          {estado === "arquivado" && <Selo cor="#475569" bg="#f1f5f9">arquivado</Selo>}
          {a?.revisao_pendente_desde && <Selo cor="#991b1b" bg="#fee2e2">pode estar desatualizado</Selo>}
        </span>
      </div>

      {aviso && (
        <div style={{ padding: "10px 14px", borderRadius: 10, marginBottom: 12, fontSize: 13, background: aviso.tipo === "ok" ? "#d1fae5" : "#fee2e2", color: aviso.tipo === "ok" ? "#065f46" : "#991b1b" }}>{aviso.texto}</div>
      )}

      {a?.revisao_pendente_desde && (
        <RevisaoPendente desde={a.revisao_pendente_desde} motivo={a.revisao_motivo} podePublicar={podePublicar} ocupado={!!ocupado} aoConfirmar={emDia} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: previa ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        {/* ---------- formulário ---------- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <section style={caixa}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 10 }}>
              <Campo rotulo="Título">
                <input style={campo} value={titulo} onChange={(e) => marcar(setTitulo)(e.target.value)} placeholder="O que a pessoa vai conseguir fazer ou entender" />
              </Campo>
              <Campo rotulo="Módulo">
                {novo ? (
                  <select style={campo} value={modulo} onChange={(e) => setModulo(e.target.value)}>
                    {MODULOS_KB.map((m) => <option key={m.id} value={m.id}>{m.rotulo}</option>)}
                  </select>
                ) : <div style={{ ...campo, background: "var(--portal-bg-subtle, #f8fafc)" }}>{rotuloModulo(modulo)}</div>}
              </Campo>
            </div>
            <Campo rotulo="Resumo (uma frase; aparece na busca e na lista do botão ?)">
              <input style={campo} value={resumo} onChange={(e) => marcar(setResumo)(e.target.value)} placeholder="Opcional" />
            </Campo>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) 90px", gap: 10 }}>
              <Campo rotulo="Telas onde aparece (separe por vírgula)">
                <input style={campo} value={telas} onChange={(e) => marcar(setTelas)(e.target.value)} placeholder="/pos, /pos/dashboard" />
              </Campo>
              <Campo rotulo="Tipo">
                <select style={campo} value={tipo} onChange={(e) => marcar(setTipo)(e.target.value as TipoArtigo)}>
                  {TIPOS_ARTIGO.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Ordem">
                <input style={campo} type="number" min={0} value={ordem} onChange={(e) => marcar(setOrdem)(Number(e.target.value) || 0)} />
              </Campo>
            </div>
            <Campo rotulo="Palavras-chave (separe por vírgula)">
              <input style={campo} value={tags} onChange={(e) => marcar(setTags)(e.target.value)} placeholder="orçamento, fase, omie" />
            </Campo>
          </section>

          <section style={caixa}>
            <button type="button" onClick={() => setIaAberta((v) => !v)} style={{ ...btnSec, width: "100%", textAlign: "left" }}>
              ✨ {iaAberta ? "Fechar" : "Rascunhar com IA ou colar um texto"}
            </button>
            {iaAberta && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                <div style={{ fontSize: 12, color: "var(--portal-text-secondary)" }}>
                  Cole o material (manual, e-mail, anotação, trecho de documento). A IA escreve <strong>só</strong> com o que está aqui e o resultado entra como rascunho para você revisar.
                </div>
                <textarea style={{ ...campo, resize: "vertical", minHeight: 140, fontFamily: "inherit" }} value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="Material de origem…" />
                <input style={campo} value={instrucao} onChange={(e) => setInstrucao(e.target.value)} placeholder="Pedido para a IA (opcional): ex. foque em quem abre a OS pela primeira vez" />
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" style={btnPrimario} disabled={!!ocupado || material.trim().length < 40} onClick={() => gerar("ia")}>{ocupado === "ia" ? "Gerando…" : "IA rascunha o artigo"}</button>
                  <button type="button" style={btnSec} disabled={!!ocupado || !material.trim()} onClick={() => gerar("converter")}>{ocupado === "converter" ? "Convertendo…" : "Só converter o texto em blocos"}</button>
                </div>
              </div>
            )}
          </section>

          <section style={caixa}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--portal-text-secondary)", flex: 1 }}>Conteúdo</h2>
              <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={previa} onChange={(e) => setPrevia(e.target.checked)} /> prévia ao lado</label>
            </div>
            <EditorBlocos corpo={corpo} versao={versaoCorpo} onChange={(c) => { setCorpo(c); setSujo(true); }} />
          </section>

          {/* ---------- ações ---------- */}
          <section style={{ ...caixa, position: "sticky", bottom: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" style={btnSec} disabled={!!ocupado} onClick={salvar}>{ocupado === "salvar" ? "Salvando…" : novo ? "Criar rascunho" : "Salvar rascunho"}</button>
              {!novo && estado === "edicao" && <button type="button" style={btnSec} disabled={!!ocupado} onClick={simples("descartar", "Descartar a edição pendente e voltar ao que está publicado?")}>Descartar edição</button>}
              {!novo && podePublicar && estado !== "arquivado" && <button type="button" style={btnSec} disabled={!!ocupado} onClick={simples("arquivar", "Arquivar este artigo? Ele some do botão \"?\" e da busca.")}>Arquivar</button>}
              {!novo && podePublicar && estado === "arquivado" && <button type="button" style={btnSec} disabled={!!ocupado} onClick={simples("reabrir", "Reabrir este artigo?")}>Reabrir</button>}
              {sujo && <span style={{ fontSize: 11, color: "#92400e" }}>alterações não salvas</span>}
            </div>
            {!novo && podePublicar && estado !== "arquivado" && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--portal-border)", display: "flex", flexDirection: "column", gap: 8 }}>
                <input style={campo} value={resumoMudanca} onChange={(e) => setResumoMudanca(e.target.value)} placeholder={a && a.versao > 0 ? "O que mudou nesta versão (uma frase, aparece no histórico)" : "Primeira publicação"} />
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }} title="Mudança que a equipe precisa reaprender (usado pelo treinamento)">
                    <input type="checkbox" checked={relevante} onChange={(e) => setRelevante(e.target.checked)} /> mudança relevante
                  </label>
                  <button type="button" style={{ ...btnPrimario, marginLeft: "auto" }} disabled={!!ocupado} onClick={publicar}>{ocupado === "publicar" ? "Publicando…" : a && a.versao > 0 ? `Publicar versão ${a.versao + 1}` : "Publicar"}</button>
                </div>
              </div>
            )}
            {!novo && !podePublicar && (
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--portal-text-secondary)" }}>
                Quem publica é {dados?.responsavel ? <strong>{dados.responsavel}</strong> : "o responsável do módulo"}. Ao salvar, ele é avisado.
              </div>
            )}
          </section>

          {dados && dados.versoes.length > 0 && (
            <section style={caixa}>
              <h2 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--portal-text-secondary)" }}>Histórico</h2>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                {dados.versoes.map((v) => (
                  <li key={v.versao}>
                    <strong>v{v.versao}</strong> · {new Date(v.publicado_em).toLocaleString("pt-BR")} · {v.publicado_por_nome || "—"}
                    {v.resumo_mudanca && <> — {v.resumo_mudanca}</>}{v.relevante && <span style={{ color: "#991b1b", fontWeight: 700 }}> · relevante</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* ---------- prévia ---------- */}
        {previa && (
          <div style={{ ...caixa, position: "sticky", top: 96, maxHeight: "calc(100vh - 120px)", overflowY: "auto" }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--portal-text-muted)", marginBottom: 10 }}>Prévia · como o leitor vê</div>
            <h1 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800, color: "var(--portal-text)" }}>{titulo || <span style={{ opacity: 0.4 }}>Sem título</span>}</h1>
            {resumo && <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--portal-text-secondary)" }}>{resumo}</p>}
            {corpo.length ? <ArtigoView corpo={corpo} /> : <div style={{ fontSize: 13, color: "var(--portal-text-muted)", fontStyle: "italic" }}>Adicione blocos ou rascunhe com a IA.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/** O sistema mudou em algo que este artigo documenta: mostra o que mudou e deixa o responsável confirmar ou editar. */
function RevisaoPendente({ desde, motivo, podePublicar, ocupado, aoConfirmar }: { desde: string; motivo: unknown; podePublicar: boolean; ocupado: boolean; aoConfirmar: () => void }) {
  const m = (motivo && typeof motivo === "object" ? motivo : {}) as { commits?: { sha: string; titulo: string }[]; arquivos?: string[] };
  return (
    <div style={{ border: "1.5px solid #fca5a5", background: "#fef2f2", color: "#7f1d1d", borderRadius: 12, padding: "12px 14px", marginBottom: 12, fontSize: 13 }}>
      <div style={{ fontWeight: 800 }}>⚠️ O sistema mudou em {new Date(desde).toLocaleDateString("pt-BR")} e este artigo pode ter ficado desatualizado.</div>
      {m.commits && m.commits.length > 0 && (
        <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12 }}>
          {m.commits.map((c) => <li key={c.sha}>{c.titulo}</li>)}
        </ul>
      )}
      {m.arquivos && m.arquivos.length > 0 && (
        <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>Partes do sistema tocadas: {m.arquivos.map((f) => f.split("/").slice(-2).join("/")).join(" · ")}</div>
      )}
      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {podePublicar ? (
          <>
            <button type="button" disabled={ocupado} onClick={aoConfirmar} style={{ padding: "7px 14px", borderRadius: 10, border: "1.5px solid #15803d", background: "#fefefe", color: "#15803d", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>✓ Conferi, o texto continua valendo</button>
            <span style={{ fontSize: 12 }}>ou edite abaixo e publique uma versão nova.</span>
          </>
        ) : <span style={{ fontSize: 12 }}>O responsável do módulo confirma ou publica a correção.</span>}
      </div>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--portal-text-muted)", marginBottom: 4 }}>{rotulo}</div>
      {children}
    </div>
  );
}
function Selo({ cor, bg, children }: { cor: string; bg: string; children: React.ReactNode }) {
  return <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 6, background: bg, color: cor, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: 0.3 }}>{children}</span>;
}

const caixa: React.CSSProperties = { background: "var(--portal-bg-card)", border: "1px solid var(--portal-border)", borderRadius: 14, padding: 14 };
const campo: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--portal-border)", background: "var(--portal-bg-card)", color: "var(--portal-text)", fontSize: 13, fontFamily: "inherit", outline: "none" };
const btnPrimario: React.CSSProperties = { padding: "9px 18px", background: "#0369a1", color: "#fefefe", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const btnSec: React.CSSProperties = { padding: "8px 14px", background: "transparent", color: "var(--portal-text)", border: "1.5px solid var(--portal-border)", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
