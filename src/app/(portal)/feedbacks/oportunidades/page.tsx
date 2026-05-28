"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import KanbanOportunidades from "@/components/feedbacks/KanbanOportunidades";
import ModalFeedback from "@/components/feedbacks/ModalFeedback";
import { listarOportunidades } from "@/lib/feedbacks/api";
import type { FeedbackRegistro, Oportunidade, RegraOportunidade, StatusOportunidade, TipoFeedback } from "@/lib/feedbacks/types";

// Cada regra de oportunidade pre-seleciona um tipo de feedback ao atender:
// - R1 revisao garantia → CRM (registramos a confirmacao da revisao)
// - R2 sem OS recente   → RFM (reativacao de cliente parado)
// - R3 up-sell          → RFM (cliente esfriado, motivar venda)
// - R4 follow-up        → CRM (confirmar satisfacao do servico anterior)
// - R5 venda de pecas   → RFM (cliente sem comprar peca ha tempo)
const TIPO_PADRAO_POR_REGRA: Record<RegraOportunidade, TipoFeedback> = {
  R1_revisao:  "crm",
  R2_sem_os:   "rfm",
  R3_upsell:   "rfm",
  R4_followup: "crm",
  R5_pecas:    "rfm",
};

function prefillDoOportunidade(op: Oportunidade): Partial<FeedbackRegistro> {
  const tipo = TIPO_PADRAO_POR_REGRA[op.regra];
  const d = op.detalhes || {};
  const hoje = new Date().toISOString().slice(0, 10);
  const base: Partial<FeedbackRegistro> = {
    tipo,
    nome: op.cliente_nome,
    codigo_omie: op.codigo_omie,
    trator: op.trator,
    data_contato: hoje,
  };
  // Sugestao automatica como ponto de partida
  const sugestao = (d.sugestao as string | undefined) || "";
  if (tipo === "crm") {
    if (op.regra === "R1_revisao") {
      const alvo = (d.revisao_alvo as string | undefined) || "";
      base.servico = `Confirmacao revisao ${alvo}`.trim();
    } else if (op.regra === "R4_followup") {
      base.servico = "Follow-up apos feedback";
    }
    base.feedback = sugestao;
  } else {
    base.motivo = sugestao;
    base.prioridade = op.prioridade === "Urgente" ? "Urgente" : "Normal";
  }
  return base;
}

const STATUS_FILTROS: Array<{ value: StatusOportunidade | "todas"; label: string }> = [
  { value: "aberta",      label: "Abertas" },
  { value: "atendida",    label: "Atendidas" },
  { value: "dispensada",  label: "Dispensadas" },
  { value: "expirada",    label: "Expiradas" },
  { value: "todas",       label: "Todas" },
];

