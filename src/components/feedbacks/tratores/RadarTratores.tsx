"use client";
// Feedbacks → Radar Tratores (José, 26–28/10/2026). Duas abas:
//  • Vendidos recentemente: os tratores novos vendidos (notas de "Trator Novo") num ROTEIRO DE LIGAÇÃO
//    dos 30/60/90 dias (RoteiroLigacao.tsx → /api/revisoes/vendidos/contatos). Passou de 90 dias sem
//    orçamento da 50 h = vermelho, até ter a OS ou o motivo de não fazer (com horímetro → previsão).
//  • Controle de Revisões: todos os tratores do controle com a previsão da próxima revisão, quem já
//    chegou primeiro (ControleRevisoes.tsx). As revisões saíram da fila do Hoje (28/10).
// O pátio (tratores novos no estoque) saiu daqui em 28/10 — vai para outro lugar. A ficha (cliente,
// mapa, nota, revisões) é a mesma de /revisoes/vendidos. Dados: GET /api/revisoes/vendidos?mahindra=1.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAuth } from "@/lib/auth/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";
import { Ficha, ESTILO_TV } from "@/components/revisoes/TratoresVendidos";
import RoteiroLigacao, { type CtxAtendimento } from "./RoteiroLigacao";
import ControleRevisoes from "./ControleRevisoes";
import { guardar, lerGuardado } from "./cacheTela";
import type { TratorVendido } from "@/lib/revisoes/vendidos-server";

const TODOS_MESES = 12;
const COR_VENDA = "#2563eb";
type Aba = "vendidos" | "revisoes";
const ABAS: { id: Aba; rotulo: string; ico: string }[] = [
  { id: "vendidos", rotulo: "Vendidos recentemente", ico: "fa-tractor" },
  { id: "revisoes", rotulo: "Controle de Revisões", ico: "fa-screwdriver-wrench" },
];
const abaDaUrl = (): Aba => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("aba") === "revisoes" ? "revisoes" : "vendidos");

export interface Dados { tratores: TratorVendido[]; desde?: string | null }

