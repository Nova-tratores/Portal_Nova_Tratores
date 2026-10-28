"use client";
// Resumo da MÁQUINA dentro da janela do cliente na tela Hoje (José, 26/10/2026: "quando eu abrir o modal
// eu quero ver separado por trator o que exatamente tá faltando nele, e ter serviços ou feedbacks
// passados para facilitar a negociação"). Por trator: o que falta (revisão atrasada, as que pulou, a
// próxima), o que já foi feito, e "para negociar" (últimos serviços, quanto gastou, o que disse no
// pós-serviço). Os detalhes completos continuam na janela da máquina ("Ver a máquina").
import { useMemo, useState } from "react";
import { revisoesDaMaquina, servicosDaMaquina, type MaquinaRef } from "@/lib/feedbacks/maquina-modal";
import { fmtDataBR } from "@/lib/feedbacks/previsao-revisao";
import { useDadosMaquina } from "../ModalMaquina";

const fmtMoeda = (v: number | null | undefined) => (v == null ? "" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const h = (n: number) => `${n.toLocaleString("pt-BR")} h`;
const DIA = 86_400_000;

export default function ResumoMaquina({ alvo, exemplo }: { alvo: MaquinaRef; exemplo: boolean }) {
  const { dados, erro, carregando } = useDadosMaquina(alvo, exemplo);
  const [agora] = useState(() => Date.now());
  const p = (dados?.revisao ?? alvo.trator)?.previsao ?? null;
  const eventos = useMemo(() => dados?.historico.eventos ?? [], [dados]);
  const revisoes = useMemo(() => revisoesDaMaquina(eventos, p), [eventos, p]);
  const servicos = useMemo(() => servicosDaMaquina(eventos, 3), [eventos]);
  const todasOS = useMemo(() => eventos.filter((e) => e.tipo === "os"), [eventos]);
  const gasto = todasOS.reduce((t, e) => t + (e.valor || 0), 0);

  const alvoRev = revisoes.find((r) => r.estado === "atrasada" || r.estado === "proxima");
  const faltou = revisoes.filter((r) => r.estado === "faltou").sort((a, b) => a.rev - b.rev);
  const feitas = revisoes.filter((r) => r.estado === "feita").sort((a, b) => b.rev - a.rev);
  const ultimaFeita = feitas[0];
  const atrasoDias = alvoRev?.estado === "atrasada" && alvoRev.data ? Math.max(0, Math.round((agora - Date.parse(`${alvoRev.data}T12:00:00`)) / DIA)) : null;
  const feedbacks = servicos.flatMap((s) => s.posServico.map((a) => ({ a, os: s.os }))).filter((x) => x.a.detalhe);

  if (carregando && !dados) return <div className="fbh-rm-vazio"><i className="fa-solid fa-circle-notch fa-spin" /> Lendo revisões e serviços desta máquina…</div>;

  return (
    <div className="fbh-rm">
      <div className="fbh-rm-bloco">
        <div className="fbh-rm-t"><i className="fa-solid fa-triangle-exclamation" style={{ color: "#dc2626" }} /> O que falta nesta máquina</div>
        {!p && !revisoes.length ? <div className="fbh-rm-vazio">Fora do controle de revisões Mahindra (sem previsão).</div> : (
          <ul className="fbh-rm-lista">
            {alvoRev && (
              <li className={alvoRev.estado === "atrasada" ? "ruim" : "aviso"}>
                <b>{alvoRev.estado === "atrasada" ? `Revisão ${h(alvoRev.rev)} atrasada` : `Próxima: revisão ${h(alvoRev.rev)}`}</b>
                <span>{alvoRev.estado === "atrasada" ? (atrasoDias != null ? `passou há ${atrasoDias} dia(s)` : "já passou") : alvoRev.data ? `por volta de ${fmtDataBR(alvoRev.data)}` : ""}{p ? ` · horímetro hoje ~${h(Math.round(p.horimetroHoje))}` : ""}</span>
              </li>
            )}
            {faltou.length > 0 && (
              <li className="aviso">
                <b>Não fez na loja: {faltou.map((r) => h(r.rev)).join(", ")}</b>
                <span>pode ter feito em outro lugar — vale perguntar</span>
              </li>
            )}
            {ultimaFeita
              ? <li className="ok"><b>Última feita aqui: {h(ultimaFeita.rev)}</b><span>{[ultimaFeita.data ? fmtDataBR(ultimaFeita.data) : "", ultimaFeita.origem].filter(Boolean).join(" · ")}</span></li>
              : <li className="aviso"><b>Nenhuma revisão registrada na loja</b><span>{p?.entrega ? `entregue em ${fmtDataBR(p.entrega)}` : ""}</span></li>}
          </ul>
        )}
      </div>

      <div className="fbh-rm-bloco">
        <div className="fbh-rm-t"><i className="fa-solid fa-handshake" style={{ color: "#2563eb" }} /> Para negociar
          {todasOS.length > 0 && <span className="fbh-rm-gasto">{todasOS.length} serviço(s) nesta máquina · {fmtMoeda(gasto)}</span>}
        </div>
        {erro && !dados ? <div className="fbh-rm-vazio">{erro}</div>
          : servicos.length === 0 ? <div className="fbh-rm-vazio">Nenhum serviço desta máquina na loja ainda.</div>
          : (
            <div className="fbh-rm-servs">
              {servicos.map(({ os, pecas }) => (
                <div key={os.id} className="fbh-rm-serv">
                  <div className="l1"><b>{os.titulo}</b><span>{fmtDataBR(os.data)}</span><span className="v">{fmtMoeda((os.valor || 0) + pecas.reduce((t, x) => t + (x.valor || 0), 0))}</span></div>
                  {os.detalhe && <div className="l2" title={os.detalhe}>{os.detalhe}</div>}
                  {(os.quem || pecas.length > 0) && <div className="l3">{[os.quem ? `técnico ${os.quem}` : "", pecas.length ? `com peças (${pecas.length} pedido)` : ""].filter(Boolean).join(" · ")}</div>}
                </div>
              ))}
            </div>
          )}
        {feedbacks.length > 0 ? feedbacks.slice(0, 2).map(({ a, os }) => (
          <div key={a.id} className="fbh-rm-fb"><i className="fa-solid fa-comment" /> <span><b>O cliente disse</b> ({os.titulo}, {fmtDataBR(a.data)}): “{a.detalhe}”</span></div>
        )) : servicos.length > 0 && <div className="fbh-rm-fb nada"><i className="fa-regular fa-comment" /> Sem feedback dos últimos serviços — pergunte como ficou.</div>}
      </div>
    </div>
  );
}

export const ESTILO_RM = `
.fbh-rm { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 10px }
.fbh-rm-bloco { display: grid; gap: 8px; align-content: start; padding: 10px 12px; border-radius: 14px; background: var(--soft); border: 1px solid var(--b); min-width: 0 }
.fbh-rm-t { font-size: 13.5px; font-weight: 500; color: var(--t); display: flex; gap: 8px; align-items: center; flex-wrap: wrap }
.fbh-rm-gasto { margin-left: auto; font-size: 12px; font-weight: 400; color: var(--t2) }
.fbh-rm-vazio { font-size: 13px; color: var(--t2) }
.fbh-rm-lista { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px }
.fbh-rm-lista li { display: grid; gap: 1px; padding: 6px 10px; border-radius: 10px; border: 1px solid var(--b); background: var(--s); font-size: 13px }
.fbh-rm-lista li b { font-weight: 500 } .fbh-rm-lista li span { font-size: 12.5px; color: var(--t2) }
.fbh-rm-lista li.ruim { border-color: color-mix(in srgb, #dc2626 35%, var(--b)) } .fbh-rm-lista li.ruim b { color: #b91c1c }
.fbh-rm-lista li.aviso b { color: #b45309 } .fbh-rm-lista li.ok b { color: #15803d }
.fbh-rm-servs { display: grid; gap: 6px }
.fbh-rm-serv { padding: 6px 10px; border-radius: 10px; background: var(--s); border: 1px solid var(--b); display: grid; gap: 2px; font-size: 13px; min-width: 0 }
.fbh-rm-serv .l1 { display: flex; gap: 8px; align-items: baseline } .fbh-rm-serv .l1 b { font-weight: 500 } .fbh-rm-serv .l1 span { color: var(--t2); font-size: 12.5px }
.fbh-rm-serv .l1 .v { margin-left: auto; color: var(--t); font-variant-numeric: tabular-nums }
.fbh-rm-serv .l2 { color: var(--t2); font-size: 12.5px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden }
.fbh-rm-serv .l3 { color: var(--t3, #94a3b8); font-size: 12px }
.fbh-rm-fb { display: flex; gap: 8px; align-items: baseline; font-size: 13px; color: var(--t2); padding: 6px 10px; border-radius: 10px; background: color-mix(in srgb, #2563eb 6%, var(--s)) }
.fbh-rm-fb > i { color: #2563eb } .fbh-rm-fb b { font-weight: 500; color: var(--t) } .fbh-rm-fb.nada { background: var(--s); border: 1px dashed var(--b) }
`;
