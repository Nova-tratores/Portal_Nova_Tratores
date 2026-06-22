"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { X, Search, Loader2, FileText } from "lucide-react";

interface OrcamentoBusca {
  id: number;
  numero: string;
  tipo: string;
  cliente_nome: string;
  cliente_cidade: string | null;
  total: number;
  status: string;
  expirado: boolean;
  ordem_servico: string | null;
}

interface Props {
  open: boolean;
  osId: string; // OS de destino (pra avisar se o orçamento já está em outra OS)
  onClose: () => void;
  onSelect: (id: number, numero: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho", ativo: "Ativo", aprovado: "Aprovado",
  rejeitado: "Rejeitado", expirado: "Expirado", concluido: "Concluído",
};

export function statusBadge(status: string, expirado: boolean): { label: string; bg: string; color: string } {
  if (expirado && status !== "concluido" && status !== "rejeitado") {
    return { label: "Expirado", bg: "#fefce8", color: "#a16207" };
  }
  const map: Record<string, { bg: string; color: string }> = {
    rascunho: { bg: "#f5f5f5", color: "#737373" },
    ativo: { bg: "#eff6ff", color: "#1d4ed8" },
    aprovado: { bg: "#f0fdf4", color: "#16a34a" },
    rejeitado: { bg: "#fef2f2", color: "#dc2626" },
    expirado: { bg: "#fefce8", color: "#a16207" },
    concluido: { bg: "#eef2ff", color: "#4f46e5" },
  };
  const c = map[status] || map.ativo;
  return { label: STATUS_LABEL[status] || status, ...c };
}

export default function ModalBuscaOrcamento({ open, osId, onClose, onSelect }: Props) {
  const [termo, setTermo] = useState("");
  const [lista, setLista] = useState<OrcamentoBusca[]>([]);
  const [carregando, setCarregando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setTermo("");
    setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setCarregando(true);
      try {
        const res = await fetch(`/api/orcamentos?q=${encodeURIComponent(termo.trim())}`);
        const data = await res.json();
        setLista(data.orcamentos || []);
      } catch {
        setLista([]);
      } finally {
        setCarregando(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [termo, open]);

  const filtrados = useMemo(() => lista, [lista]);
  const fmt = (v: number) => (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (!open) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10002, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--portal-bg-card)", borderRadius: 16, maxWidth: 720, width: "100%", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--portal-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, color: "var(--portal-text)" }}>
            <FileText size={18} /> Vincular orçamento
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--portal-text-secondary)", display: "flex" }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: "14px 20px 0" }}>
          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--portal-text-muted)" }} />
            <input
              ref={inputRef}
              type="text"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Buscar por número ou cliente…"
              style={{ width: "100%", padding: "10px 12px 10px 36px", borderRadius: 9, border: "1px solid var(--portal-border)", background: "var(--portal-bg-input)", color: "var(--portal-text)", fontSize: 13, outline: "none", boxSizing: "border-box" }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 20px" }}>
          {carregando ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 28 }}>
              <Loader2 size={18} className="spin" color="var(--portal-text-muted)" />
            </div>
          ) : filtrados.length === 0 ? (
            <div style={{ textAlign: "center", padding: 24, color: "var(--portal-text-muted)", fontSize: 13 }}>
              Nenhum orçamento encontrado.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filtrados.map((o) => {
                const sb = statusBadge(o.status, o.expirado);
                const noutraOS = o.ordem_servico && o.ordem_servico !== osId;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => { onSelect(o.id, o.numero); onClose(); }}
                    style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--portal-border)", background: "var(--portal-bg-card)", cursor: "pointer", display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <strong style={{ fontSize: 13, color: "#dc2626" }}>{o.numero}</strong>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: sb.bg, color: sb.color }}>{sb.label}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: "var(--portal-text-secondary)" }}>
                      <span>{o.cliente_nome || "—"}{o.cliente_cidade ? ` · ${o.cliente_cidade}` : ""}</span>
                      <span style={{ fontWeight: 700, color: "var(--portal-text)" }}>R$ {fmt(o.total)}</span>
                    </div>
                    {noutraOS && (
                      <span style={{ fontSize: 11, color: "#b45309" }}>Já vinculado à OS {o.ordem_servico} — será movido para esta.</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