export default function OportunidadesPage() {
  const { userProfile } = useAuth();
  const [ops, setOps] = useState<Oportunidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputando, setRecomputando] = useState(false);
  const [statusFiltro, setStatusFiltro] = useState<StatusOportunidade | "todas">("aberta");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [comoFuncionaAberto, setComoFuncionaAberto] = useState(false);
  // Modal de atendimento: ao clicar "Atender" abre um ModalFeedback pre-preenchido.
  // Quando o usuario salva, criamos um feedback_registros e marcamos a oportunidade
  // como atendida com feedback_id vinculado.
  const [modalAtender, setModalAtender] = useState<{ op: Oportunidade; tipo: TipoFeedback } | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listarOportunidades(statusFiltro);
      setOps(data);
      // Não limpa erro aqui — recomputar() pode ter setado mensagem de erro
      // das regras que precisa permanecer visível mesmo depois do reload da lista.
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [statusFiltro]);

  useEffect(() => { void carregar(); }, [carregar]);

  const recomputar = useCallback(async () => {
    setRecomputando(true);
    setMsg(null);
    setErro(null);
    try {
      const res = await fetch("/api/feedbacks/oportunidades/recomputar", {
        method: "POST",
        headers: { "x-sync-manual": "true" },
      });
      const json = await res.json();
      console.log("[recomputar] response completo:", json);
      if (!res.ok || !json.sucesso) {
        throw new Error(json.erro || "Falha ao recomputar");
      }
      const resumo = (json.resumo || {}) as Record<string, { computadas?: number; inseridas_ou_atualizadas?: number; expiradas?: number; erro?: string }>;
      const linhas: string[] = [];
      const erros: string[] = [];
      for (const [regra, r] of Object.entries(resumo)) {
        if (r?.erro) {
          linhas.push(`${regra}=ERRO`);
          erros.push(`${regra}: ${r.erro}`);
        } else {
          const c = r?.computadas ?? 0;
          const i = r?.inseridas_ou_atualizadas ?? 0;
          linhas.push(`${regra}=${c}${c !== i ? ` (inseridas ${i})` : ""}`);
        }
      }
      await carregar();
      setMsg(`Recomputado em ${json.ms}ms — ${linhas.join(" · ")}`);
      if (erros.length) setErro("Erros nas regras: " + erros.join(" | "));
      else setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setRecomputando(false);
    }
  }, [carregar]);

  const patch = useCallback(async (id: number, payload: Record<string, unknown>) => {
    const res = await fetch(`/api/feedbacks/oportunidades?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.erro || "Falha ao atualizar");
    }
    return res.json() as Promise<Oportunidade>;
  }, []);

  // Abrir modal de atendimento pre-preenchido (CRM ou RFM conforme a regra)
  const handleAtender = useCallback((op: Oportunidade) => {
    if (!userProfile) return;
    const tipo = TIPO_PADRAO_POR_REGRA[op.regra];
    setModalAtender({ op, tipo });
  }, [userProfile]);

  // Apos salvar o feedback no modal, vinculamos com a oportunidade
  const handleFeedbackSalvo = useCallback(async (feedbackSalvo: FeedbackRegistro) => {
    if (!modalAtender || !userProfile) return;
    try {
      await patch(modalAtender.op.id, {
        status: "atendida",
        atendida_por: userProfile.id,
        feedback_id: feedbackSalvo.id,
      });
      await carregar();
      setMsg(`Oportunidade de "${modalAtender.op.cliente_nome}" atendida e ${feedbackSalvo.tipo.toUpperCase()} #${feedbackSalvo.id} criado.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, [modalAtender, userProfile, patch, carregar]);

  const handleDispensar = useCallback(async (op: Oportunidade) => {
    const motivo = prompt(`Motivo para dispensar oportunidade de "${op.cliente_nome}":`);
    if (motivo === null) return;
    try {
      await patch(op.id, { status: "dispensada", dispensada_motivo: motivo || "(sem motivo)" });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, [patch, carregar]);

  return (
    <div style={{ paddingTop: 20 }}>
      {/* Barra superior */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
          flexWrap: "wrap",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--portal-text)", margin: 0, flex: 1 }}>
          🎯 Oportunidades
        </h1>

        <button
          onClick={() => setComoFuncionaAberto((v) => !v)}
          style={{
            padding: "8px 14px",
            background: "#fff",
            border: "1.5px solid var(--portal-border)",
            color: "var(--portal-text-secondary)",
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "Inter, sans-serif",
          }}
        >
          {comoFuncionaAberto ? "▴ Esconder ajuda" : "❓ Como funciona"}
        </button>

        <select
          value={statusFiltro}
          onChange={(e) => setStatusFiltro(e.target.value as StatusOportunidade | "todas")}
          style={{
            padding: "8px 12px",
            border: "1px solid var(--portal-border)",
            borderRadius: 8,
            background: "var(--portal-bg-card)",
            color: "var(--portal-text)",
            fontSize: 13,
            fontFamily: "Inter, sans-serif",
            cursor: "pointer",
          }}
          title="Filtrar por status — abertas são as ações pendentes"
        >
          {STATUS_FILTROS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>

        <button
          onClick={recomputar}
          disabled={recomputando}
          title="Roda a análise novamente em cima dos dados atuais (tratores, OS, feedbacks). É feito automaticamente todo dia às 06:00."
          style={{
            padding: "9px 18px",
            background: recomputando ? "#94a3b8" : "linear-gradient(135deg, #dc2626, #b91c1c)",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            cursor: recomputando ? "wait" : "pointer",
            boxShadow: "0 2px 8px rgba(185,28,28,0.25)",
            fontFamily: "Inter, sans-serif",
          }}
        >
          {recomputando ? "⏳ Recomputando…" : "🔄 Recomputar agora"}
        </button>
      </div>

      {comoFuncionaAberto && (
        <div style={comoFuncionaStyle}>
          <p style={{ margin: 0, marginBottom: 12, fontSize: 13, lineHeight: 1.6, color: "var(--portal-text)" }}>
            <strong>O que é esta tela?</strong> Um painel automático que olha pra base de tratores vendidos, OSs feitas e
            feedbacks coletados, e sugere quais clientes vale a pena contatar agora — para revisão, manutenção,
            up-sell de implemento ou retorno pós-atendimento.
          </p>
          <div style={comoGridStyle}>
            <ComoBlock cor="#dc2626" emoji="🔧" titulo="Revisões garantia">
              Trator próximo de uma <strong>revisão obrigatória</strong> (50h, 300h ou 600h). Se passar do prazo, o cliente perde a garantia de fábrica. Quem está atrasado vira <em>URGENTE</em>.
            </ComoBlock>
            <ComoBlock cor="#f59e0b" emoji="🏗️" titulo="Sem OS recente">
              Cliente parado há <strong>3 meses ou mais</strong> — sem nenhuma OS na oficina e sem nenhum registro de contato (feedback CRM/RFM) nesse período. Hora de ligar pra ver como está.
            </ComoBlock>
            <ComoBlock cor="#8b5cf6" emoji="🔩" titulo="Venda de peças">
              Cliente que <strong>já comprou peça</strong> da gente mas não faz pedido há <strong>6 meses ou mais</strong>. Hora de oferecer reposição, kit de manutenção, ou peça preventiva.
            </ComoBlock>
            <ComoBlock cor="#10b981" emoji="📈" titulo="Up-sell potencial">
              Cliente com trator nosso que está <strong>parado há 12+ meses</strong> sem nenhum pedido. Cliente frio — bom momento pra oferecer implemento (pulverizador, plantadeira) ou trator novo pra puxar mais ferramenta.
            </ComoBlock>
            <ComoBlock cor="#3b82f6" emoji="📞" titulo="Follow-up feedback">
              Já faz cerca de <strong>30 dias</strong> que pegamos o último feedback desse cliente. Hora de retornar e perguntar como está o serviço, se travou algo, se precisa de peça.
            </ComoBlock>
          </div>
          <div style={{ marginTop: 14, padding: 12, background: "#fff", border: "1px solid var(--portal-border)", borderRadius: 8, fontSize: 12, color: "var(--portal-text-secondary)", lineHeight: 1.6 }}>
            <strong style={{ color: "var(--portal-text)" }}>O que fazer em cada card:</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              <li><strong>✓ Atender</strong> — Entrei em contato (ou vou entrar agora). Some da lista de abertas.</li>
              <li><strong>✕ Dispensar</strong> — Não é oportunidade real (cliente já foi contatado por outro canal, não interessa, etc).</li>
            </ul>
            <div style={{ marginTop: 8 }}>
              A análise roda <strong>automaticamente todo dia às 06:00</strong>. Se precisar atualizar na hora, clica em <em>🔄 Recomputar agora</em>.
            </div>
          </div>
        </div>
      )}

      {msg && (
        <div style={notifStyle("#d1fae5", "#065f46")}>{msg}</div>
      )}
      {erro && (
        <div style={notifStyle("#fee2e2", "#991b1b")}>Erro: {erro}</div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--portal-text-muted)", fontFamily: "Inter, sans-serif" }}>
          Carregando…
        </div>
      ) : (
        <KanbanOportunidades
          oportunidades={ops}
          onAtender={handleAtender}
          onDispensar={handleDispensar}
        />
      )}

      {modalAtender && (
        <ModalFeedback
          tipo={modalAtender.tipo}
          aberto={true}
          prefill={prefillDoOportunidade(modalAtender.op)}
          onFechar={() => setModalAtender(null)}
          onSalvo={handleFeedbackSalvo}
        />
      )}
    </div>
  );
}

function notifStyle(bg: string, fg: string): React.CSSProperties {
  return {
    background: bg,
    color: fg,
    padding: "10px 14px",
    borderRadius: 10,
    fontSize: 13,
    marginBottom: 12,
    fontFamily: "Inter, sans-serif",
  };
}

function ComoBlock({ cor, emoji, titulo, children }: { cor: string; emoji: string; titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderLeft: `4px solid ${cor}`, borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 16 }}>{emoji}</span>
        <strong style={{ fontSize: 13, color: "var(--portal-text)" }}>{titulo}</strong>
      </div>
      <div style={{ fontSize: 12, color: "var(--portal-text-secondary)", lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

const comoFuncionaStyle: React.CSSProperties = {
  background: "#fafafa",
  border: "1px solid var(--portal-border)",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
  fontFamily: "Inter, sans-serif",
};

const comoGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};
