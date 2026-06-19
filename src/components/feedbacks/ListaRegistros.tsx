"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import RegistroCard from "./RegistroCard";
import ModalFeedback from "./ModalFeedback";
import ModalHistoricoCliente from "./ModalHistoricoCliente";
import ModalConfirmarCaveira from "./ModalConfirmarCaveira";
import { atualizarRegistro, buscarUltimasOSPorCliente, deletarRegistro, listarRegistros, listarClientesInfo, upsertClienteInfo, definirInativoOmie, type UltimaOS } from "@/lib/feedbacks/api";
import { clienteKey, TAG_NAO_CONTATAR, type ClienteInfo, type FeedbackRegistro, type StatusAtendimento, type TipoFeedback } from "@/lib/feedbacks/types";
import { useAuditLog } from "@/hooks/useAuditLog";

interface Props {
  tipo: TipoFeedback;
}

interface Filtros {
  busca: string;
  tecnico: string;
  dataDe: string;
  dataAte: string;
  // Atendimento ("pendentes" = tudo menos concluído; é o padrão da tela)
  statusAtendimento: "pendentes" | "todos" | "aberto" | "em_andamento" | "concluido" | "sem_resposta" | "atrasados" | "arquivado";
  // CRM-only
  notaMin: number;
  statusCrm: string;
  // RFM-only
  prioridade: string;
  semResposta: "todos" | "sim" | "nao";
}

const FILTROS_VAZIO: Filtros = {
  busca: "", tecnico: "", dataDe: "", dataAte: "",
  statusAtendimento: "pendentes",
  notaMin: 0, statusCrm: "",
  prioridade: "", semResposta: "todos",
};

function dataReferencia(r: FeedbackRegistro): string | null {
  return r.data_contato || r.data_servico || r.ultimo_servico || r.criado_em;
}

function aplicarFiltros(rows: FeedbackRegistro[], f: Filtros, tipo: TipoFeedback): FeedbackRegistro[] {
  const q = f.busca.trim().toLowerCase();
  return rows.filter((r) => {
    if (q) {
      const hay = [r.nome, r.trator, r.tecnico, r.codigo_omie, r.feedback, r.motivo].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.tecnico && r.tecnico !== f.tecnico) return false;
    const dRef = dataReferencia(r);
    if (f.dataDe && dRef && dRef < f.dataDe) return false;
    if (f.dataAte && dRef && dRef > f.dataAte) return false;
    // Filtro de status de atendimento
    if (f.statusAtendimento === "atrasados") {
      // aberto há mais de 24h
      if (r.status_atendimento !== "aberto" && r.status_atendimento !== "em_andamento") return false;
      if (!r.aberto_em) return false;
      const horas = (Date.now() - new Date(r.aberto_em).getTime()) / (1000 * 60 * 60);
      if (horas < 24) return false;
    } else if (f.statusAtendimento === "pendentes") {
      // Padrão da tela: esconde concluídos e arquivados (o que ainda precisa de ação fica visível).
      if (r.status_atendimento === "concluido" || r.status_atendimento === "arquivado") return false;
    } else if (f.statusAtendimento !== "todos") {
      if (r.status_atendimento !== f.statusAtendimento) return false;
    }
    if (tipo === "crm") {
      if (f.statusCrm && r.status_cliente !== f.statusCrm) return false;
      if (f.notaMin > 0 && (r.nota ?? 0) < f.notaMin) return false;
    } else {
      if (f.prioridade && r.prioridade !== f.prioridade) return false;
      if (f.semResposta === "sim" && !r.sem_resposta) return false;
      if (f.semResposta === "nao" && r.sem_resposta) return false;
    }
    return true;
  });
}

