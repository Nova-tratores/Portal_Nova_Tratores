"use client";
// Feedbacks → Robô (23/10/2026, substitui /feedbacks/oportunidades): o robô de oportunidades em
// linguagem simples — as 8 regras (R1–R8) com quantas estão abertas e quanto pesam na fila da Hoje
// (clique numa regra = filtra a triagem) — e a triagem das oportunidades (busca, regra, situação,
// urgentes; ver na fila, cockpit/atender, dispensar com motivo, histórico). "Recalcular agora" roda
// o robô na hora (ele roda sozinho todo dia às 06:00). Permissão: feedbacks:oportunidades.
// URL: ?regra=R5_pecas abre filtrado.
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";
import { fetchAuth } from "@/lib/auth/client";
import ModalHistoricoCliente from "@/components/feedbacks/ModalHistoricoCliente";
import Casca from "@/components/feedbacks/hoje/Casca";
import { AbaRobo } from "@/components/feedbacks/hoje/AbasGerente";
import TriagemRobo, { type StatusFiltro } from "@/components/feedbacks/hoje/TriagemRobo";
import { TODAS_REGRAS } from "@/lib/feedbacks/atendimento/areas";
import { podeAba } from "@/lib/feedbacks/telas";
import type { Oportunidade, RegraOportunidade } from "@/lib/feedbacks/types";

export default function FeedbacksRoboPage() {
  return <Suspense fallback={null}><Robo /></Suspense>;
}

async function lerOportunidades(status: StatusFiltro): Promise<Oportunidade[]> {
  const r = await fetchAuth(`/api/feedbacks/oportunidades?status=${status}`);
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error((j && (j.erro || j.error)) || `erro ${r.status}`);
  return (j || []) as Oportunidade[];
}