/** `inicial`: dados prontos (prévia) — sem ele, lê da API. */
export default function RadarTratores({ inicial }: { inicial?: Dados } = {}) {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  // só os vendidos nos últimos 12 meses (José, 28/10/2026); o resto fica no Controle de Revisões
  const meses = TODOS_MESES;
  const [dados, setDados] = useState<Dados | null>(inicial ?? null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<TratorVendido | null>(null);
  /** o que a ficha precisa para o atendimento (Iniciar → atendeu? → como foi) */
  const [ctxAtend, setCtxAtend] = useState<CtxAtendimento | null>(null);
  const [aba, setAbaEstado] = useState<Aba>("vendidos");
  useEffect(() => { const a = abaDaUrl(); if (a !== "vendidos") setAbaEstado(a); }, []);
  const setAba = (a: Aba) => {
    setAbaEstado(a);
    const u = new URL(window.location.href);
    if (a === "vendidos") u.searchParams.delete("aba"); else u.searchParams.set("aba", a);
    window.history.replaceState(null, "", u.toString());
  };

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const r = await fetchAuth(`/api/revisoes/vendidos?meses=${meses}&mahindra=1`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.erro || "Não consegui ler as notas dos tratores.");
      const novo = { tratores: j.tratores || [], desde: j.desde ?? null };
      setDados(novo);
      guardar(`vendidos:${meses}`, novo);
      setAberto((a) => (a ? (j.tratores as TratorVendido[]).find((t) => t.chave === a.chave) || null : null));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setDados((d) => d ?? { tratores: [] });
    }
  }, [meses]);
  // mostra na hora o último resultado guardado e atualiza por trás
  useEffect(() => {
    if (inicial) return;
    setDados(lerGuardado<Dados>(`vendidos:${meses}`));
    void carregar();
  }, [carregar, inicial, meses]);

  const vendidos = useMemo(() => dados?.tratores ?? [], [dados]);
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return vendidos.filter((t) => !q || [t.cliente?.nome, t.cliente?.cidade, t.modelo, t.chassi, t.vendedor, t.nota?.numero].some((x) => String(x || "").toLowerCase().includes(q)));
  }, [vendidos, busca]);
  const carregando = dados === null;

  return (
    <div className="rt">
      <style>{ESTILO_RT}</style>

      <div className="rt-abas" role="tablist" aria-label="Radar Tratores">
        {ABAS.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} className={aba === a.id ? "on" : ""} onClick={() => setAba(a.id)}>
            <i className={`fa-solid ${a.ico}`} /> {a.rotulo}
          </button>
        ))}
      </div>

      <div className="rt-topo">
        <label className="fbn-busca" style={{ maxWidth: 420 }}>
          <i className="fa-solid fa-magnifying-glass" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={aba === "vendidos" ? "Cliente, cidade, modelo, chassi, vendedor, nota…" : "Cliente, cidade, modelo, chassi, vendedor…"} />
        </label>
        {aba === "vendidos" && <StatusMahindra onLeu={carregar} />}
        <details className="fbf-como" style={{ flex: "1 1 260px" }}>
          <summary><i className="fa-regular fa-circle-question" style={{ color: COR_VENDA }} /> Como ler esta tela</summary>
          {aba === "vendidos" ? (
            <ul>
              <li>Aparecem <b>todos</b> os tratores novos vendidos (pelas <b>notas fiscais</b>). Os <b>30, 60 e 90 dias</b> contam da <b>entrega técnica</b> do certificado de garantia no portal da Mahindra (lido sozinho de hora em hora e sempre que esta tela abre); sem certificado, contam da nota.</li>
              <li>O trator só sai do radar com a <b>OS da revisão de 50 h</b> (orçamento aberto ou feita) no POS.</li>
              <li><b>Passou de 90 dias</b> sem orçamento da 50 h fica <b>vermelho</b>. Para tirar do vermelho sem a OS, registre o <b>motivo</b> em &quot;Não vai fazer a 50 h agora&quot;.</li>
              <li>Motivo <b>&quot;Ainda não deu as horas&quot;</b> pede o horímetro: horas ÷ dias desde a entrega técnica = o ritmo, e daí sai a previsão da 50 h e da 300 h. Uma semana antes da 50 h prevista o trator volta para a fila.</li>
              <li><b>Liguei</b> grava como foi a conversa; <b>Não atendeu</b> conta a tentativa e manda para o fim da fila; <b>Tem problema</b> fica em &quot;Precisa retorno&quot;.</li>
            </ul>
          ) : (
            <ul>
              <li>Todos os tratores do <b>controle de revisões</b>, com a previsão da próxima revisão pelo ritmo de uso (horímetro dos cheques, das OS e dos envios; sem leitura, a média).</li>
              <li><b>Já chegou na revisão</b> vem primeiro: a previsão já passou e a revisão não foi registrada. Depois, os que chegam em 30 dias.</li>
              <li>Abra o trator para ver a conta, ligar ou mandar o WhatsApp pronto, e registrar: <b>Agendou</b>, <b>Não atendeu</b> ou <b>Não vai fazer agora</b> (com o motivo).</li>
              <li>As revisões saíram das <b>Ligações do dia</b>: lá ficam os outros serviços (pós-serviço, reativação, peças, retornos).</li>
            </ul>
          )}
        </details>
      </div>

      {erro && aba === "vendidos" && <div className="fbn-erro">Erro: {erro}</div>}

      {aba === "revisoes" ? <ControleRevisoes busca={busca} />
        : carregando ? <div className="fbn-vazio"><i className="fa-solid fa-circle-notch fa-spin" /> Lendo as notas dos tratores vendidos…</div>
        : <RoteiroLigacao lista={lista} desde={dados?.desde ?? null} onAbrir={(t, ctx) => { setAberto(t); setCtxAtend(ctx ?? null); }} />}

      {aberto && (
        <div className="tv-vn" style={{ padding: 0 }}>
          <style>{ESTILO_TV}</style>
          <Ficha t={aberto} podeControle={pode("revisoes", "tratores")} meses={meses} seminovos={false} onFechar={() => setAberto(null)} atendimento={ctxAtend ?? undefined} onMudou={carregar} />
        </div>
      )}
    </div>
  );
}

