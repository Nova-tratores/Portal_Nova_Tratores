"use client";

// Bloco "Checklists desta OS": roteiros de POPs anexados à OS (ex.: trator levado
// a evento → saída da loja → chegada no evento → saída do evento → chegada na loja).
// Uma etapa de cada vez: a próxima é liberada sozinha quando a anterior termina.
// Mostra também execuções de POP ligadas à OS por gatilho. Via /api/pos/ordens/[id]/roteiros.
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import UserSelect from "@/components/tickets/UserSelect";
import { authHeaders } from "@/lib/auth/client";
import { chamarRoteiros } from "@/lib/pops/roteiros-client";
import { STATUS_ETAPA_INFO, situacaoRoteiro, type EtapaOS, type StatusEtapa } from "@/lib/pops/roteiros";

const VERDE = "#0f766e";
type Ticket = { id: string; numero: number; status: string; prazo: string | null; responsavel_id: string } | null;
type PopMin = { id: string; codigo: string; titulo: string } | null;
interface Etapa extends EtapaOS { pop: PopMin; ticket: Ticket; fora_faixa: number }
interface Roteiro { id: string; nome: string; status: "ativo" | "concluido" | "cancelado"; criado_em: string; mkt_acao_id: string | null; etapas: Etapa[] }
interface Avulsa { ticket_id: string; pop: PopMin; ticket: Ticket }
interface Evento { id: string; nome: string; data_inicio: string | null; data_fim: string | null; cidade: string | null; status: string }
interface Dados { roteiros: Roteiro[]; avulsas: Avulsa[]; pendentes: string[]; usuarios: Record<string, { nome: string }>; eventos?: Record<string, Evento> }
interface Modelo { id: string; nome: string; descricao: string; etapas: { ordem: number; nome: string; pop_id: string; responsavel_padrao_id: string | null; prazo_dias: number | null }[] }

const br = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
const btn = (cor = VERDE): React.CSSProperties => ({ border: `1px solid ${cor}`, background: "transparent", color: cor, borderRadius: 7, padding: "3px 9px", fontSize: 12, fontWeight: 700, cursor: "pointer" });
const ICONE: Record<StatusEtapa, string> = { pendente: "🔒", liberada: "▶", concluida: "✓", pulada: "⤼" };
const periodo = (e: Evento) => [e.data_inicio && br(e.data_inicio), e.data_fim && e.data_fim !== e.data_inicio && br(e.data_fim)].filter(Boolean).join(" a ");
const rotuloEvento = (e: Evento) => [e.nome, periodo(e), e.cidade].filter(Boolean).join(" · ");

// Celular: janelas em tela cheia e botões com alvo de toque ≥ 40 px.
const CSS = `
.ckos-fundo{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px}
.ckos-janela{background:var(--surface,#fefefe);color:var(--portal-text,#111111);border-radius:12px;max-height:90vh;overflow:auto;padding:18px;display:grid;gap:12px;align-content:start}
.ckos-tabela{width:100%;border-collapse:collapse;font-size:13px}
.ckos-tabela th,.ckos-tabela td{border-bottom:1px solid #e5e7eb;padding:7px 8px;text-align:left;vertical-align:top}
.ckos-tabela th:first-child,.ckos-tabela td:first-child{position:sticky;left:0;background:var(--surface,#fefefe);min-width:150px;max-width:220px;z-index:1}
@media (max-width:640px){
  .ckos-fundo{padding:0;align-items:stretch}
  .ckos-janela{width:100%!important;max-height:none;height:100%;border-radius:0}
  .ckos-bloco button,.ckos-bloco a,.ckos-janela button,.ckos-janela select{min-height:40px}
}`;

