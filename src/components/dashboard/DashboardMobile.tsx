"use client";
// Versão MOBILE do Dashboard — lançador de apps no estilo "tela inicial do celular":
// cabeçalho grafite com saudação + busca, faixa de pastas (Todos · Favoritos · pastas
// da pessoa), atalhos (favoritos e mais usados) e os apps numa grade compacta de
// ícones por categoria, que recolhe. "Editar" liga o modo de arrumar: favoritar,
// reordenar favoritos e montar pastas — as MESMAS pastas/favoritos do desktop
// (mesmo localStorage). Cores pelas variáveis do tema (claro/escuro).
// O desktop não usa este componente.
import { useEffect, useMemo, useState } from "react";
import { normalizar, relevancia, type Tela } from "@/lib/dashboard/telas";

export interface AppCard {
  id: string; name: string; icon: React.ReactNode; color: string; gradient: string; tag: string; group: string;
}

export interface PastaApps { id: string; name: string; cardIds: string[] }

interface Props {
  systems: AppCard[];       // já filtrados por permissão
  grupos: { key: string; label: string; color: string }[];
  favoritos: string[];
  onToggleFav: (id: string) => void;
  onMoverFav: (id: string, direcao: -1 | 1) => void;
  maisUsados: string[];     // ids de AppCard, do mais para o menos usado
  pastas: PastaApps[];
  onCriarPasta: () => void;
  onRenomearPasta: (id: string) => void;
  onExcluirPasta: (id: string) => void;
  onAlternarNaPasta: (pastaId: string, appId: string) => void;
  onOpen: (s: AppCard) => void;
  searchTerm: string;
  onSearch: (v: string) => void;
  userNome?: string;
  /** Telas (sub-páginas) que casam com a busca, já filtradas por permissão. */
  telas?: Tela[];
  onAbrirTela?: (t: Tela) => void;
  onSincronizar?: () => void;
}

const CHAVE_RECOLHIDOS = "portal-dash-m-recolhidos";

const IcoSearch = ({ c = "#94a3b8" }: { c?: string }) => (
  <svg viewBox="0 0 24 24" width={17} height={17} fill="none" stroke={c} strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></svg>
);
const IcoStar = ({ fill, size = 14 }: { fill: boolean; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={fill ? "#f59e0b" : "none"} stroke={fill ? "#f59e0b" : "currentColor"} strokeWidth={2} strokeLinejoin="round"><path d="M12 2l3 6 6 .9-4.5 4.3 1 6.3L12 17l-5.5 2.5 1-6.3L3 8.9 9 8z" /></svg>
);
const IcoChevron = ({ aberto }: { aberto: boolean }) => (
  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" style={{ transform: aberto ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .18s" }}><path d="m6 9 6 6 6-6" /></svg>
);
const IcoSeta = ({ esquerda }: { esquerda?: boolean }) => (
  <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round"><path d={esquerda ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} /></svg>
);
const IcoCheck = () => (
  <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round"><path d="M20 6 9 17l-5-5" /></svg>
);

