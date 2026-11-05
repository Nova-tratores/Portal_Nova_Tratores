"use client";
// Fazer a trilha: artigo por artigo ("Li e entendi"), depois a prova. Quem gere vê também os botões de gestão.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ArtigoView from "@/components/conhecimento/Artigo";
import { botao, card, CSS_KB, Icone, Selo, T1, T2, T3, vazio, dataBR } from "@/components/conhecimento/estiloKB";
import { corModulo, rotuloModulo } from "@/lib/conhecimento/modulos";
import { Barra, ComoLer, pagina, ROXO, TreinamentoNav } from "@/components/treinamento/TreinamentoNav";
import { enviarProva, ErroApi, marcarLido, obterTrilha, type ResultadoProva, type TrilhaResposta } from "@/lib/treinamento/client";
import { SITUACAO_ROTULO } from "@/lib/treinamento/regras";

export default function FazerTrilhaPage() {
  const { id } = useParams<{ id: string }>();
  const [dados, setDados] = useState<TrilhaResposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [rodada, setRodada] = useState(0);
  const [etapaAberta, setEtapaAberta] = useState<string | "prova" | null>(null);
  const [respostas, setRespostas] = useState<Record<string, number>>({});
  const [resultado, setResultado] = useState<ResultadoProva | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    obterTrilha(id).then((r) => { if (vivo) setDados(r); }).catch((e) => { if (vivo) setErro(e instanceof ErroApi && e.migracaoFaltando ? "O treinamento ainda não foi instalado no banco." : (e as Error).message); });
    return () => { vivo = false; };
  }, [id, rodada]);

  const minha = dados?.minha ?? null;
  // abre sozinho onde a pessoa parou
  const alvo = useMemo(() => {
    if (!minha) return null;
    if (minha.progresso.proxima) return minha.progresso.proxima.id;
    if (minha.progresso.faltaProva) return "prova" as const;
    return null;
  }, [minha]);
  const aberta = etapaAberta ?? alvo;

  const li = useCallback(async (etapaId: string) => {
    setOcupado(true);
    try {
      const r = await marcarLido(id, etapaId);
      setDados((d) => (d ? { ...d, minha: r.minha } : d));
      const prox = r.minha.progresso.proxima?.id ?? (r.minha.progresso.faltaProva ? "prova" : null);
      setEtapaAberta(prox);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  }, [id]);

  const enviar = useCallback(async () => {
    setOcupado(true); setErro(null);
    try {
      const r = await enviarProva(id, respostas);
      setResultado(r.resultado);
      setRodada((n) => n + 1);
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  }, [id, respostas]);

  if (erro && !dados) return <div style={pagina}><TreinamentoNav podeGerir={false} /><div style={{ ...card, color: "#991b1b" }}>{erro} · <Link href="/treinamento">voltar</Link></div></div>;
  if (!dados) return <div style={pagina}><TreinamentoNav podeGerir={false} /><div style={vazio}>Carregando…</div></div>;

  const { trilha, artigos } = dados;
  const etapas = minha?.etapas ?? dados.etapas;
  const lidas = new Set(minha?.lidas ?? []);
  const s = minha ? SITUACAO_ROTULO[minha.situacao] : null;
  const perguntas = minha?.prova.perguntas ?? [];
  const todasRespondidas = perguntas.every((p) => typeof respostas[p.id] === "number");

  return (
    <div style={pagina}>
      <style>{CSS_KB}</style>
      <TreinamentoNav podeGerir={dados.podeGerir} />
      <ComoLer itens={[
        <>À esquerda, a lista dos artigos da trilha. Abra um, leia e clique em <b>Li e entendi</b>: o próximo abre sozinho.</>,
        <>A <b>prova</b> aparece no fim da lista e só libera depois de ler tudo. Marque uma opção por pergunta e envie; a nota mínima desta trilha é <b>{trilha.nota_minima}%</b>.</>,
        <>Não passou? A tela mostra o que errou com a explicação. Leia de novo e tente outra vez — não há limite de tentativas.</>,
      ]} />

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <Icone icone="fa-route" cor={corModulo(trilha.modulo)} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: T1 }}>{trilha.titulo}</h1>
          <div style={{ fontSize: 12.5, color: T3 }}>{rotuloModulo(trilha.modulo)} · nota mínima {trilha.nota_minima}% · {trilha.prazo_dias} dias{trilha.descricao ? ` · ${trilha.descricao}` : ""}</div>
        </div>
        {s && minha && <Selo cor={s.cor}><i className={`fa-solid ${s.icone}`} /> {s.rotulo}{minha.situacao !== "concluida" ? ` · até ${dataBR(minha.atribuicao.prazo)}` : ""}</Selo>}
        {dados.podeGerir && <Link href={`/treinamento/editar/${trilha.id}`} style={botao(ROXO)}><i className="fa-solid fa-pen" /> Editar trilha</Link>}
      </div>
      {minha && <div style={{ marginBottom: 16 }}><Barra pct={minha.progresso.pct} cor={minha.situacao === "concluida" ? "#15803d" : ROXO} /></div>}
      {minha?.atribuicao.motivo && <div style={{ ...card, marginBottom: 14, fontSize: 13.5, color: T2 }}><i className="fa-solid fa-rotate" style={{ color: ROXO }} /> Reciclagem: {minha.atribuicao.motivo}. Releia o que mudou e responda a prova de novo.</div>}
      {!minha && <div style={{ ...card, marginBottom: 14, fontSize: 13.5, color: T2 }}>Você está vendo esta trilha como gestor; ela não foi atribuída a você.</div>}
      {erro && <div style={{ ...card, marginBottom: 14, color: "#991b1b", fontSize: 13.5 }}>{erro}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(min(280px, 100%), 300px) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        {/* ---- lista ---- */}
        <nav style={{ ...card, padding: 8, position: "sticky", top: 96 }}>
          {etapas.map((e, i) => {
            const a = artigos[e.artigo_id];
            const feita = lidas.has(e.id);
            const on = aberta === e.id;
            return (
              <button key={e.id} type="button" onClick={() => setEtapaAberta(e.id)} style={{ width: "100%", textAlign: "left", display: "flex", gap: 10, alignItems: "center", padding: "9px 10px", borderRadius: 10, border: "none", cursor: "pointer", background: on ? `color-mix(in srgb, ${ROXO} 9%, var(--portal-bg-card, #fefefe))` : "transparent", color: T1, fontFamily: "inherit", fontSize: 13.5 }}>
                <span style={{ width: 24, height: 24, borderRadius: 999, display: "grid", placeItems: "center", fontSize: 12, flex: "none", background: feita ? "#15803d" : `color-mix(in srgb, ${ROXO} 12%, var(--portal-bg-card, #fefefe))`, color: feita ? "#fefefe" : ROXO }}>{feita ? <i className="fa-solid fa-check" /> : i + 1}</span>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a?.titulo ?? "Artigo"}</span>
              </button>
            );
          })}
          {perguntas.length > 0 && (
            <button type="button" onClick={() => setEtapaAberta("prova")} disabled={!minha?.prova.podeFazer} style={{ width: "100%", textAlign: "left", display: "flex", gap: 10, alignItems: "center", padding: "9px 10px", borderRadius: 10, border: "none", cursor: minha?.prova.podeFazer ? "pointer" : "not-allowed", opacity: minha?.prova.podeFazer ? 1 : 0.5, background: aberta === "prova" ? `color-mix(in srgb, ${ROXO} 9%, var(--portal-bg-card, #fefefe))` : "transparent", color: T1, fontFamily: "inherit", fontSize: 13.5, marginTop: 4, borderTop: "1px solid var(--portal-border, #e2e8f0)" }}>
              <span style={{ width: 24, height: 24, borderRadius: 999, display: "grid", placeItems: "center", fontSize: 12, flex: "none", background: minha?.prova.aprovado ? "#15803d" : `color-mix(in srgb, ${ROXO} 12%, var(--portal-bg-card, #fefefe))`, color: minha?.prova.aprovado ? "#fefefe" : ROXO }}>{minha?.prova.aprovado ? <i className="fa-solid fa-check" /> : <i className="fa-solid fa-clipboard-question" />}</span>
              <span>Prova · {perguntas.length} pergunta{perguntas.length > 1 ? "s" : ""}</span>
            </button>
          )}
        </nav>

        {/* ---- conteúdo ---- */}
        <div>
          {aberta && aberta !== "prova" && (() => {
            const e = etapas.find((x) => x.id === aberta);
            const a = e ? artigos[e.artigo_id] : null;
            if (!e || !a) return <div style={vazio}>Artigo não encontrado.</div>;
            const feita = lidas.has(e.id);
            return (
              <article style={card}>
                <div style={{ fontSize: 12, color: T3, marginBottom: 4 }}>Artigo {etapas.indexOf(e) + 1} de {etapas.length} · v{a.versao}</div>
                <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 500, color: T1 }}>{a.titulo}</h2>
                {a.resumo && <p style={{ margin: "0 0 14px", fontSize: 14, color: T2 }}>{a.resumo}</p>}
                <ArtigoView corpo={a.corpo} />
                <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--portal-border, #e2e8f0)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  {minha && (feita
                    ? <span style={{ fontSize: 13.5, color: "#15803d" }}><i className="fa-solid fa-circle-check" /> Lido</span>
                    : <button type="button" disabled={ocupado} onClick={() => li(e.id)} style={botao(ROXO, true)}><i className="fa-solid fa-check" /> Li e entendi</button>)}
                  <Link href={`/conhecimento/${a.slug}`} target="_blank" style={{ fontSize: 12.5, color: T2, marginLeft: "auto" }}>abrir na base de conhecimento ↗</Link>
                </div>
              </article>
            );
          })()}

          {aberta === "prova" && minha && (
            <section style={card}>
              <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 500, color: T1 }}>Prova</h2>
              <p style={{ margin: "0 0 16px", fontSize: 13.5, color: T2 }}>{perguntas.length} perguntas · nota mínima {trilha.nota_minima}%{minha.atribuicao.tentativas > 0 ? ` · ${minha.atribuicao.tentativas} tentativa${minha.atribuicao.tentativas > 1 ? "s" : ""} antes` : ""}</p>
              {resultado ? (
                <Resultado r={resultado} perguntas={perguntas} respostas={respostas} notaMinima={trilha.nota_minima} aoRefazer={() => { setResultado(null); setRespostas({}); }} />
              ) : minha.prova.aprovado ? (
                <div style={{ fontSize: 14, color: "#15803d" }}><i className="fa-solid fa-circle-check" /> Você já passou nesta prova{minha.prova.ultima ? ` com ${minha.prova.ultima.nota}%` : ""}.</div>
              ) : (
                <>
                  {perguntas.map((p, i) => (
                    <fieldset key={p.id} style={{ border: "none", margin: "0 0 18px", padding: 0 }}>
                      <legend style={{ fontSize: 14.5, color: T1, marginBottom: 8 }}>{i + 1}. {p.enunciado}</legend>
                      <div style={{ display: "grid", gap: 6 }}>
                        {p.opcoes.map((o, k) => {
                          const on = respostas[p.id] === k;
                          return (
                            <label key={k} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 12px", borderRadius: 10, cursor: "pointer", fontSize: 13.5, color: T1, border: `1px solid ${on ? ROXO : "var(--portal-border, #e2e8f0)"}`, background: on ? `color-mix(in srgb, ${ROXO} 7%, var(--portal-bg-card, #fefefe))` : "transparent" }}>
                              <input type="radio" name={p.id} checked={on} onChange={() => setRespostas((r) => ({ ...r, [p.id]: k }))} style={{ marginTop: 3 }} />
                              <span>{o}</span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  ))}
                  <button type="button" disabled={ocupado || !todasRespondidas} onClick={enviar} style={{ ...botao(ROXO, true), opacity: todasRespondidas ? 1 : 0.55 }}><i className="fa-solid fa-paper-plane" /> {ocupado ? "Corrigindo…" : "Enviar respostas"}</button>
                  {!todasRespondidas && <span style={{ fontSize: 12.5, color: T3, marginLeft: 10 }}>responda todas as perguntas</span>}
                </>
              )}
            </section>
          )}

          {!aberta && minha && (
            <div style={{ ...card, textAlign: "center", padding: 36 }}>
              <div style={{ fontSize: 36, color: "#15803d" }}><i className="fa-solid fa-circle-check" /></div>
              <div style={{ fontSize: 18, fontWeight: 500, color: T1, marginTop: 8 }}>Trilha concluída</div>
              <div style={{ fontSize: 13.5, color: T2, marginTop: 4 }}>{minha.atribuicao.nota != null ? `Nota ${minha.atribuicao.nota}%` : "Sem prova"}{minha.atribuicao.concluida_em ? ` · ${dataBR(minha.atribuicao.concluida_em)}` : ""}. Os artigos continuam na lista ao lado para consulta.</div>
              <Link href="/treinamento" style={{ ...botao(ROXO), marginTop: 16 }}>Voltar para as minhas trilhas</Link>
            </div>
          )}
          {!aberta && !minha && <div style={vazio}>Escolha um artigo na lista para ver o conteúdo.</div>}
        </div>
      </div>
    </div>
  );
}

function Resultado({ r, perguntas, respostas, notaMinima, aoRefazer }: { r: ResultadoProva; perguntas: { id: string; enunciado: string; opcoes: string[] }[]; respostas: Record<string, number>; notaMinima: number; aoRefazer: () => void }) {
  const cor = r.aprovado ? "#15803d" : "#dc2626";
  return (
    <div>
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 22, fontWeight: 500, color: cor, fontVariantNumeric: "tabular-nums" }}>{r.nota}%</span>
        <div style={{ fontSize: 14, color: T1 }}>
          {r.aprovado ? <><i className="fa-solid fa-circle-check" style={{ color: cor }} /> Aprovado</> : <><i className="fa-solid fa-circle-xmark" style={{ color: cor }} /> Ainda não passou (mínimo {notaMinima}%)</>}
          <div style={{ fontSize: 12.5, color: T2 }}>{r.acertos} de {r.total} certas</div>
        </div>
      </div>
      {r.revisao.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          {r.revisao.map((v) => {
            const p = perguntas.find((x) => x.id === v.id);
            if (!p) return null;
            const minha = respostas[v.id];
            return (
              <div key={v.id} style={{ padding: "10px 12px", borderRadius: 10, background: "color-mix(in srgb, #dc2626 6%, var(--portal-bg-card, #fefefe))", fontSize: 13.5 }}>
                <div style={{ color: T1 }}>{p.enunciado}</div>
                {typeof minha === "number" && <div style={{ color: "#991b1b", marginTop: 4 }}>Você marcou: {p.opcoes[minha]}</div>}
                <div style={{ color: "#15803d", marginTop: 2 }}>Certa: {v.certa}</div>
                {v.explicacao && <div style={{ color: T2, marginTop: 4 }}>{v.explicacao}</div>}
              </div>
            );
          })}
        </div>
      )}
      {!r.aprovado && <button type="button" onClick={aoRefazer} style={{ ...botao(ROXO, true), marginTop: 16 }}><i className="fa-solid fa-rotate-right" /> Tentar de novo</button>}
      {r.aprovado && <Link href="/treinamento" style={{ ...botao(ROXO), marginTop: 16 }}>Voltar para as minhas trilhas</Link>}
    </div>
  );
}
