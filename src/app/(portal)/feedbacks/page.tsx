"use client";
// Feedbacks → Hoje (tela de verdade desde 23/10/2026 — José escolheu o "Caminho B", Opção 1:
// lista + painel do cliente ao lado; gaveta no celular). Uma fila por cliente juntando o que antes
// eram CRM (Pós-serviço), RFM (Reativação), Agenda (Retornos combinados), oportunidades do robô e
// revisões Mahindra; concluir num lugar só, GRAVANDO de verdade (as regras são as do useHoje; a
// página de teste /feedbacks/crm/teste/hoje continua com "Dados de exemplo" e "Gravar de verdade").
// URL: ?motivo=pos|rfm|revisao|pecas|cadastro|retorno (vários com vírgula) · ?cliente=<chave> abre
// o cliente · ?id=<registro> abre o cliente daquele atendimento (aviso de nota baixa do sino).
// Permissão: feedbacks:crm | rfm | atendimento | agenda (lib/feedbacks/telas); sem ela, vai para a
// 1ª aba que a pessoa pode ver.
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";
import { useHoje } from "@/components/feedbacks/hoje/useHoje";
import AbaHoje from "@/components/feedbacks/hoje/AbaHoje";
import Casca from "@/components/feedbacks/hoje/Casca";
import { TopoReal } from "@/components/feedbacks/hoje/Moldura";
import { abasVisiveis, gruposDaUrl, podeAba } from "@/lib/feedbacks/telas";

export default function FeedbacksHojePage() {
  return <Suspense fallback={null}><Porta /></Suspense>;
}

function Porta() {
  const { userProfile } = useAuth();
  const { pode, loading } = usePermissoes(userProfile?.id);
  const router = useRouter();
  const pronto = !loading && !!userProfile;
  const libera = pronto && podeAba(pode, "hoje");
  const outra = pronto && !libera ? abasVisiveis(pode)[0]?.href ?? null : null;

  useEffect(() => { if (outra) router.replace(outra); }, [outra, router]);

  if (!libera) {
    return <Casca><div className="fbn-vazio">{pronto && !outra ? "Você não tem acesso à fila de atendimento." : <><i className="fa-solid fa-circle-notch fa-spin" /> Abrindo…</>}</div></Casca>;
  }
  return <TelaHoje />;
}

function TelaHoje() {
  const { userProfile } = useAuth();
  const { isAdmin, pode } = usePermissoes(userProfile?.id);
  const router = useRouter();
  const sp = useSearchParams();
  const gerente = isAdmin || pode("feedbacks", "relatorios");
  // revisões saíram daqui em 28/10 (José): ficam no Radar Tratores → Controle de Revisões
  const hoje = useHoje(false, userProfile?.funcao, { gravarSempre: true, tela: "hoje", podeCockpit: pode("feedbacks", "atendimento"), comRevisoes: false });
  const [selKey, setSelKey] = useState<string | null>(null);
  const { setGrupos, clientes } = hoje;
  const carregando = hoje.carregando || hoje.carregandoRev;

  // ?motivo= vira o filtro de chips (uma vez, ao abrir)
  const motivo = sp.get("motivo");
  useEffect(() => {
    let vivo = true;
    const g = gruposDaUrl(motivo);
    Promise.resolve().then(() => { if (vivo) setGrupos(new Set(g)); });
    return () => { vivo = false; };
  }, [motivo, setGrupos]);

  // ?ok= é o recado do cockpit ao encerrar a ligação
  const ok = sp.get("ok");
  const { avisar } = hoje;
  useEffect(() => {
    if (!ok) return;
    let vivo = true;
    Promise.resolve().then(() => { if (vivo) avisar(ok, "ok"); });
    return () => { vivo = false; };
  }, [ok, avisar]);

  // ?cliente= / ?id= abrem o cliente quando a fila terminar de carregar
  const alvoCliente = sp.get("cliente");
  const alvoId = Number(sp.get("id")) || null;
  const aplicado = useRef<string | null>(null);
  useEffect(() => {
    const chave = `${alvoCliente || ""}|${alvoId || ""}`;
    if (carregando || chave === "|" || aplicado.current === chave) return;
    aplicado.current = chave;
    const c = alvoCliente
      ? clientes.find((x) => x.key === alvoCliente)
      : clientes.find((x) => x.motivos.some((m) => m.registro?.id === alvoId));
    let vivo = true;
    Promise.resolve().then(() => {
      if (!vivo) return;
      if (c) setSelKey(c.key);
      else hoje.avisar(alvoId ? `O atendimento #${alvoId} não está mais na fila (já foi concluído ou é de um cliente “não contatar”).` : "Este cliente não está na fila de hoje.", "sim");
    });
    return () => { vivo = false; };
    // hoje.avisar é estável (useCallback); clientes muda a cada leitura
  }, [carregando, clientes, alvoCliente, alvoId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Casca hoje={hoje}>
      <AbaHoje real hoje={hoje} gerente={gerente} irPainel={() => router.push("/feedbacks/painel")} topo={<TopoReal hoje={hoje} />} selKey={selKey} setSelKey={setSelKey} />
    </Casca>
  );
}
