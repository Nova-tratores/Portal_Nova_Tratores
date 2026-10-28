"use client";
// Resumo da MÁQUINA dentro da janela do cliente na tela Hoje (José, 26/10/2026: "quando eu abrir o modal
// eu quero ver separado por trator o que exatamente tá faltando nele, e ter serviços ou feedbacks
// passados para facilitar a negociação"). Por trator: o que falta (revisão atrasada, as que pulou, a
// próxima), o que já foi feito, e "para negociar" (últimos serviços, quanto gastou, o que disse no
// pós-serviço). Os detalhes completos continuam na janela da máquina ("Ver a máquina").
import { useEffect, useMemo, useState } from "react";
import { revisoesDaMaquina, servicosDaMaquina, type LinhaRevisao, type MaquinaRef } from "@/lib/feedbacks/maquina-modal";
import { fmtDataBR } from "@/lib/feedbacks/previsao-revisao";
import { useDadosMaquina } from "../ModalMaquina";

const fmtMoeda = (v: number | null | undefined) => (v == null ? "" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const h = (n: number) => `${n.toLocaleString("pt-BR")} h`;
const DIA = 86_400_000;

export default function ResumoMaquina({ alvo, exemplo }: { alvo: MaquinaRef; exemplo: boolean }) {
  const { dados, erro, carregando } = useDadosMaquina(alvo, exemplo);
  const [agora] = useState(() => Date.now());
  // José, 28/10/2026: "deixa o histórico oculto, não precisa mostrar todo o passado de uma vez" —
  // fica à vista só a revisão da vez e o total; o resto abre no "Ver …".
  const [verRev, setVerRev] = useState(false);
  const [verServ, setVerServ] = useState(false);
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
            {(faltou.length > 0 || ultimaFeita || !alvoRev) && (
              <li className="fbh-rm-mais-li"><button type="button" className="fbh-rm-mais" onClick={() => setVerRev((v) => !v)} aria-expanded={verRev}>
                <i className={`fa-solid fa-chevron-${verRev ? "up" : "down"}`} /> {verRev ? "Esconder o histórico" : "Ver o histórico de revisões"}
              </button></li>
            )}
            {verRev && faltou.length > 0 && (
              <li className="aviso">
                <b>Não fez na loja: {faltou.map((r) => h(r.rev)).join(", ")}</b>
                <span>pode ter feito em outro lugar — vale perguntar</span>
              </li>
            )}
            {verRev && (ultimaFeita
              ? <li className="ok"><b>Última feita aqui: {h(ultimaFeita.rev)}</b><span>{[ultimaFeita.data ? fmtDataBR(ultimaFeita.data) : "", ultimaFeita.origem].filter(Boolean).join(" · ")}</span></li>
              : <li className="aviso"><b>Nenhuma revisão registrada na loja</b><span>{p?.entrega ? `entregue em ${fmtDataBR(p.entrega)}` : ""}</span></li>)}
          </ul>
        )}
      </div>

      <div className="fbh-rm-bloco">
        <div className="fbh-rm-t"><i className="fa-solid fa-handshake" style={{ color: "#2563eb" }} /> Para negociar</div>
        {/* José, 26/10/2026: "melhora o visual dos serviços pra ficar mais dinâmico" — total que sobe
            contando, régua das revisões e os serviços numa linha do tempo que abre no clique */}
        {todasOS.length > 0 && (
          <div className="fbh-rm-total">
            <span><b><ContaMoeda valor={gasto} /></b><small>em {todasOS.length} serviço{todasOS.length === 1 ? "" : "s"} nesta máquina</small></span>
            {todasOS.length > 0 && todasOS[0].ts > 0 && <span className="ult">último {haQuanto(Math.max(...todasOS.map((o) => o.ts)), agora)}</span>}
          </div>
        )}
        {feedbacks.length > 0 && feedbacks.slice(0, 1).map(({ a, os }) => (
          <div key={a.id} className="fbh-rm-fb"><i className="fa-solid fa-comment" /> <span><b>O cliente disse</b> ({os.titulo}, {fmtDataBR(a.data)}): “{a.detalhe}”</span></div>
        ))}
        {erro && !dados ? <div className="fbh-rm-vazio">{erro}</div>
          : servicos.length === 0 ? <div className="fbh-rm-vazio">Nenhum serviço desta máquina na loja ainda.</div>
          : (
            <button type="button" className="fbh-rm-mais" onClick={() => setVerServ((v) => !v)} aria-expanded={verServ}>
              <i className={`fa-solid fa-chevron-${verServ ? "up" : "down"}`} /> {verServ ? "Esconder os serviços" : `Ver os serviços (${servicos.length})`}
            </button>
          )}
        {verServ && revisoes.length > 0 && <ReguaRevisoes revisoes={revisoes} />}
        {verServ && servicos.length > 0 && <LinhaServicos servicos={servicos} agora={agora} />}
        {verServ && feedbacks.length > 1 && feedbacks.slice(1, 3).map(({ a, os }) => (
          <div key={a.id} className="fbh-rm-fb"><i className="fa-solid fa-comment" /> <span><b>O cliente disse</b> ({os.titulo}, {fmtDataBR(a.data)}): “{a.detalhe}”</span></div>
        ))}
        {verServ && feedbacks.length === 0 && servicos.length > 0 && <div className="fbh-rm-fb nada"><i className="fa-regular fa-comment" /> Sem feedback dos últimos serviços — pergunte como ficou.</div>}
      </div>
    </div>
  );
}

