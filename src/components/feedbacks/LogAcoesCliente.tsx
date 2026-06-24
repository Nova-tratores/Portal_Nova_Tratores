"use client";
import { useCallback, useEffect, useState } from "react";
import { buscarLogsCliente, type LogAcao } from "@/lib/feedbacks/api";
import { clienteKey } from "@/lib/feedbacks/types";

interface Props {
  codigoOmie: string | null;
  nome: string;
  visible: boolean;
  refreshKey?: number;   // muda pra forçar recarregar (ex: depois de salvar)
}

// Texto legível por ação registrada no audit_log do módulo de feedbacks.
const ACAO_LABEL: Record<string, string> = {
  atendimento_salvo: "Atendimento salvo",
  atendimento_concluido: "Atendimento concluído",
  atendimento_reaberto: "Atendimento reaberto",
  atendimento_sem_resposta: "Marcado como sem resposta",
  atendimento_arquivado: "Atendimento arquivado",
  cadastro_omie: "Dados cadastrais atualizados (Omie)",
  localizacao_cliente: "Localização atualizada",
  tags_cliente: "Tags atualizadas",
  tags_omie: "Tags sincronizadas no Omie",
  nao_contatar: "Marcado como “não contatar”",
  inativar_omie: "Cadastro inativado no Omie",
  reativar_contato: "Contato reativado",
};

function fmtDataHora(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Histórico de ações do cliente (audit_log) — mesmo visual do LogPanel do POS.
export default function LogAcoesCliente({ codigoOmie, nome, visible, refreshKey }: Props) {
  const [logs, setLogs] = useState<LogAcao[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    if (!nome) return;
    setLoading(true);
    try {
      setLogs(await buscarLogsCliente(clienteKey(codigoOmie, nome)));
    } catch {
      /* silencioso — log é informativo */
    }
    setLoading(false);
  }, [codigoOmie, nome]);

  useEffect(() => {
    if (!nome || !visible) return;
    fetchLogs();
  }, [nome, visible, refreshKey, fetchLogs]);

  if (!visible) return null;

  return (
    <div className="log-panel">
      <div style={{ padding: "14px 20px", background: "#F5F0E8", borderBottom: "1px solid #E0D6C8", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "space-between", color: "#3A332B" }}>
        <span>Histórico</span>
        <button
          onClick={fetchLogs}
          disabled={loading}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#7A6E5D", fontSize: 13, padding: "4px 8px", borderRadius: 6, display: "flex", alignItems: "center", gap: 4 }}
          title="Atualizar"
        >
          <i className={`fas fa-sync-alt${loading ? " fa-spin" : ""}`} style={{ fontSize: 11 }} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {logs.length === 0 ? (
          <div style={{ padding: 20, color: "#B8A99A", textAlign: "center" }}>
            {loading ? "Carregando..." : "Sem histórico."}
          </div>
        ) : (
          logs.map((l) => (
            <div key={l.id} style={{ padding: 15, borderBottom: "1px solid #F5F0E8", fontSize: 12 }}>
              <div style={{ color: "var(--primary)", fontWeight: 600 }}>{fmtDataHora(l.created_at)}</div>
              <div style={{ fontWeight: 600 }}>{ACAO_LABEL[l.acao] || l.acao}</div>
              <div style={{ fontSize: 10, color: "#999" }}>{l.user_nome || ""}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
