"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { listarChamadasResumo, listarRegistros } from "@/lib/feedbacks/api";
import type { FeedbackRegistro, TipoFeedback } from "@/lib/feedbacks/types";
import {
  agregarPerformance, CSV_PERFORMANCE_CABECALHO, linhaCSVPerformance, normalizarAtendente, periodoDoPreset, porDia, PRESETS_PERIODO, totalPerformance,
  type ChamadaResumo, type PerformanceAtendente, type PresetPeriodo,
} from "@/lib/feedbacks/atendimento/performance";
import { formatarDuracao } from "@/lib/feedbacks/atendimento/tempo";
import { DESFECHOS } from "@/lib/feedbacks/atendimento/chamada";
import { emojiHumor } from "@/lib/feedbacks/atendimento/retorno";
import styles from "@/components/feedbacks/feedbacks.module.css";
import { COR_RFM, COR_CRM_BG, COR_CRM_FG, COR_RFM_BG, COR_RFM_FG } from "@/lib/feedbacks/cores";

type Fonte = "todos" | TipoFeedback;
type View = "geral" | "dia" | "atendentes";

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

function dataRef(r: FeedbackRegistro): string {
  return r.data_contato || r.data_servico || r.ultimo_servico || r.criado_em;
}

const CSV_SEP = ";"; // Excel pt-BR usa ; como separador de colunas