/** "há 3 meses", "há 12 dias", "hoje". */
function haQuanto(ts: number, agora: number): string {
  const d = Math.max(0, Math.round((agora - ts) / DIA));
  if (d === 0) return "hoje";
  if (d < 45) return `há ${d} dia${d === 1 ? "" : "s"}`;
  const m = Math.round(d / 30);
  return m < 18 ? `há ${m} meses` : `há ${Math.round(d / 365)} anos`;
}

/** R$ que sobe contando (mesmo ritmo do Contador da fila). */
function ContaMoeda({ valor }: { valor: number }) {
  const [v, setV] = useState(() => (typeof window === "undefined" ? valor : 0));
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { const id = requestAnimationFrame(() => setV(valor)); return () => cancelAnimationFrame(id); }
    let raf = 0; const t0 = performance.now();
    const passo = (t: number) => { const p = Math.min(1, (t - t0) / 800); setV(valor * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(passo); };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [valor]);
  return <>{fmtMoeda(Math.round(v))}</>;
}

const COR_REV: Record<LinhaRevisao["estado"], string> = { feita: "#16a34a", faltou: "#d97706", proxima: "#2563eb", atrasada: "#dc2626" };
const ROT_REV: Record<LinhaRevisao["estado"], string> = { feita: "feita", faltou: "não fez aqui", proxima: "próxima", atrasada: "atrasada" };

/** Régua das revisões: 50 · 300 · 600 … cada uma com a cor do estado. */
function ReguaRevisoes({ revisoes }: { revisoes: LinhaRevisao[] }) {
  const lista = [...revisoes].sort((a, b) => a.rev - b.rev).slice(-7);
  return (
    <div className="fbh-rm-regua" aria-label="Revisões da máquina">
      {lista.map((r, i) => (
        <span key={r.rev} className={`p ${r.estado}`} style={{ ["--k" as string]: COR_REV[r.estado], animationDelay: `${i * 70}ms` }}
          title={`${r.rev} h · ${ROT_REV[r.estado]}${r.data ? ` · ${fmtDataBR(r.data)}` : ""}${r.origem ? ` · ${r.origem}` : ""}`}>
          <i />
          <b>{r.rev}</b>
          <small>{ROT_REV[r.estado]}</small>
        </span>
      ))}
    </div>
  );
}

