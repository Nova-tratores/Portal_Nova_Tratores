"use client";
// Editor de trilha: dados, artigos (etapas), perguntas (com sugestão da IA), ativar, atribuir pessoas.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { botao, campo, card, CSS_KB, Icone, Selo, T1, T2, T3, vazio } from "@/components/conhecimento/estiloKB";
import { MODULOS_KB, rotuloModulo } from "@/lib/conhecimento/modulos";
import { ComoLer, pagina, ROXO, TreinamentoNav } from "@/components/treinamento/TreinamentoNav";
import { acaoTrilha, atribuirPessoas, criarTrilha, ErroApi, listar, obterTrilha, sugerirPerguntas, type ArtigoPublicado, type TrilhaResposta } from "@/lib/treinamento/client";
import { NOTA_MINIMA_PADRAO, PRAZO_DIAS_PADRAO, type Pergunta } from "@/lib/treinamento/regras";

const CATEGORIAS = ["Pós Vendas", "Peças", "Comercial", "Financeiro", "T.I."];
type PerguntaEd = Omit<Pergunta, "id" | "trilha_id"> & { id?: string; chave: string };
let seq = 0;
const nova = (p: Partial<PerguntaEd> = {}): PerguntaEd => ({ chave: `n${++seq}`, enunciado: "", opcoes: ["", "", "", ""], correta: 0, explicacao: null, artigo_id: null, ordem: 0, ativa: true, ...p });

