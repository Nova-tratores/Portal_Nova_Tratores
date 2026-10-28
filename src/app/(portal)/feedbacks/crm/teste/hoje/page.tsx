"use client";
// PÁGINA DE TESTE da tela "Hoje" do módulo Feedbacks (José, 23/10/2026 — "Caminho B" para o módulo
// inteiro): abas Hoje · Clientes · Robô de oportunidades (gerente) · Painel (gerente, ao vivo).
// Hoje = UMA fila por cliente juntando atendimentos CRM/RFM, oportunidades do robô, revisões
// Mahindra e retornos combinados, com pontuação única (lib/feedbacks/hoje) e concluir num lugar só.
// As telas de verdade (/feedbacks, /feedbacks/crm, /rfm, /agenda, /atendimento, /oportunidades)
// não mudaram. Começa em DADOS DE EXEMPLO; com dados reais as ações simulam até "Gravar de verdade".
// Permissão: o layout de /feedbacks confere a sub-tela pelo 1º segmento ("crm").
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";
import ModalHistoricoCliente from "@/components/feedbacks/ModalHistoricoCliente";
import { ESTILO_FBN } from "@/components/feedbacks/estiloNovo";
import { ESTILO_FILA } from "@/components/feedbacks/fila/estiloFila";
import { ESTILO_US } from "@/components/feedbacks/fila/UltimoServico";
import { ESTILO_HOJE } from "@/components/feedbacks/hoje/estiloHoje";
import { useHoje } from "@/components/feedbacks/hoje/useHoje";
import { FaixaAbas, Topo, type Aba } from "@/components/feedbacks/hoje/Moldura";
import AbaHoje from "@/components/feedbacks/hoje/AbaHoje";
import AbaClientes from "@/components/feedbacks/hoje/AbaClientes";
import { AbaPainel, AbaRobo } from "@/components/feedbacks/hoje/AbasGerente";
import { COR_CRM } from "@/lib/feedbacks/cores";
import type { Grupo } from "@/lib/feedbacks/hoje";

export default function HojeTestePage() {
  const { userProfile } = useAuth();
  const { isAdmin, pode } = usePermissoes(userProfile?.id);
  // "Só gerente": admin ou quem vê os Relatórios do módulo
  const gerente = isAdmin || pode("feedbacks", "relatorios");
  const [aba, setAba] = useState<Aba>("hoje");
  const [exemplo, setExemplo] = useState(true);
  const [selKey, setSelKey] = useState<string | null>(null);
  const hoje = useHoje(exemplo, userProfile?.funcao);
  const abaVisivel: Aba = !gerente && (aba === "robo" || aba === "painel") ? "hoje" : aba;
  const { recarregar } = hoje;

  // Painel ao vivo: relê a cada 60 s e quando a pessoa volta para a aba (sem piscar a tela).
  useEffect(() => {
    if (abaVisivel !== "painel" || exemplo) return;
    const id = setInterval(() => void recarregar({ silencioso: true }), 60_000);
    const volta = () => { if (document.visibilityState === "visible") void recarregar({ silencioso: true }); };
    document.addEventListener("visibilitychange", volta);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", volta); };
  }, [abaVisivel, exemplo, recarregar]);

  const filtrarGrupo = (g: Grupo) => { hoje.setGrupos(new Set([g])); setAba("hoje"); };
  const verNaFila = (key: string) => { hoje.setGrupos(new Set()); hoje.setBusca(""); hoje.setTecnico(""); hoje.setSoAcao(""); hoje.setMinhaArea(false); setSelKey(key); setAba("hoje"); };
  const topo = <Topo hoje={hoje} exemplo={exemplo} setExemplo={(v) => { setExemplo(v); setSelKey(null); }} />;

  return (
    <div className="fbn fbh" style={{ ["--c" as string]: COR_CRM }}>
      <style>{ESTILO_FBN + ESTILO_FILA + ESTILO_US + ESTILO_HOJE}</style>
      <FaixaAbas aba={abaVisivel} setAba={setAba} gerente={gerente} />

      {abaVisivel === "hoje" && <AbaHoje hoje={hoje} gerente={gerente} irPainel={() => setAba("painel")} topo={topo} selKey={selKey} setSelKey={setSelKey} />}
      {abaVisivel === "clientes" && <>{topo}<AbaClientes hoje={hoje} verNaFila={verNaFila} /></>}
      {abaVisivel === "robo" && <>{topo}<AbaRobo hoje={hoje} /></>}
      {abaVisivel === "painel" && <>{topo}<AbaPainel hoje={hoje} filtrarGrupo={filtrarGrupo} /></>}

      <ModalHistoricoCliente aberto={!!hoje.historico} nome={hoje.historico?.nome || ""} codigoOmie={hoje.historico?.codigoOmie ?? null} onFechar={hoje.fecharHistorico} />
      {hoje.toast && (
        <div key={hoje.toast.id} className={`fbf-toast ${hoje.toast.tipo}`} role="status">
          <i className={`fa-solid ${hoje.toast.tipo === "erro" ? "fa-circle-exclamation" : hoje.toast.tipo === "sim" ? "fa-flask" : "fa-circle-check"}`} />
          <span>{hoje.toast.texto}</span>
          <button type="button" onClick={hoje.fecharToast} aria-label="Fechar"><i className="fa-solid fa-xmark" /></button>
        </div>
      )}
    </div>
  );
}
