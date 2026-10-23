"use client";
// Base de conhecimento: busca, artigos por módulo e, para quem edita, a fila de
// aprovação e os retornos dos leitores. Qualquer usuário logado entra aqui; o que
// cada um vê é filtrado no servidor por módulo e categoria.
// Visual: docs/estilo-pos-newportal.md (components/conhecimento/estiloKB.tsx).

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { aguardaAprovacao } from "@/lib/conhecimento/artigos";
import { ErroApi, listarArtigos, listarRetornos, resolverRetorno, type ListaResposta, type ResumoComPermissao, type Retorno } from "@/lib/conhecimento/client";
import { corModulo, iconeModulo, MODULOS_KB, rotuloModulo } from "@/lib/conhecimento/modulos";
import { AZUL, botao, card, contador, CSS_KB, Icone, IconeModulo, pilula, Selo, T1, T2, T3, tituloPagina, tituloSecao, vazio } from "@/components/conhecimento/estiloKB";

type Aba = "artigos" | "fila" | "retornos";

export default function Page() {
  // useSearchParams exige Suspense no App Router
  return <Suspense fallback={null}><ConhecimentoPage /></Suspense>;
}

function ConhecimentoPage() {
  const router = useRouter();
  const search = useSearchParams();
  const [aba, setAba] = useState<Aba>((search.get("aba") as Aba) || "artigos");
  const [q, setQ] = useState(search.get("q") || "");
  const [qAplicado, setQAplicado] = useState(q);
  const [modulo, setModulo] = useState(search.get("modulo") || "");
  const [dados, setDados] = useState<ListaResposta | null>(null);
  const [fila, setFila] = useState<ResumoComPermissao[]>([]);
  const [retornos, setRetornos] = useState<Retorno[]>([]);
  const [erro, setErro] = useState<{ msg: string; migracao: boolean } | null>(null);
  const [carregando, setCarregando] = useState(true);
  // só para quem edita: a aba Artigos mistura rascunho e publicado
  const [situacao, setSituacao] = useState<"todos" | "publicados" | "rascunhos">("todos");

  useEffect(() => { const t = setTimeout(() => setQAplicado(q), 350); return () => clearTimeout(t); }, [q]);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const [lista, f, r] = await Promise.all([
        listarArtigos({ q: qAplicado || undefined, modulo: modulo || undefined }),
        listarArtigos({ fila: true }).then((x) => x.artigos).catch(() => [] as ResumoComPermissao[]),
        listarRetornos().then((x) => x.retornos).catch(() => [] as Retorno[]),
      ]);
      setDados(lista); setFila(f); setRetornos(r);
    } catch (e) {
      setErro({ msg: (e as Error).message, migracao: e instanceof ErroApi && e.migracaoFaltando });
    } finally { setCarregando(false); }
  }, [qAplicado, modulo]);

  useEffect(() => { void carregar(); }, [carregar]);

  const porModulo = useMemo(() => {
    const m = new Map<string, ResumoComPermissao[]>();
    for (const a of dados?.artigos ?? []) {
      if (situacao === "publicados" && a.status !== "publicado") continue;
      if (situacao === "rascunhos" && a.status === "publicado" && !a.tem_rascunho) continue;
      (m.get(a.modulo) ?? m.set(a.modulo, []).get(a.modulo)!).push(a);
    }
    return Array.from(m.entries());
  }, [dados, situacao]);

  const modulosComArtigo = useMemo(() => {
    const ids = new Set((dados?.artigos ?? []).map((a) => a.modulo));
    return MODULOS_KB.filter((m) => ids.has(m.id) || m.id === modulo);
  }, [dados, modulo]);

  const podeCriar = dados?.podeCriar ?? false;

  return (
    <div style={{ padding: "20px 16px 40px", fontFamily: "Inter, system-ui, sans-serif", fontWeight: 400, color: T1 }}>
      <style>{CSS_KB}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: "min(260px, 100%)" }}>
          <h1 style={tituloPagina}><Icone icone="fa-book" cor={AZUL} /> Base de conhecimento</h1>
          <div style={{ fontSize: 13.5, color: T2, marginTop: 6 }}>
            Como usar cada tela do portal. O mesmo texto aparece no botão <i className="fa-solid fa-circle-question" style={{ color: AZUL }} /> do cabeçalho quando você está na tela.
          </div>
        </div>
        <Link href="/conhecimento/novidades" className="kb-btn" style={botao()}>
          <i className="fa-solid fa-wand-magic-sparkles" style={{ color: AZUL }} /> O que mudou
        </Link>
        {podeCriar && (
          <button type="button" onClick={() => router.push(`/conhecimento/editar/novo${modulo ? `?modulo=${modulo}` : ""}`)} style={botao(AZUL, true)}>
            <i className="fa-solid fa-plus" /> Novo artigo
          </button>
        )}
      </div>

      {podeCriar && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {([
            ["artigos", "Artigos", "fa-book-open", AZUL, 0],
            ["fila", "Para aprovar", "fa-hourglass-half", "#d97706", fila.length],
            ["retornos", "Retornos dos leitores", "fa-comment-dots", "#dc2626", retornos.length],
          ] as [Aba, string, string, string, number][]).map(([k, rot, ic, cor, n]) => (
            <button key={k} type="button" onClick={() => setAba(k)} style={pilula(cor, aba === k)}>
              <i className={`fa-solid ${ic}`} style={{ color: cor }} /> {rot}
              {n > 0 && <span style={contador(cor)}>{n}</span>}
            </button>
          ))}
        </div>
      )}

      {erro && (
        <div style={{ ...card, padding: "12px 16px", background: erro.migracao ? "#fef3c7" : "#fee2e2", color: erro.migracao ? "#92400e" : "#991b1b", fontSize: 13.5, marginBottom: 14 }}>
          {erro.migracao ? "A base de conhecimento ainda não foi instalada no banco. " : ""}{erro.msg}
        </div>
      )}

      {aba === "artigos" && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
            <label style={{ flex: "1 1 320px", display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 12px", border: "1px solid var(--portal-border, #e2e8f0)", borderRadius: 12, background: "var(--portal-bg-card, #fefefe)" }}>
              <i className="fa-solid fa-magnifying-glass" style={{ color: T3 }} />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: fase, botão, regra, tela…" autoFocus
                style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", fontFamily: "inherit", fontSize: 14, color: T1 }} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <button type="button" onClick={() => setModulo("")} style={pilula("#475569", !modulo)}>
              <i className="fa-solid fa-layer-group" style={{ color: "#475569" }} /> Todos
            </button>
            {modulosComArtigo.map((m) => (
              <button key={m.id} type="button" onClick={() => setModulo(modulo === m.id ? "" : m.id)} style={pilula(m.cor, modulo === m.id)}>
                <i className={`fa-solid ${iconeModulo(m.id)}`} style={{ color: m.cor }} /> {m.rotulo}
              </button>
            ))}
          </div>

          {podeCriar && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16, fontSize: 13, color: T2 }}>
              Mostrar:
              {([["todos", "Tudo"], ["publicados", "Só publicados"], ["rascunhos", "Só rascunhos e edições pendentes"]] as const).map(([k, rot]) => (
                <button key={k} type="button" onClick={() => setSituacao(k)} style={{ ...pilula("#475569", situacao === k), height: 30, fontSize: 13 }}>{rot}</button>
              ))}
            </div>
          )}

          {carregando && !dados ? (
            <div style={vazio}>Carregando…</div>
          ) : porModulo.length === 0 ? (
            <div style={vazio}>{qAplicado ? "Nada encontrado com esse termo." : podeCriar ? "Ainda não há artigos publicados. Os rascunhos ficam na aba \"Para aprovar\"." : "Ainda não há artigos publicados para as telas que você usa."}</div>
          ) : porModulo.map(([mod, lista]) => (
            <section key={mod} style={{ marginBottom: 24 }}>
              <h2 style={tituloSecao}>
                <IconeModulo modulo={mod} /> {rotuloModulo(mod)}
                <span style={contador(corModulo(mod))}>{lista.length}</span>
                {dados?.responsaveis[mod] && <span style={{ fontSize: 13, color: T2 }}>responsável: {dados.responsaveis[mod]}</span>}
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))", gap: 12 }}>
                {lista.map((a) => <CardArtigo key={a.id} a={a} />)}
              </div>
            </section>
          ))}
        </>
      )}

      {aba === "fila" && (
        fila.length === 0 ? <div style={vazio}>Nada esperando aprovação nos módulos que você edita.</div> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))", gap: 12 }}>
            {fila.map((a) => <CardArtigo key={a.id} a={a} editar />)}
          </div>
        )
      )}

      {aba === "retornos" && (
        retornos.length === 0 ? <div style={vazio}>Nenhum retorno pendente.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {retornos.map((r) => {
              const cor = r.tipo === "desatualizado" ? "#d97706" : "#dc2626";
              return (
                <div key={r.id} style={{ ...card, display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <Icone icone={r.tipo === "desatualizado" ? "fa-clock-rotate-left" : "fa-thumbs-down"} cor={cor} tam={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14 }}>
                      {r.user_nome || "Alguém"} {r.tipo === "desatualizado" ? "marcou como desatualizado" : "disse que não ajudou"}:{" "}
                      <Link href={`/conhecimento/editar/${r.artigo_id}`} style={{ color: AZUL, fontWeight: 500, textDecoration: "none" }}>{r.artigo.titulo}</Link>
                      <span style={{ color: T3 }}> · v{r.versao} · {rotuloModulo(r.artigo.modulo)}{r.tela ? ` · em ${r.tela}` : ""}</span>
                    </div>
                    {r.comentario && <div style={{ fontSize: 13.5, marginTop: 6, color: T2, background: "var(--portal-bg-secondary, #f8fafc)", borderRadius: 10, padding: "8px 10px" }}>“{r.comentario}”</div>}
                    <div style={{ fontSize: 12, color: T3, marginTop: 6 }}>{new Date(r.criado_em).toLocaleString("pt-BR")}</div>
                  </div>
                  <button type="button" className="kb-btn" style={{ ...botao("#15803d"), height: 34 }} onClick={async () => { await resolverRetorno(r.id).catch(() => {}); void carregar(); }}>
                    <i className="fa-solid fa-check" style={{ color: "#15803d" }} /> Resolvido
                  </button>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

function CardArtigo({ a, editar = false }: { a: ResumoComPermissao; editar?: boolean }) {
  const pendente = aguardaAprovacao(a);
  const href = editar || a.status !== "publicado" ? `/conhecimento/editar/${a.id}` : `/conhecimento/${a.slug}`;
  const cor = corModulo(a.modulo);
  return (
    <Link href={href} className="kb-card kb-hover" style={{ ...card, textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", gap: 8, ["--kb-cor" as string]: cor }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Icone icone="fa-file-lines" cor={cor} tam={32} />
        <div style={{ flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: 500, lineHeight: 1.35, color: T1, paddingTop: 5 }}>{a.titulo}</div>
      </div>
      {(a.status !== "publicado" || a.tem_rascunho || a.revisao_pendente_desde) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {a.status === "rascunho" && <Selo cor="#b45309">rascunho</Selo>}
          {a.status === "publicado" && a.tem_rascunho && <Selo cor="#2563eb">edição pendente</Selo>}
          {a.status === "arquivado" && <Selo cor="#64748b">arquivado</Selo>}
          {a.revisao_pendente_desde && <Selo cor="#dc2626">pode estar desatualizado</Selo>}
        </div>
      )}
      {a.resumo && <div style={{ fontSize: 13.5, color: T2, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{a.resumo}</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: "auto", fontSize: 12, color: T3 }}>
        {a.telas.map((t) => <span key={t} style={{ border: "1px solid var(--portal-border, #e2e8f0)", borderRadius: 999, padding: "1px 8px" }}>{t}</span>)}
        {pendente && a.rascunho_por && <span style={{ marginLeft: "auto" }}>por {a.rascunho_por}</span>}
        {!pendente && a.versao > 0 && <span style={{ marginLeft: "auto" }}>v{a.versao}</span>}
      </div>
    </Link>
  );
}