/** Certificados de garantia da Mahindra (entrega técnica) — AUTOMÁTICO (José, 28/10/2026: "isso tem que
 *  ser automático de uma forma dinâmica"). O agendador lê de hora em hora (tarefa mahindra-certificados);
 *  ao abrir a tela, se a última leitura passou de 1 h, lê na hora e recarrega a lista quando grava algo.
 *  Aqui só mostra o estado, sem botão. */
const VELHA_MS = 60 * 60_000;
function StatusMahindra({ onLeu }: { onLeu: () => void }) {
  const [info, setInfo] = useState<{ configurado: boolean; ultima: string | null } | null>(null);
  const [lendo, setLendo] = useState(false);
  const [novos, setNovos] = useState<number | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [, tique] = useState(0);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const j = await fetchAuth("/api/revisoes/mahindra-certificados").then((r) => r.json()).catch(() => null);
      if (!vivo || !j?.ok) return;
      setInfo(j);
      if (!j.configurado || (j.ultima && Date.now() - Date.parse(j.ultima) < VELHA_MS)) return;
      setLendo(true);
      try {
        const r = await fetchAuth("/api/revisoes/mahindra-certificados", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const x = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok || !x.ok) { setFalhou(true); return; }
        setInfo({ configurado: true, ultima: x.ultima });
        setNovos(x.gravados || 0);
        if (x.gravados) onLeu();
      } catch { if (vivo) setFalhou(true); }
      finally { if (vivo) setLendo(false); }
    })();
    // o "há X min" anda sozinho
    const id = setInterval(() => tique((n) => n + 1), 60_000);
    return () => { vivo = false; clearInterval(id); };
  }, [onLeu]);
  if (!info || !info.configurado) return null;
  const min = info.ultima ? Math.max(0, Math.round((Date.now() - Date.parse(info.ultima)) / 60_000)) : null;
  const ha = min == null ? "ainda não lida" : min < 1 ? "agora" : min < 60 ? `há ${min} min` : `há ${Math.round(min / 60)} h`;
  return (
    <span className={`rt-mh ${lendo ? "lendo" : falhou ? "erro" : ""}`} title="Entrega técnica lida sozinha do portal de concessionárias da Mahindra, de hora em hora e ao abrir esta tela">
      <i className={`fa-solid ${lendo ? "fa-circle-notch fa-spin" : falhou ? "fa-triangle-exclamation" : "fa-circle-check"}`} />
      {lendo ? "Lendo a Mahindra…" : falhou ? `Mahindra fora do ar · última leitura ${ha}` : `Mahindra em dia · ${ha}${novos ? ` · ${novos} novo${novos > 1 ? "s" : ""}` : ""}`}
    </span>
  );
}

