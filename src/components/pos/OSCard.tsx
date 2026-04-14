"use client";

import { useState } from "react";
import { diasEntre } from "@/lib/pos/utils";
import type { KanbanCard } from "@/lib/pos/types";

interface OSCardProps {
  order: KanbanCard;
  onClick: (id: string) => void;
}

export default function OSCard({ order: o, onClick }: OSCardProps) {
  let borderColor = "#1E3A5F";
  if (o.status === "Aguardando ordem Técnico") borderColor = "#0EA5E9";
  else if (o.status === "Aguardando outros") borderColor = "#A855F7";
  else if (o.status.includes("Exec")) borderColor = "#F59E0B";
  else if (o.status.includes("Concluída")) borderColor = "#10B981";
  else if (o.status.includes("Cancelada")) borderColor = "#EF4444";

  const diasCriado = diasEntre(o.data);
  const diasFase = diasEntre(o.dataFase);

  const temReqOuRel = (o.temReq && o.reqInfo && o.reqInfo.length > 0) || o.temRel;
  const [hover, setHover] = useState(false);

  return (
    <div className="card" style={{ borderLeftColor: borderColor, position: "relative" }} onClick={() => onClick(o.id)}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <b>#{o.id}</b>
          {/* Indicador piscando quando tem req + ordem */}
          {temReqOuRel && (
            <span
              onMouseEnter={() => setHover(true)}
              onMouseLeave={() => setHover(false)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                padding: "1px 7px",
                borderRadius: 6,
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: 0.5,
                color: "#fff",
                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                animation: "pulseGlow 1.5s ease-in-out infinite",
                cursor: "default",
                position: "relative",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <i className="fas fa-paperclip" style={{ fontSize: 8 }} />
              {o.reqInfo && o.reqInfo.length > 0 && `${o.reqInfo.length} REQ`}
              {o.reqInfo?.length > 0 && o.temRel && " + "}
              {o.temRel && "REL"}
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700 }}>R$ {o.valor}</span>
      </div>

      {/* Tooltip no hover */}
      {temReqOuRel && hover && (
        <div
          style={{
            position: "absolute",
            top: -8,
            left: "50%",
            transform: "translate(-50%, -100%)",
            background: "#1e293b",
            color: "#fff",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 11,
            zIndex: 100,
            minWidth: 220,
            maxWidth: 300,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            pointerEvents: "none",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Seta */}
          <div style={{
            position: "absolute", bottom: -5, left: "50%", transform: "translateX(-50%)",
            width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "6px solid #1e293b",
          }} />

          {/* Requisições */}
          {o.reqInfo && o.reqInfo.length > 0 && (
            <div style={{ marginBottom: o.temRel ? 8 : 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                <i className="fas fa-shopping-cart" style={{ marginRight: 4 }} />Requisições
              </div>
              {o.reqInfo.map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  <div>
                    <span style={{ fontWeight: 700, color: "#fbbf24" }}>#{r.id}</span>
                    <span style={{ marginLeft: 6, color: "#cbd5e1" }}>{r.titulo || "Sem título"}</span>
                  </div>
                  {r.valor > 0 && (
                    <span style={{ fontWeight: 700, color: "#34d399", whiteSpace: "nowrap", marginLeft: 8 }}>
                      R$ {r.valor.toFixed(2).replace(".", ",")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Relatório técnico */}
          {o.temRel && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>
                <i className="fas fa-file-alt" style={{ marginRight: 4 }} />Relatório Técnico
              </div>
              <div style={{ color: "#e2e8f0" }}>
                {o.relTecnico ? (
                  <>Preenchido por <span style={{ fontWeight: 700, color: "#60a5fa" }}>{o.relTecnico}</span></>
                ) : (
                  "Relatório anexado"
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>{o.cliente}</div>
      <div style={{ fontSize: 10, color: "var(--text-light)", marginBottom: 8, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
        <i>{o.servSolicitado}</i>
      </div>
      <div style={{ fontSize: 10, color: "var(--text-light)" }}><i className="far fa-calendar-alt" /> Criado: {diasCriado} dias</div>
      <div style={{ fontSize: 10, color: "var(--primary)", marginBottom: 6 }}><i className="fas fa-clock" /> Na fase: {diasFase} dias</div>
      {o.ultimaAcao && (
        <div style={{ background: "#F8F9FA", borderRadius: 6, padding: "6px 8px", marginBottom: 8, border: "1px solid #E9ECEF" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#374151", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {o.ultimaAcao}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#9CA3AF" }}>
            <span><i className="far fa-user" style={{ marginRight: 3 }} />{o.ultimoUsuario}</span>
            <span>{o.ultimaData}</span>
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, borderTop: "1px dashed var(--border)", paddingTop: 8, alignItems: "center" }}>
        {o.temPPV ? (
          <a
            href={`/ppv?id=${encodeURIComponent(o.ppvId.split(",")[0].trim())}`}
            onClick={(e) => e.stopPropagation()}
            title={`Abrir ${o.ppvId}`}
            style={{ color: "#1E3A5F", display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, textDecoration: "none" }}
          >
            <i className="fas fa-box" />
            <span>{o.ppvId.split(",")[0].trim()}</span>
          </a>
        ) : (
          <i className="fas fa-box" style={{ color: "var(--border)" }} />
        )}
        <i className="fas fa-shopping-cart" style={{ color: o.temReq ? "#1E3A5F" : "var(--border)" }} />
        <i className="fas fa-file-alt" style={{ color: o.temRel ? "#1E3A5F" : "var(--border)" }} />
      </div>

      {/* CSS da animação pulsante */}
      <style>{`
        @keyframes pulseGlow {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(245,158,11,0.4); }
          50% { opacity: 0.85; box-shadow: 0 0 8px 3px rgba(245,158,11,0.3); }
        }
      `}</style>
    </div>
  );
}
