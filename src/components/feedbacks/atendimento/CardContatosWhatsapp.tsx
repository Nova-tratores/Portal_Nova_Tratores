"use client";
// Card "Contatos do WhatsApp" do cockpit de atendimento: quem é quem dentro
// do cliente segundo o NovaZap (cargo, telefone, fazendas) + resumo da última
// conversa. Só leitura; sem alert()/prompt().
import styles from "../feedbacks.module.css";
import type { ContatoWhatsapp, SecaoWhatsapp } from "@/lib/chatwoot/parsers";

const COR_WA = "#25d366";

interface Props {
  secao?: SecaoWhatsapp | null;
  carregando: boolean;
  onRecarregar: () => void;
}

const COR_CARGO: Record<string, { bg: string; fg: string }> = {
  proprietario: { bg: "#fef3c7", fg: "#92400e" },
  gerente: { bg: "#dbeafe", fg: "#1e40af" },
  financeiro: { bg: "#e0e7ff", fg: "#4338ca" },
  tratorista: { bg: "#d1fae5", fg: "#065f46" },
  funcionario: { bg: "#f1f5f9", fg: "#334155" },
};
const COR_STATUS: Record<string, { bg: string; fg: string }> = {
  open: { bg: "#d1fae5", fg: "#065f46" },
  pending: { bg: "#fef3c7", fg: "#92400e" },
  resolved: { bg: "#f1f5f9", fg: "#334155" },
  snoozed: { bg: "#e0e7ff", fg: "#4338ca" },
};