export default function ListaRegistros({ tipo }: Props) {
  const [rows, setRows] = useState<FeedbackRegistro[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIO);
  const [filtrosVisivel, setFiltrosVisivel] = useState(false);

  const [modalAberto, setModalAberto] = useState(false);
  const [registroEdit, setRegistroEdit] = useState<FeedbackRegistro | null>(null);
  // Última OS (oficina) por nome de cliente — preenche o "último técnico" no card.
  const [ultimasOS, setUltimasOS] = useState<Record<string, UltimaOS>>({});
  // Cliente cujo histórico (OS/PV/requisições) está aberto no modal.
  const [histAlvo, setHistAlvo] = useState<{ nome: string; codigoOmie: string | null } | null>(null);
  // Info/tags por cliente (feedback_clientes_info) — ícones e caveira.
  const [infoPorKey, setInfoPorKey] = useState<Record<string, ClienteInfo>>({});
  // Caveira: registro alvo da confirmação expressiva (marcar/inativar).
  const [caveiraAlvo, setCaveiraAlvo] = useState<FeedbackRegistro | null>(null);
  const [caveiraProcessando, setCaveiraProcessando] = useState(false);
  const { log } = useAuditLog();

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const data = await listarRegistros(tipo);
      setRows(data);
      // Busca a última OS por cliente em paralelo (best-effort — não bloqueia a lista).
      buscarUltimasOSPorCliente(data.map((r) => r.nome))
        .then(setUltimasOS)
        .catch(() => { /* silencioso: card só não mostra a última OS */ });
      // Info/tags dos clientes (best-effort).
      listarClientesInfo()
        .then((infos) => {
          const m: Record<string, ClienteInfo> = {};
          for (const i of infos) m[i.cliente_key] = i;
          setInfoPorKey(m);
        })
        .catch(() => { /* sem tags — cards só não mostram ícones */ });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [tipo]);

  useEffect(() => { void carregar(); }, [carregar]);

  const tagsDe = useCallback(
    (r: FeedbackRegistro): string[] => (infoPorKey[clienteKey(r.codigo_omie, r.nome)]?.tags as string[] | undefined) || [],
    [infoPorKey]
  );

  const filtradas = useMemo(() => {
    const base = aplicarFiltros(rows, filtros, tipo);
    // No padrão "pendentes", esconde também os clientes marcados como "não contatar" (caveira).
    if (filtros.statusAtendimento !== "pendentes") return base;
    return base.filter((r) => !tagsDe(r).includes(TAG_NAO_CONTATAR));
  }, [rows, filtros, tipo, tagsDe]);

  const tecnicosUnicos = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.tecnico) set.add(r.tecnico);
    return Array.from(set).sort();
  }, [rows]);

  const titulo = tipo === "crm" ? "🔴 CRM — Clientes Recentes" : "🟡 RFM — Clientes Inativos";

  function abrirNovo() {
    setRegistroEdit(null);
    setModalAberto(true);
  }
  function abrirEdit(r: FeedbackRegistro) {
    setRegistroEdit(r);
    setModalAberto(true);
  }
  async function handleExcluir(r: FeedbackRegistro) {
    if (!confirm(`Excluir registro de "${r.nome}"?`)) return;
    try {
      await deletarRegistro(r.id);
      setRows((prev) => prev.filter((x) => x.id !== r.id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }
  function handleSalvo(salvo: FeedbackRegistro) {
    setRows((prev) => {
      const idx = prev.findIndex((x) => x.id === salvo.id);
      if (idx === -1) return [salvo, ...prev];
      const novo = [...prev];
      novo[idx] = salvo;
      return novo;
    });
  }
  // Muda o status de atendimento direto no card (concluir, reabrir, sem-resposta).
  // - concluido: registra concluido_em; outros status limpam.
  // - sem_resposta: liga a flag sem_resposta (badge/filtro); demais desligam.
  async function handleMudarAtendimento(r: FeedbackRegistro, novo: StatusAtendimento) {
    try {
      const payload: Partial<FeedbackRegistro> = {
        status_atendimento: novo,
        concluido_em: novo === "concluido" ? new Date().toISOString() : null,
        sem_resposta: novo === "sem_resposta",
      };
      const salvo = await atualizarRegistro(r.id, payload);
      handleSalvo(salvo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }
  // Arquiva o atendimento com justificativa (cliente que não vale a pena).
  async function handleArquivar(r: FeedbackRegistro) {
    const motivo = prompt(`Motivo para arquivar o atendimento de "${r.nome}":`);
    if (motivo === null) return; // cancelou
    try {
      const salvo = await atualizarRegistro(r.id, {
        status_atendimento: "arquivado",
        arquivado_motivo: motivo || "(sem motivo)",
      });
      handleSalvo(salvo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }
  // 💀 Caveira: marcar abre a confirmação expressiva (pode inativar no Omie);
  // se já estiver marcado, o clique reativa o contato.
  function handleCaveira(r: FeedbackRegistro) {
    const jaMarcado = ((infoPorKey[clienteKey(r.codigo_omie, r.nome)]?.tags as string[] | undefined) || []).includes(TAG_NAO_CONTATAR);
    if (jaMarcado) { void handleReativar(r); return; }
    setCaveiraAlvo(r);
  }

  // Marca "não contatar" no Portal e, opcionalmente, inativa o cadastro no Omie. Auditado.
  async function aplicarNaoContatar(r: FeedbackRegistro, inativarOmie: boolean) {
    const key = clienteKey(r.codigo_omie, r.nome);
    const atual = (infoPorKey[key]?.tags as string[] | undefined) || [];
    const novas = atual.includes(TAG_NAO_CONTATAR) ? atual : [...atual, TAG_NAO_CONTATAR];
    setCaveiraProcessando(true);
    try {
      if (inativarOmie && r.codigo_omie) await definirInativoOmie(r.codigo_omie, true);
      const salvo = await upsertClienteInfo({ cliente_key: key, codigo_omie: r.codigo_omie, nome: r.nome, tags: novas });
      setInfoPorKey((prev) => ({ ...prev, [key]: salvo }));
      void log({
        sistema: "feedbacks", acao: inativarOmie ? "inativar_omie" : "nao_contatar",
        entidade: "cliente", entidade_id: key, entidade_label: r.nome,
        detalhes: { tag: TAG_NAO_CONTATAR, inativou_omie: inativarOmie },
      });
      setCaveiraAlvo(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCaveiraProcessando(false);
    }
  }

  // Reativa o contato: remove a tag e (se houver código) reativa o cadastro no Omie. Auditado.
  async function handleReativar(r: FeedbackRegistro) {
    const key = clienteKey(r.codigo_omie, r.nome);
    const atual = (infoPorKey[key]?.tags as string[] | undefined) || [];
    const temOmie = !!r.codigo_omie;
    const msg = temOmie
      ? `Reativar contato com "${r.nome}"?\n\nRemove "Não contatar" e reativa o cadastro no Omie.`
      : `Reativar contato com "${r.nome}"?\n\nRemove a marca "Não contatar".`;
    if (!confirm(msg)) return;
    const novas = atual.filter((t) => t !== TAG_NAO_CONTATAR);
    try {
      if (temOmie) await definirInativoOmie(r.codigo_omie as string, false);
      const salvo = await upsertClienteInfo({ cliente_key: key, codigo_omie: r.codigo_omie, nome: r.nome, tags: novas });
      setInfoPorKey((prev) => ({ ...prev, [key]: salvo }));
      void log({
        sistema: "feedbacks", acao: "reativar_contato", entidade: "cliente",
        entidade_id: key, entidade_label: r.nome, detalhes: { reativou_omie: temOmie },
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div style={{ paddingTop: 20, fontFamily: "Inter, sans-serif" }}>
      {/* Topo */}
      <div style={topoStyle}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--portal-text)", margin: 0, flex: 1 }}>
          {titulo}
        </h1>
        <span style={badgeStyle}>{filtradas.length} de {rows.length}</span>
        <button onClick={() => setFiltrosVisivel((v) => !v)} style={btnSecundario}>
          {filtrosVisivel ? "▴ Esconder filtros" : "▾ Filtros avançados"}
        </button>
        <button onClick={abrirNovo} style={btnPrimario}>
          + Novo {tipo === "crm" ? "feedback" : "registro"}
        </button>
      </div>

      {/* Busca rápida */}
      <input
        type="text"
        value={filtros.busca}
        onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))}
        placeholder="🔍 Buscar por cliente, equipamento, técnico, código Omie, feedback…"
        style={{
          width: "100%", padding: "12px 16px", marginTop: 12,
          border: "1.5px solid var(--portal-border)", borderRadius: 10,
          fontSize: 13, background: "var(--portal-bg-card)", color: "var(--portal-text)",
          fontFamily: "Inter, sans-serif", outline: "none",
        }}
      />

      {/* Filtros avançados */}
      {filtrosVisivel && (
        <div style={painelFiltrosStyle}>
          <FiltroCampo label="Técnico">
            <select value={filtros.tecnico} onChange={(e) => setFiltros((f) => ({ ...f, tecnico: e.target.value }))} style={filtroInput}>
              <option value="">Todos</option>
              {tecnicosUnicos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </FiltroCampo>
          <FiltroCampo label="Atendimento">
            <select
              value={filtros.statusAtendimento}
              onChange={(e) => setFiltros((f) => ({ ...f, statusAtendimento: e.target.value as Filtros["statusAtendimento"] }))}
              style={filtroInput}
            >
              <option value="pendentes">⏳ Pendentes (não concluídos)</option>
              <option value="todos">Todos</option>
              <option value="aberto">🟢 Em atendimento</option>
              <option value="atrasados">⚠️ Atrasados (+24h)</option>
              <option value="concluido">✓ Concluídos</option>
              <option value="sem_resposta">🔴 Sem resposta</option>
              <option value="arquivado">🗄️ Arquivados</option>
            </select>
          </FiltroCampo>
          <FiltroCampo label="Data de">
            <input type="date" value={filtros.dataDe} onChange={(e) => setFiltros((f) => ({ ...f, dataDe: e.target.value }))} style={filtroInput} />
          </FiltroCampo>
          <FiltroCampo label="Data até">
            <input type="date" value={filtros.dataAte} onChange={(e) => setFiltros((f) => ({ ...f, dataAte: e.target.value }))} style={filtroInput} />
          </FiltroCampo>

          {tipo === "crm" ? (
            <>
              <FiltroCampo label="Status">
                <select value={filtros.statusCrm} onChange={(e) => setFiltros((f) => ({ ...f, statusCrm: e.target.value }))} style={filtroInput}>
                  <option value="">Todos</option>
                  <option value="Satisfeito">Satisfeito</option>
                  <option value="Neutro">Neutro</option>
                  <option value="Insatisfeito">Insatisfeito</option>
                  <option value="Aguardando">Aguardando</option>
                </select>
              </FiltroCampo>
              <FiltroCampo label={`Nota mínima: ${filtros.notaMin || "—"}`}>
                <input type="range" min={0} max={10} value={filtros.notaMin}
                  onChange={(e) => setFiltros((f) => ({ ...f, notaMin: Number(e.target.value) }))}
                  style={{ width: "100%" }}
                />
              </FiltroCampo>
            </>
          ) : (
            <>
              <FiltroCampo label="Prioridade">
                <select value={filtros.prioridade} onChange={(e) => setFiltros((f) => ({ ...f, prioridade: e.target.value }))} style={filtroInput}>
                  <option value="">Todas</option>
                  <option value="Urgente">Urgente</option>
                  <option value="Normal">Normal</option>
                  <option value="Inativo">Inativo</option>
                </select>
              </FiltroCampo>
              <FiltroCampo label="Sem resposta">
                <select value={filtros.semResposta} onChange={(e) => setFiltros((f) => ({ ...f, semResposta: e.target.value as "todos" | "sim" | "nao" }))} style={filtroInput}>
                  <option value="todos">Todos</option>
                  <option value="sim">Apenas sem resposta</option>
                  <option value="nao">Apenas com resposta</option>
                </select>
              </FiltroCampo>
            </>
          )}

          <button onClick={() => setFiltros(FILTROS_VAZIO)} style={{ ...btnSecundario, alignSelf: "end" }}>
            Limpar
          </button>
        </div>
      )}

      {erro && <div style={erroStyle}>Erro: {erro}</div>}

      {/* Lista */}
      {loading ? (
        <div style={vazioStyle}>Carregando…</div>
      ) : filtradas.length === 0 ? (
        <div style={vazioStyle}>
          {rows.length === 0
            ? `Nenhum registro ${tipo.toUpperCase()} cadastrado ainda.`
            : "Nenhum registro corresponde aos filtros."}
        </div>
      ) : (
        <div style={gridStyle}>
          {filtradas.map((r) => (
            <RegistroCard
              key={r.id}
              registro={r}
              ultimaOS={ultimasOS[(r.nome || "").trim()] || null}
              onEditar={abrirEdit}
              onExcluir={handleExcluir}
              onMudarAtendimento={handleMudarAtendimento}
              onArquivar={handleArquivar}
              onVerHistorico={(reg) => setHistAlvo({ nome: reg.nome, codigoOmie: reg.codigo_omie })}
              clienteTags={tagsDe(r)}
              onCaveira={handleCaveira}
            />
          ))}
        </div>
      )}

      <ModalFeedback
        tipo={tipo}
        aberto={modalAberto}
        registro={registroEdit}
        onFechar={() => setModalAberto(false)}
        onSalvo={handleSalvo}
      />

      <ModalHistoricoCliente
        aberto={!!histAlvo}
        nome={histAlvo?.nome || ""}
        codigoOmie={histAlvo?.codigoOmie ?? null}
        onFechar={() => setHistAlvo(null)}
      />

      <ModalConfirmarCaveira
        aberto={!!caveiraAlvo}
        nome={caveiraAlvo?.nome || ""}
        codigoOmie={caveiraAlvo?.codigo_omie ?? null}
        processando={caveiraProcessando}
        onFechar={() => { if (!caveiraProcessando) setCaveiraAlvo(null); }}
        onApenasNaoContatar={() => { if (caveiraAlvo) void aplicarNaoContatar(caveiraAlvo, false); }}
        onInativarOmie={() => { if (caveiraAlvo) void aplicarNaoContatar(caveiraAlvo, true); }}
      />
    </div>
  );
}

function FiltroCampo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--portal-text-muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const topoStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
};
const badgeStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 8,
  background: "#fef2f2", color: "#b91c1c",
};
const btnPrimario: React.CSSProperties = {
  padding: "9px 18px",
  background: "linear-gradient(135deg, #dc2626, #b91c1c)",
  color: "#fff", border: "none", borderRadius: 10,
  fontSize: 13, fontWeight: 700, cursor: "pointer",
  boxShadow: "0 2px 8px rgba(185,28,28,0.25)",
  fontFamily: "Inter, sans-serif",
};
const btnSecundario: React.CSSProperties = {
  padding: "9px 16px", background: "#fff",
  border: "1.5px solid var(--portal-border)", color: "var(--portal-text-secondary)",
  borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer",
  fontFamily: "Inter, sans-serif",
};
const painelFiltrosStyle: React.CSSProperties = {
  marginTop: 12, padding: 16, background: "var(--portal-bg-card)",
  border: "1px solid var(--portal-border)", borderRadius: 12,
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12, alignItems: "end",
};
const filtroInput: React.CSSProperties = {
  width: "100%", padding: "8px 12px",
  border: "1px solid var(--portal-border)", borderRadius: 8,
  fontSize: 12, background: "var(--portal-bg-card)", color: "var(--portal-text)",
  fontFamily: "Inter, sans-serif", outline: "none",
};
const gridStyle: React.CSSProperties = {
  marginTop: 16,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
  gap: 12,
};
const vazioStyle: React.CSSProperties = {
  marginTop: 20, padding: 60, textAlign: "center",
  color: "var(--portal-text-muted)", fontSize: 14, fontStyle: "italic",
};
const erroStyle: React.CSSProperties = {
  marginTop: 12, padding: "10px 14px",
  background: "#fee2e2", color: "#991b1b",
  borderRadius: 10, fontSize: 13,
};
