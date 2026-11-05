"use client";
// Trilhas que eu giro: lista + criar.

import { useEffect, useState } from "react";
import Link from "next/link";
import { botao, card, CSS_KB, Icone, Selo, T1, T2, T3, vazio } from "@/components/conhecimento/estiloKB";
import { corModulo, rotuloModulo } from "@/lib/conhecimento/modulos";
import { ComoLer, pagina, ROXO, TreinamentoNav } from "@/components/treinamento/TreinamentoNav";
import { ErroApi, listar, type ListaResposta } from "@/lib/treinamento/client";

const STATUS: Record<string, { rotulo: string; cor: string }> = { rascunho: { rotulo: "rascunho", cor: "#92400e" }, ativa: { rotulo: "ativa", cor: "#15803d" }, arquivada: { rotulo: "arquivada", cor: "#64748b" } };

export default function TrilhasPage() {
  const [dados, setDados] = useState<ListaResposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    listar().then((r) => { if (vivo) setDados(r); }).catch((e) => { if (vivo) setErro(e instanceof ErroApi && e.migracaoFaltando ? "O treinamento ainda não foi instalado no banco." : (e as Error).message); });
    return () => { vivo = false; };
  }, []);
  return (
    <div style={pagina}>
      <style>{CSS_KB}</style>
      <TreinamentoNav podeGerir />
      <ComoLer itens={[
        <>Uma trilha nasce como <b>rascunho</b>: escolha os artigos publicados, escreva as perguntas (ou peça sugestões à IA) e <b>ative</b>. Ao ativar, todo mundo da categoria do público recebe a trilha com o prazo.</>,
        <>Quem gere: admin, quem tem o módulo Treinamento, ou o responsável do módulo na base de conhecimento.</>,
      ]} />
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Link href="/treinamento/editar/nova" style={botao(ROXO, true)}><i className="fa-solid fa-plus" /> Nova trilha</Link>
      </div>
      {erro && <div style={{ ...card, color: "#991b1b" }}>{erro}</div>}
      {!dados && !erro && <div style={vazio}>Carregando…</div>}
      {dados && dados.gerir.length === 0 && <div style={vazio}>Nenhuma trilha ainda.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))", gap: 12 }}>
        {dados?.gerir.map((t) => (
          <Link key={t.id} href={`/treinamento/editar/${t.id}`} className="kb-card kb-hover" style={{ ...card, textDecoration: "none", color: "inherit", ["--kb-cor" as string]: ROXO }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Icone icone="fa-route" cor={corModulo(t.modulo)} tam={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: T1 }}>{t.titulo}</div>
                <div style={{ fontSize: 12, color: T3, marginTop: 2 }}>{rotuloModulo(t.modulo)} · nota {t.nota_minima}% · {t.prazo_dias} dias</div>
              </div>
              <Selo cor={STATUS[t.status]?.cor ?? "#64748b"}>{STATUS[t.status]?.rotulo ?? t.status}</Selo>
            </div>
            {t.descricao && <div style={{ fontSize: 13, color: T2, marginTop: 8 }}>{t.descricao}</div>}
            <div style={{ fontSize: 12, color: T3, marginTop: 8 }}>Público: {t.publico.length ? t.publico.join(", ") : "só atribuição manual"}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