function chaveCargo(c: string | null): string {
  return (c || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function relativo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  const hora = d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  if (dias <= 0) return `hoje ${hora.slice(-5)}`;
  if (dias === 1) return `ontem ${hora.slice(-5)}`;
  return `${hora} (${dias} d)`;
}

export default function CardContatosWhatsapp({ secao, carregando, onRecarregar }: Props) {
  const total = secao?.estado === "ok" ? secao.total : 0;
  return (
    <section className={styles.card} style={{ ["--fb-accent" as string]: COR_WA }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
          📱 Contatos do WhatsApp
          {total > 0 && <span className={styles.pill} style={{ background: "#d1fae5", color: "#065f46" }}>{total}</span>}
        </h3>
        {secao?.estado === "ok" && (
          <span style={{ fontSize: 10, opacity: 0.6 }} title="Lido do NovaZap">
            NovaZap · {relativo(secao.consultado_em)}
          </span>
        )}
      </header>

      {carregando && <Esqueleto />}

      {!carregando && (!secao || secao.estado === "nao_configurado") && (
        <p style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>Integração com o NovaZap não configurada neste ambiente.</p>
      )}

      {!carregando && secao?.estado === "indisponivel" && (
        <div style={{ background: "#fef3c7", color: "#92400e", borderRadius: 10, padding: "8px 12px", fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span>NovaZap indisponível agora: {secao.motivo}</span>
          <button type="button" onClick={onRecarregar} style={btnPequeno("#92400e")}>Tentar novamente</button>
        </div>
      )}

      {!carregando && secao?.estado === "sem_contatos" && (
        <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>
          Nenhum contato vinculado no NovaZap
          {secao.codigos_consultados.length > 0 && <> (código{secao.codigos_consultados.length > 1 ? "s" : ""} {secao.codigos_consultados.join(", ")})</>}.
          Vincule o contato pelo seletor de cliente na conversa do NovaZap.
        </p>
      )}

      {!carregando && secao?.estado === "ok" && (
        <>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {secao.contatos.map((c) => (
              <ItemContato key={c.id} c={c} />
            ))}
          </ul>
          {secao.truncado && (
            <p style={{ margin: "8px 0 0", fontSize: 11, opacity: 0.6 }}>
              mostrando {secao.contatos.length} de {secao.total} — os demais estão no NovaZap
            </p>
          )}
        </>
      )}
    </section>
  );
}

function ItemContato({ c }: { c: ContatoWhatsapp }) {
  const cargo = COR_CARGO[chaveCargo(c.cargo)];
  const destaque = chaveCargo(c.cargo) === "proprietario";
  const conv = c.ultima_conversa;
  const st = conv ? COR_STATUS[conv.status] ?? COR_STATUS.resolved : null;
  return (
    <li style={{ display: "grid", gridTemplateColumns: "36px 1fr", gap: 10, padding: 10, borderRadius: 12, border: `1px solid ${destaque ? "#fcd34d" : "var(--portal-border)"}`, background: destaque ? "#fffbeb" : "transparent" }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#334155" }}>
        {c.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          c.nome.charAt(0).toUpperCase()
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 13 }}>{c.nome}</strong>
          {c.cargo && (
            <span className={styles.pill} style={{ background: cargo?.bg ?? "#f1f5f9", color: cargo?.fg ?? "#334155" }}>
              {destaque ? "👑 " : ""}{c.cargo}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap", fontSize: 12 }}>
          {c.telefone ? (
            <>
              <a href={`tel:+${c.telefone_wa ?? c.telefone.replace(/\D/g, "")}`} style={{ color: "inherit", textDecoration: "none", fontVariantNumeric: "tabular-nums" }}>
                {c.telefone}
              </a>
              {c.telefone_wa && (
                <a href={`https://wa.me/${c.telefone_wa}`} target="_blank" rel="noopener noreferrer" style={btnPequeno(COR_WA, true)} title="Abrir conversa no WhatsApp">
                  WhatsApp
                </a>
              )}
            </>
          ) : (
            <span style={{ opacity: 0.6 }}>sem telefone</span>
          )}
        </div>

        {c.localizacoes.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {c.localizacoes.map((l, i) =>
              l.link ? (
                <a key={i} href={/^https?:\/\//i.test(l.link) ? l.link : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.link)}`} target="_blank" rel="noopener noreferrer" className={styles.pill} style={{ background: "#ecfdf5", color: "#065f46", textDecoration: "none" }} title={l.link}>
                  📍 {l.nome}
                </a>
              ) : (
                <span key={i} className={styles.pill} style={{ background: "#f1f5f9", color: "#334155" }}>📍 {l.nome}</span>
              )
            )}
          </div>
        )}

        <div style={{ marginTop: 6, fontSize: 11, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {conv && st ? (
            <>
              <span className={styles.pill} style={{ background: st.bg, color: st.fg }}>{conv.status_label}</span>
              {conv.nao_lidas > 0 && <span className={styles.pill} style={{ background: "#fee2e2", color: "#991b1b" }}>{conv.nao_lidas} não lida{conv.nao_lidas > 1 ? "s" : ""}</span>}
              <span style={{ opacity: 0.75 }}>
                {conv.atendente ? `${conv.atendente} · ` : ""}{relativo(conv.ultima_atividade)}{conv.inbox ? ` · ${conv.inbox}` : ""}
              </span>
              <a href={conv.url} target="_blank" rel="noopener noreferrer" style={{ color: "#0369a1", fontWeight: 700, textDecoration: "none" }}>
                Abrir no NovaZap ↗
              </a>
            </>
          ) : (
            <span style={{ opacity: 0.55 }}>sem conversa registrada</span>
          )}
        </div>
      </div>
    </li>
  );
}

function Esqueleto() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {[0, 1].map((i) => (
        <div key={i} style={{ height: 64, borderRadius: 12, background: "linear-gradient(90deg, #f1f5f9, #e2e8f0, #f1f5f9)", opacity: 0.7 }} />
      ))}
    </div>
  );
}

function btnPequeno(cor: string, preenchido = false): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 10px",
    borderRadius: 999,
    border: `1px solid ${cor}`,
    background: preenchido ? cor : "transparent",
    color: preenchido ? "#fff" : cor,
    textDecoration: "none",
    cursor: "pointer",
  };
}
