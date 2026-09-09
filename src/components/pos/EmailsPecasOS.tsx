"use client";
// Histórico dos e-mails de peças da OS (aprovação do pedido + lembrete de
// separação pro Zezo/Danilo) — aparece junto do Histórico no drawer.
import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth/client";

interface EmailRow { id: number; tipo: string; para: string; assunto: string; data_servico: string | null; enviado_em: string }

export default function EmailsPecasOS({ osId }: { osId: string | null }) {
  const [emails, setEmails] = useState<EmailRow[] | null>(null);

  useEffect(() => {
    if (!osId) return;
    let ativo = true;
    (async () => {
      try {
        const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/emails`, { headers: { ...(await authHeaders()) } });
        const j = await r.json();
        if (ativo) setEmails(Array.isArray(j.emails) ? j.emails : []);
      } catch { if (ativo) setEmails([]); }
    })();
    return () => { ativo = false; };
  }, [osId]);

  if (!emails || emails.length === 0) return null;

  return (
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px" }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)", marginBottom: 8 }}>
        <i className="fas fa-envelope" style={{ marginRight: 6, color: "#0891A8" }} />E-mails de peças ({emails.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {emails.map((e) => (
          <div key={e.id} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12.5, borderBottom: "1px solid var(--portal-bg-secondary, #f1f5f9)", paddingBottom: 5, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 10, fontWeight: 800, borderRadius: 5, padding: "2px 8px", textTransform: "uppercase", whiteSpace: "nowrap",
              background: e.tipo === "separacao" ? "#FEF3C7" : "#D1FAE5",
              color: e.tipo === "separacao" ? "#B45309" : "#047857",
            }}>{e.tipo === "separacao" ? "Separar peças" : "Pedido aprovado"}</span>
            <span style={{ flex: 1, minWidth: 160, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.assunto}>{e.assunto}</span>
            <span style={{ color: "var(--text-light)", whiteSpace: "nowrap" }} title={`Para: ${e.para}`}>
              {new Date(e.enviado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
