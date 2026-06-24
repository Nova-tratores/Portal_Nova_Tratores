"use client";
import { useState } from "react";

interface Props {
  aberto: boolean;
  nome: string;
  codigoOmie: string | null;   // sem código → não dá pra inativar no Omie
  processando: boolean;
  onFechar: () => void;
  onApenasNaoContatar: () => void;   // marca só no Portal (reversível)
  onInativarOmie: () => void;        // marca + INATIVA o cadastro no Omie
}

// Confirmação "expressiva" da caveira: marcar cliente como não-contatar e,
// opcionalmente, inativar o cadastro no Omie (ação forte, exige confirmação).
export default function ModalConfirmarCaveira({
  aberto, nome, codigoOmie, processando, onFechar, onApenasNaoContatar, onInativarOmie,
}: Props) {
  const [confirmado, setConfirmado] = useState(false);
  // Reseta o checkbox a cada abertura sem useEffect (padrão "ajuste durante render").
  const [eraAberto, setEraAberto] = useState(aberto);
  if (aberto !== eraAberto) { setEraAberto(aberto); if (aberto) setConfirmado(false); }

  if (!aberto) return null;

  return (
    <div style={overlay} onClick={processando ? undefined : onFechar}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        {/* Header expressivo */}
        <div style={header}>
          <div style={{ fontSize: 46, lineHeight: 1 }}>💀</div>
          <h2 style={{ margin: "10px 0 2px", fontSize: 22, fontWeight: 900, letterSpacing: 0.3 }}>Tem certeza?</h2>
          <div style={{ fontSize: 13, opacity: 0.9, fontWeight: 600 }}>
            Você está prestes a desistir de contatar este cliente.
          </div>
        </div>

        <div style={{ padding: "18px 22px" }}>
          <div style={nomeBox}>{nome || "(sem nome)"}</div>

          <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.6, marginBottom: 14 }}>
            Ao confirmar, este cliente será marcado como{" "}
            <strong style={{ color: "#991b1b" }}>&quot;Não contatar&quot;</strong> e sumirá das listas de
            pendentes do CRM/RFM.
          </div>

          {codigoOmie ? (
            <div style={avisoForte}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>⚠ Inativar no Omie é uma ação forte</div>
              O cadastro deixa de aparecer em novas vendas, OS e orçamentos no Omie. Dá pra reverter
              depois (reativar), mas evite fazer por engano.
              <label style={checkRow}>
                <input type="checkbox" checked={confirmado} disabled={processando} onChange={(e) => setConfirmado(e.target.checked)} style={{ width: 16, height: 16 }} />
                <span>Entendo e quero <strong>inativar o cadastro no Omie</strong>.</span>
              </label>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#64748b", fontStyle: "italic", marginBottom: 8 }}>
              Este cliente não tem código Omie vinculado — só dá pra marcar &quot;Não contatar&quot; no Portal.
            </div>
          )}
        </div>

        {/* Ações */}
        <div style={footer}>
          <button onClick={onFechar} disabled={processando} style={btnGhost}>Cancelar</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onApenasNaoContatar} disabled={processando} style={btnSecundario}>
              {processando ? "…" : "Só marcar “Não contatar”"}
            </button>
            {codigoOmie && (
              <button
                onClick={onInativarOmie}
                disabled={processando || !confirmado}
                style={{ ...btnPerigo, opacity: processando || !confirmado ? 0.5 : 1, cursor: processando || !confirmado ? "default" : "pointer" }}
              >
                {processando ? "Inativando…" : "Inativar no Omie"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,0.7)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 10000, padding: 16, fontFamily: "Inter, sans-serif",
};
const card: React.CSSProperties = {
  background: "#fff", width: "100%", maxWidth: 460, borderRadius: 16,
  overflow: "hidden", boxShadow: "0 25px 60px rgba(0,0,0,0.4)",
};
const header: React.CSSProperties = {
  background: "linear-gradient(135deg, #b91c1c, #7f1d1d)",
  color: "#fff", textAlign: "center", padding: "22px 22px 18px",
};
const nomeBox: React.CSSProperties = {
  fontSize: 15, fontWeight: 800, color: "#0f172a", textAlign: "center",
  padding: "10px 12px", background: "#f8fafc", border: "1px solid #e2e8f0",
  borderRadius: 10, marginBottom: 14,
};
const avisoForte: React.CSSProperties = {
  background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 10,
  padding: "12px 14px", fontSize: 12.5, color: "#7f1d1d", lineHeight: 1.5,
};
const checkRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, marginTop: 10,
  fontSize: 13, color: "#7f1d1d", cursor: "pointer", fontWeight: 600,
};
const footer: React.CSSProperties = {
  padding: "14px 22px", borderTop: "1px solid #e2e8f0",
  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: "#fafafa",
};
const btnGhost: React.CSSProperties = {
  padding: "10px 18px", background: "#fff", border: "1.5px solid #e2e8f0",
  color: "#475569", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const btnSecundario: React.CSSProperties = {
  padding: "10px 14px", background: "#fff", border: "1.5px solid #fca5a5",
  color: "#b91c1c", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
};
const btnPerigo: React.CSSProperties = {
  padding: "10px 16px", background: "linear-gradient(135deg, #dc2626, #991b1b)",
  color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800,
  boxShadow: "0 2px 8px rgba(153,27,27,0.35)",
};
