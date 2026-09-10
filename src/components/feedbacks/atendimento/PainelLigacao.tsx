"use client";
// Coluna direita do cockpit: A LIGAÇÃO. Três momentos:
//  1) sem ligação → "Iniciar ligação" (ou aviso "em atendimento por Fulano")
//  2) durante → cronômetro, telefone usado, notas com autosave
//  3) ao encerrar → desfecho em botões grandes + campos que o desfecho pede
import { useEffect, useMemo, useState } from "react";
import styles from "../feedbacks.module.css";
import { DESFECHOS, DESFECHO_POR_VALOR, ehDesfecho, efeitosDoDesfecho, validarEncerramento, type Desfecho, type PayloadEncerrar } from "@/lib/feedbacks/atendimento/chamada";
import { CONFIG_RETORNO_PADRAO, HUMORES, QUALIDADES, TAG_CLIENTE_SENSIVEL, emojiHumor, sugerirCaveira, sugerirRetorno, type ConfigRetorno } from "@/lib/feedbacks/atendimento/retorno";
import type { EstadoChamada } from "@/lib/feedbacks/atendimento/use-chamada";
import { formatarDuracao, horaCurta } from "@/lib/feedbacks/atendimento/tempo";
import { fmtDataBR } from "@/lib/feedbacks/atendimento/rotulos";
import { linkWhatsapp } from "@/lib/feedbacks/telefone";
import type { TipoFeedback } from "@/lib/feedbacks/types";

export const COR_ATENDIMENTO = "#d97706";

export interface TelefoneOpcao { numero: string; wa: string | null; origem: string }

interface Props {
  estado: EstadoChamada;
  telefones: TelefoneOpcao[];
  naoContatar: boolean;
  abertoEmDoRegistro: string | null; // p/ prever a regra das 24 h
  onIniciar: (telefone: string | null) => Promise<unknown>;
  onSetTelefone: (t: string) => void;
  onSetNotas: (t: string) => void;
  onEncerrar: (p: PayloadEncerrar, extras: { marcarSensivel: boolean }) => Promise<unknown>;
  onCancelar: () => Promise<unknown>;
  onRegistrarSemLigar: (tipo: TipoFeedback) => void;
  // Fase 2
  configRetorno?: ConfigRetorno;
  humoresRecentes?: number[];
}

