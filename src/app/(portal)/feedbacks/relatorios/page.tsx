"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listarRegistros } from "@/lib/feedbacks/api";
import type { FeedbackRegistro, TipoFeedback } from "@/lib/feedbacks/types";
import styles from "@/components/feedbacks/feedbacks.module.css";

type Fonte = "todos" | TipoFeedback;
type View = "geral" | "dia" | "atendentes";

interface StatsAtendDet {
  atendente: string;
  hoje: number;
  ontem: number;
  sete: number;         // contatos nos últimos 7 dias
  respondeu: number;    // dos últimos 7 dias: status_atendimento concluído
  positiva: number;     // só CRM (satisfação)
  negativa: number;     // só CRM (satisfação)
  gerouServico: number; // 7 dias: atendimentos com "serviço confirmado" preenchido
}

interface StatsTecnico {
  tecnico: string;
  total: number;
  satisfeitos: number;
  insatisfeitos: number;
  notaMedia: number | null;
  pctSatisfeitos: number;
}

interface StatsCliente {
  nome: string;
  total: number;
  notaMedia: number | null;
  ultimoContato: string;
}

interface StatsAtendente {
  atendente: string;
  total: number;       // atendimentos que passou pela mão dele
  concluidos: number;
  semResposta: number;
  emAberto: number;    // aberto/em_andamento
  pctConclusao: number;
}

function dataRef(r: FeedbackRegistro): string {
  return r.data_contato || r.data_servico || r.ultimo_servico || r.criado_em;
}