function Robo() {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const sp = useSearchParams();
  const regraUrl = sp.get("regra");
  const [regra, setRegra] = useState<RegraOportunidade | null>(() => ((TODAS_REGRAS as string[]).includes(regraUrl || "") ? (regraUrl as RegraOportunidade) : null));
  const [status, setStatus] = useState<StatusFiltro>("aberta");
  const [abertas, setAbertas] = useState<Oportunidade[]>([]);
  const [outras, setOutras] = useState<Oportunidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [recalculando, setRecalculando] = useState(false);
  const [hist, setHist] = useState<{ nome: string; codigoOmie: string | null } | null>(null);
  const [toast, setToast] = useState<{ id: number; texto: string; tipo: "ok" | "erro" } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avisar = useCallback((texto: string, tipo: "ok" | "erro" = "ok") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), texto, tipo });
    timer.current = setTimeout(() => setToast(null), 6000);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const [a, o] = await Promise.all([lerOportunidades("aberta"), status === "aberta" ? Promise.resolve(null) : lerOportunidades(status)]);
      setAbertas(a); setOutras(o || []);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setCarregando(false); }
  }, [status]);
  useEffect(() => {
    let vivo = true;
    Promise.resolve().then(() => { if (vivo) void carregar(); });
    return () => { vivo = false; };
  }, [carregar]);

  const recalcular = async () => {
    setRecalculando(true);
    try {
      const res = await fetchAuth("/api/feedbacks/oportunidades/recomputar", { method: "POST" });
      const j = await res.json();
      if (!res.ok || !j.sucesso) throw new Error(j.erro || "Falha ao recalcular");
      const resumo = (j.resumo || {}) as Record<string, { computadas?: number; erro?: string }>;
      const erros = Object.entries(resumo).filter(([, r]) => r?.erro).map(([k, r]) => `${k}: ${r.erro}`);
      await carregar();
      if (erros.length) avisar(`Recalculado, mas com erro em: ${erros.join(" | ")}`, "erro");
      else avisar(`Recalculado em ${Math.round((j.ms || 0) / 100) / 10} s.`);
    } catch (e) { avisar(e instanceof Error ? e.message : String(e), "erro"); } finally { setRecalculando(false); }
  };

  const lista = status === "aberta" ? abertas : outras;

  return (
    <Casca>
      <div className="fbf-topo">
        <span style={{ fontSize: 13.5, color: "var(--t2)" }}>{carregando ? "lendo…" : `${abertas.length.toLocaleString("pt-BR")} oportunidades abertas`}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="fbn-btn" onClick={() => void recalcular()} disabled={recalculando} title="Roda as 8 regras agora em cima dos dados atuais (tratores, OS, pedidos, atendimentos). Ele já roda sozinho todo dia às 06:00.">
          <i className={`fa-solid ${recalculando ? "fa-circle-notch fa-spin" : "fa-robot"}`} /> {recalculando ? "Recalculando…" : "Recalcular agora"}
        </button>
        <button type="button" className="fbn-btn" onClick={() => void carregar()}><i className="fa-solid fa-rotate" /> Atualizar</button>
      </div>

      <details className="fbf-como">
        <summary><i className="fa-regular fa-circle-question" style={{ color: "var(--c)" }} /> Como ler esta tela</summary>
        <ul>
          <li>O <b>robô</b> olha os tratores vendidos, as OS, os pedidos e os atendimentos e sugere <b>quem vale a pena chamar</b>. Cada sugestão é uma <b>oportunidade</b>, e cada uma nasce de uma das 8 regras (R1 a R8) explicadas nos cartões.</li>
          <li>O número de cada regra é quantas estão <b>abertas</b> agora e para quantos clientes. <b>Peso na fila</b> é quanto ela vale na ordem da aba Hoje; “pode ser urgente” = pode passar na frente. Clique numa regra para ver só ela na triagem.</li>
          <li>Toda oportunidade aberta <b>já aparece na aba Hoje</b>, junto com os outros motivos do mesmo cliente. Esta tela serve para conferir e limpar: <b>Ver na fila de hoje</b> abre o cliente lá; <b>Abrir no cockpit</b> (ou <b>Atender</b>) liga para ele; <b>Dispensar</b> tira da fila com um motivo (quando não é oportunidade de verdade); <b>Histórico</b> mostra serviços, máquinas, compras e requisições do cliente.</li>
          <li>Os botões Abertas · Atendidas · Dispensadas · Expiradas mostram o que já foi feito. <b>Recalcular agora</b> roda o robô na hora; sozinho ele roda todo dia às 06:00.</li>
        </ul>
      </details>

      {erro && <div className="fbn-erro">Erro: {erro}</div>}

      <style>{`.fbrb { display: grid; grid-template-columns: minmax(0, 1fr) minmax(340px, 460px); gap: 14px; align-items: start }
.fbrb > aside { position: sticky; top: 90px; max-height: calc(100vh - 110px); overflow-y: auto }
@media (max-width: 1100px) { .fbrb { grid-template-columns: minmax(0, 1fr) } .fbrb > aside { position: static; max-height: none } }`}</style>
      <div className="fbrb">
        <TriagemRobo
          lista={lista} carregando={carregando} status={status} setStatus={setStatus} regra={regra} setRegra={setRegra}
          podeHoje={podeAba(pode, "hoje")} podeCockpit={pode("feedbacks", "atendimento")}
          usuario={userProfile ? { id: userProfile.id, nome: userProfile.nome } : null}
          onMudou={() => void carregar()} abrirHistorico={(op) => setHist({ nome: op.cliente_nome, codigoOmie: op.codigo_omie })} avisar={avisar}
        />
        <aside aria-label="As regras do robô">
          <AbaRobo abertas={abertas} construcao={false} carregando={carregando} regraSel={regra} onRegra={(r) => setRegra(regra === r ? null : r)} />
        </aside>
      </div>

      <ModalHistoricoCliente aberto={!!hist} nome={hist?.nome || ""} codigoOmie={hist?.codigoOmie ?? null} onFechar={() => setHist(null)} />
      {toast && (
        <div key={toast.id} className={`fbf-toast ${toast.tipo}`} role="status">
          <i className={`fa-solid ${toast.tipo === "erro" ? "fa-circle-exclamation" : "fa-circle-check"}`} />
          <span>{toast.texto}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Fechar"><i className="fa-solid fa-xmark" /></button>
        </div>
      )}
    </Casca>
  );
}