export default function PainelLigacao(p: Props) {
  const { estado } = p;
  const ch = estado.chamada;
  const [telSel, setTelSel] = useState<string>("");
  const [notas, setNotas] = useState<string>("");
  const [desfecho, setDesfecho] = useState<Desfecho | null>(null);
  const [motivoId, setMotivoId] = useState<number | "">("");
  const [motivoObs, setMotivoObs] = useState("");
  const [retorno, setRetorno] = useState("");
  const [servico, setServico] = useState("");
  const [resumo, setResumo] = useState("");
  const [humor, setHumor] = useState<number | null>(null);
  const [qualidade, setQualidade] = useState<number | null>(null);
  const [marcarSensivel, setMarcarSensivel] = useState(false);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const cfg = p.configRetorno ?? CONFIG_RETORNO_PADRAO;

  // sincroniza o formulário quando a chamada muda (retomada / nova)
  useEffect(() => {
    setNotas(ch?.notas_ao_vivo ?? "");
    setTelSel(ch?.telefone_usado ?? p.telefones[0]?.numero ?? "");
    setDesfecho(null); setMotivoId(""); setMotivoObs(""); setRetorno(""); setServico(""); setResumo(""); setErroLocal(null);
    setHumor(null); setQualidade(null); setMarcarSensivel(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ch?.id]);

  // Retorno sugerido (Fase 2): depende do desfecho E do humor — recalcula a
  // sugestão sempre que um dos dois muda (o usuário ainda pode editar a data).
  const sugestao = useMemo(() => (ehDesfecho(desfecho) ? sugerirRetorno(desfecho, humor, cfg) : null), [desfecho, humor, cfg]);
  useEffect(() => {
    if (sugestao?.data) setRetorno(sugestao.data);
    if (sugestao?.humor_baixo) setMarcarSensivel(true);
  }, [sugestao?.data, sugestao?.humor_baixo]);
  const sugerirNaoContatar = useMemo(() => sugerirCaveira(p.humoresRecentes ?? [], humor, cfg), [p.humoresRecentes, humor, cfg]);

  const payload: Partial<PayloadEncerrar> = useMemo(() => ({
    desfecho: desfecho ?? undefined,
    motivo_negativa_id: motivoId === "" ? null : Number(motivoId),
    motivo_negativa_obs: motivoObs || null,
    proximo_contato_em: (desfecho === "retornar" || desfecho === "sem_resposta") && retorno ? retorno : null,
    servico_previsto_em: desfecho === "servico_agendado" && servico ? servico : null,
    notas_encerramento: resumo || null,
    telefone_usado: telSel || null,
    humor_cliente: humor,
    qualidade_conversa: qualidade,
  }), [desfecho, motivoId, motivoObs, retorno, servico, resumo, telSel, humor, qualidade]);
  const errosValidacao = useMemo(() => validarEncerramento(payload), [payload]);
  const previsao = useMemo(() => (ehDesfecho(desfecho) ? efeitosDoDesfecho(desfecho, { aberto_em: p.abertoEmDoRegistro, proximo_contato_em: payload.proximo_contato_em ?? null }) : null), [desfecho, p.abertoEmDoRegistro, payload.proximo_contato_em]);

  const telefoneAtual = p.telefones.find((t) => t.numero === telSel) ?? null;

  // ───────── 1) sem ligação ─────────
  if (estado.situacao !== "minha") {
    return (
      <>
        <section className={styles.card} style={{ ["--fb-accent" as string]: COR_ATENDIMENTO }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 800 }}>☎️ Ligar para</h3>
          {p.naoContatar && <Aviso cor="#991b1b" bg="#fee2e2">🚫 CONTATO BLOQUEADO · NÃO CONTATAR. Marcação feita a pedido do cliente ou por decisão da loja — não ligue sem autorização de quem marcou.</Aviso>}
          {estado.situacao === "carregando" && <p style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>Verificando se há ligação em andamento…</p>}
          {estado.situacao === "erro" && <Aviso cor="#92400e" bg="#fef3c7">Não consegui consultar a ligação: {estado.erro}</Aviso>}
          {estado.situacao === "de_outro" && ch && (
            <Aviso cor="#3730a3" bg="#e0e7ff">🎧 <strong>{ch.atendente_nome}</strong> está em ligação com este cliente desde {horaCurta(ch.iniciada_em)}. Espere terminar ou combine com a pessoa.</Aviso>
          )}
          {p.telefones.length === 0 ? (
            <p style={{ margin: "8px 0 0", fontSize: 12, opacity: 0.7 }}>Nenhum telefone cadastrado. Confira o cadastro no Omie.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {p.telefones.map((t) => (
                <label key={t.numero} style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${telSel === t.numero ? COR_ATENDIMENTO : "var(--portal-border)"}`, borderRadius: 12, padding: "8px 12px", cursor: "pointer", background: telSel === t.numero ? "#fffbeb" : "transparent" }}>
                  <input type="radio" name="tel" checked={telSel === t.numero} onChange={() => setTelSel(t.numero)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, opacity: 0.65 }}>{t.origem}</div>
                    <div style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{t.numero}</div>
                  </div>
                  {t.wa && <a href={linkWhatsapp(t.wa) ?? "#"} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={btn("#25d366", true)}>WhatsApp</a>}
                </label>
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={estado.ocupado || estado.situacao === "de_outro" || estado.situacao === "carregando"}
            onClick={() => { setErroLocal(null); p.onIniciar(telSel || null).catch((e) => setErroLocal((e as Error).message)); }}
            style={{ ...btnGrande(COR_ATENDIMENTO, true), marginTop: 12, width: "100%", alignItems: "center", justifyContent: "center" }}
          >
            {estado.ocupado ? "Iniciando…" : "▶ Iniciar ligação"}
          </button>
          {telefoneAtual && (
            <a href={`tel:${telefoneAtual.wa ? `+${telefoneAtual.wa}` : telefoneAtual.numero.replace(/\D/g, "")}`} style={{ display: "block", textAlign: "center", marginTop: 6, fontSize: 12, color: "#0369a1" }}>
              discar {telefoneAtual.numero} pelo computador
            </a>
          )}
          {(erroLocal || estado.erro) && estado.situacao !== "erro" && <Aviso cor="#991b1b" bg="#fee2e2">{erroLocal || estado.erro}</Aviso>}
        </section>

        <section className={styles.card} style={{ ["--fb-accent" as string]: COR_ATENDIMENTO }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 800 }}>📝 Registrar sem ligar</h3>
          <p style={{ margin: "0 0 10px", fontSize: 12, opacity: 0.75 }}>Conversou por outro canal ou visita? Anote direto:</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button type="button" onClick={() => p.onRegistrarSemLigar("rfm")} style={btnGrande("#6366f1", false)}><span>🟣 Reativação / oferta</span><small>Cliente parado, revisão, peças, garantia</small></button>
            <button type="button" onClick={() => p.onRegistrarSemLigar("crm")} style={btnGrande("#dc2626", false)}><span>🔴 Pós-serviço (satisfação)</span><small>Nota, NPS e o que melhorar</small></button>
          </div>
        </section>
      </>
    );
  }

  // ───────── 2) e 3) durante / ao encerrar ─────────
  const d = desfecho ? DESFECHO_POR_VALOR[desfecho] : null;
  const podeEncerrar = errosValidacao.length === 0 && !estado.ocupado;
  const podeCancelar = !notas.trim() && !estado.ocupado;

  return (
    <>
      <section className={styles.card} style={{ ["--fb-accent" as string]: "#16a34a" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>🟢 Em ligação</h3>
          <span style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: "#16a34a" }}>{formatarDuracao(estado.segundos)}</span>
        </div>
        <label style={{ display: "block", fontSize: 11, opacity: 0.65, marginTop: 10 }}>Telefone usado</label>
        <div style={{ display: "flex", gap: 6 }}>
          <select value={p.telefones.some((t) => t.numero === telSel) ? telSel : "__outro"} onChange={(e) => { const v = e.target.value === "__outro" ? "" : e.target.value; setTelSel(v); p.onSetTelefone(v); }} style={input}>
            {p.telefones.map((t) => <option key={t.numero} value={t.numero}>{t.numero} · {t.origem}</option>)}
            <option value="__outro">outro…</option>
          </select>
        </div>
        {!p.telefones.some((t) => t.numero === telSel) && (
          <input value={telSel} onChange={(e) => { setTelSel(e.target.value); p.onSetTelefone(e.target.value); }} placeholder="(14) 9 9999-9999" style={{ ...input, marginTop: 6 }} />
        )}

        <label style={{ display: "block", fontSize: 11, opacity: 0.65, marginTop: 10 }}>Anotações durante a ligação</label>
        <textarea
          value={notas}
          onChange={(e) => { setNotas(e.target.value); p.onSetNotas(e.target.value); }}
          placeholder="O que o cliente está dizendo… (salva sozinho)"
          rows={6}
          style={{ ...input, resize: "vertical", lineHeight: 1.45 }}
        />
        <div style={{ fontSize: 11, marginTop: 4, color: estado.salvar === "erro" ? "#991b1b" : "#64748b" }}>
          {estado.salvar === "salvando" && "salvando…"}
          {estado.salvar === "sujo" && "alterado — salvando em instantes"}
          {estado.salvar === "salvo" && `salvo · ${horaCurta(estado.salvoEm)}`}
          {estado.salvar === "erro" && "erro ao salvar — tentando de novo"}
          {estado.salvar === "ocioso" && " "}
        </div>
      </section>

      <section className={styles.card} style={{ ["--fb-accent" as string]: COR_ATENDIMENTO }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 800 }}>🏁 Como terminou?</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {DESFECHOS.map((x) => (
            <button key={x.valor} type="button" onClick={() => setDesfecho(x.valor)} title={x.ajuda}
              style={{ ...btnGrande(COR_ATENDIMENTO, desfecho === x.valor), padding: "10px 10px", fontSize: 13 }}>
              <span>{x.emoji} {x.rotulo}</span>
            </button>
          ))}
        </div>
        {d && <p style={{ margin: "8px 0 0", fontSize: 12, opacity: 0.7 }}>{d.ajuda}</p>}

        {d?.pede_termometros && (
          <>
            <label style={rotulo}>Como o cliente estava? *</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
              {HUMORES.map((h) => (
                <button key={h.valor} type="button" onClick={() => setHumor(h.valor)} title={h.rotulo}
                  style={{ ...btnNota(humor === h.valor, h.valor <= cfg.humor_baixo_max ? "#b45309" : "#16a34a"), fontSize: 20 }}>
                  {h.emoji}<small style={{ fontSize: 9, display: "block" }}>{h.rotulo}</small>
                </button>
              ))}
            </div>
            <label style={rotulo}>Como foi a conversa? *</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
              {QUALIDADES.map((q) => (
                <button key={q.valor} type="button" onClick={() => setQualidade(q.valor)} title={q.rotulo}
                  style={{ ...btnNota(qualidade === q.valor, "#0369a1"), fontSize: 15 }}>
                  {q.emoji}<small style={{ fontSize: 9, display: "block" }}>{q.rotulo}</small>
                </button>
              ))}
            </div>
            {sugestao?.humor_baixo && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, background: "#fef3c7", color: "#92400e", borderRadius: 10, padding: "8px 10px", cursor: "pointer" }}>
                <input type="checkbox" checked={marcarSensivel} onChange={(e) => setMarcarSensivel(e.target.checked)} />
                <span>Cliente {emojiHumor(humor)} chateado: marcar como <strong>{TAG_CLIENTE_SENSIVEL}</strong> na pasta (avisa quem ligar depois)</span>
              </label>
            )}
            {sugerirNaoContatar && (
              <Aviso cor="#111" bg="#e5e7eb">💀 Duas ligações seguidas com o cliente irritado. Considere marcar <strong>Não contatar</strong> pelo CRM — isso nunca é automático.</Aviso>
            )}
          </>
        )}

        {d?.precisa_motivo && (
          <>
            <label style={rotulo}>Motivo *</label>
            <select value={motivoId} onChange={(e) => setMotivoId(e.target.value === "" ? "" : Number(e.target.value))} style={input}>
              <option value="">escolha…</option>
              {estado.motivos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
            <input value={motivoObs} onChange={(e) => setMotivoObs(e.target.value)} placeholder="detalhe (opcional)" style={{ ...input, marginTop: 6 }} />
          </>
        )}
        {d?.pede_retorno && (
          <>
            <label style={rotulo}>Ligar de novo em {d.precisa_retorno ? "*" : ""}</label>
            <input type="date" value={retorno} onChange={(e) => setRetorno(e.target.value)} style={input} />
            {sugestao?.motivo && <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{sugestao.motivo}</div>}
          </>
        )}
        {d?.pede_servico && (
          <>
            <label style={rotulo}>Data prevista do serviço (opcional)</label>
            <input type="date" value={servico} onChange={(e) => setServico(e.target.value)} style={input} />
          </>
        )}
        {d && (
          <>
            <label style={rotulo}>Resumo para o histórico</label>
            <textarea value={resumo} onChange={(e) => setResumo(e.target.value)} rows={3} placeholder="Em uma frase: o que ficou combinado" style={{ ...input, resize: "vertical" }} />
          </>
        )}

        {previsao && (
          <div style={{ fontSize: 11, marginTop: 8, padding: "6px 10px", borderRadius: 8, background: "var(--portal-bg)", border: "1px solid var(--portal-border)", opacity: 0.85 }}>
            Ao encerrar: atendimento fica <strong>{rotuloStatus(previsao.status_atendimento)}</strong>
            {previsao.proximo_contato_em && <> · retorno em <strong>{fmtDataBR(previsao.proximo_contato_em)}</strong></>}
            {previsao.oportunidade === "atendida" && <> · motivo da fila marcado como atendido</>}
            {previsao.marca_pendencia_cadastral && <> · cadastro marcado com pendência</>}
            {previsao.regra_24h_aplicada && <> · (aberto há menos de 24 h: fica em aberto, não &ldquo;não respondeu&rdquo;)</>}
          </div>
        )}

        {errosValidacao.length > 0 && desfecho && <div style={{ fontSize: 11, color: "#92400e", marginTop: 6 }}>{errosValidacao.join(" ")}</div>}
        {(erroLocal || estado.erro) && <Aviso cor="#991b1b" bg="#fee2e2">{erroLocal || estado.erro}</Aviso>}

        <button
          type="button"
          disabled={!podeEncerrar}
          onClick={() => { setErroLocal(null); p.onEncerrar(payload as PayloadEncerrar, { marcarSensivel: !!sugestao?.humor_baixo && marcarSensivel }).catch((e) => setErroLocal((e as Error).message)); }}
          style={{ ...btnGrande("#16a34a", true), marginTop: 10, width: "100%", alignItems: "center", justifyContent: "center", opacity: podeEncerrar ? 1 : 0.5 }}
        >
          {estado.ocupado ? "Gravando…" : "■ Encerrar ligação"}
        </button>
        <button
          type="button"
          disabled={!podeCancelar}
          title={notas.trim() ? "Há anotações — encerre a ligação em vez de cancelar" : "Apaga esta ligação (não houve conversa)"}
          onClick={() => { setErroLocal(null); p.onCancelar().catch((e) => setErroLocal((e as Error).message)); }}
          style={{ ...btn("#64748b", false), marginTop: 8, width: "100%", opacity: podeCancelar ? 1 : 0.4 }}
        >
          Cancelar ligação (não houve conversa)
        </button>
      </section>
    </>
  );
}

function rotuloStatus(s: string): string {
  return ({ aberto: "em aberto", em_andamento: "em andamento", concluido: "concluído", sem_resposta: "não respondeu", arquivado: "arquivado" } as Record<string, string>)[s] ?? s;
}

function Aviso({ cor, bg, children }: { cor: string; bg: string; children: React.ReactNode }) {
  return <div style={{ background: bg, color: cor, borderRadius: 10, padding: "8px 12px", fontSize: 12, marginTop: 8, lineHeight: 1.45 }}>{children}</div>;
}
function btn(cor: string, preenchido: boolean): React.CSSProperties {
  return { fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 999, border: `1px solid ${cor}`, background: preenchido ? cor : "transparent", color: preenchido ? "#fff" : cor, cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap" };
}
function btnGrande(cor: string, preenchido: boolean): React.CSSProperties {
  return { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, padding: "12px 14px", borderRadius: 12, border: `2px solid ${cor}`, background: preenchido ? cor : "transparent", color: preenchido ? "#fff" : cor, cursor: "pointer", fontSize: 14, fontWeight: 800, textAlign: "left" };
}
function btnNota(ativo: boolean, cor: string): React.CSSProperties {
  return { padding: "6px 2px", borderRadius: 10, border: `2px solid ${ativo ? cor : "var(--portal-border)"}`, background: ativo ? `${cor}22` : "transparent", color: "inherit", cursor: "pointer", lineHeight: 1.1 };
}
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 10, border: "1px solid var(--portal-border)", fontSize: 13, background: "var(--portal-bg-card)", color: "inherit" };
const rotulo: React.CSSProperties = { display: "block", fontSize: 11, opacity: 0.65, marginTop: 10, marginBottom: 4 };