function escapeCSV(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function gerarCSV(rows: FeedbackRegistro[]): string {
  const headers = [
    "id","tipo","nome","telefone","trator","tecnico","codigo_omie","data_contato",
    "servico","data_servico","status_cliente","nota","feedback","nps","melhoria",
    "ultimo_servico","motivo","prioridade","acao","sem_resposta","revisao_confirmada",
    "criado_em",
  ];
  const linhas = [headers.join(",")];
  for (const r of rows) {
    linhas.push(headers.map((h) => escapeCSV((r as unknown as Record<string, unknown>)[h])).join(","));
  }
  return linhas.join("\n");
}

function baixarCSV(rows: FeedbackRegistro[], nome: string) {
  const csv = "﻿" + gerarCSV(rows);  // BOM para Excel BR
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}

export default function RelatoriosPage() {
  const [registros, setRegistros] = useState<FeedbackRegistro[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [fonte, setFonte] = useState<Fonte>("todos");
  const [view, setView] = useState<View>("geral");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [diaEscolhido, setDiaEscolhido] = useState(() => new Date().toISOString().slice(0, 10));

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const [crm, rfm] = await Promise.all([listarRegistros("crm"), listarRegistros("rfm")]);
      setRegistros([...crm, ...rfm]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const filtradas = useMemo(() => {
    return registros.filter((r) => {
      if (fonte !== "todos" && r.tipo !== fonte) return false;
      const d = dataRef(r);
      if (dataDe && d && d < dataDe) return false;
      if (dataAte && d && d > dataAte) return false;
      return true;
    });
  }, [registros, fonte, dataDe, dataAte]);

  const statsTecnico = useMemo<StatsTecnico[]>(() => {
    const map = new Map<string, StatsTecnico>();
    for (const r of filtradas) {
      if (!r.tecnico) continue;
      let s = map.get(r.tecnico);
      if (!s) {
        s = { tecnico: r.tecnico, total: 0, satisfeitos: 0, insatisfeitos: 0, notaMedia: null, pctSatisfeitos: 0 };
        map.set(r.tecnico, s);
      }
      s.total++;
      if (r.status_cliente === "Satisfeito") s.satisfeitos++;
      if (r.status_cliente === "Insatisfeito") s.insatisfeitos++;
    }
    for (const s of map.values()) {
      const notas = filtradas.filter((r) => r.tecnico === s.tecnico).map((r) => r.nota).filter((n): n is number => n !== null && n !== undefined);
      s.notaMedia = notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null;
      s.pctSatisfeitos = s.total > 0 ? Math.round((s.satisfeitos / s.total) * 100) : 0;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtradas]);

  const topClientes = useMemo<StatsCliente[]>(() => {
    const map = new Map<string, StatsCliente>();
    for (const r of filtradas) {
      let s = map.get(r.nome);
      if (!s) {
        s = { nome: r.nome, total: 0, notaMedia: null, ultimoContato: "" };
        map.set(r.nome, s);
      }
      s.total++;
      const d = dataRef(r);
      if (d > s.ultimoContato) s.ultimoContato = d;
    }
    for (const s of map.values()) {
      const notas = filtradas.filter((r) => r.nome === s.nome).map((r) => r.nota).filter((n): n is number => n !== null && n !== undefined);
      s.notaMedia = notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 20);
  }, [filtradas]);

  // Performance por ATENDENTE (quem trabalhou o contato/oportunidade).
  // "Deu mais resultado" = mais atendimentos concluídos.
  const statsAtendente = useMemo<StatsAtendente[]>(() => {
    const map = new Map<string, StatsAtendente>();
    for (const r of filtradas) {
      if (!r.atendente_nome) continue;
      let s = map.get(r.atendente_nome);
      if (!s) {
        s = { atendente: r.atendente_nome, total: 0, concluidos: 0, semResposta: 0, emAberto: 0, pctConclusao: 0 };
        map.set(r.atendente_nome, s);
      }
      s.total++;
      if (r.status_atendimento === "concluido") s.concluidos++;
      else if (r.status_atendimento === "sem_resposta") s.semResposta++;
      else s.emAberto++; // aberto / em_andamento
    }
    for (const s of map.values()) {
      s.pctConclusao = s.total > 0 ? Math.round((s.concluidos / s.total) * 100) : 0;
    }
    return Array.from(map.values()).sort((a, b) => b.concluidos - a.concluidos || b.total - a.total);
  }, [filtradas]);
  const topAtendente = statsAtendente[0] || null;

  // Feedbacks que GERARAM RETORNO DE SERVIÇO = têm "serviço confirmado" preenchido.
  const retornosServico = useMemo(
    () => filtradas.filter((r) => (r.revisao_confirmada || "").trim().length > 0),
    [filtradas]
  );

  const doDia = useMemo(() => filtradas.filter((r) => dataRef(r).startsWith(diaEscolhido)), [filtradas, diaEscolhido]);

  // Relatório DETALHADO por atendente: contatos por janela de tempo + respostas.
  // Usa todos os registros (filtra só por fonte) — as janelas é que definem o tempo.
  const statsAtendenteDet = useMemo<StatsAtendDet[]>(() => {
    const hojeD = new Date();
    const fmt = (d: Date) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD local
    const hojeStr = fmt(hojeD);
    const ontemD = new Date(hojeD); ontemD.setDate(ontemD.getDate() - 1);
    const ontemStr = fmt(ontemD);
    const seteD = new Date(hojeD); seteD.setDate(seteD.getDate() - 6);
    const seteStr = fmt(seteD);
    const dataAt = (r: FeedbackRegistro) =>
      (r.concluido_em || r.aberto_em || r.data_contato || r.criado_em || "").slice(0, 10);

    const map = new Map<string, StatsAtendDet>();
    for (const r of registros) {
      if (fonte !== "todos" && r.tipo !== fonte) continue;
      if (!r.atendente_nome) continue;
      const d = dataAt(r);
      if (!d) continue;
      let s = map.get(r.atendente_nome);
      if (!s) { s = { atendente: r.atendente_nome, hoje: 0, ontem: 0, sete: 0, respondeu: 0, positiva: 0, negativa: 0, gerouServico: 0 }; map.set(r.atendente_nome, s); }
      if (d === hojeStr) s.hoje++;
      if (d === ontemStr) s.ontem++;
      if (d >= seteStr) {
        s.sete++;
        if ((r.revisao_confirmada || "").trim().length > 0) s.gerouServico++;
        if (r.status_atendimento === "concluido") {
          s.respondeu++;
          // Positiva/negativa = satisfação, só faz sentido no CRM (feedback do serviço).
          if (r.tipo === "crm") {
            if (r.status_cliente === "Satisfeito" || r.nps === "Sim") s.positiva++;
            else if (r.status_cliente === "Insatisfeito" || r.nps === "Não") s.negativa++;
          }
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.sete - a.sete || b.respondeu - a.respondeu);
  }, [registros, fonte]);

  function baixarCSVAtendentes() {
    const headers = ["atendente", "contatos_hoje", "contatos_ontem", "contatos_7d", "respondeu_7d", "positiva_crm_7d", "negativa_crm_7d", "gerou_servico_7d", "nao_gerou_7d"];
    const linhas = [headers.join(",")];
    for (const s of statsAtendenteDet) {
      linhas.push([escapeCSV(s.atendente), s.hoje, s.ontem, s.sete, s.respondeu, s.positiva, s.negativa, s.gerouServico, s.sete - s.gerouServico].join(","));
    }
    const csv = "﻿" + linhas.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `relatorio-atendentes-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ paddingTop: 20, fontFamily: "Inter, sans-serif" }}>
      <div style={topoStyle}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--portal-text)", margin: 0, flex: 1 }}>
          📊 Relatórios
        </h1>
        {view === "atendentes" ? (
          <button onClick={baixarCSVAtendentes} style={btnPrimario}>
            ⬇ Exportar atendentes ({statsAtendenteDet.length})
          </button>
        ) : (
          <button onClick={() => baixarCSV(filtradas, `relatorio-feedbacks-${new Date().toISOString().slice(0,10)}.csv`)} style={btnPrimario}>
            ⬇ Exportar CSV ({filtradas.length})
          </button>
        )}
      </div>

      {/* Pills de view */}
      <div style={pillsStyle}>
        {[
          { v: "geral", label: "Geral" },
          { v: "atendentes", label: "🎧 Atendentes" },
          { v: "dia",   label: "Por dia" },
        ].map((p) => (
          <button
            key={p.v}
            onClick={() => setView(p.v as View)}
            style={{
              ...pillStyle,
              background: view === p.v ? "#dc2626" : "transparent",
              color: view === p.v ? "#fff" : "var(--portal-text-secondary)",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div style={filtrosStyle}>
        <FiltroCampo label="Fonte">
          <select value={fonte} onChange={(e) => setFonte(e.target.value as Fonte)} style={filtroInput}>
            <option value="todos">Todos (CRM+RFM)</option>
            <option value="crm">Apenas CRM</option>
            <option value="rfm">Apenas RFM</option>
          </select>
        </FiltroCampo>
        {view === "geral" ? (
          <>
            <FiltroCampo label="Data de">
              <input type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} style={filtroInput} />
            </FiltroCampo>
            <FiltroCampo label="Data até">
              <input type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} style={filtroInput} />
            </FiltroCampo>
          </>
        ) : (
          <FiltroCampo label="Dia">
            <input type="date" value={diaEscolhido} onChange={(e) => setDiaEscolhido(e.target.value)} style={filtroInput} />
          </FiltroCampo>
        )}
      </div>

      {erro && <div style={erroStyle}>{erro}</div>}

      {loading ? (
        <div style={vazioStyle}>Carregando…</div>
      ) : view === "geral" ? (
        <>
          {/* Cards de totais */}
          <div style={statsGrid}>
            <StatCard icon="📊" label="Total" value={filtradas.length} cor="#475569" />
            <StatCard icon="🔴" label="CRM" value={filtradas.filter((r) => r.tipo === "crm").length} cor="#dc2626" />
            <StatCard icon="🟡" label="RFM" value={filtradas.filter((r) => r.tipo === "rfm").length} cor="#f59e0b" />
            <StatCard icon="★" label="Nota média" cor="#ca8a04" value={(() => {
              const notas = filtradas.map((r) => r.nota).filter((n): n is number => n !== null && n !== undefined);
              return notas.length ? (Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10).toString() : "—";
            })()} />
            <StatCard icon="😊" label="% Satisfeitos" cor="#10b981" value={(() => {
              const comStatus = filtradas.filter((r) => r.status_cliente);
              if (!comStatus.length) return "—";
              const sat = comStatus.filter((r) => r.status_cliente === "Satisfeito").length;
              return `${Math.round((sat / comStatus.length) * 100)}%`;
            })()} />
            <StatCard icon="🔧" label="Retornos de serviço" value={retornosServico.length} cor="#0369a1" />
          </div>

          {/* Ranking de Atendentes — quem trabalhou os contatos/oportunidades */}
          <div style={secaoStyle}>
            <h2 style={tituloSecaoStyle}>🎧 Performance por Atendente</h2>
            {topAtendente && topAtendente.concluidos > 0 && (
              <div style={destaqueAtendenteStyle}>
                🏅 <strong>{topAtendente.atendente}</strong> foi quem mais deu resultado:{" "}
                <strong>{topAtendente.concluidos}</strong> atendimento{topAtendente.concluidos !== 1 ? "s" : ""} concluído{topAtendente.concluidos !== 1 ? "s" : ""}
                {" "}de {topAtendente.total} ({topAtendente.pctConclusao}% de conclusão).
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <table style={tabelaStyle}>
                <thead>
                  <tr>
                    <Th>Atendente</Th><Th>Atendidos</Th><Th>Concluídos</Th><Th>Sem resposta</Th><Th>Em aberto</Th><Th>% Conclusão</Th>
                  </tr>
                </thead>
                <tbody>
                  {statsAtendente.map((s, i) => (
                    <tr key={s.atendente}>
                      <Td><strong>{i === 0 && s.concluidos > 0 ? "🏅 " : ""}{s.atendente}</strong></Td>
                      <Td>{s.total}</Td>
                      <Td><strong style={{ color: "#065f46" }}>{s.concluidos}</strong></Td>
                      <Td>{s.semResposta}</Td>
                      <Td>{s.emAberto}</Td>
                      <Td><span style={badgePctStyle(s.pctConclusao)}>{s.pctConclusao}%</span></Td>
                    </tr>
                  ))}
                  {statsAtendente.length === 0 && (
                    <tr><Td colSpan={6}><em style={{ color: "var(--portal-text-muted)" }}>Nenhum atendimento iniciado ainda (atendentes aparecem quando alguém atende uma oportunidade).</em></Td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Feedbacks que geraram retorno de serviço — métrica-chave */}
          <div style={secaoStyle}>
            <h2 style={tituloSecaoStyle}>🔧 Feedbacks que geraram retorno de serviço ({retornosServico.length})</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={tabelaStyle}>
                <thead>
                  <tr><Th>Cliente</Th><Th>Serviço confirmado</Th><Th>Atendente</Th><Th>Técnico</Th><Th>Data</Th></tr>
                </thead>
                <tbody>
                  {retornosServico.map((r) => (
                    <tr key={r.id}>
                      <Td><strong>{r.nome}</strong></Td>
                      <Td>{r.revisao_confirmada}</Td>
                      <Td>{r.atendente_nome || "—"}</Td>
                      <Td>{r.tecnico || "—"}</Td>
                      <Td>{dataRef(r).slice(0, 10)}</Td>
                    </tr>
                  ))}
                  {retornosServico.length === 0 && (
                    <tr><Td colSpan={5}><em style={{ color: "var(--portal-text-muted)" }}>Nenhum retorno de serviço registrado ainda — preencha o campo &quot;Serviço confirmado&quot; ao atender.</em></Td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tabela técnicos */}
          <div style={secaoStyle}>
            <h2 style={tituloSecaoStyle}>👷 Performance por Técnico</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={tabelaStyle}>
                <thead>
                  <tr>
                    <Th>Técnico</Th><Th>Total</Th><Th>Satisfeitos</Th><Th>Insatisfeitos</Th><Th>Nota média</Th><Th>% Satisfação</Th>
                  </tr>
                </thead>
                <tbody>
                  {statsTecnico.map((s) => (
                    <tr key={s.tecnico}>
                      <Td><strong>{s.tecnico}</strong></Td>
                      <Td>{s.total}</Td>
                      <Td>{s.satisfeitos}</Td>
                      <Td>{s.insatisfeitos}</Td>
                      <Td>{s.notaMedia ?? "—"}</Td>
                      <Td><span style={badgePctStyle(s.pctSatisfeitos)}>{s.pctSatisfeitos}%</span></Td>
                    </tr>
                  ))}
                  {statsTecnico.length === 0 && (
                    <tr><Td colSpan={6}><em style={{ color: "var(--portal-text-muted)" }}>Sem dados.</em></Td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top clientes */}
          <div style={secaoStyle}>
            <h2 style={tituloSecaoStyle}>🏆 Top 20 Clientes</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={tabelaStyle}>
                <thead>
                  <tr><Th>Cliente</Th><Th>Total</Th><Th>Nota média</Th><Th>Último contato</Th></tr>
                </thead>
                <tbody>
                  {topClientes.map((s) => (
                    <tr key={s.nome}>
                      <Td><strong>{s.nome}</strong></Td>
                      <Td>{s.total}</Td>
                      <Td>{s.notaMedia ?? "—"}</Td>
                      <Td>{s.ultimoContato.slice(0, 10) || "—"}</Td>
                    </tr>
                  ))}
                  {topClientes.length === 0 && (
                    <tr><Td colSpan={4}><em style={{ color: "var(--portal-text-muted)" }}>Sem dados.</em></Td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : view === "atendentes" ? (
        <div style={secaoStyle}>
          <h2 style={tituloSecaoStyle}>🎧 Desempenho por atendente</h2>
          <p style={{ fontSize: 12, color: "var(--portal-text-secondary)", marginTop: -4, marginBottom: 14 }}>
            Contatos por período e qualidade das respostas (respostas medem os últimos 7 dias). &quot;Atendente&quot; = quem trabalhou o contato/oportunidade.
          </p>
          {statsAtendenteDet.length === 0 ? (
            <div style={vazioStyle}>Nenhum atendimento registrado por atendentes ainda.</div>
          ) : (
            <div style={atendentesGrid}>
              {statsAtendenteDet.map((s) => {
                const taxa = s.sete > 0 ? Math.round((s.respondeu / s.sete) * 100) : 0;
                return (
                  <div key={s.atendente} className={styles.atendCard}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "var(--portal-text)", marginBottom: 10, textAlign: "center" }}>
                      🎧 {s.atendente}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                      <NumBloco n={s.hoje} label="Hoje" cor="#dc2626" />
                      <NumBloco n={s.ontem} label="Ontem" cor="#f59e0b" />
                      <NumBloco n={s.sete} label="7 dias" cor="#0369a1" />
                    </div>
                    <div style={{ borderTop: "1px dashed var(--portal-border)", margin: "12px 0 0", paddingTop: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--portal-text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, textAlign: "center" }}>
                        Últimos 7 dias
                      </div>
                      <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginBottom: 8 }}>
                        <PillResp bg="#dbeafe" fg="#1e40af">✅ {s.respondeu} respondeu</PillResp>
                        <PillResp bg="#e0f2fe" fg="#075985">🔧 {s.gerouServico} gerou serviço</PillResp>
                        <PillResp bg="#f3f4f6" fg="#525252">↩ {s.sete - s.gerouServico} não gerou</PillResp>
                      </div>
                      <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                        <PillResp bg="#d1fae5" fg="#065f46">😊 {s.positiva} positiva</PillResp>
                        <PillResp bg="#fee2e2" fg="#991b1b">😞 {s.negativa} negativa</PillResp>
                        <span style={{ fontSize: 9, color: "var(--portal-text-muted)", alignSelf: "center" }}>(satisfação CRM)</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--portal-text-secondary)", marginTop: 8, textAlign: "center" }}>
                        Taxa de resposta: <strong>{taxa}%</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        // View por dia
        <div style={secaoStyle}>
          <h2 style={tituloSecaoStyle}>
            Registros em {diaEscolhido.split("-").reverse().join("/")} — {doDia.length}
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={tabelaStyle}>
              <thead>
                <tr><Th>Tipo</Th><Th>Cliente</Th><Th>Técnico</Th><Th>Serviço/Motivo</Th><Th>Nota</Th></tr>
              </thead>
              <tbody>
                {doDia.map((r) => (
                  <tr key={r.id}>
                    <Td><span style={tipoBadge(r.tipo)}>{r.tipo.toUpperCase()}</span></Td>
                    <Td><strong>{r.nome}</strong></Td>
                    <Td>{r.tecnico || "—"}</Td>
                    <Td>{r.tipo === "crm" ? (r.servico || "—") : (r.motivo || "—")}</Td>
                    <Td>{r.nota ?? "—"}</Td>
                  </tr>
                ))}
                {doDia.length === 0 && (
                  <tr><Td colSpan={5}><em style={{ color: "var(--portal-text-muted)" }}>Nada nesse dia.</em></Td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function FiltroCampo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--portal-text-muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
function StatCard({ icon, label, value, cor = "#dc2626" }: { icon: string; label: string; value: string | number; cor?: string }) {
  return (
    <div className={styles.statCard} style={{ ["--fb-accent" as string]: cor }}>
      <div style={{ fontSize: 11, color: "var(--portal-text-muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>{icon} {label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "var(--portal-text)" }}>{value}</div>
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ textAlign: "left", padding: "10px 12px", background: "#fafafa", borderBottom: "1.5px solid var(--portal-border)", fontSize: 11, fontWeight: 700, color: "var(--portal-text-secondary)", textTransform: "uppercase", letterSpacing: 0.4 }}>
      {children}
    </th>
  );
}
function Td({ children, colSpan }: { children: React.ReactNode; colSpan?: number }) {
  return (
    <td colSpan={colSpan} style={{ padding: "10px 12px", borderBottom: "1px solid var(--portal-border)", fontSize: 12, color: "var(--portal-text)" }}>
      {children}
    </td>
  );
}
function badgePctStyle(pct: number): React.CSSProperties {
  const cor = pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#dc2626";
  const bg = pct >= 80 ? "#d1fae5" : pct >= 50 ? "#fef3c7" : "#fee2e2";
  return { background: bg, color: cor, fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6 };
}
function tipoBadge(tipo: TipoFeedback): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
    background: tipo === "crm" ? "#fef2f2" : "#fef3c7",
    color: tipo === "crm" ? "#b91c1c" : "#92400e",
    letterSpacing: 0.3, display: "inline-block",
  };
}

function NumBloco({ n, label, cor }: { n: number; label: string; cor: string }) {
  return (
    <div style={{ textAlign: "center", background: "#fafafa", border: "1px solid var(--portal-border)", borderRadius: 10, padding: "10px 4px" }}>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: cor }}>{n}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--portal-text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>{label}</div>
    </div>
  );
}
function PillResp({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return (
    <span className={styles.pill} style={{ background: bg, color: fg, fontSize: 11 }}>{children}</span>
  );
}

const atendentesGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14,
};
const topoStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 };
const pillsStyle: React.CSSProperties = { display: "flex", gap: 6, marginBottom: 16 };
const pillStyle: React.CSSProperties = {
  padding: "8px 18px", border: "1.5px solid var(--portal-border)",
  borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
  fontFamily: "Inter, sans-serif",
};
const filtrosStyle: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12, padding: 16, background: "var(--portal-bg-card)",
  border: "1px solid var(--portal-border)", borderRadius: 12, marginBottom: 20,
};
const filtroInput: React.CSSProperties = {
  width: "100%", padding: "8px 12px",
  border: "1px solid var(--portal-border)", borderRadius: 8,
  fontSize: 12, background: "var(--portal-bg-card)", color: "var(--portal-text)",
  fontFamily: "Inter, sans-serif", outline: "none",
};
const statsGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12, marginBottom: 24,
};
const secaoStyle: React.CSSProperties = { marginBottom: 28 };
const destaqueAtendenteStyle: React.CSSProperties = {
  marginBottom: 12, padding: "12px 16px",
  background: "linear-gradient(135deg, #fef9c3, #fef3c7)",
  border: "1px solid #fde68a", borderRadius: 10,
  fontSize: 13, color: "#854d0e",
};
const tituloSecaoStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 800, color: "var(--portal-text)",
  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12,
};
const tabelaStyle: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse",
  background: "var(--portal-bg-card)",
  border: "1px solid var(--portal-border)", borderRadius: 10,
  fontFamily: "Inter, sans-serif",
};
const btnPrimario: React.CSSProperties = {
  padding: "9px 18px", background: "linear-gradient(135deg, #dc2626, #b91c1c)",
  color: "#fff", border: "none", borderRadius: 10,
  fontSize: 13, fontWeight: 700, cursor: "pointer",
  boxShadow: "0 2px 8px rgba(185,28,28,0.25)", fontFamily: "Inter, sans-serif",
};
const vazioStyle: React.CSSProperties = {
  padding: 60, textAlign: "center", color: "var(--portal-text-muted)",
  fontSize: 14, fontStyle: "italic",
};
const erroStyle: React.CSSProperties = {
  marginBottom: 12, padding: "10px 14px",
  background: "#fee2e2", color: "#991b1b", borderRadius: 10, fontSize: 13,
};
