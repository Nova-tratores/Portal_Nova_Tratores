"use client";

// Bloco "Checklists desta OS": roteiros de POPs anexados à OS (ex.: trator levado
// a evento → saída da loja → chegada no evento → saída do evento → chegada na loja).
// Uma etapa de cada vez: a próxima é liberada sozinha quando a anterior termina.
// Mostra também execuções de POP ligadas à OS por gatilho. Via /api/pos/ordens/[id]/roteiros.
import { useCallback, useEffect, useState } from "react";
import UserSelect from "@/components/tickets/UserSelect";
import { authHeaders } from "@/lib/auth/client";
import { chamarRoteiros } from "@/lib/pops/roteiros-client";
import { STATUS_ETAPA_INFO, situacaoRoteiro, type EtapaOS, type StatusEtapa } from "@/lib/pops/roteiros";

const VERDE = "#0f766e";
type Ticket = { id: string; numero: number; status: string; prazo: string | null; responsavel_id: string } | null;
type PopMin = { id: string; codigo: string; titulo: string } | null;
interface Etapa extends EtapaOS { pop: PopMin; ticket: Ticket; fora_faixa: number }
interface Roteiro { id: string; nome: string; status: "ativo" | "concluido" | "cancelado"; criado_em: string; etapas: Etapa[] }
interface Avulsa { ticket_id: string; pop: PopMin; ticket: Ticket }
interface Dados { roteiros: Roteiro[]; avulsas: Avulsa[]; pendentes: string[]; usuarios: Record<string, { nome: string }> }
interface Modelo { id: string; nome: string; descricao: string; etapas: { ordem: number; nome: string; pop_id: string; responsavel_padrao_id: string | null; prazo_dias: number | null }[] }

const br = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
const btn = (cor = VERDE): React.CSSProperties => ({ border: `1px solid ${cor}`, background: "transparent", color: cor, borderRadius: 7, padding: "3px 9px", fontSize: 12, fontWeight: 700, cursor: "pointer" });
const ICONE: Record<StatusEtapa, string> = { pendente: "🔒", liberada: "▶", concluida: "✓", pulada: "⤼" };

function ModalAnexar({ osId, onFechar, onFeito }: { osId: string; onFechar: () => void; onFeito: () => void }) {
  const [modelos, setModelos] = useState<Modelo[] | null>(null);
  const [pops, setPops] = useState<Record<string, { codigo: string; titulo: string }>>({});
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
    })();
  }, []);

  const m = modelos?.find((x) => x.id === escolhido);
  const faltaQuem = m ? m.etapas.filter((e) => !(resp[e.ordem] || e.responsavel_padrao_id)) : [];
  const anexar = async () => {
    setEnviando(true); setErro("");
    try { await chamarRoteiros(osId, { json: { roteiro_id: escolhido, responsaveis: resp } }); onFeito(); }
    catch (e) { setErro((e as Error).message); setEnviando(false); }
  };

  return (
    <div onClick={onFechar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "min(640px, 100%)", maxHeight: "90vh", overflow: "auto", padding: 18, display: "grid", gap: 12 }}>
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
    </div>
  );
}

export default function ChecklistsOSBloco({ osId, podeEditar }: { osId: string; podeEditar: boolean }) {
  const [d, setD] = useState<Dados | null>(null);
  const [aviso, setAviso] = useState("");
  const [semBanco, setSemBanco] = useState(false);
  const [anexar, setAnexar] = useState(false);
  const [trocando, setTrocando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

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
    <div style={{ border: "1px solid #99f6e4", background: "#f0fdfa", borderRadius: 10, padding: 12, margin: "10px 0", display: "grid", gap: 10 }}>
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
              {podeEditar && r.status === "ativo" && (
                <button type="button" disabled={ocupado} onClick={() => { if (window.confirm(`Cancelar o roteiro "${r.nome}" nesta OS? A etapa em andamento é cancelada junto.`)) patch({ acao: "cancelar", roteiro_os_id: r.id }); }} style={btn("#9ca3af")}>Cancelar roteiro</button>
              )}
            </div>
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
      {anexar && <ModalAnexar osId={osId} onFechar={() => setAnexar(false)} onFeito={() => { setAnexar(false); carregar(); }} />}
    </div>
  );
}