const dataHoje = () => {
  const t = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export default function DashboardMobile({
  systems, grupos, favoritos, onToggleFav, onMoverFav, maisUsados, pastas, onCriarPasta, onRenomearPasta, onExcluirPasta,
  onAlternarNaPasta, onOpen, searchTerm, onSearch, userNome, telas = [], onAbrirTela, onSincronizar,
}: Props) {
  const q = normalizar(searchTerm);
  const buscando = q.length > 0;
  const [editando, setEditando] = useState(false);
  // "todos" | "favoritos" | id de pasta
  const [filtro, setFiltro] = useState<string>("todos");
  const [recolhidos, setRecolhidos] = useState<string[]>([]);

  // Categorias recolhidas: conveniência deste aparelho (não precisa ir pro banco)
  useEffect(() => {
    try { const s = localStorage.getItem(CHAVE_RECOLHIDOS); if (s) setRecolhidos(JSON.parse(s)); } catch { /* sem storage */ }
  }, []);
  const alternarGrupo = (key: string) => setRecolhidos((prev) => {
    const prox = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
    try { localStorage.setItem(CHAVE_RECOLHIDOS, JSON.stringify(prox)); } catch { /* sem storage */ }
    return prox;
  });

  // Pasta escolhida que foi apagada → volta pra "Todos"
  const pastaAtiva = pastas.find((p) => p.id === filtro);
  useEffect(() => {
    if (filtro !== "todos" && filtro !== "favoritos" && !pastaAtiva) setFiltro("todos");
  }, [filtro, pastaAtiva]);

  const porId = useMemo(() => new Map(systems.map((s) => [s.id, s])), [systems]);
  const favs = useMemo(() => favoritos.map((id) => porId.get(id)).filter((s): s is AppCard => Boolean(s)), [favoritos, porId]);
  const usados = useMemo(
    () => maisUsados.filter((id) => !favoritos.includes(id)).map((id) => porId.get(id)).filter((s): s is AppCard => Boolean(s)).slice(0, 8),
    [maisUsados, favoritos, porId]
  );

  const filtrados = useMemo(() => {
    if (!q) return systems;
    const nota = (s: AppCard) => Math.min(relevancia(s.name, q) ?? Infinity, relevancia(s.tag, q) ?? Infinity);
    return systems.filter((s) => nota(s) !== Infinity).sort((a, b) => nota(a) - nota(b));
  }, [systems, q]);

  // O que a grade mostra conforme a faixa de pastas. Editando uma pasta, mostra
  // TODOS os apps (com ✓ nos que estão nela) pra dar pra incluir/tirar.
  const visiveis = useMemo(() => {
    if (filtro === "favoritos") return favs;
    if (pastaAtiva && !editando) return systems.filter((s) => pastaAtiva.cardIds.includes(s.id));
    return systems;
  }, [filtro, favs, pastaAtiva, editando, systems]);

  const saudacao = (() => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; })();
  const primeiroNome = (userNome || "").trim().split(/\s+/)[0] || "";
  const iniciais = (userNome || "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "NT";

  // ---------- peças visuais ----------

  // Ícone de app da grade (estilo tela inicial)
  const Icone = ({ s }: { s: AppCard }) => {
    const fav = favoritos.includes(s.id);
    const naPasta = pastaAtiva ? pastaAtiva.cardIds.includes(s.id) : false;
    const tocar = () => {
      if (!editando) return onOpen(s);
      if (pastaAtiva) return onAlternarNaPasta(pastaAtiva.id, s.id);
      onToggleFav(s.id);
    };
    const marcado = pastaAtiva ? naPasta : fav;
    return (
      <button onClick={tocar} aria-label={editando ? (pastaAtiva ? `${naPasta ? "Tirar" : "Pôr"} ${s.name} na pasta` : `${fav ? "Desfavoritar" : "Favoritar"} ${s.name}`) : s.name}
        style={{
          position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 7, minWidth: 0,
          padding: "6px 2px 4px", background: "none", border: "none", cursor: "pointer", color: "var(--portal-text)",
          opacity: editando && pastaAtiva && !naPasta ? 0.45 : 1, transition: "opacity .15s",
        }}>
        <span style={{
          width: 56, height: 56, borderRadius: 17, background: s.gradient, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          boxShadow: `0 5px 12px ${s.color}38`,
          animation: editando ? "dashm-tremer .32s ease-in-out infinite alternate" : undefined,
        }}>
          <span style={{ display: "flex", transform: "scale(.86)" }}>{s.icon}</span>
        </span>
        <span style={{
          // quebra só ENTRE palavras (antes saía "Recebimento-s"); palavra longa usa hífen
          fontSize: 11, fontWeight: 600, lineHeight: 1.2, letterSpacing: -0.1, textAlign: "center", maxWidth: "100%",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", hyphens: "auto",
        }}>{s.name}</span>
        {/* selo: estrela (favorito) fora da edição; no modo editar, a marca do que está escolhido */}
        {editando ? (
          <span style={{
            position: "absolute", top: 0, right: "calc(50% - 36px)", width: 22, height: 22, borderRadius: 11,
            background: marcado ? (pastaAtiva ? "#16a34a" : "#f59e0b") : "var(--portal-bg-card)",
            border: marcado ? "none" : "1.5px solid var(--portal-text-muted)",
            display: "flex", alignItems: "center", justifyContent: "center", color: "var(--portal-text-muted)",
            boxShadow: "0 1px 3px rgba(0,0,0,.18)",
          }}>
            {marcado ? (pastaAtiva ? <IcoCheck /> : <IcoStar fill size={12} />) : null}
          </span>
        ) : fav ? (
          <span style={{ position: "absolute", top: 1, right: "calc(50% - 34px)", display: "flex", filter: "drop-shadow(0 1px 1px rgba(0,0,0,.25))" }}>
            <IcoStar fill size={13} />
          </span>
        ) : null}
      </button>
    );
  };

  const Grade = ({ itens }: { itens: AppCard[] }) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px 4px" }}>
      {itens.map((s) => <Icone key={s.id} s={s} />)}
    </div>
  );

  const Titulo = ({ children, direita }: { children: React.ReactNode; direita?: React.ReactNode }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 2px 10px", minHeight: 24 }}>
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--portal-text-secondary)", display: "flex", alignItems: "center", gap: 7 }}>{children}</span>
      {direita ? <span style={{ marginLeft: "auto" }}>{direita}</span> : null}
    </div>
  );

  // Atalho redondo (favoritos / mais usados)
  const Atalho = ({ s, indice, total }: { s: AppCard; indice?: number; total?: number }) => (
    <div style={{ flex: "0 0 auto", width: 74, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <button onClick={() => (editando ? onToggleFav(s.id) : onOpen(s))} aria-label={editando ? `Desfavoritar ${s.name}` : s.name}
        style={{ position: "relative", width: 58, height: 58, borderRadius: 19, background: s.gradient, color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 6px 14px ${s.color}44` }}>
        {s.icon}
        {editando && indice !== undefined && (
          <span style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, background: "#ef4444", color: "#fff", fontSize: 15, lineHeight: "20px", fontWeight: 800, boxShadow: "0 1px 3px rgba(0,0,0,.25)" }}>×</span>
        )}
      </button>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--portal-text)", textAlign: "center", lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 74 }}>{s.name}</span>
      {editando && indice !== undefined && total !== undefined && total > 1 && (
        <span style={{ display: "flex", gap: 6 }}>
          <button onClick={() => onMoverFav(s.id, -1)} disabled={indice === 0} aria-label={`Mover ${s.name} para a esquerda`} style={btnSeta(indice === 0)}><IcoSeta esquerda /></button>
          <button onClick={() => onMoverFav(s.id, 1)} disabled={indice === total - 1} aria-label={`Mover ${s.name} para a direita`} style={btnSeta(indice === total - 1)}><IcoSeta /></button>
        </span>
      )}
    </div>
  );

  const Chip = ({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button onClick={onClick} style={{
      flex: "0 0 auto", height: 36, padding: "0 14px", borderRadius: 18, cursor: "pointer", whiteSpace: "nowrap",
      fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
      border: ativo ? "1px solid #dc2626" : "1px solid var(--portal-border)",
      background: ativo ? "#dc2626" : "var(--portal-bg-card)",
      color: ativo ? "#fff" : "var(--portal-text-secondary)",
    }}>{children}</button>
  );

  return (
    <div style={{ minHeight: "calc(100dvh - var(--portal-header-h))", background: "var(--portal-bg)" }}>
      <style>{`@keyframes dashm-tremer { from { transform: rotate(-2.2deg); } to { transform: rotate(2.2deg); } }`}</style>

      {/* Cabeçalho grafite: saudação, data e busca */}
      <div style={{ background: "linear-gradient(150deg,#1b2230,#2c3648)", color: "#fff", padding: "18px 16px 20px", borderRadius: "0 0 24px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={{ width: 44, flexShrink: 0, height: 44, borderRadius: 14, background: "rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15 }}>{iniciais}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {saudacao}{primeiroNome ? `, ${primeiroNome}` : ""}
            </div>
            <div style={{ fontSize: 12.5, opacity: 0.72, marginTop: 2 }}>{dataHoje()}</div>
          </div>
        </div>
        <div style={{ position: "relative", marginTop: 16 }}>
          <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", display: "flex" }}><IcoSearch /></span>
          <input value={searchTerm} onChange={(e) => onSearch(e.target.value)} placeholder="Buscar tela ou sistema…"
            onKeyDown={(e) => { if (e.key === "Enter" && telas[0] && onAbrirTela) onAbrirTela(telas[0]); }}
            aria-label="Buscar tela ou sistema" enterKeyHint="search"
            style={{ width: "100%", height: 46, padding: "0 44px 0 38px", borderRadius: 14, border: "none", background: "#fff", fontSize: 16, outline: "none", boxSizing: "border-box", color: "#0f172a" }} />
          {searchTerm && (
            <button onClick={() => onSearch("")} aria-label="Limpar busca" style={{ position: "absolute", right: 3, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
          )}
        </div>
      </div>

      <div style={{ padding: "16px 14px calc(36px + env(safe-area-inset-bottom))" }}>
        {buscando ? (
          filtrados.length === 0 && telas.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 16px", color: "var(--portal-text-muted)" }}>Nada encontrado para &quot;{searchTerm}&quot;.</div>
          ) : (
            <>
              {/* Telas primeiro: leva direto ao que foi buscado */}
              {telas.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <Titulo>Telas</Titulo>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {telas.map((t) => {
                      const sis = systems.find((s) => s.id === t.sistema);
                      return (
                        <button key={t.href + t.nome} onClick={() => onAbrirTela?.(t)}
                          style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 56, padding: "8px 12px", borderRadius: 14, border: "1px solid var(--portal-border)", background: "var(--portal-bg-card)", cursor: "pointer", textAlign: "left" }}>
                          <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, background: sis?.gradient || "#64748b", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {sis?.icon ? <span style={{ display: "flex", transform: "scale(.7)" }}>{sis.icon}</span> : <IcoSearch c="#fff" />}
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: "var(--portal-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.nome}</span>
                            <span style={{ display: "block", fontSize: 12, color: "var(--portal-text-secondary)" }}>{t.area}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {filtrados.length > 0 && (
                <>
                  <Titulo>Sistemas</Titulo>
                  <Grade itens={filtrados} />
                </>
              )}
            </>
          )
        ) : (
          <>
            {/* Faixa de pastas + Editar */}
            <div className="m-rolar-x" style={{ gap: 8, margin: "0 -14px 18px", padding: "0 14px 2px" }}>
              <Chip ativo={filtro === "todos"} onClick={() => setFiltro("todos")}>Todos</Chip>
              <Chip ativo={filtro === "favoritos"} onClick={() => setFiltro("favoritos")}><IcoStar fill={filtro !== "favoritos"} size={13} /> Favoritos</Chip>
              {pastas.map((p) => (
                <Chip key={p.id} ativo={filtro === p.id} onClick={() => setFiltro(p.id)}>📁 {p.name} <span style={{ opacity: 0.7, fontWeight: 600 }}>{p.cardIds.length}</span></Chip>
              ))}
              <Chip ativo={editando} onClick={() => setEditando((e) => !e)}>{editando ? "✓ Pronto" : "✎ Editar"}</Chip>
            </div>

            {/* Explicação do modo editar */}
            {editando && (
              <div style={{ marginBottom: 18, padding: "12px 14px", borderRadius: 14, background: "var(--portal-bg-card)", border: "1px dashed var(--portal-border-hover)", fontSize: 13, color: "var(--portal-text-secondary)", lineHeight: 1.45 }}>
                {pastaAtiva ? (
                  <>Toque nos sistemas para <b style={{ color: "var(--portal-text)" }}>pôr ou tirar</b> da pasta <b style={{ color: "var(--portal-text)" }}>{pastaAtiva.name}</b>.</>
                ) : (
                  <>Toque num sistema para <b style={{ color: "var(--portal-text)" }}>favoritar</b>. Use as setas para mudar a ordem dos favoritos.</>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  <button onClick={onCriarPasta} style={btnAcao}>＋ Nova pasta</button>
                  {pastaAtiva && <button onClick={() => onRenomearPasta(pastaAtiva.id)} style={btnAcao}>Renomear pasta</button>}
                  {pastaAtiva && <button onClick={() => onExcluirPasta(pastaAtiva.id)} style={{ ...btnAcao, color: "#dc2626" }}>Excluir pasta</button>}
                </div>
              </div>
            )}

            {filtro === "todos" ? (
              <>
                {favs.length > 0 && (
                  <section style={{ marginBottom: 22 }}>
                    <Titulo><IcoStar fill /> Favoritos</Titulo>
                    <div className="m-rolar-x" style={{ gap: 6, margin: "0 -14px", padding: "6px 14px 4px" }}>
                      {favs.map((s, i) => <Atalho key={s.id} s={s} indice={i} total={favs.length} />)}
                    </div>
                  </section>
                )}
                {usados.length > 0 && !editando && (
                  <section style={{ marginBottom: 22 }}>
                    <Titulo>Mais usados por você</Titulo>
                    <div className="m-rolar-x" style={{ gap: 6, margin: "0 -14px", padding: "6px 14px 4px" }}>
                      {usados.map((s) => <Atalho key={s.id} s={s} />)}
                    </div>
                  </section>
                )}
                {grupos.map(({ key, label, color }) => {
                  const doGrupo = systems.filter((s) => s.group === key);
                  if (doGrupo.length === 0) return null;
                  const aberto = editando || !recolhidos.includes(key);
                  return (
                    <section key={key} style={{ marginBottom: 14, background: "var(--portal-bg-card)", border: "1px solid var(--portal-border)", borderRadius: 18, padding: aberto ? "4px 8px 12px" : "4px 8px" }}>
                      <button onClick={() => alternarGrupo(key)} aria-expanded={aberto}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, minHeight: 44, padding: "0 6px", background: "none", border: "none", cursor: "pointer", color: "var(--portal-text-secondary)" }}>
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--portal-text)" }}>{label}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--portal-text-muted)" }}>{doGrupo.length}</span>
                        <span style={{ marginLeft: "auto", display: "flex" }}><IcoChevron aberto={aberto} /></span>
                      </button>
                      {aberto && <div style={{ paddingTop: 4 }}><Grade itens={doGrupo} /></div>}
                    </section>
                  );
                })}
              </>
            ) : visiveis.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--portal-text-muted)", fontSize: 14, lineHeight: 1.5 }}>
                {filtro === "favoritos"
                  ? <>Nenhum favorito ainda.<br />Toque em <b>✎ Editar</b> e escolha seus sistemas.</>
                  : <>Pasta vazia.<br />Toque em <b>✎ Editar</b> para pôr sistemas nela.</>}
              </div>
            ) : filtro === "favoritos" ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "14px 6px", justifyContent: "flex-start" }}>
                {visiveis.map((s, i) => <Atalho key={s.id} s={s} indice={i} total={visiveis.length} />)}
              </div>
            ) : (
              <Grade itens={visiveis} />
            )}

            {/* Rodapé: o mesmo "Sincronizar com Omie" do desktop */}
            {onSincronizar && !editando && (
              <div style={{ marginTop: 26, textAlign: "center" }}>
                <button onClick={onSincronizar} style={{ ...btnAcao, height: 44, padding: "0 18px", fontSize: 13.5 }}>⟳ Sincronizar com Omie</button>
                <div style={{ fontSize: 11.5, color: "var(--portal-text-muted)", marginTop: 12 }}>Nova Tratores © {new Date().getFullYear()} — Portal Corporativo</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const btnAcao: React.CSSProperties = {
  height: 38, padding: "0 14px", borderRadius: 12, border: "1px solid var(--portal-border)", background: "var(--portal-bg)",
  color: "var(--portal-text)", fontSize: 13, fontWeight: 700, cursor: "pointer",
};
const btnSeta = (desligado: boolean): React.CSSProperties => ({
  width: 30, height: 30, borderRadius: 9, border: "1px solid var(--portal-border)", background: "var(--portal-bg-card)",
  color: "var(--portal-text-secondary)", display: "flex", alignItems: "center", justifyContent: "center",
  cursor: desligado ? "default" : "pointer", opacity: desligado ? 0.35 : 1,
});