export default function EditarTrilhaPage() {
  const { id } = useParams<{ id: string }>();
  const novo = id === "nova";
  const router = useRouter();
  const [dados, setDados] = useState<TrilhaResposta | null>(null);
  const [artigos, setArtigos] = useState<ArtigoPublicado[]>([]);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [modulo, setModulo] = useState("pos");
  const [publico, setPublico] = useState<string[]>([]);
  const [notaMinima, setNotaMinima] = useState(NOTA_MINIMA_PADRAO);
  const [prazoDias, setPrazoDias] = useState(PRAZO_DIAS_PADRAO);
  const [etapas, setEtapas] = useState<string[]>([]);
  const [perguntas, setPerguntas] = useState<PerguntaEd[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [selPessoas, setSelPessoas] = useState<string[]>([]);
  const [rodada, setRodada] = useState(0);

  useEffect(() => {
    let vivo = true;
    listar(true).then((r) => { if (vivo) setArtigos(r.artigos); }).catch(() => {});
    if (novo) return () => { vivo = false; };
    obterTrilha(id, true).then((r) => {
      if (!vivo) return;
      setDados(r);
      const t = r.trilha;
      setTitulo(t.titulo); setDescricao(t.descricao ?? ""); setModulo(t.modulo); setPublico(t.publico); setNotaMinima(t.nota_minima); setPrazoDias(t.prazo_dias);
      setEtapas(r.etapas.map((e) => e.artigo_id));
      setPerguntas((r.perguntas ?? []).map((p) => ({ ...p, chave: p.id })));
    }).catch((e) => { if (vivo) setAviso({ tipo: "erro", texto: e instanceof ErroApi && e.migracaoFaltando ? "O treinamento ainda não foi instalado no banco." : (e as Error).message }); });
    return () => { vivo = false; };
  }, [id, novo, rodada]);

  const artigosDoModulo = useMemo(() => artigos.filter((a) => a.modulo === modulo && !etapas.includes(a.id)), [artigos, modulo, etapas]);
  const artigoPorId = useMemo(() => new Map(artigos.map((a) => [a.id, a])), [artigos]);
  const dadosTrilha = { titulo, descricao, modulo, publico, obrigatoria: true, nota_minima: notaMinima, prazo_dias: prazoDias, etapas };

  async function executar(nome: string, fn: () => Promise<void>) {
    setOcupado(nome); setAviso(null);
    try { await fn(); } catch (e) { setAviso({ tipo: "erro", texto: (e as Error).message }); } finally { setOcupado(null); }
  }
  const salvar = () => executar("salvar", async () => {
    if (novo) { const r = await criarTrilha(dadosTrilha); router.replace(`/treinamento/editar/${r.trilha.id}`); return; }
    await acaoTrilha(id, { acao: "salvar", ...dadosTrilha });
    const limpas = perguntas.filter((p) => p.enunciado.trim()).map((p) => ({ id: p.id, enunciado: p.enunciado, opcoes: p.opcoes.filter((o) => o.trim()), correta: p.correta, explicacao: p.explicacao, artigo_id: p.artigo_id, ordem: p.ordem, ativa: p.ativa }));
    await acaoTrilha(id, { acao: "perguntas", perguntas: limpas });
    setAviso({ tipo: "ok", texto: "Trilha salva." }); setRodada((n) => n + 1);
  });
  const mudarStatus = (acao: "ativar" | "arquivar" | "rascunho") => executar(acao, async () => {
    if (acao === "ativar" && !confirm(`Ativar a trilha? Todo mundo da categoria ${publico.join(", ") || "(nenhuma — só atribuição manual)"} recebe com prazo de ${prazoDias} dias.`)) return;
    await salvar();
    const r = await acaoTrilha(id, { acao });
    setAviso({ tipo: "ok", texto: acao === "ativar" ? `Trilha ativa. ${r.atribuidas ?? 0} pessoa(s) receberam agora.` : "Feito." }); setRodada((n) => n + 1);
  });
  const atribuir = () => executar("atribuir", async () => {
    const r = await atribuirPessoas(id, selPessoas);
    setAviso({ tipo: "ok", texto: `${r.atribuidas} pessoa(s) atribuída(s).` }); setSelPessoas([]); setRodada((n) => n + 1);
  });
  const sugerir = (artigoId: string) => executar(`ia:${artigoId}`, async () => {
    const r = await sugerirPerguntas(artigoId, 3);
    setPerguntas((ps) => [...ps, ...r.perguntas.map((p) => nova(p))]);
    setAviso({ tipo: "ok", texto: `${r.perguntas.length} pergunta(s) sugeridas pela IA — revise e salve.` });
  });
  const mover = (i: number, d: -1 | 1) => setEtapas((es) => { const j = i + d; if (j < 0 || j >= es.length) return es; const c = [...es]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  const setP = (chave: string, patch: Partial<PerguntaEd>) => setPerguntas((ps) => ps.map((p) => (p.chave === chave ? { ...p, ...patch } : p)));

  const t = dados?.trilha;
  const status = t?.status ?? "nova";

  return (
    <div style={pagina}>
      <style>{CSS_KB}</style>
      <TreinamentoNav podeGerir />
      <ComoLer itens={[
        <><b>Artigos</b>: só artigos publicados do módulo escolhido entram; a ordem aqui é a ordem de leitura.</>,
        <><b>Perguntas</b>: múltipla escolha, uma certa. O botão ✨ IA ao lado do artigo lê o texto e propõe 3 perguntas; revise antes de salvar. Pergunta ligada a um artigo entra na reciclagem quando esse artigo mudar.</>,
        <><b>Público</b>: categorias (Admin) que recebem a trilha sozinhas ao ativar e quando a pessoa entra. Outras pessoas: <b>Atribuir</b> embaixo.</>,
      ]} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12, fontSize: 12.5 }}>
        <Link href="/treinamento/trilhas" style={{ color: ROXO, textDecoration: "none" }}>← Trilhas</Link>
        <Selo cor={status === "ativa" ? "#15803d" : status === "arquivada" ? "#64748b" : "#92400e"}>{status === "nova" ? "nova trilha" : status}</Selo>
        {t && <Link href={`/treinamento/${t.id}`} style={{ color: T2, textDecoration: "none" }}>ver como a pessoa vê</Link>}
      </div>
      {aviso && <div style={{ ...card, marginBottom: 12, fontSize: 13.5, color: aviso.tipo === "ok" ? "#065f46" : "#991b1b" }}>{aviso.texto}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 14, alignItems: "start" }}>
        {/* dados */}
        <section style={card}>
          <h2 style={h2}><Icone icone="fa-route" cor={ROXO} tam={32} /> Dados da trilha</h2>
          <Campo rotulo="Título"><input style={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Pós-Vendas — operação da OS" /></Campo>
          <Campo rotulo="Descrição (opcional)"><input style={campo} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></Campo>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Campo rotulo="Módulo"><select style={campo} value={modulo} onChange={(e) => { setModulo(e.target.value); setEtapas([]); }} disabled={!novo && status === "ativa"}>{MODULOS_KB.map((m) => <option key={m.id} value={m.id}>{m.rotulo}</option>)}</select></Campo>
            <Campo rotulo="Nota mínima %"><input style={campo} type="number" min={0} max={100} value={notaMinima} onChange={(e) => setNotaMinima(Number(e.target.value))} /></Campo>
            <Campo rotulo="Prazo (dias)"><input style={campo} type="number" min={1} max={365} value={prazoDias} onChange={(e) => setPrazoDias(Number(e.target.value))} /></Campo>
          </div>
          <Campo rotulo="Público (quem recebe sozinho)">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {CATEGORIAS.map((c) => { const on = publico.includes(c); return <button key={c} type="button" onClick={() => setPublico((p) => (on ? p.filter((x) => x !== c) : [...p, c]))} style={{ ...botao(on ? ROXO : "#94a3b8", on), height: 32, fontSize: 13 }}>{c}</button>; })}
            </div>
          </Campo>
        </section>

        {/* etapas */}
        <section style={card}>
          <h2 style={h2}><Icone icone="fa-list-ol" cor={ROXO} tam={32} /> Artigos, na ordem de leitura</h2>
          {etapas.length === 0 && <div style={{ fontSize: 13, color: T3, marginBottom: 8 }}>Nenhum artigo ainda. Escolha abaixo.</div>}
          {etapas.map((aid, i) => (
            <div key={aid} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--portal-border, #e2e8f0)", fontSize: 13.5 }}>
              <span style={{ color: T3, width: 20 }}>{i + 1}.</span>
              <span style={{ flex: 1, color: T1 }}>{artigoPorId.get(aid)?.titulo ?? aid}</span>
              <button type="button" style={mini} onClick={() => mover(i, -1)} disabled={i === 0}>▲</button>
              <button type="button" style={mini} onClick={() => mover(i, 1)} disabled={i === etapas.length - 1}>▼</button>
              {!novo && <button type="button" style={mini} onClick={() => sugerir(aid)} disabled={!!ocupado} title="Sugerir perguntas com IA sobre este artigo">{ocupado === `ia:${aid}` ? "…" : "✨ IA"}</button>}
              <button type="button" style={{ ...mini, color: "#991b1b" }} onClick={() => setEtapas((es) => es.filter((x) => x !== aid))}>✕</button>
            </div>
          ))}
          <select style={{ ...campo, marginTop: 10 }} value="" onChange={(e) => { if (e.target.value) setEtapas((es) => [...es, e.target.value]); }}>
            <option value="">+ adicionar artigo publicado de {rotuloModulo(modulo)}…</option>
            {artigosDoModulo.map((a) => <option key={a.id} value={a.id}>{a.titulo}</option>)}
          </select>
          {artigosDoModulo.length === 0 && etapas.length === 0 && <div style={{ fontSize: 12.5, color: T3, marginTop: 6 }}>Não há artigo publicado neste módulo. Publique na <Link href="/conhecimento">base de conhecimento</Link> primeiro.</div>}
        </section>
      </div>

      {/* perguntas */}
      <section style={{ ...card, marginTop: 14 }}>
        <h2 style={h2}><Icone icone="fa-clipboard-question" cor={ROXO} tam={32} /> Prova <span style={{ fontSize: 12.5, color: T3, fontWeight: 400 }}>{perguntas.length} pergunta{perguntas.length !== 1 ? "s" : ""}{novo ? " · salve a trilha para adicionar perguntas" : ""}</span></h2>
        {!novo && perguntas.map((p, i) => (
          <div key={p.chave} style={{ padding: "12px 0", borderBottom: "1px solid var(--portal-border, #e2e8f0)" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ color: T3, paddingTop: 10, width: 24 }}>{i + 1}.</span>
              <div style={{ flex: 1, display: "grid", gap: 6 }}>
                <input style={campo} value={p.enunciado} onChange={(e) => setP(p.chave, { enunciado: e.target.value })} placeholder="Pergunta" />
                {p.opcoes.map((o, k) => (
                  <label key={k} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                    <input type="radio" name={`c-${p.chave}`} checked={p.correta === k} onChange={() => setP(p.chave, { correta: k })} title="Esta é a certa" />
                    <input style={{ ...campo, padding: "6px 10px" }} value={o} onChange={(e) => setP(p.chave, { opcoes: p.opcoes.map((x, j) => (j === k ? e.target.value : x)) })} placeholder={`Opção ${k + 1}`} />
                    {p.opcoes.length > 2 && <button type="button" style={mini} onClick={() => setP(p.chave, { opcoes: p.opcoes.filter((_, j) => j !== k), correta: p.correta >= k && p.correta > 0 ? p.correta - 1 : p.correta })}>✕</button>}
                  </label>
                ))}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {p.opcoes.length < 6 && <button type="button" style={mini} onClick={() => setP(p.chave, { opcoes: [...p.opcoes, ""] })}>+ opção</button>}
                  <input style={{ ...campo, padding: "6px 10px", flex: 1 }} value={p.explicacao ?? ""} onChange={(e) => setP(p.chave, { explicacao: e.target.value || null })} placeholder="Explicação da resposta certa (aparece para quem errar)" />
                  <select style={{ ...campo, width: 220, padding: "6px 10px" }} value={p.artigo_id ?? ""} onChange={(e) => setP(p.chave, { artigo_id: e.target.value || null })} title="De qual artigo vem (reciclagem)">
                    <option value="">artigo: nenhum</option>
                    {etapas.map((aid) => <option key={aid} value={aid}>{artigoPorId.get(aid)?.titulo?.slice(0, 40)}</option>)}
                  </select>
                </div>
              </div>
              <button type="button" style={{ ...mini, color: "#991b1b", marginTop: 8 }} onClick={() => setPerguntas((ps) => ps.filter((x) => x.chave !== p.chave))}>✕</button>
            </div>
          </div>
        ))}
        {!novo && <button type="button" style={{ ...botao(ROXO), marginTop: 10 }} onClick={() => setPerguntas((ps) => [...ps, nova()])}><i className="fa-solid fa-plus" /> Pergunta</button>}
      </section>

      {/* ações */}
      <section style={{ ...card, marginTop: 14, position: "sticky", bottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" style={botao(ROXO, true)} disabled={!!ocupado} onClick={salvar}>{ocupado === "salvar" ? "Salvando…" : novo ? "Criar trilha" : "Salvar"}</button>
        {!novo && status !== "ativa" && <button type="button" style={botao("#15803d", true)} disabled={!!ocupado} onClick={() => mudarStatus("ativar")}><i className="fa-solid fa-play" /> Ativar e atribuir ao público</button>}
        {!novo && status === "ativa" && <button type="button" style={botao("#64748b")} disabled={!!ocupado} onClick={() => mudarStatus("arquivar")}>Arquivar</button>}
        {!novo && status === "arquivada" && <button type="button" style={botao("#64748b")} disabled={!!ocupado} onClick={() => mudarStatus("rascunho")}>Voltar a rascunho</button>}
      </section>

      {/* atribuir */}
      {!novo && dados?.pessoas && (
        <section style={{ ...card, marginTop: 14 }}>
          <h2 style={h2}><Icone icone="fa-user-plus" cor={ROXO} tam={32} /> Atribuir a outras pessoas</h2>
          {status !== "ativa" ? <div style={{ fontSize: 13, color: T3 }}>Ative a trilha para atribuir.</div> : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(220px, 100%), 1fr))", gap: 4, maxHeight: 260, overflowY: "auto", fontSize: 13.5 }}>
                {dados.pessoas.map((u) => (
                  <label key={u.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 6px", color: T1 }}>
                    <input type="checkbox" checked={selPessoas.includes(u.id)} onChange={(e) => setSelPessoas((s) => (e.target.checked ? [...s, u.id] : s.filter((x) => x !== u.id)))} />
                    {u.nome}{u.categoria && <span style={{ color: T3, fontSize: 12 }}>· {u.categoria}</span>}
                  </label>
                ))}
              </div>
              <button type="button" style={{ ...botao(ROXO, true), marginTop: 10 }} disabled={!!ocupado || !selPessoas.length} onClick={atribuir}>Atribuir ({selPessoas.length})</button>
            </>
          )}
        </section>
      )}
      {!dados && !novo && !aviso && <div style={vazio}>Carregando…</div>}
    </div>
  );
}

const h2: React.CSSProperties = { margin: "0 0 12px", fontSize: 15, fontWeight: 500, color: T1, display: "flex", alignItems: "center", gap: 10 };
const mini: React.CSSProperties = { fontSize: 12, padding: "3px 8px", borderRadius: 7, border: "1px solid var(--portal-border, #e2e8f0)", background: "transparent", color: T2, cursor: "pointer", fontFamily: "inherit" };
function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 10 }}><div style={{ fontSize: 12, color: T3, marginBottom: 4 }}>{rotulo}</div>{children}</div>;
}
