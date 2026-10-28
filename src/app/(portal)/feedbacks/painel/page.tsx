"use client";
// Feedbacks → Painel (23/10/2026, substitui /feedbacks/relatorios): o gerente vê a equipe.
//   Ao vivo     = quem está em ligação, feitos hoje, notas baixas, coisas paradas, fila por motivo,
//                 conversão da semana (AbaPainel, relê a cada 60 s e ao voltar para a aba).
//   Desempenho  = o que valia a pena da tela de Relatórios (ranking dos atendentes por período,
//                 satisfação por técnico, viraram serviço, dia a dia, CSV).
// Permissão: feedbacks:relatorios (lib/feedbacks/telas). URL: ?ver=desempenho abre a 2ª.
import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";
import { useHoje } from "@/components/feedbacks/hoje/useHoje";
import { AbaPainel } from "@/components/feedbacks/hoje/AbasGerente";
import PainelDesempenho from "@/components/feedbacks/hoje/PainelDesempenho";
import Casca, { ExtrasHoje } from "@/components/feedbacks/hoje/Casca";
import { podeAba, urlDoGrupo } from "@/lib/feedbacks/telas";

export default function FeedbacksPainelPage() {
  return <Suspense fallback={null}><Painel /></Suspense>;
}

function Painel() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const ver = sp.get("ver") === "desempenho" ? "desempenho" : "vivo";
  const trocar = (v: "vivo" | "desempenho") => router.replace(v === "vivo" ? pathname : `${pathname}?ver=desempenho`, { scroll: false });

  return (
    <Casca>
      <div className="fbh-linha-topo">
        <div className="fbr-seg" role="tablist" aria-label="O que ver">
          <button type="button" role="tab" aria-selected={ver === "vivo"} className={ver === "vivo" ? "on" : ""} onClick={() => trocar("vivo")}><i className="fa-solid fa-tower-broadcast" /> Ao vivo</button>
          <button type="button" role="tab" aria-selected={ver === "desempenho"} className={ver === "desempenho" ? "on" : ""} onClick={() => trocar("desempenho")}><i className="fa-solid fa-chart-column" /> Desempenho por período</button>
        </div>
      </div>
      {ver === "vivo" ? <AoVivo /> : <PainelDesempenho />}
    </Casca>
  );
}

function AoVivo() {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const router = useRouter();
  // Só leitura: o Painel não conclui nada (não grava; sem revisões não muda o painel, mas a "fila por motivo" conta revisões)
  const hoje = useHoje(false, userProfile?.funcao, { tela: "painel" });
  const { recarregar } = hoje;

  useEffect(() => {
    const id = setInterval(() => void recarregar({ silencioso: true }), 60_000);
    const volta = () => { if (document.visibilityState === "visible") void recarregar({ silencioso: true }); };
    document.addEventListener("visibilitychange", volta);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", volta); };
  }, [recarregar]);

  return (
    <>
      {hoje.erro && <div className="fbn-erro">Erro: {hoje.erro}</div>}
      <AbaPainel hoje={hoje} filtrarGrupo={podeAba(pode, "hoje") ? (g) => router.push(urlDoGrupo(g)) : undefined} />
      {/* o histórico das notas baixas abre por aqui */}
      <ExtrasHoje hoje={hoje} />
    </>
  );
}
