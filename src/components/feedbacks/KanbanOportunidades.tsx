"use client";
import { useMemo } from "react";
import OportunidadeCard from "./OportunidadeCard";
import type { Oportunidade, RegraOportunidade } from "@/lib/feedbacks/types";

interface ColunaDef {
  regra: RegraOportunidade;
  titulo: string;
  emoji: string;
  cor: string;
  explicacao: string;
}

const COLUNAS: ColunaDef[] = [
  {
    regra: "R1_revisao",
    titulo: "Revisões garantia",
    emoji: "🔧",
    cor: "#dc2626",
    explicacao: "Clientes próximos de uma revisão obrigatória (50h, 300h ou 600h). Se não fizer a revisão no prazo, perde a garantia.",
  },
  {
    regra: "R2_sem_os",
    titulo: "Sem OS recente",
    emoji: "🏗️",
    cor: "#f59e0b",
    explicacao: "Clientes nossos parados há 3+ meses — sem nenhuma OS na oficina e sem registro de contato em feedback. Hora de ligar.",
  },
  {
    regra: "R5_pecas",
    titulo: "Venda de peças",
    emoji: "🔩",
    cor: "#8b5cf6",
    explicacao: "Cliente que já comprou peça da gente mas não faz pedido há 6+ meses. Hora de oferecer reposição ou kit de manutenção.",
  },
  {
    regra: "R3_upsell",
    titulo: "Up-sell potencial",
    emoji: "📈",
    cor: "#10b981",
    explicacao: "Cliente com trator nosso parado há 12+ meses sem qualquer pedido. Cliente frio — bom momento para oferecer implemento ou trator novo.",
  },
  {
    regra: "R4_followup",
    titulo: "Follow-up feedback",
    emoji: "📞",
    cor: "#3b82f6",
    explicacao: "Clientes que recebemos feedback há ~30 dias. Hora de retornar e ver como tá.",
  },
];

interface Props {
  oportunidades: Oportunidade[];
  onAtender: (op: Oportunidade) => void;
  onDispensar: (op: Oportunidade) => void;
}

export default function KanbanOportunidades({ oportunidades, onAtender, onDispensar }: Props) {
  const porRegra = useMemo(() => {
    const m: Record<RegraOportunidade, Oportunidade[]> = {
      R1_revisao: [], R2_sem_os: [], R3_upsell: [], R4_followup: [], R5_pecas: [],
    };
    for (const op of oportunidades) {
      if (m[op.regra]) m[op.regra].push(op);
    }
    return m;
  }, [oportunidades]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 16,
        marginTop: 16,
        fontFamily: "Inter, sans-serif",
      }}
    >
      {COLUNAS.map((c) => {
        const cards = porRegra[c.regra] || [];
        const urgentes = cards.filter((o) => o.prioridade === "Urgente").length;

        return (
          <section
            key={c.regra}
            style={{
              background: "var(--portal-bg-secondary)",
              borderRadius: 12,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minHeight: 200,
            }}
          >
            <header
              style={{
                padding: "6px 8px",
                borderBottom: `2px solid ${c.cor}`,
                paddingBottom: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>{c.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--portal-text)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {c.titulo}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--portal-text-secondary)", marginTop: 2 }}>
                    {cards.length} oportunidades{urgentes > 0 && ` · ${urgentes} urgente${urgentes > 1 ? "s" : ""}`}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "var(--portal-text-secondary)", lineHeight: 1.4, fontStyle: "italic" }}>
                {c.explicacao}
              </div>
            </header>

            {cards.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--portal-text-muted)", fontSize: 12, fontStyle: "italic" }}>
                Nenhuma oportunidade aqui ✨
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {cards.map((op) => (
                  <OportunidadeCard
                    key={op.id}
                    op={op}
                    onAtender={onAtender}
                    onDispensar={onDispensar}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