function escapeCSV(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(CSV_SEP) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Data ISO (YYYY-MM-DD...) -> DD/MM/AAAA. Se não parecer data, devolve como está.
function fmtDataCSV(d: string | null | undefined): string {
  if (!d) return "";
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
}

// Tira quebras de linha e espaços repetidos pra cada célula caber numa linha só.
function limpar(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

// Força o Excel a tratar como TEXTO (sintaxe de fórmula ="..."): evita notação
// científica em telefone/código e evita reinterpretar/encolher datas (####).
function txtExcel(v: unknown): string {
  const s = limpar(v);
  return s ? `="${s}"` : "";
}

// Monta o CSV: BOM (Excel lê UTF-8) + separador ; + quebras \r\n.
function montarCSV(headers: string[], linhas: (string | number)[][]): string {
  const corpo = [headers, ...linhas]
    .map((row) => row.map(escapeCSV).join(CSV_SEP))
    .join("\r\n");
  return "﻿" + corpo;
}

function gerarCSV(rows: FeedbackRegistro[]): string {
  const headers = [
    "Tipo", "Cliente", "Telefone", "Trator", "Técnico", "Cód. Omie", "Data do contato",
    "Serviço", "Data do serviço", "Satisfação", "Nota", "Feedback", "NPS", "Melhoria",
    "Último serviço", "Motivo", "Prioridade", "Ação", "Sem resposta", "Revisão confirmada",
    "Atendente", "Status", "Criado em",
  ];
  const linhas: (string | number)[][] = rows.map((r) => [
    r.tipo.toUpperCase(),
    limpar(r.nome),
    txtExcel(r.telefone),
    limpar(r.trator),
    limpar(r.tecnico),
    txtExcel(r.codigo_omie),
    txtExcel(fmtDataCSV(r.data_contato)),
    limpar(r.servico),
    txtExcel(fmtDataCSV(r.data_servico)),
    limpar(r.status_cliente),
    r.nota ?? "",
    limpar(r.feedback),
    limpar(r.nps),
    limpar(r.melhoria),
    txtExcel(fmtDataCSV(r.ultimo_servico)),
    limpar(r.motivo),
    limpar(r.prioridade),
    limpar(r.acao),
    r.sem_resposta ? "Sim" : "Não",
    txtExcel(fmtDataCSV(r.revisao_confirmada)),
    limpar(r.atendente_nome),
    limpar((r.status_atendimento || "").replace(/_/g, " ")),
    txtExcel(fmtDataCSV(r.criado_em)),
  ]);
  return montarCSV(headers, linhas);
}

function baixarCSV(rows: FeedbackRegistro[], nome: string) {
  const blob = new Blob([gerarCSV(rows)], { type: "text/csv;charset=utf-8;" });
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
  const [atendenteAberto, setAtendenteAberto] = useState<string | null>(null);
  const [chamadas, setChamadas] = useState<ChamadaResumo[]>([]);
  const [erroChamadas, setErroChamadas] = useState<string | null>(null);
  // Aba Atendentes: período próprio (presets + personalizado)
  const [preset, setPreset] = useState<PresetPeriodo>("30d");
  const [perDe, setPerDe] = useState("");
  const [perAte, setPerAte] = useState("");
  const router = useRouter();

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const [crm, rfm, lig] = await Promise.all([
        listarRegistros("crm"),
        listarRegistros("rfm"),
        // ligações do cockpit: se a tabela não existir ainda, o resto do relatório segue
        listarChamadasResumo().catch((e) => { setErroChamadas(e instanceof Error ? e.message : String(e)); return [] as ChamadaResumo[]; }),
      ]);
      setRegistros([...crm, ...rfm]);
      setChamadas(lig);
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

  // Performance por ATENDENTE (aba Geral: segue o filtro de datas da aba).
  const perfGeral = useMemo<PerformanceAtendente[]>(
    () => agregarPerformance(registros, chamadas, { de: dataDe || null, ate: dataAte || null }, fonte),
    [registros, chamadas, dataDe, dataAte, fonte]
  );
  const topAtendente = perfGeral[0] || null;

  // Feedbacks que GERARAM RETORNO DE SERVIÇO = têm "serviço confirmado" preenchido.
  const retornosServico = useMemo(
    () => filtradas.filter((r) => (r.revisao_confirmada || "").trim().length > 0),
    [filtradas]
  );

  const doDia = useMemo(() => filtradas.filter((r) => dataRef(r).startsWith(diaEscolhido)), [filtradas, diaEscolhido]);

  // Aba Atendentes: período escolhido (presets), registros + ligações do cockpit.
  const periodoAtend = useMemo(() => periodoDoPreset(preset, new Date(), { de: perDe || null, ate: perAte || null }), [preset, perDe, perAte]);
  const perfAtend = useMemo<PerformanceAtendente[]>(() => agregarPerformance(registros, chamadas, periodoAtend, fonte), [registros, chamadas, periodoAtend, fonte]);
  const totalAtend = useMemo(() => totalPerformance(perfAtend), [perfAtend]);
  const diasAtend = useMemo(() => porDia(registros, chamadas, periodoAtend, fonte), [registros, chamadas, periodoAtend, fonte]);
  const rotuloPeriodo = useMemo(() => {
    if (!periodoAtend.de && !periodoAtend.ate) return "todo o histórico";
    const f = (d: string | null) => (d ? d.split("-").reverse().join("/") : "…");
    return periodoAtend.de === periodoAtend.ate ? f(periodoAtend.de) : `${f(periodoAtend.de)} a ${f(periodoAtend.ate)}`;
  }, [periodoAtend]);

  function baixarCSVAtendentes() {
    const headers = ["Período", ...CSV_PERFORMANCE_CABECALHO];
    const linhas: (string | number)[][] = [...perfAtend, totalAtend].map((s) => [rotuloPeriodo, ...linhaCSVPerformance(s).map((v, k) => (k === 0 ? limpar(v) : v))]);
    const blob = new Blob([montarCSV(headers, linhas)], { type: "text/csv;charset=utf-8;" });
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
            Exportar atendentes ({perfAtend.length})
          </button>
        ) : (
          <button onClick={() => baixarCSV(filtradas, `relatorio-feedbacks-${new Date().toISOString().slice(0,10)}.csv`)} style={btnPrimario}>
            Exportar CSV ({filtradas.length})
          </button>
        )}
      </div>

      {/* Pills de view */}
      <div style={pillsStyle}>
        {[
          { v: "geral", label: "Geral" },
          { v: "atendentes", label: "Atendentes" },
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
        ) : view === "atendentes" ? (
          <>
            <FiltroCampo label="Período">
              <select value={preset} onChange={(e) => setPreset(e.target.value as PresetPeriodo)} style={filtroInput}>
                {PRESETS_PERIODO.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
              </select>
            </FiltroCampo>
            {preset === "custom" && (
              <>
                <FiltroCampo label="De">
                  <input type="date" value={perDe} onChange={(e) => setPerDe(e.target.value)} style={filtroInput} />
                </FiltroCampo>
                <FiltroCampo label="Até">
                  <input type="date" value={perAte} onChange={(e) => setPerAte(e.target.value)} style={filtroInput} />
                </FiltroCampo>
              </>
            )}
          </>
        ) : (
          <FiltroCampo label="Dia">
            <input type="date" value={diaEscolhido} onChange={(e) => setDiaEscolhido(e.target.value)} style={filtroInput} />
          </FiltroCampo>
        )}
      </div>

      {erroChamadas && <div style={{ ...erroStyle, background: "#fef3c7", color: "#92400e" }}>Ligações do cockpit indisponíveis: {erroChamadas}. Os números de atendimentos continuam valendo.</div>}

      {erro && <div style={erroStyle}>{erro}</div>}

      {loading ? (
        <div style={vazioStyle}>Carregando…</div>
      ) : view === "geral" ? (
        <>
          {/* Cards de totais */}
          <div style={statsGrid}>
            <StatCard icon="📊" label="Total" value={filtradas.length} cor="#475569" />
            <StatCard icon="🔴" label="CRM" value={filtradas.filter((r) => r.tipo === "crm").length} cor="#dc2626" />
            <StatCard icon="🟣" label="RFM" value={filtradas.filter((r) => r.tipo === "rfm").length} cor={COR_RFM} />
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

          {/* Ranking de Atendentes — atendimentos (CRM/RFM) + ligações do cockpit */}
          <div style={secaoStyle}>
            <h2 style={tituloSecaoStyle}>🎧 Performance por Atendente</h2>
            {topAtendente && (topAtendente.ligacoes.conversoes > 0 || topAtendente.atendimentos.concluidos > 0) && (
              <div style={destaqueAtendenteStyle}>
                🏅 <strong>{topAtendente.atendente}</strong> foi quem mais deu resultado:{" "}
                {topAtendente.ligacoes.conversoes > 0 && <><strong>{topAtendente.ligacoes.conversoes}</strong> conversã{topAtendente.ligacoes.conversoes !== 1 ? "o" : "ões"} em ligação (serviço agendado + venda) e </>}
                <strong>{topAtendente.atendimentos.concluidos}</strong> atendimento{topAtendente.atendimentos.concluidos !== 1 ? "s" : ""} concluído{topAtendente.atendimentos.concluidos !== 1 ? "s" : ""}
                {" "}de {topAtendente.atendimentos.total} ({topAtendente.atendimentos.pctConclusao}% de conclusão).
                {" "}<button type="button" onClick={() => setView("atendentes")} style={{ background: "none", border: "none", color: "#92400e", textDecoration: "underline", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>ver detalhes →</button>
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <table style={tabelaStyle}>
                <thead>
                  <tr>
                    <Th>Atendente</Th><Th>Atendidos</Th><Th>Concluídos</Th><Th>% Conclusão</Th><Th>Ligações</Th><Th>Tempo em ligação</Th><Th>Contato efetivo</Th><Th>Conversões</Th><Th>Humor médio</Th>
                  </tr>
                </thead>
                <tbody>
                  {perfGeral.map((s, i) => (
                    <tr key={s.atendente} onClick={() => setAtendenteAberto(s.atendente)} style={{ cursor: "pointer" }} title="Ver os atendimentos deste atendente">
                      <Td><strong>{i === 0 && (s.ligacoes.conversoes > 0 || s.atendimentos.concluidos > 0) ? "🏅 " : ""}{s.atendente}</strong></Td>
                      <Td>{s.atendimentos.total}</Td>
                      <Td><strong style={{ color: "#065f46" }}>{s.atendimentos.concluidos}</strong></Td>
                      <Td><span style={badgePctStyle(s.atendimentos.pctConclusao)}>{s.atendimentos.pctConclusao}%</span></Td>
                      <Td>{s.ligacoes.total}{s.ligacoes.abertas > 0 && <span title="em ligação agora" style={{ marginLeft: 6, fontSize: 10, color: "#3730a3" }}>🎧 {s.ligacoes.abertas}</span>}</Td>
                      <Td>{s.ligacoes.total > 0 ? formatarDuracao(s.ligacoes.tempoTotalSeg) : "—"}</Td>
                      <Td>{s.ligacoes.taxaContato != null ? <span style={badgePctStyle(s.ligacoes.taxaContato)}>{s.ligacoes.contatoEfetivo} · {s.ligacoes.taxaContato}%</span> : "—"}</Td>
                      <Td><strong style={{ color: "#0369a1" }}>{s.ligacoes.conversoes}</strong>{s.ligacoes.taxaConversao != null && <span style={{ fontSize: 10, opacity: 0.7 }}> ({s.ligacoes.taxaConversao}%)</span>}</Td>
                      <Td>{s.ligacoes.humorMedio != null ? `${emojiHumor(Math.round(s.ligacoes.humorMedio))} ${s.ligacoes.humorMedio}` : "—"}</Td>
                    </tr>
                  ))}
                  {perfGeral.length === 0 && (
                    <tr><Td colSpan={9}><em style={{ color: "var(--portal-text-muted)" }}>Nenhum atendimento no período (atendentes aparecem quando alguém atende um registro ou faz uma ligação no cockpit).</em></Td></tr>
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
        <>
          {/* Resumo da equipe no período */}
          <div style={statsGrid}>
            <StatCard icon="🎧" label="Atendentes ativos" value={perfAtend.length} cor="#475569" />
            <StatCard icon="📋" label="Atendimentos" value={totalAtend.atendimentos.total} cor="#dc2626" />
            <StatCard icon="✅" label="Concluídos" value={`${totalAtend.atendimentos.concluidos} · ${totalAtend.atendimentos.pctConclusao}%`} cor="#10b981" />
            <StatCard icon="📞" label="Ligações" value={totalAtend.ligacoes.total} cor="#d97706" />
            <StatCard icon="⏱" label="Tempo em ligação" value={totalAtend.ligacoes.total ? formatarDuracao(totalAtend.ligacoes.tempoTotalSeg) : "—"} cor="#0369a1" />
            <StatCard icon="🎯" label="Conversões" value={totalAtend.ligacoes.taxaConversao != null ? `${totalAtend.ligacoes.conversoes} · ${totalAtend.ligacoes.taxaConversao}%` : totalAtend.ligacoes.conversoes} cor="#7c3aed" />
            <StatCard icon="🙂" label="Humor médio" value={totalAtend.ligacoes.humorMedio != null ? `${emojiHumor(Math.round(totalAtend.ligacoes.humorMedio))} ${totalAtend.ligacoes.humorMedio}` : "—"} cor="#ca8a04" />
          </div>

          {/* Ranking */}
          <div style={secaoStyle}>
            <h2 style={tituloSecaoStyle}>🏆 Ranking — {rotuloPeriodo}</h2>
            <p style={{ fontSize: 12, color: "var(--portal-text-secondary)", marginTop: -6, marginBottom: 12 }}>
              <strong>Atendimentos</strong> = registros CRM/RFM que passaram pela mão da pessoa (data de conclusão, senão de abertura).{" "}
              <strong>Ligações</strong> = chamadas encerradas no cockpit. <strong>Contato efetivo</strong> = ligação em que alguém atendeu (tira “sem resposta” e “número errado”).{" "}
              <strong>Conversão</strong> = serviço agendado + venda, sobre os contatos efetivos. Humor e qualidade são os termômetros de 1 a 5 marcados ao encerrar.
            </p>
            {perfAtend.length === 0 ? (
              <div style={vazioStyle}>Nenhum atendimento nem ligação no período.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={tabelaStyle}>
                  <thead>
                    <tr>
                      <Th>#</Th><Th>Atendente</Th>
                      <Th>Atendimentos</Th><Th>Concluídos</Th><Th>Sem resp.</Th><Th>Em aberto</Th><Th>Gerou serviço</Th>
                      <Th>Ligações</Th><Th>Tempo total</Th><Th>Média/lig.</Th><Th>Contato efetivo</Th>
                      {DESFECHOS.map((d) => <Th key={d.valor}><span title={d.rotulo}>{d.emoji}</span></Th>)}
                      <Th>Conversões</Th><Th>Humor</Th><Th>Qualidade</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...perfAtend, totalAtend].map((s, i) => {
                      const ehTotal = i === perfAtend.length;
                      const a = s.atendimentos, l = s.ligacoes;
                      return (
                        <tr key={s.atendente} onClick={ehTotal ? undefined : () => setAtendenteAberto(s.atendente)} style={{ cursor: ehTotal ? "default" : "pointer", background: ehTotal ? "#fafafa" : undefined, fontWeight: ehTotal ? 800 : undefined }} title={ehTotal ? undefined : "Ver os atendimentos deste atendente"}>
                          <Td>{ehTotal ? "" : i === 0 ? "🏅" : i + 1}</Td>
                          <Td><strong>{s.atendente}</strong>{l.abertas > 0 && <span title="em ligação agora" style={{ marginLeft: 6, fontSize: 10, color: "#3730a3" }}>🎧 agora</span>}</Td>
                          <Td>{a.total}</Td>
                          <Td><strong style={{ color: "#065f46" }}>{a.concluidos}</strong> <span style={badgePctStyle(a.pctConclusao)}>{a.pctConclusao}%</span></Td>
                          <Td>{a.semResposta}</Td>
                          <Td>{a.emAberto}</Td>
                          <Td>{a.gerouServico}</Td>
                          <Td><strong>{l.total}</strong></Td>
                          <Td>{l.total ? formatarDuracao(l.tempoTotalSeg) : "—"}</Td>
                          <Td>{l.tempoMedioSeg != null ? formatarDuracao(l.tempoMedioSeg) : "—"}</Td>
                          <Td>{l.taxaContato != null ? <span style={badgePctStyle(l.taxaContato)}>{l.contatoEfetivo} · {l.taxaContato}%</span> : "—"}</Td>
                          {DESFECHOS.map((d) => <Td key={d.valor}>{l.desfechos[d.valor] || <span style={{ opacity: 0.35 }}>0</span>}</Td>)}
                          <Td><strong style={{ color: "#0369a1" }}>{l.conversoes}</strong>{l.taxaConversao != null && <span style={{ fontSize: 10, opacity: 0.7 }}> ({l.taxaConversao}%)</span>}</Td>
                          <Td>{l.humorMedio != null ? `${emojiHumor(Math.round(l.humorMedio))} ${l.humorMedio}` : "—"}</Td>
                          <Td>{l.qualidadeMedia != null ? `★ ${l.qualidadeMedia}` : "—"}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Cards por atendente */}
          {perfAtend.length > 0 && (
            <div style={secaoStyle}>
              <h2 style={tituloSecaoStyle}>🎧 Por atendente</h2>
              <div style={atendentesGrid}>
                {perfAtend.map((s, i) => {
                  const a = s.atendimentos, l = s.ligacoes;
                  return (
                    <div key={s.atendente} className={styles.atendCard} onClick={() => setAtendenteAberto(s.atendente)} title="Ver todos os atendimentos deste atendente" style={{ cursor: "pointer" }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--portal-text)", marginBottom: 10, textAlign: "center" }}>
                        {i === 0 ? "🏅" : "🎧"} {s.atendente}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                        <NumBloco n={a.total} label="Atendim." cor="#dc2626" />
                        <NumBloco n={l.total} label="Ligações" cor="#d97706" />
                        <NumBloco n={l.conversoes} label="Conversões" cor="#0369a1" />
                      </div>
                      <div style={{ borderTop: "1px dashed var(--portal-border)", margin: "12px 0 0", paddingTop: 10 }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginBottom: 8 }}>
                          <PillResp bg="#d1fae5" fg="#065f46">✅ {a.concluidos} concluídos ({a.pctConclusao}%)</PillResp>
                          <PillResp bg="#e0f2fe" fg="#075985">🔧 {a.gerouServico} gerou serviço</PillResp>
                          {a.positiva + a.negativa > 0 && <PillResp bg="#f3f4f6" fg="#525252">😊 {a.positiva} · 😞 {a.negativa}</PillResp>}
                        </div>
                        {l.total > 0 ? (
                          <>
                            <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginBottom: 8 }}>
                              <PillResp bg="#fef3c7" fg="#92400e">⏱ {formatarDuracao(l.tempoTotalSeg)} (média {formatarDuracao(l.tempoMedioSeg ?? 0)})</PillResp>
                              <PillResp bg="#dbeafe" fg="#1e40af">📞 atendeu {l.contatoEfetivo}/{l.total} · {l.taxaContato}%</PillResp>
                            </div>
                            <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap", fontSize: 11 }}>
                              {DESFECHOS.filter((d) => l.desfechos[d.valor] > 0).map((d) => (
                                <span key={d.valor} className={styles.pill} style={{ background: "#f8fafc", color: "#334155", fontSize: 11 }} title={d.rotulo}>{d.emoji} {l.desfechos[d.valor]}</span>
                              ))}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--portal-text-secondary)", marginTop: 8, textAlign: "center" }}>
                              Humor <strong>{l.humorMedio != null ? `${emojiHumor(Math.round(l.humorMedio))} ${l.humorMedio}` : "—"}</strong> · Qualidade <strong>{l.qualidadeMedia != null ? `★ ${l.qualidadeMedia}` : "—"}</strong>
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: 11, color: "var(--portal-text-muted)", textAlign: "center" }}>Sem ligações pelo cockpit no período.</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dia a dia */}
          {diasAtend.length > 0 && (
            <div style={secaoStyle}>
              <h2 style={tituloSecaoStyle}>📅 Dia a dia — atendimentos · ligações</h2>
              <div style={{ overflowX: "auto" }}>
                <table style={tabelaStyle}>
                  <thead>
                    <tr>
                      <Th>Dia</Th>
                      {perfAtend.map((s) => <Th key={s.atendente}>{s.atendente.split(" ")[0]}</Th>)}
                      <Th>Total</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {diasAtend.map((d) => (
                      <tr key={d.dia}>
                        <Td><strong>{d.dia.split("-").reverse().join("/")}</strong></Td>
                        {perfAtend.map((s) => {
                          const c = d.porAtendente[s.atendente];
                          return <Td key={s.atendente}>{c ? <>{c.atendimentos} · <span style={{ color: "#d97706" }}>{c.ligacoes}</span></> : <span style={{ opacity: 0.3 }}>—</span>}</Td>;
                        })}
                        <Td><strong>{d.atendimentos} · <span style={{ color: "#d97706" }}>{d.ligacoes}</span></strong></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
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

      {/* Modal: todos os atendimentos de um atendente (clique no card) */}
      {atendenteAberto && (() => {
        const lista = registros
          .filter((r) => normalizarAtendente(r.atendente_nome) === atendenteAberto && (fonte === "todos" || r.tipo === fonte))
          .sort((a, b) => (dataRef(b) || "").slice(0, 10).localeCompare((dataRef(a) || "").slice(0, 10)));
        return (
          <div onClick={() => setAtendenteAberto(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
            <div onClick={(e) => e.stopPropagation()}
              style={{ background: "var(--portal-bg-card)", borderRadius: 16, border: "1px solid var(--portal-border)", width: "min(760px, 100%)", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px -12px rgba(0,0,0,0.4)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--portal-border)" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--portal-text)" }}>🎧 {atendenteAberto} — {lista.length} atendimento(s)</div>
                <button onClick={() => setAtendenteAberto(null)} style={{ background: "none", border: "none", fontSize: 24, lineHeight: 1, cursor: "pointer", color: "var(--portal-text-muted)" }}>×</button>
              </div>
              <div style={{ overflowY: "auto", padding: "4px 0" }}>
                {lista.length === 0 ? (
                  <div style={{ padding: 40, textAlign: "center", color: "var(--portal-text-muted)", fontSize: 13 }}>Nenhum atendimento{fonte !== "todos" ? ` (fonte: ${fonte.toUpperCase()})` : ""}.</div>
                ) : lista.map((r) => {
                  const dataFmt = dataRef(r) ? dataRef(r).slice(0, 10).split("-").reverse().join("/") : "—";
                  return (
                    <div key={r.id}
                      onClick={() => router.push(`/feedbacks/clientes?registro=${r.id}`)}
                      title="Abrir este atendimento"
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", cursor: "pointer", borderBottom: "1px solid var(--portal-border)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--portal-bg-subtle, #f8fafc)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                      <span style={tipoBadge(r.tipo)}>{r.tipo.toUpperCase()}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--portal-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nome}</div>
                        <div style={{ fontSize: 11, color: "var(--portal-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.tipo === "crm" ? (r.servico || r.feedback || "—") : (r.motivo || r.acao || "—")}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 11, color: "var(--portal-text-secondary)" }}>{dataFmt}</div>
                        {r.status_atendimento && <div style={{ fontSize: 10, color: "var(--portal-text-muted)" }}>{r.status_atendimento.replace("_", " ")}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
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
    background: tipo === "crm" ? COR_CRM_BG : COR_RFM_BG,
    color: tipo === "crm" ? COR_CRM_FG : COR_RFM_FG,
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
