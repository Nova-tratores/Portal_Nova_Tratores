"use client";
// Bloco "Último serviço" da ficha do RFM (José, 23/10/2026): tudo da última OS do cliente e se ele
// gostou — ou o aviso de que esse serviço ficou sem feedback. Lê o espelho Omie e o CRM do cliente.
import { useEffect, useState } from "react";
import { buscarHistoricoCliente, listarCrmDoCliente } from "@/lib/feedbacks/api";
import { feedbackDoServico, montarUltimoServico, type FeedbackDoServico, type UltimoServico as Ultimo } from "@/lib/feedbacks/ultimo-servico";
import type { FeedbackRegistro } from "@/lib/feedbacks/types";
import { exemploUltimoServico } from "./exemplos";
import { fmtData, fmtValor } from "./FichaCliente";

type Estado = { carregando: true } | { carregando: false; u: Ultimo | null; fb: FeedbackDoServico };
const COR_STATUS: Record<string, string> = { Satisfeito: "#16a34a", Neutro: "#d97706", Insatisfeito: "#dc2626" };
const qtdBR = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export default function UltimoServico({ r, onHistorico }: { r: FeedbackRegistro; onHistorico?: () => void }) {
  const [est, setEst] = useState<Estado>({ carregando: true });

  useEffect(() => {
    let vivo = true;
    Promise.resolve().then(async () => {
      if (!vivo) return;
      setEst({ carregando: true });
      if (r.id < 0) { const ex = exemploUltimoServico(r); if (vivo) setEst({ carregando: false, ...ex }); return; }
      const [h, crms] = await Promise.all([
        buscarHistoricoCliente(r.codigo_omie, r.nome).catch(() => ({ os: [], pv: [], requisicoes: [] })),
        listarCrmDoCliente(r.codigo_omie, r.nome).catch(() => [] as FeedbackRegistro[]),
      ]);
      const u = montarUltimoServico(h.os);
      if (vivo) setEst({ carregando: false, u, fb: feedbackDoServico(u, crms) });
    });
    return () => { vivo = false; };
  }, [r]);

  if (est.carregando) return <div className="fbf-us"><p className="fbf-sub">Último serviço</p><div className="fbf-us-vazio"><i className="fa-solid fa-circle-notch fa-spin" /> Buscando a última OS…</div></div>;
  const { u, fb } = est;
  if (!u) return <div className="fbf-us"><p className="fbf-sub">Último serviço</p><div className="fbf-us-vazio">Nenhuma OS deste cliente no Omie.</div></div>;

  const maquina = [u.modelo, u.chassi ? `chassi ${u.chassi}` : null, u.horimetro ? `${u.horimetro} h` : null].filter(Boolean).join(" · ");
  return (
    <div className="fbf-us">
      <p className="fbf-sub" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        Último serviço
        {onHistorico && u.totalOS > 1 && <button type="button" className="fbf-us-link" onClick={onHistorico}>ver os {u.totalOS} serviços</button>}
      </p>

      <Feedback fb={fb} />

      <div className="fbf-us-cab">
        <span><b>OS {u.numOs || "—"}</b>{u.empresa ? ` · ${u.empresa}` : ""}</span>
        <span className="fbf-us-valor">{fmtValor(u.valor)}</span>
      </div>
      <div className="fbf-us-linha">
        <span><i className="fa-regular fa-calendar" /> {u.faturada ? "Faturada em" : "Aberta em"} {fmtData(u.data)}</span>
        {u.situacao && <span className="fbn-pilula" style={{ ["--k" as string]: u.faturada ? "#16a34a" : "#d97706" }}>{u.situacao}</span>}
        {u.numNf && (u.linkNf ? <a href={u.linkNf} target="_blank" rel="noreferrer" className="fbf-us-link">NF {u.numNf}</a> : <span>NF {u.numNf}</span>)}
      </div>

      <div className="fbn-dados">
        {maquina && <div><small>Máquina</small><span>{maquina}</span></div>}
        {u.tecnico && <div><small>Técnico</small><span>{u.tecnico}</span></div>}
      </div>
      {u.solicitacao && <div className="fbf-us-bloco"><small>O que o cliente pediu</small><p>{u.solicitacao}</p></div>}
      {u.realizado && <div className="fbf-us-bloco"><small>O que foi feito</small><p>{u.realizado}</p></div>}

      {u.itens.length > 0 && (
        <div className="fbf-us-itens">
          {u.itens.map((it, i) => (
            <div key={i}>
              <i className={`fa-solid ${it.tipo === "hora" ? "fa-clock" : it.tipo === "km" ? "fa-route" : "fa-wrench"}`} />
              <span className="d">{it.desc}{it.qtd !== 1 || it.tipo !== "outro" ? <em> · {qtdBR(it.qtd)} {it.tipo === "hora" ? "h" : it.tipo === "km" ? "km" : "×"} de {fmtValor(it.valor)}</em> : null}</span>
              <span className="v">{fmtValor(it.total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Feedback({ fb }: { fb: FeedbackDoServico }) {
  if (fb.tipo === "respondeu") {
    const r = fb.registro;
    const cor = (r.status_cliente && COR_STATUS[r.status_cliente]) || (r.nota != null ? (r.nota >= 9 ? "#16a34a" : r.nota >= 7 ? "#d97706" : "#dc2626") : "#2563eb");
    const ico = cor === "#16a34a" ? "fa-face-smile" : cor === "#dc2626" ? "fa-face-frown" : "fa-face-meh";
    const det = [r.nota != null ? `nota ${r.nota}` : null, r.nps ? `indicaria: ${r.nps.toLowerCase()}` : null, r.melhoria ? `melhorar: ${r.melhoria.toLowerCase()}` : null].filter(Boolean).join(" · ");
    return (
      <div className="fbf-us-fb" style={{ ["--k" as string]: cor }}>
        <i className={`fa-solid ${ico}`} />
        <div>
          <b>{r.status_cliente && r.status_cliente !== "Aguardando" ? `Cliente ${r.status_cliente.toLowerCase()} com este serviço` : "Cliente respondeu sobre este serviço"}</b>
          {det && <div>{det}</div>}
          {r.feedback && <div className="q">“{r.feedback}”</div>}
          <div className="m">{r.atendente_nome ? `${r.atendente_nome} · ` : ""}{r.data_contato ? `em ${fmtData(r.data_contato)}` : r.concluido_em ? `em ${fmtData(r.concluido_em)}` : ""}</div>
        </div>
      </div>
    );
  }
  const txt = fb.tipo === "sem_resposta" ? { t: "Sem feedback deste serviço", p: `Tentaram ${fb.registro.tentativas?.length || 0} vez(es) e o cliente não atendeu.` }
    : fb.tipo === "aberto" ? { t: "Sem feedback deste serviço ainda", p: "A ligação de pesquisa está na fila do CRM e não foi feita." }
    : fb.tipo === "arquivado" ? { t: "Sem feedback deste serviço", p: `A pesquisa foi arquivada${fb.registro.arquivado_motivo ? `: ${fb.registro.arquivado_motivo}` : "."}` }
    : { t: "Sem feedback deste serviço", p: "Ninguém perguntou ao cliente o que ele achou. Vale perguntar nesta ligação." };
  return (
    <div className="fbf-us-fb" style={{ ["--k" as string]: "#d97706" }}>
      <i className="fa-solid fa-circle-question" />
      <div><b>{txt.t}</b><div>{txt.p}</div></div>
    </div>
  );
}

export const ESTILO_US = `
.fbf-us { display: grid; gap: 8px }
.fbf-us-vazio { font-size: 13.5px; color: var(--t2) }
.fbf-us-link { border: 0; background: none; padding: 0; color: var(--c); font: inherit; font-size: 13px; cursor: pointer; text-decoration: underline }
.fbf-us-fb { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 14px; font-size: 13.5px; line-height: 1.45;
  background: color-mix(in srgb, var(--k) 8%, var(--s)); border: 1px solid color-mix(in srgb, var(--k) 22%, transparent) }
.fbf-us-fb > i { color: var(--k); font-size: 20px; margin-top: 1px; flex: none }
.fbf-us-fb b { font-weight: 500 } .fbf-us-fb .q { margin-top: 4px; color: var(--t) } .fbf-us-fb .m { margin-top: 3px; font-size: 12.5px; color: var(--t2) }
.fbf-us-cab { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; font-size: 14.5px } .fbf-us-cab b { font-weight: 500 }
.fbf-us-valor { font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap }
.fbf-us-linha { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 13px; color: var(--t2) }
.fbf-us-bloco small { display: block; font-size: 12px; color: var(--t2) } .fbf-us-bloco p { margin: 2px 0 0; font-size: 13.5px; line-height: 1.45; overflow-wrap: anywhere }
.fbf-us-itens { display: grid; gap: 4px; border: 1px solid var(--b); border-radius: 12px; padding: 8px 10px }
.fbf-us-itens > div { display: flex; gap: 8px; align-items: baseline; font-size: 13px }
.fbf-us-itens i { color: var(--t2); width: 14px; flex: none } .fbf-us-itens .d { flex: 1; min-width: 0; overflow-wrap: anywhere } .fbf-us-itens em { font-style: normal; color: var(--t2) }
.fbf-us-itens .v { font-variant-numeric: tabular-nums; white-space: nowrap }
`;
