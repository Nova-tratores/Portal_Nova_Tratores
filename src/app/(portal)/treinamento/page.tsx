"use client";
// Treinamento — minhas trilhas: o que tenho para fazer, até quando, e onde parei.

import { useEffect, useState } from "react";
import Link from "next/link";
import { card, CSS_KB, Icone, Selo, T1, T2, T3, vazio, dataBR } from "@/components/conhecimento/estiloKB";
import { corModulo, rotuloModulo } from "@/lib/conhecimento/modulos";
import { Barra, ComoLer, pagina, ROXO, TreinamentoNav } from "@/components/treinamento/TreinamentoNav";
import { ErroApi, listar, type ListaResposta } from "@/lib/treinamento/client";
import { diasParaPrazo, SITUACAO_ROTULO } from "@/lib/treinamento/regras";

export default function MinhasTrilhasPage() {
  const [dados, setDados] = useState<ListaResposta | null>(null);
  const [erro, setErro] = useState<{ msg: string; migracao: boolean } | null>(null);

  useEffect(() => {
    let vivo = true;
    listar().then((r) => { if (vivo) setDados(r); }).catch((e) => { if (vivo) setErro({ msg: (e as Error).message, migracao: e instanceof ErroApi && e.migracaoFaltando }); });
    return () => { vivo = false; };
  }, []);

  const minhas = dados?.minhas ?? [];
  const abertas = minhas.filter((m) => m.situacao !== "concluida").sort((a, b) => a.atribuicao.prazo.localeCompare(b.atribuicao.prazo));
  const feitas = minhas.filter((m) => m.situacao === "concluida");
  const atrasadas = abertas.filter((m) => m.situacao === "vencida").length;

  return (
    <div style={pagina}>
      <style>{CSS_KB}</style>
      <TreinamentoNav podeGerir={dados?.podeGerir ?? false} conta={{ minhas: abertas.length }} />
      <ComoLer itens={[
        <>Uma <b>trilha</b> é uma sequência de artigos da base de conhecimento para você ler, mais uma prova rápida no fim. Você recebe as trilhas da sua área sozinho; o gestor pode atribuir outras.</>,
        <>Cada cartão mostra <b>até quando</b> fazer e <b>onde você parou</b>. Clique para continuar de onde estava.</>,
        <>A prova libera depois que você lê todos os artigos. Passou na nota mínima, a trilha fica concluída. Não passou, pode tentar de novo.</>,
        <>Quando um artigo da trilha muda de forma relevante, você recebe uma <b>reciclagem</b>: só a parte que mudou, com uma ou duas perguntas.</>,
      ]} />

      {erro && <div style={{ ...card, marginBottom: 14, color: erro.migracao ? "#92400e" : "#991b1b" }}>{erro.migracao ? "O treinamento ainda não foi instalado no banco. " : ""}{erro.msg}</div>}

      <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 500, color: T1, display: "flex", alignItems: "center", gap: 10 }}>
        <Icone icone="fa-graduation-cap" cor={ROXO} tam={32} /> Para fazer
        {atrasadas > 0 && <Selo cor="#dc2626">{atrasadas} atrasada{atrasadas > 1 ? "s" : ""}</Selo>}
      </h2>
      {!dados && !erro ? <div style={vazio}>Carregando…</div> : abertas.length === 0 ? (
        <div style={vazio}>Nenhuma trilha pendente. {feitas.length ? "Tudo em dia." : "Quando houver treinamento para a sua área, ele aparece aqui."}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(340px, 100%), 1fr))", gap: 12, marginBottom: 26 }}>
          {abertas.map((m, i) => <CartaoTrilha key={m.atribuicao.id} m={m} hoje={dados!.hoje} i={i} />)}
        </div>
      )}

      {feitas.length > 0 && (
        <>
          <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 500, color: T1, display: "flex", alignItems: "center", gap: 10 }}><Icone icone="fa-circle-check" cor="#15803d" tam={32} /> Concluídas</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(340px, 100%), 1fr))", gap: 12 }}>
            {feitas.map((m, i) => <CartaoTrilha key={m.atribuicao.id} m={m} hoje={dados!.hoje} i={i} />)}
          </div>
        </>
      )}
    </div>
  );
}

function CartaoTrilha({ m, hoje, i }: { m: ListaResposta["minhas"][number]; hoje: string; i: number }) {
  const s = SITUACAO_ROTULO[m.situacao];
  const dias = diasParaPrazo(m.atribuicao.prazo, hoje);
  const prazoTxt = m.situacao === "concluida" ? `concluída em ${dataBR(m.atribuicao.concluida_em || m.atribuicao.prazo)}` : dias < 0 ? `venceu há ${-dias} dia${dias < -1 ? "s" : ""}` : dias === 0 ? "vence hoje" : `${dias} dia${dias > 1 ? "s" : ""} · até ${dataBR(m.atribuicao.prazo)}`;
  return (
    <Link href={`/treinamento/${m.trilha.id}`} className="kb-card kb-hover" style={{ ...card, textDecoration: "none", color: "inherit", display: "block", ["--kb-cor" as string]: ROXO, animation: `kbEntra .4s ease ${i * 50}ms both` }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Icone icone={m.atribuicao.origem === "reciclagem" ? "fa-rotate" : "fa-route"} cor={corModulo(m.trilha.modulo)} tam={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: T1 }}>{m.trilha.titulo}</div>
          <div style={{ fontSize: 12, color: T3, marginTop: 2 }}>{rotuloModulo(m.trilha.modulo)} · {m.etapas} artigo{m.etapas !== 1 ? "s" : ""}{m.progresso.temProva ? " + prova" : ""}</div>
        </div>
        <Selo cor={s.cor}><i className={`fa-solid ${s.icone}`} /> {s.rotulo}</Selo>
      </div>
      {m.atribuicao.motivo && <div style={{ fontSize: 12.5, color: T2, marginTop: 8 }}><i className="fa-solid fa-rotate" style={{ color: ROXO }} /> Reciclagem: {m.atribuicao.motivo}</div>}
      <div style={{ marginTop: 12 }}><Barra pct={m.progresso.pct} cor={m.situacao === "vencida" ? "#dc2626" : m.situacao === "concluida" ? "#15803d" : ROXO} /></div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T2, marginTop: 6 }}>
        <span>{m.progresso.lidas} de {m.progresso.total} lidos{m.progresso.temProva ? (m.progresso.faltaProva ? " · prova pendente" : " · prova ok") : ""}</span>
        <span style={{ color: m.situacao === "vencida" ? "#dc2626" : T2 }}>{prazoTxt}</span>
      </div>
    </Link>
  );
}
