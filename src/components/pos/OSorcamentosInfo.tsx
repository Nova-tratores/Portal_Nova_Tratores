"use client";
import { useState, useEffect, useCallback } from "react";
import { FileText, ExternalLink, Loader2, Plus, Download, CheckCircle2, X, Package, Clock, MapPin } from "lucide-react";
import ModalBuscaOrcamento, { statusBadge } from "./ModalBuscaOrcamento";

interface ItemOrc { codigo?: string; descricao?: string; quantidade?: number; preco?: number; }
interface OrcamentoVinc {
  id: number;
  numero: string;
  tipo: string;
  cliente_nome: string;
  observacao: string;
  validade: number | null;
  itens: ItemOrc[];
  mao_obra: { valorHora: number; horas: number } | null;
  deslocamento: { valorKm: number; km: number } | null;
  total: number;
  status: string;
  expirado: boolean;
  vencimento: string | null;
}

const fmt = (v: number) => (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Seção da OS (Pós-Vendas) que mostra os orçamentos vinculados, com ações de
// concluir e importar dados (peças/horas/km/observação) para a OS e o PPV.
export default function OSorcamentosInfo({ osId, userName, onImported }: { osId: string; userName: string; onImported?: () => void }) {
  const [lista, setLista] = useState<OrcamentoVinc[]>([]);
  const [carregou, setCarregou] = useState(false);
  const [busy, setBusy] = useState("");
  const [aviso, setAviso] = useState("");
  const [modalAberto, setModalAberto] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/orcamentos?os=${encodeURIComponent(osId)}`);
      const data = await res.json();
      setLista(data.orcamentos || []);
    } catch {
      setLista([]);
    } finally {
      setCarregou(true);
    }
  }, [osId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function vincular(id: number) {
    setBusy(`vincular-${id}`);
    try {
      await fetch(`/api/orcamentos/${id}/vincular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordem_servico: osId }),
      });
      await carregar();
    } finally {
      setBusy("");
    }
  }

  async function desvincular(id: number) {
    if (!confirm("Desvincular este orçamento da OS?")) return;
    setBusy(`desvincular-${id}`);
    try {
      await fetch(`/api/orcamentos/${id}/vincular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordem_servico: null }),
      });
      await carregar();
    } finally {
      setBusy("");
    }
  }

  async function concluir(id: number) {
    setBusy(`concluir-${id}`);
    try {
      await fetch(`/api/orcamentos/${id}/concluir`, { method: "POST" });
      await carregar();
    } finally {
      setBusy("");
    }
  }

  async function importar(o: OrcamentoVinc) {
    if (!confirm(`Importar o orçamento ${o.numero} para esta OS?\n\nHoras e KM vão SUBSTITUIR os valores da OS, as peças entram no PPV e o orçamento é marcado como concluído.`)) return;
    setBusy(`importar-${o.id}`);
    setAviso("");
    try {
      const res = await fetch(`/api/orcamentos/${o.id}/importar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordem_servico: osId, userName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAviso(data.error || "Falha ao importar.");
        return;
      }
      setAviso(`Importado: ${data.horas}h · ${data.km} km · ${data.itens} peça(s)${data.ppvCriado ? ` · PPV ${data.ppv} criado` : data.ppv ? ` · peças no PPV ${data.ppv}` : ""}. Reabra a OS pra ver horas/km/total atualizados.`);
      await carregar();
      onImported?.();
    } finally {
      setBusy("");
    }
  }

  if (!carregou) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {lista.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--portal-text-muted, #94a3b8)" }}>Nenhum orçamento vinculado a esta OS.</div>
      ) : (
        lista.map((o) => {
          const sb = statusBadge(o.status, o.expirado);
          const horas = o.mao_obra?.horas || 0;
          const km = o.deslocamento?.km || 0;
          const concluido = o.status === "concluido";
          return (
            <div key={o.id} style={{ border: "1px solid var(--portal-border, #e5e7eb)", borderLeft: `4px solid ${sb.color}`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "var(--portal-bg-card, #fff)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <FileText size={15} color={sb.color} />
                  <strong style={{ fontSize: 13, color: "var(--portal-text)" }}>{o.numero}</strong>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: sb.bg, color: sb.color }}>{sb.label}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: "var(--portal-text)" }}>R$ {fmt(o.total)}</span>
              </div>

              {/* Peças */}
              {o.itens.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--portal-text-muted)", display: "flex", alignItems: "center", gap: 4 }}><Package size={12} /> Peças ({o.itens.length})</span>
                  {o.itens.map((it, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--portal-text-secondary)", paddingLeft: 16 }}>
                      <span>{it.quantidade || 1}x {it.descricao}{it.codigo ? ` (${it.codigo})` : ""}</span>
                      <span style={{ whiteSpace: "nowrap" }}>R$ {fmt((it.preco || 0) * (it.quantidade || 1))}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Horas / KM */}
              {(horas > 0 || km > 0) && (
                <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--portal-text-secondary)" }}>
                  {horas > 0 && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Clock size={12} /> {horas}h</span>}
                  {km > 0 && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MapPin size={12} /> {km} km</span>}
                </div>
              )}

              {/* Observação */}
              {o.observacao && (
                <div style={{ fontSize: 12, color: "var(--portal-text-secondary)", background: "var(--portal-bg-secondary)", padding: "6px 8px", borderRadius: 6 }}>
                  <strong>Obs.:</strong> {o.observacao}
                </div>
              )}

              {/* Ações */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => importar(o)}
                  disabled={!!busy}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 7, border: "none", background: "linear-gradient(135deg,#1d4ed8,#1e40af)", color: "#fff", fontSize: 11, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
                >
                  {busy === `importar-${o.id}` ? <Loader2 size={12} className="spin" /> : <Download size={12} />}
                  Importar p/ OS e PPV
                </button>
                {!concluido && (
                  <button
                    type="button"
                    onClick={() => concluir(o.id)}
                    disabled={!!busy}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--portal-border)", background: "var(--portal-bg-input)", color: "var(--portal-text-secondary)", fontSize: 11, fontWeight: 600, cursor: busy ? "default" : "pointer" }}
                  >
                    {busy === `concluir-${o.id}` ? <Loader2 size={12} className="spin" /> : <CheckCircle2 size={12} />}
                    Concluir
                  </button>
                )}
                <a href={`/orcamentos?id=${o.id}`} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#0ea5e9", fontWeight: 600 }}>
                  <ExternalLink size={12} /> Abrir
                </a>
                <button
                  type="button"
                  onClick={() => desvincular(o.id)}
                  disabled={!!busy}
                  title="Desvincular da OS"
                  style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: busy ? "default" : "pointer", color: "#dc2626", fontSize: 11, fontWeight: 600 }}
                >
                  <X size={13} /> Desvincular
                </button>
              </div>
            </div>
          );
        })
      )}

      {aviso && (
        <div style={{ fontSize: 12, color: "#15803d", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 10px" }}>{aviso}</div>
      )}

      <button
        type="button"
        onClick={() => setModalAberto(true)}
        style={{ display: "flex", alignItems: "center", gap: 6, alignSelf: "flex-start", padding: "7px 12px", borderRadius: 8, border: "1px dashed var(--portal-border)", background: "var(--portal-bg-input)", color: "var(--portal-text-secondary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
      >
        <Plus size={14} /> Vincular orçamento
      </button>

      <ModalBuscaOrcamento
        open={modalAberto}
        osId={osId}
        onClose={() => setModalAberto(false)}
        onSelect={(id) => vincular(id)}
      />
    </div>
  );
}