const ESTILO_RT = `
.rt { display: grid; gap: 18px; min-width: 0 }
.rt-topo { display: flex; gap: 10px; align-items: flex-start; flex-wrap: wrap }
.rt-topo .fbn-busca { flex: 1 1 280px }
.rt-periodo { display: inline-flex; gap: 8px; align-items: center; height: 42px; font-size: 14px; color: var(--t2) }
.rt-periodo select { height: 38px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--b); background: var(--s); color: var(--t); font: inherit; font-size: 14px; cursor: pointer }
.rt-mh { display: inline-flex; gap: 7px; align-items: center; height: 40px; padding: 0 14px; border-radius: 99px; font-size: 13px; color: #15803d; background: color-mix(in srgb, #16a34a 8%, var(--s)); border: 1px solid color-mix(in srgb, #16a34a 25%, var(--b)) }
.rt-mh.lendo { color: #0e7490; background: color-mix(in srgb, #0e7490 8%, var(--s)); border-color: color-mix(in srgb, #0e7490 25%, var(--b)) }
.rt-mh.erro { color: #b45309; background: color-mix(in srgb, #d97706 8%, var(--s)); border-color: color-mix(in srgb, #d97706 25%, var(--b)) }
.rt-abas { display: flex; gap: 6px; flex-wrap: wrap; border-bottom: 1px solid var(--b) }
.rt-abas button { display: inline-flex; gap: 8px; align-items: center; height: 42px; padding: 0 18px; border: 1px solid transparent; border-bottom: 0; border-radius: 12px 12px 0 0; background: transparent; color: var(--t2); font: inherit; font-size: 14.5px; cursor: pointer; margin-bottom: -1px; transition: color .15s, background .15s }
.rt-abas button:hover { color: var(--t); background: var(--soft) }
.rt-abas button.on { color: var(--t); background: var(--s); border-color: var(--b) }
.rt-abas button.on i { color: #db2777 }

/* seções */
.rt-sec { display: grid; gap: 10px; scroll-margin-top: 90px }
.rt-tit { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0; font-size: 17px; font-weight: 500 }
.rt-tit .fbn-ico { --c: var(--k) }
.rt-n { font-size: 12.5px; padding: 1px 10px; border-radius: 99px; color: #fefefe; background: var(--k); font-variant-numeric: tabular-nums }

/* cartões */
.rt-grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(420px, 100%), 1fr)); gap: 12px }
.rt-grade.patio { grid-template-columns: repeat(auto-fill, minmax(min(380px, 100%), 1fr)) }
.rt-card { display: grid; gap: 12px; padding: 14px 16px 12px; border-radius: 16px; background: var(--s); border: 1px solid var(--b); font: inherit; color: var(--t); text-align: left; cursor: pointer; min-width: 0;
  animation: rtEntra .5s cubic-bezier(.16,1,.3,1) both; transition: transform .25s, box-shadow .25s, border-color .25s }
.rt-card:hover { transform: translateY(-2px); box-shadow: 0 14px 28px -20px rgba(15,23,42,.55); border-color: color-mix(in srgb, #2563eb 35%, var(--b)) }
.rt-card.patio { cursor: default }
.rt-card.patio:hover { border-color: color-mix(in srgb, var(--k) 40%, var(--b)) }
.rt-card.destaque { border-color: color-mix(in srgb, #db2777 40%, var(--b)); box-shadow: 0 0 0 3px color-mix(in srgb, #db2777 10%, transparent) }
.rt-card-cab { display: flex; gap: 12px; align-items: center; min-width: 0 }
.rt-modelo { display: block; font-size: 16px; font-weight: 500; line-height: 1.25 }
.rt-cli { display: block; font-size: 14px; color: var(--t); margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.rt-meta { display: flex; flex-wrap: wrap; gap: 3px 12px; font-size: 12.5px; color: var(--t2); margin-top: 3px }
.rt-meta i { color: var(--t3); margin-right: 3px; font-size: 11px }
.rt-dias { text-align: right; line-height: 1; flex: none }
.rt-dias b { display: block; font-size: 28px; font-weight: 500; color: #2563eb; font-variant-numeric: tabular-nums }
.rt-dias small { font-size: 11.5px; color: var(--t2) }
.rt-selos { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px }
.rt-pil { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; padding: 1px 9px; border-radius: 99px; color: var(--k); background: color-mix(in srgb, var(--k) 10%, var(--s)); border: 1px solid color-mix(in srgb, var(--k) 22%, transparent) }

/* anel do pátio */
.rt-anel { position: relative; width: 64px; height: 64px; flex: none }
.rt-anel > span { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; line-height: 1 }
.rt-anel b { font-size: 17px; font-weight: 500; font-variant-numeric: tabular-nums }
.rt-anel small { font-size: 10.5px; color: var(--t2) }
.rt-anel-arco { animation: rtAnel 1.1s cubic-bezier(.16,1,.3,1) both }
@keyframes rtAnel { from { stroke-dasharray: 0 999 } }

@keyframes rtEntra { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) { .rt *, .rt *::before { animation: none !important; transition: none !important } }
@media (max-width: 760px) {
}
`;