function ModalAnexar({ osId, onFechar, onFeito }: { osId: string; onFechar: () => void; onFeito: () => void }) {
  const [modelos, setModelos] = useState<Modelo[] | null>(null);
  const [pops, setPops] = useState<Record<string, { codigo: string; titulo: string }>>({});
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [evento, setEvento] = useState("");
  const [escolhido, setEscolhido] = useState("");
  const [resp, setResp] = useState<Record<number, string>>({});
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/pops/roteiros", { headers: await authHeaders() });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Erro");
        setModelos(d.roteiros || []);
        setPops(Object.fromEntries((d.pops || []).map((p: { id: string; codigo: string; titulo: string }) => [p.id, p])));
      } catch (e) { setErro((e as Error).message); setModelos([]); }
      // evento do Marketing é opcional: falhar aqui não atrapalha
      try { setEventos((await chamarRoteiros<{ eventos: Evento[] }>(osId, { method: "GET", query: "eventos=1" })).eventos || []); } catch { /* sem eventos */ }
    })();
  }, [osId]);

  const m = modelos?.find((x) => x.id === escolhido);
  const faltaQuem = m ? m.etapas.filter((e) => !(resp[e.ordem] || e.responsavel_padrao_id)) : [];
  const anexar = async () => {
    setEnviando(true); setErro("");
    try { await chamarRoteiros(osId, { json: { roteiro_id: escolhido, responsaveis: resp, mkt_acao_id: evento || null } }); onFeito(); }
    catch (e) { setErro((e as Error).message); setEnviando(false); }
  };

  return createPortal(
    <div onClick={onFechar} className="ckos-fundo">
      <div onClick={(e) => e.stopPropagation()} className="ckos-janela" style={{ width: "min(640px, 100%)" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <b style={{ color: VERDE, fontSize: 16 }}>Adicionar checklists à OS {osId}</b>
          <button type="button" onClick={onFechar} aria-label="Fechar" style={{ marginLeft: "auto", border: 0, background: "transparent", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>
        {modelos === null ? <div style={{ color: "#6b7280" }}>Carregando…</div> : !modelos.length ? (
          <div style={{ fontSize: 13, color: "#6b7280" }}>
            Nenhum roteiro cadastrado. Cadastre em <a href="/pops/roteiros" target="_blank" rel="noreferrer" style={{ color: VERDE, fontWeight: 700 }}>Procedimentos (POP) → Roteiros</a>.
          </div>
        ) : (
          <>
            <select value={escolhido} onChange={(e) => { setEscolhido(e.target.value); setResp({}); }} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}>
              <option value="">Escolha o roteiro…</option>
              {modelos.map((x) => <option key={x.id} value={x.id}>{x.nome} ({x.etapas.length} etapas)</option>)}
            </select>
            {m?.descricao && <div style={{ fontSize: 13, color: "#4b5563" }}>{m.descricao}</div>}
            {m && eventos.length > 0 && (
              <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#4b5563" }}>
                Evento do Marketing (opcional)
                <select value={evento} onChange={(e) => setEvento(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}>
                  <option value="">Nenhum</option>
                  {eventos.map((e) => <option key={e.id} value={e.id}>{rotuloEvento(e)}</option>)}
                </select>
              </label>
            )}
            {m && (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Uma etapa de cada vez: a próxima é liberada quando a anterior termina, e quem faz recebe o aviso.</div>
                {m.etapas.map((e) => (
                  <div key={e.ordem} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 13 }}><b>{e.ordem}. {e.nome}</b> <span style={{ color: "#6b7280" }}>· {pops[e.pop_id]?.codigo || "POP"} {pops[e.pop_id]?.titulo || ""}{e.prazo_dias != null ? ` · prazo ${e.prazo_dias} d` : ""}</span></div>
                    <UserSelect value={resp[e.ordem] || e.responsavel_padrao_id || ""} onChange={(id) => setResp((r) => ({ ...r, [e.ordem]: id }))} placeholder="Quem faz esta etapa…" barraBusca />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {erro && <div style={{ color: "#dc2626", fontSize: 13, fontWeight: 600 }}>{erro}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onFechar} style={btn("#6b7280")}>Cancelar</button>
          <button type="button" disabled={!m || faltaQuem.length > 0 || enviando} onClick={anexar}
            style={{ ...btn(), background: VERDE, color: "#fefefe", opacity: !m || faltaQuem.length || enviando ? 0.5 : 1, padding: "7px 14px", fontSize: 13 }}>
            {enviando ? "Adicionando…" : faltaQuem.length ? `Falta escolher quem faz (${faltaQuem.length})` : "Adicionar e liberar a 1ª etapa"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type Celula = { texto: string; numero: number | null; fotos: string[]; delta: number | null; mudou: boolean; alerta: boolean } | null;
interface Comparacao {
  colunas: { etapa: string; ordem: number }[];
  linhas: { chave: string; titulo: string; tipo: string; unidade: string; celulas: Celula[]; mudou: boolean; alerta: boolean }[];
  mudancas: number; alertas: number; fotos: Record<string, string>;
}

/** Saída × Retorno: o mesmo checklist de cada etapa lado a lado, com o que mudou marcado. */
function ModalComparacao({ osId, roteiro, onFechar }: { osId: string; roteiro: Roteiro; onFechar: () => void }) {
  const [c, setC] = useState<Comparacao | null>(null);
  const [erro, setErro] = useState("");
  const [soMudou, setSoMudou] = useState(false);
  useEffect(() => {
    chamarRoteiros<Comparacao>(osId, { method: "GET", query: `comparar=${roteiro.id}` }).then(setC).catch((e) => setErro((e as Error).message));
  }, [osId, roteiro.id]);
  const linhas = c ? c.linhas.filter((l) => !soMudou || l.mudou || l.alerta) : [];
  const fmtDelta = (d: number, u: string) => `${d > 0 ? "+" : ""}${String(d).replace(".", ",")}${u ? ` ${u}` : ""}`;

  return createPortal(
    <div onClick={onFechar} className="ckos-fundo">
      <div onClick={(e) => e.stopPropagation()} className="ckos-janela" style={{ width: "min(1100px, 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <b style={{ color: VERDE, fontSize: 16 }}>Saída × Retorno · {roteiro.nome}</b>
          <button type="button" onClick={onFechar} aria-label="Fechar" style={{ marginLeft: "auto", border: 0, background: "transparent", fontSize: 22, cursor: "pointer", color: "#6b7280", minWidth: 40 }}>×</button>
        </div>
        {erro ? <div style={{ color: "#dc2626", fontSize: 13, fontWeight: 600 }}>{erro}</div> : !c ? <div style={{ color: "#6b7280" }}>Carregando…</div> : c.colunas.length < 2 ? (
          <div style={{ fontSize: 13, color: "#6b7280" }}>A comparação aparece quando duas etapas já foram feitas (por exemplo, a saída da loja e a chegada no evento).</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: c.mudancas ? "#b45309" : "#059669" }}>{c.mudancas ? `${c.mudancas} item(ns) mudaram` : "Nada mudou entre as etapas"}</span>
              {c.alertas > 0 && <span style={{ fontWeight: 700, color: "#dc2626" }}>{c.alertas} ponto(s) de atenção</span>}
              <label style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", cursor: "pointer", minHeight: 40 }}>
                <input type="checkbox" checked={soMudou} onChange={(e) => setSoMudou(e.target.checked)} /> Só o que mudou
              </label>
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Amarelo = diferente da etapa anterior · vermelho = pede atenção (era “sim” e virou “não”, ou fora da faixa). Toque na foto para abrir.</div>
            <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 8 }}>
              <table className="ckos-tabela">
                <thead>
                  <tr>
                    <th>Item</th>
                    {c.colunas.map((col) => <th key={col.ordem} style={{ minWidth: 150 }}>{col.ordem}. {col.etapa}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.chave}>
                      <td style={{ fontWeight: 600 }}>{l.titulo}</td>
                      {l.celulas.map((cel, i) => (
                        <td key={i} style={{ background: cel?.alerta ? "#fee2e2" : cel?.mudou ? "#fef3c7" : undefined }}>
                          {!cel ? <span style={{ color: "#9ca3af" }}>—</span> : (
                            <div style={{ display: "grid", gap: 4 }}>
                              {cel.texto ? <span style={{ fontWeight: cel.mudou || cel.alerta ? 700 : 400, color: cel.alerta ? "#b91c1c" : undefined }}>{cel.texto}{l.unidade && cel.numero !== null ? ` ${l.unidade}` : ""}</span> : <span style={{ color: "#9ca3af" }}>sem resposta</span>}
                              {cel.delta !== null && cel.delta !== 0 && <span style={{ fontSize: 12, fontWeight: 700, color: "#b45309" }}>{fmtDelta(cel.delta, l.unidade)}</span>}
                              {cel.fotos.length > 0 && (
                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                  {cel.fotos.map((f) => c.fotos[f] ? (
                                    <a key={f} href={c.fotos[f]} target="_blank" rel="noreferrer">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={c.fotos[f]} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb" }} />
                                    </a>
                                  ) : null)}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!linhas.length && <tr><td colSpan={c.colunas.length + 1} style={{ color: "#6b7280" }}>Nada mudou.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default function ChecklistsOSBloco({ osId, podeEditar }: { osId: string; podeEditar: boolean }) {
  const [d, setD] = useState<Dados | null>(null);
  const [aviso, setAviso] = useState("");
  const [semBanco, setSemBanco] = useState(false);
  const [anexar, setAnexar] = useState(false);
  const [trocando, setTrocando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [comparando, setComparando] = useState<Roteiro | null>(null);
  const [ligando, setLigando] = useState<string | null>(null);
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const abrirLigar = async (r: Roteiro) => {
    setLigando(ligando === r.id ? null : r.id);
    if (!eventos) {
      try { setEventos((await chamarRoteiros<{ eventos: Evento[] }>(osId, { method: "GET", query: "eventos=1" })).eventos || []); }
      catch { setEventos([]); }
    }
  };

  const carregar = useCallback(async () => {
    try { setD(await chamarRoteiros<Dados>(osId)); setAviso(""); }
    catch (e) { if ((e as { migracaoFaltando?: boolean }).migracaoFaltando) setSemBanco(true); else setAviso((e as Error).message); }
  }, [osId]);
  // carrega ao abrir a OS
  useEffect(() => { carregar(); }, [carregar]);

  const patch = async (json: Record<string, unknown>) => {
    setOcupado(true);
    try { await chamarRoteiros(osId, { method: "PATCH", json }); await carregar(); }
    catch (e) { setAviso((e as Error).message); }
    finally { setOcupado(false); setTrocando(null); }
  };
  const pular = (e: Etapa) => {
    const motivo = window.prompt(`Pular a etapa "${e.nome}"? Diga o motivo:`);
    if (motivo && motivo.trim()) patch({ acao: "pular", etapa_id: e.id, motivo });
  };

  if (semBanco) return null;   // migration ainda não aplicada: o bloco não aparece
  const nome = (u?: string | null) => (u && d?.usuarios[u]?.nome) || "—";
  const nada = d && !d.roteiros.length && !d.avulsas.length;

  return (
    <div className="ckos-bloco" style={{ border: "1px solid #99f6e4", background: "#f0fdfa", borderRadius: 10, padding: 12, margin: "10px 0", display: "grid", gap: 10 }}>
      <style>{CSS}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b style={{ color: VERDE, fontSize: 14 }}>Checklists desta OS</b>
        {d && d.pendentes.length > 0 && <span style={{ fontSize: 12, color: "#b45309", fontWeight: 700 }}>{d.pendentes.length} a fazer</span>}
        <span style={{ flex: 1 }} />
        {podeEditar && <button type="button" onClick={() => setAnexar(true)} style={btn()}>+ Adicionar roteiro</button>}
      </div>
      {!d ? <div style={{ fontSize: 13, color: "#6b7280" }}>Carregando…</div> : nada ? (
        <div style={{ fontSize: 13, color: "#6b7280" }}>Nenhum checklist. Ex.: levar trator a um evento — saída da loja, chegada no evento, saída do evento e chegada na loja.</div>
      ) : null}

      {d?.roteiros.map((r) => {
        const s = situacaoRoteiro(r.etapas);
        return (
          <div key={r.id} style={{ background: "#fefefe", border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, opacity: r.status === "cancelado" ? 0.55 : 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <b style={{ fontSize: 13 }}>{r.nome}</b>
              <span style={{ fontSize: 12, color: r.status === "concluido" ? "#059669" : r.status === "cancelado" ? "#6b7280" : "#b45309", fontWeight: 700 }}>
                {r.status === "concluido" ? "✓ tudo feito" : r.status === "cancelado" ? "cancelado" : `${s.feitas} de ${s.total} feitas`}
              </span>
              <span style={{ flex: 1 }} />
              {r.etapas.filter((e) => e.ticket_id).length >= 2 && (
                <button type="button" onClick={() => setComparando(r)} style={btn()}>Saída × Retorno</button>
              )}
              {podeEditar && r.status !== "cancelado" && (
                <button type="button" onClick={() => abrirLigar(r)} style={btn("#6b7280")}>{r.mkt_acao_id ? "Trocar evento" : "Ligar a um evento"}</button>
              )}
              {podeEditar && r.status === "ativo" && (
                <button type="button" disabled={ocupado} onClick={() => { if (window.confirm(`Cancelar o roteiro "${r.nome}" nesta OS? A etapa em andamento é cancelada junto.`)) patch({ acao: "cancelar", roteiro_os_id: r.id }); }} style={btn("#9ca3af")}>Cancelar roteiro</button>
              )}
            </div>
            {r.mkt_acao_id && d?.eventos?.[r.mkt_acao_id] && (
              <div style={{ fontSize: 12, marginBottom: 6 }}>
                Evento: <a href={`/marketing/${r.mkt_acao_id}`} target="_blank" rel="noreferrer" style={{ color: "#DB2777", fontWeight: 700 }}>{rotuloEvento(d.eventos[r.mkt_acao_id])}</a>
              </div>
            )}
            {ligando === r.id && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                {eventos === null ? <span style={{ fontSize: 12, color: "#6b7280" }}>Carregando eventos…</span> : (
                  <select defaultValue={r.mkt_acao_id || ""} disabled={ocupado}
                    onChange={(ev) => { patch({ acao: "evento", roteiro_os_id: r.id, mkt_acao_id: ev.target.value || null }); setLigando(null); }}
                    style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, maxWidth: "100%" }}>
                    <option value="">Nenhum evento</option>
                    {eventos.map((e) => <option key={e.id} value={e.id}>{rotuloEvento(e)}</option>)}
                  </select>
                )}
                {eventos !== null && !eventos.length && <span style={{ fontSize: 12, color: "#6b7280" }}>Nenhuma ação do Marketing nos últimos 60 dias.</span>}
              </div>
            )}
            <div style={{ display: "grid", gap: 4 }}>
              {[...r.etapas].sort((a, b) => a.ordem - b.ordem).map((e) => {
                const info = STATUS_ETAPA_INFO[e.status];
                const cancelada = e.status === "liberada" && (!e.ticket || e.ticket.status === "cancelado");
                const ativo = r.status === "ativo";
                return (
                  <div key={e.id} style={{ display: "grid", gridTemplateColumns: "22px minmax(0,1fr) auto", gap: 8, alignItems: "center", fontSize: 13, padding: "6px 0", borderTop: "1px solid #f1f5f9" }}>
                    <span style={{ color: info.cor, fontWeight: 900, textAlign: "center" }}>{ICONE[e.status]}</span>
                    <div style={{ minWidth: 0 }}>
                      <div><b>{e.ordem}. {e.nome}</b> <span style={{ color: "#6b7280" }}>· {e.pop?.codigo || "POP"}</span></div>
                      <div style={{ fontSize: 12, color: "#4b5563" }}>
                        {cancelada ? <span style={{ color: "#dc2626", fontWeight: 700 }}>execução cancelada — libere de novo ou pule</span> : info.label}
                        {" · "}{nome(e.responsavel_id)}
                        {e.ticket && <> · #{e.ticket.numero}</>}
                        {e.status === "liberada" && e.ticket?.prazo && <> · prazo {br(e.ticket.prazo)}</>}
                        {e.concluida_em && e.status === "concluida" && <> · {br(e.concluida_em)}</>}
                        {e.status === "pulada" && e.motivo_pulo && <> · {e.motivo_pulo}</>}
                        {e.fora_faixa > 0 && <span style={{ color: "#dc2626", fontWeight: 700 }}> · {e.fora_faixa} fora da faixa</span>}
                      </div>
                      {trocando === e.id && (
                        <div style={{ marginTop: 6, maxWidth: 360 }}>
                          <UserSelect value={e.responsavel_id} onChange={(id) => id && patch({ acao: "responsavel", etapa_id: e.id, responsavel_id: id })} placeholder="Quem faz…" barraBusca autoFocus />
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {e.ticket_id && !cancelada && (
                        <a href={`/pops/executar/${e.ticket_id}`} target="_blank" rel="noreferrer" style={{ ...btn(), textDecoration: "none" }}>{e.status === "liberada" ? "Executar" : "Ver"}</a>
                      )}
                      {podeEditar && ativo && cancelada && <button type="button" disabled={ocupado} onClick={() => patch({ acao: "liberar", etapa_id: e.id })} style={btn()}>Liberar de novo</button>}
                      {podeEditar && ativo && e.status === "pendente" && <button type="button" onClick={() => setTrocando(trocando === e.id ? null : e.id)} style={btn("#6b7280")}>Quem faz</button>}
                      {podeEditar && ativo && (e.status === "pendente" || e.status === "liberada") && <button type="button" disabled={ocupado} onClick={() => pular(e)} style={btn("#9ca3af")}>Pular</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {d && d.avulsas.length > 0 && (
        <div style={{ background: "#fefefe", border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
          <b style={{ fontSize: 13 }}>Outros POPs desta OS</b>
          {d.avulsas.map((a) => (
            <div key={a.ticket_id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "6px 0", borderTop: "1px solid #f1f5f9" }}>
              <span style={{ flex: 1 }}>{a.pop?.codigo} {a.pop?.titulo} <span style={{ color: "#6b7280" }}>· {nome(a.ticket?.responsavel_id)}{a.ticket ? ` · #${a.ticket.numero} ${a.ticket.status}` : ""}</span></span>
              <a href={`/pops/executar/${a.ticket_id}`} target="_blank" rel="noreferrer" style={{ ...btn(), textDecoration: "none" }}>Abrir</a>
            </div>
          ))}
        </div>
      )}

      {aviso && <div style={{ color: "#dc2626", fontSize: 13, fontWeight: 600 }}>{aviso}</div>}
      {comparando && <ModalComparacao osId={osId} roteiro={comparando} onFechar={() => setComparando(null)} />}
      {anexar && <ModalAnexar osId={osId} onFechar={() => setAnexar(false)} onFeito={() => { setAnexar(false); carregar(); }} />}
    </div>
  );
}
