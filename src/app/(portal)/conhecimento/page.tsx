"use client";
// Base de conhecimento: busca, artigos por módulo e, para quem edita, a fila de
// aprovação e os retornos dos leitores. Qualquer usuário logado entra aqui; o que
// cada um vê é filtrado no servidor por módulo e categoria.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { aguardaAprovacao } from "@/lib/conhecimento/artigos";
import { ErroApi, listarArtigos, listarRetornos, resolverRetorno, type ListaResposta, type ResumoComPermissao, type Retorno } from "@/lib/conhecimento/client";
import { corModulo, MODULOS_KB, rotuloModulo } from "@/lib/conhecimento/modulos";

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
    for (const a of dados?.artigos ?? []) (m.get(a.modulo) ?? m.set(a.modulo, []).get(a.modulo)!).push(a);
    return Array.from(m.entries());
  }, [dados]);

  const modulosComArtigo = useMemo(() => {
    const ids = new Set((dados?.artigos ?? []).map((a) => a.modulo));
    return MODULOS_KB.filter((m) => ids.has(m.id) || m.id === modulo);
  }, [dados, modulo]);

  const podeCriar = dados?.podeCriar ?? false;

  return (
    <div style={{ paddingTop: 20, maxWidth: 1100, margin: "0 auto", fontFamily: "Inter, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--portal-text)" }}>📚 Base de conhecimento</h1>
          <div style={{ fontSize: 12, color: "var(--portal-text-secondary)", marginTop: 2 }}>
            Como usar cada tela do portal. O mesmo texto aparece no botão <strong>?</strong> do cabeçalho quando você está na tela.
          </div>
        </div>
        {podeCriar && (
          <button type="button" onClick={() => router.push(`/conhecimento/editar/novo${modulo ? `?modulo=${modulo}` : ""}`)} style={btnPrimario}>+ Novo artigo</button>
        )}
      </div>

      {podeCriar && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {([
            ["artigos", `Artigos`],
            ["fila", `Para aprovar${fila.length ? ` (${fila.length})` : ""}`],
            ["retornos", `Retornos dos leitores${retornos.length ? ` (${retornos.length})` : ""}`],
          ] as [Aba, string][]).map(([k, rot]) => (
            <button key={k} type="button" onClick={() => setAba(k)} style={{ ...pill, background: aba === k ? "#0369a1" : "transparent", color: aba === k ? "#fefefe" : "var(--portal-text-secondary)", borderColor: aba === k ? "#0369a1" : "var(--portal-border)" }}>{rot}</button>
          ))}
        </div>
      )}

      {erro && (
        <div style={{ padding: "12px 16px", borderRadius: 12, background: erro.migracao ? "#fef3c7" : "#fee2e2", color: erro.migracao ? "#92400e" : "#991b1b", fontSize: 13, marginBottom: 14 }}>
          {erro.migracao ? "A base de conhecimento ainda não foi instalada no banco. " : ""}{erro.msg}
        </div>
      )}

      {aba === "artigos" && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: fase, botão, regra, tela…" autoFocus
              style={{ flex: 1, minWidth: 260, padding: "10px 14px", borderRadius: 999, border: "1.5px solid var(--portal-border)", background: "var(--portal-bg-card)", color: "var(--portal-text)", fontSize: 14, outline: "none" }} />
            <button type="button" onClick={() => setModulo("")} style={{ ...pill, background: !modulo ? "#111111" : "transparent", color: !modulo ? "#fefefe" : "var(--portal-text-secondary)" }}>Todos</button>
            {modulosComArtigo.map((m) => (
              <button key={m.id} type="button" onClick={() => setModulo(modulo === m.id ? "" : m.id)} style={{ ...pill, background: modulo === m.id ? m.cor : "transparent", color: modulo === m.id ? "#fefefe" : m.cor, borderColor: m.cor }}>{m.rotulo}</button>
            ))}
          </div>

          {carregando && !dados ? (
            <div style={vazio}>Carregando…</div>
          ) : porModulo.length === 0 ? (
            <div style={vazio}>{qAplicado ? "Nada encontrado com esse termo." : podeCriar ? "Ainda não há artigos publicados. Os rascunhos ficam na aba \"Para aprovar\"." : "Ainda não há artigos publicados para as telas que você usa."}</div>
          ) : porModulo.map(([mod, lista]) => (
            <section key={mod} style={{ marginBottom: 22 }}>
              <h2 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6, color: corModulo(mod), margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8 }}>
                {rotuloModulo(mod)} <span style={{ fontWeight: 600, color: "var(--portal-text-muted)" }}>· {lista.length}</span>
                {dados?.responsaveis[mod] && <span style={{ fontWeight: 600, color: "var(--portal-text-muted)", textTransform: "none", letterSpacing: 0 }}>· responsável: {dados.responsaveis[mod]}</span>}
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
                {lista.map((a) => <CardArtigo key={a.id} a={a} />)}
              </div>
            </section>
          ))}
        </>
      )}

      {aba === "fila" && (
        fila.length === 0 ? <div style={vazio}>Nada esperando aprovação nos módulos que você edita.</div> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
            {fila.map((a) => <CardArtigo key={a.id} a={a} editar />)}
          </div>
        )
      )}

      {aba === "retornos" && (
        retornos.length === 0 ? <div style={vazio}>Nenhum retorno pendente. 🎉</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {retornos.map((r) => (
              <div key={r.id} style={{ ...card, display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: 20 }}>{r.tipo === "desatualizado" ? "⚠️" : "👎"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>
                    <strong>{r.user_nome || "Alguém"}</strong> {r.tipo === "desatualizado" ? "marcou como desatualizado" : "disse que não ajudou"}:{" "}
                    <Link href={`/conhecimento/editar/${r.artigo_id}`} style={{ color: "#0369a1", fontWeight: 700 }}>{r.artigo.titulo}</Link>
                    <span style={{ color: "var(--portal-text-muted)" }}> · v{r.versao} · {rotuloModulo(r.artigo.modulo)}{r.tela ? ` · em ${r.tela}` : ""}</span>
                  </div>
                  {r.comentario && <div style={{ fontSize: 13, marginTop: 4, fontStyle: "italic", color: "var(--portal-text-secondary)" }}>“{r.comentario}”</div>}
                  <div style={{ fontSize: 11, color: "var(--portal-text-muted)", marginTop: 4 }}>{new Date(r.criado_em).toLocaleString("pt-BR")}</div>
                </div>
                <button type="button" style={btnChip} onClick={async () => { await resolverRetorno(r.id).catch(() => {}); void carregar(); }}>Resolvido</button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function CardArtigo({ a, editar = false }: { a: ResumoComPermissao; editar?: boolean }) {
  const pendente = aguardaAprovacao(a);
  const href = editar || a.status !== "publicado" ? `/conhecimento/editar/${a.id}` : `/conhecimento/${a.slug}`;
  return (
    <Link href={href} style={{ ...card, textDecoration: "none", color: "inherit", display: "block", borderLeft: `4px solid ${corModulo(a.modulo)}` }}>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: "var(--portal-text)" }}>{a.titulo}</div>
        {a.status === "rascunho" && <Selo cor="#92400e" bg="#fef3c7">rascunho</Selo>}
        {a.status === "publicado" && a.tem_rascunho && <Selo cor="#1e40af" bg="#dbeafe">edição pendente</Selo>}
        {a.status === "arquivado" && <Selo cor="#475569" bg="#f1f5f9">arquivado</Selo>}
        {a.revisao_pendente_desde && <Selo cor="#991b1b" bg="#fee2e2">pode estar desatualizado</Selo>}
      </div>
      {a.resumo && <div style={{ fontSize: 12, color: "var(--portal-text-secondary)", marginTop: 4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{a.resumo}</div>}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8, fontSize: 10, color: "var(--portal-text-muted)" }}>
        {a.telas.map((t) => <span key={t} style={{ border: "1px solid var(--portal-border)", borderRadius: 6, padding: "1px 6px" }}>{t}</span>)}
        {pendente && a.rascunho_por && <span style={{ marginLeft: "auto" }}>por {a.rascunho_por}</span>}
        {!pendente && a.versao > 0 && <span style={{ marginLeft: "auto" }}>v{a.versao}</span>}
      </div>
    </Link>
  );
}

function Selo({ cor, bg, children }: { cor: string; bg: string; children: React.ReactNode }) {
  return <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 6, background: bg, color: cor, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: 0.3 }}>{children}</span>;
}

const card: React.CSSProperties = { background: "var(--portal-bg-card)", border: "1px solid var(--portal-border)", borderRadius: 12, padding: "12px 14px" };
const pill: React.CSSProperties = { padding: "7px 14px", borderRadius: 999, border: "1.5px solid var(--portal-border)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const btnPrimario: React.CSSProperties = { padding: "9px 18px", background: "#0369a1", color: "#fefefe", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const btnChip: React.CSSProperties = { fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 999, border: "1px solid #15803d", background: "transparent", color: "#15803d", cursor: "pointer", whiteSpace: "nowrap" };
const vazio: React.CSSProperties = { padding: 50, textAlign: "center", color: "var(--portal-text-muted)", fontSize: 14, fontStyle: "italic" };
