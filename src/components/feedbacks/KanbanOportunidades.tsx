"use client";
import { useMemo, useState } from "react";
import OportunidadeCard from "./OportunidadeCard";
import type { Oportunidade, RegraOportunidade } from "@/lib/feedbacks/types";
import styles from "./feedbacks.module.css";

// Quantos cards mostrar por coluna inicialmente, e o passo de "Ver mais".
const PAGE_SIZE = 10;

// Escala de urgência primeiro (Urgente > Normal > Baixa) e, dentro do mesmo
// grupo, ordem alfabética pelo nome do cliente.
function ordenarCards(cards: Oportunidade[]): Oportunidade[] {
  const peso = { Urgente: 0, Normal: 1, Baixa: 2 } as const;
  return [...cards].sort((a, b) => {
    const pa = peso[a.prioridade] ?? 9;
    const pb = peso[b.prioridade] ?? 9;
    if (pa !== pb) return pa - pb;
    return (a.cliente_nome || "").localeCompare(b.cliente_nome || "", "pt-BR", { sensitivity: "base" });
  });
}

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
    regra: "R6_fora_garantia",
    titulo: "Fora de garantia",
    emoji: "🛡️",
    cor: "#0ea5e9",
    explicacao: "Equipamentos que saíram da garantia (por tempo ou horas, conforme a marca). Bom momento pra oferecer revisão paga, garantia estendida ou contrato de manutenção.",
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
  onVerHistorico?: (op: Oportunidade) => void;
}

export default function KanbanOportunidades({ oportunidades, onAtender, onDispensar, onVerHistorico }: Props) {
  const porRegra = useMemo(() => {
    const m: Record<RegraOportunidade, Oportunidade[]> = {
      R1_revisao: [], R2_sem_os: [], R3_upsell: [], R4_followup: [], R5_pecas: [], R6_fora_garantia: [],
    };
    for (const op of oportunidades) {
      if (m[op.regra]) m[op.regra].push(op);
    }
    // Ordena cada coluna: Urgente primeiro
    for (const k of Object.keys(m) as RegraOportunidade[]) {
      m[k] = ordenarCards(m[k]);
    }
    return m;
  }, [oportunidades]);

  // Quantos cards mostrar por coluna (cresce ao clicar "Ver mais")
  const [mostrar, setMostrar] = useState<Record<RegraOportunidade, number>>({
    R1_revisao: PAGE_SIZE,
    R2_sem_os: PAGE_SIZE,
    R3_upsell: PAGE_SIZE,
    R4_followup: PAGE_SIZE,
    R5_pecas: PAGE_SIZE,
    R6_fora_garantia: PAGE_SIZE,
  });

  function verMais(regra: RegraOportunidade) {
    setMostrar((m) => ({ ...m, [regra]: m[regra] + PAGE_SIZE }));
  }
  function verTodas(regra: RegraOportunidade, total: number) {
    setMostrar((m) => ({ ...m, [regra]: total }));
  }
  function reduzirColuna(regra: RegraOportunidade) {
    setMostrar((m) => ({ ...m, [regra]: PAGE_SIZE }));
  }

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
            <header className={styles.kcolHead} style={{ ["--fb-accent" as string]: c.cor }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>{c.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--portal-text)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {c.titulo}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                    <span className={styles.pill} style={{ background: `${c.cor}1a`, color: c.cor }}>{cards.length} oport.</span>
                    {urgentes > 0 && <span className={styles.pill} style={{ background: "#fee2e2", color: "#991b1b" }}>{urgentes} urgente{urgentes > 1 ? "s" : ""}</span>}
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
            ) : (() => {
              const limite = mostrar[c.regra];
              const visiveis = cards.slice(0, limite);
              const restantes = cards.length - visiveis.length;
              return (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {visiveis.map((op) => (
                      <OportunidadeCard
                        key={op.id}
                        op={op}
                        onAtender={onAtender}
                        onDispensar={onDispensar}
                        onVerHistorico={onVerHistorico}
                      />
                    ))}
                  </div>
                  {(restantes > 0 || visiveis.length > PAGE_SIZE) && (
                    <div style={paginacaoStyle}>
                      {restantes > 0 && (
                        <>
                          <button onClick={() => verMais(c.regra)} style={btnPag(c.cor)}>
                            Ver mais {Math.min(PAGE_SIZE, restantes)}
                          </button>
                          {restantes > PAGE_SIZE && (
                            <button onClick={() => verTodas(c.regra, cards.length)} style={btnPagSec}>
                              Ver todas ({cards.length})
                            </button>
                          )}
                        </>
                      )}
                      {restantes === 0 && visiveis.length > PAGE_SIZE && (
                        <button onClick={() => reduzirColuna(c.regra)} style={btnPagSec}>
                          Reduzir
                        </button>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </section>
        );
      })}
    </div>
  );
}

const paginacaoStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  marginTop: 4,
};

function btnPag(cor: string): React.CSSProperties {
  return {
    flex: 1,
    padding: "8px 10px",
    background: cor,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "Inter, sans-serif",
  };
}

const btnPagSec: React.CSSProperties = {
  padding: "8px 12px",
  background: "#fff",
  color: "var(--portal-text-secondary)",
  border: "1px solid var(--portal-border)",
  borderRadius: 8,
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "Inter, sans-serif",
};