/** Serviços numa linha do tempo; a barra mostra o valor (o maior enche); clique abre o detalhe. */
function LinhaServicos({ servicos, agora }: { servicos: ReturnType<typeof servicosDaMaquina>; agora: number }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const totais = servicos.map(({ os, pecas }) => (os.valor || 0) + pecas.reduce((t, x) => t + (x.valor || 0), 0));
  const maior = Math.max(1, ...totais);
  return (
    <ol className="fbh-rm-tl">
      {servicos.map(({ os, pecas, posServico }, i) => {
        const tot = totais[i];
        const on = aberto === os.id;
        const notas = posServico.filter((a) => a.detalhe);
        return (
          <li key={os.id} className={on ? "on" : ""} style={{ animationDelay: `${i * 80}ms` }}>
            <button type="button" onClick={() => setAberto(on ? null : os.id)} aria-expanded={on}>
              <span className="pt" />
              <span className="tx">
                <span className="l1"><b>{os.titulo}</b><span>{os.ts ? haQuanto(os.ts, agora) : fmtDataBR(os.data)}</span><span className="v">{fmtMoeda(tot)}</span></span>
                <span className="barra"><span style={{ width: `${Math.max(4, (tot / maior) * 100)}%` }} /></span>
                {!on && os.detalhe && <span className="l2">{os.detalhe}</span>}
              </span>
              <i className={`fa-solid fa-chevron-${on ? "up" : "down"} seta`} />
            </button>
            {on && (
              <div className="det">
                {os.detalhe && <p>{os.detalhe}</p>}
                <div className="chips">
                  <span><i className="fa-regular fa-calendar" /> {fmtDataBR(os.data)}</span>
                  {os.quem && <span><i className="fa-solid fa-user-gear" /> {os.quem}</span>}
                  {os.horimetro != null && <span><i className="fa-solid fa-gauge" /> {h(Math.round(os.horimetro))}</span>}
                  {os.valor != null && <span><i className="fa-solid fa-wrench" /> serviço {fmtMoeda(os.valor)}</span>}
                </div>
                {pecas.length > 0 && (
                  <div className="pecas">
                    {pecas.map((p) => <span key={p.id}><i className="fa-solid fa-box-open" /> {p.titulo}{p.valor != null ? ` · ${fmtMoeda(p.valor)}` : ""}</span>)}
                  </div>
                )}
                {notas.map((a) => <div key={a.id} className="fbh-rm-fb"><i className="fa-solid fa-comment" /> <span>“{a.detalhe}”</span></div>)}
              </div>
            )}
          </li>
        );
      })}
    </ol>
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

.fbh-rm-mais { justify-self: start; display: inline-flex; gap: 6px; align-items: center; padding: 4px 10px; border-radius: 99px; border: 1px solid var(--b); background: var(--s); font: inherit; font-size: 12.5px; color: var(--t2); cursor: pointer; transition: color .15s, border-color .15s }
.fbh-rm-mais:hover { color: #2563eb; border-color: color-mix(in srgb, #2563eb 40%, var(--b)) }
.fbh-rm-mais i { font-size: 10px }
.fbh-rm-lista li.fbh-rm-mais-li { padding: 0; border: 0; background: none }

/* total gasto */
.fbh-rm-total { display: flex; align-items: flex-end; gap: 10px; justify-content: space-between; flex-wrap: wrap }
.fbh-rm-total b { display: block; font-size: 22px; font-weight: 500; letter-spacing: -.01em; font-variant-numeric: tabular-nums; color: var(--t) }
.fbh-rm-total small { font-size: 12px; color: var(--t2) }
.fbh-rm-total .ult { font-size: 12px; color: var(--t2); padding: 2px 9px; border-radius: 99px; background: var(--s); border: 1px solid var(--b) }

/* régua das revisões */
.fbh-rm-regua { position: relative; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 2px; padding: 6px 2px 2px }
.fbh-rm-regua::before { content: ""; position: absolute; left: 7%; right: 7%; top: 14px; height: 3px; border-radius: 99px; background: var(--b) }
.fbh-rm-regua .p { position: relative; display: grid; justify-items: center; gap: 1px; animation: rmEntra .4s cubic-bezier(.16,1,.3,1) both }
.fbh-rm-regua .p i { width: 16px; height: 16px; border-radius: 50%; background: var(--s); border: 3px solid var(--k) }
.fbh-rm-regua .p.feita i { background: var(--k) }
.fbh-rm-regua .p.atrasada i { background: var(--k); animation: rmPulsa 1.6s ease-in-out infinite }
.fbh-rm-regua .p.proxima i { border-style: dashed }
.fbh-rm-regua .p b { font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; margin-top: 2px }
.fbh-rm-regua .p small { font-size: 10.5px; color: var(--k); white-space: nowrap }
@keyframes rmPulsa { 50% { box-shadow: 0 0 0 6px color-mix(in srgb, #dc2626 20%, transparent) } }

/* linha do tempo dos serviços */
.fbh-rm-tl { list-style: none; margin: 0; padding: 0 0 0 4px; display: grid; gap: 4px; position: relative }
.fbh-rm-tl::before { content: ""; position: absolute; left: 10px; top: 10px; bottom: 10px; width: 2px; background: linear-gradient(#2563eb, color-mix(in srgb, #2563eb 10%, transparent)) }
.fbh-rm-tl li { position: relative; animation: rmEntra .45s cubic-bezier(.16,1,.3,1) both }
.fbh-rm-tl li > button { width: 100%; display: flex; gap: 10px; align-items: flex-start; padding: 7px 8px 7px 0; border: 0; border-radius: 10px; background: transparent; font: inherit; color: var(--t); text-align: left; cursor: pointer; transition: background .15s }
.fbh-rm-tl li > button:hover { background: var(--s) }
.fbh-rm-tl li.on > button { background: var(--s) }
.fbh-rm-tl .pt { flex: none; width: 14px; height: 14px; margin: 3px 0 0 0; border-radius: 50%; background: var(--s); border: 3px solid #2563eb; position: relative; z-index: 1 }
.fbh-rm-tl li:first-child .pt { background: #2563eb }
.fbh-rm-tl .tx { flex: 1; min-width: 0; display: grid; gap: 4px }
.fbh-rm-tl .l1 { display: flex; gap: 8px; align-items: baseline; font-size: 13px }
.fbh-rm-tl .l1 b { font-weight: 500 } .fbh-rm-tl .l1 span { color: var(--t2); font-size: 12px }
.fbh-rm-tl .l1 .v { margin-left: auto; color: var(--t); font-size: 13px; font-variant-numeric: tabular-nums }
.fbh-rm-tl .barra { height: 5px; border-radius: 99px; background: color-mix(in srgb, #2563eb 8%, var(--b)); overflow: hidden }
.fbh-rm-tl .barra span { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #60a5fa, #2563eb); animation: rmBarra .9s cubic-bezier(.16,1,.3,1) both }
@keyframes rmBarra { from { width: 0 } }
.fbh-rm-tl .l2 { color: var(--t2); font-size: 12.5px; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden }
.fbh-rm-tl .seta { color: var(--t3); font-size: 11px; margin-top: 4px; font-weight: 900 }
.fbh-rm-tl .det { margin: 2px 0 6px 24px; padding: 8px 10px; border-radius: 10px; background: var(--s); border: 1px solid var(--b); display: grid; gap: 6px; font-size: 13px; animation: rmEntra .3s ease both }
.fbh-rm-tl .det p { margin: 0; color: var(--t) }
.fbh-rm-tl .chips, .fbh-rm-tl .pecas { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; color: var(--t2) }
.fbh-rm-tl .chips i, .fbh-rm-tl .pecas i { color: var(--t3); margin-right: 3px }
@keyframes rmEntra { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) { .fbh-rm-regua .p, .fbh-rm-tl li, .fbh-rm-tl .barra span, .fbh-rm-tl .det, .fbh-rm-regua .p i { animation: none !important } }
`;
