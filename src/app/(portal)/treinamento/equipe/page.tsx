"use client";
// Painel do gestor: por trilha, quem concluiu, quem está atrasado e a nota.

import { useEffect, useState } from "react";
import Link from "next/link";
import { botao, card, CSS_KB, Icone, Selo, T1, T2, T3, vazio, dataBR } from "@/components/conhecimento/estiloKB";
import { corModulo, rotuloModulo } from "@/lib/conhecimento/modulos";
import { Barra, ComoLer, pagina, ROXO, TreinamentoNav } from "@/components/treinamento/TreinamentoNav";
import { ErroApi, painelEquipe, reabrir, type LinhaEquipe } from "@/lib/treinamento/client";
import { SITUACAO_ROTULO, type Situacao } from "@/lib/treinamento/regras";

type Dados = Awaited<ReturnType<typeof painelEquipe>>;

export default function EquipePage() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Situacao | "todas">("todas");
  const [rodada, setRodada] = useState(0);

  useEffect(() => {
    let vivo = true;
    painelEquipe().then((r) => { if (vivo) setDados(r); }).catch((e) => { if (vivo) setErro(e instanceof ErroApi && e.migracaoFaltando ? "O treinamento ainda não foi instalado no banco." : (e as Error).message); });
    return () => { vivo = false; };
  }, [rodada]);

  const r = dados?.resumo;
  const tiles: { k: Situacao | "todas"; rotulo: string; v: number; cor: string; icone: string }[] = r ? [
    { k: "todas", rotulo: "pessoas × trilhas", v: r.total, cor: "#475569", icone: "fa-users" },
    { k: "concluida", rotulo: "concluídas", v: r.concluidas, cor: "#15803d", icone: "fa-circle-check" },
    { k: "em_andamento", rotulo: "em andamento", v: r.emAndamento, cor: "#2563eb", icone: "fa-circle-half-stroke" },
    { k: "pendente", rotulo: "não começaram", v: r.pendentes, cor: "#64748b", icone: "fa-circle" },
    { k: "vencida", rotulo: "atrasadas", v: r.atrasadas, cor: "#dc2626", icone: "fa-circle-exclamation" },
  ] : [];

  return (
    <div style={pagina}>
      <style>{CSS_KB}</style>
      <TreinamentoNav podeGerir conta={{ atrasadas: r?.atrasadas }} />
      <ComoLer itens={[
        <>Cada linha é uma pessoa numa trilha. <b>Atrasada</b> = passou o prazo sem concluir. Clique num número do topo para filtrar.</>,
        <>A barra mostra quanto a pessoa já leu; a nota é a da última prova. <b>Reabrir</b> faz a pessoa refazer a prova (sem apagar o que já leu).</>,
        <>Quem recebe cada trilha sozinho é definido pelo <b>público</b> da trilha (categoria da pessoa no Admin). Para dar a outra pessoa, abra a trilha e use <b>Atribuir</b>.</>,
        <>Nota média = média das últimas notas de quem já fez a prova.</>,
      ]} />
      {erro && <div style={{ ...card, color: "#991b1b", marginBottom: 14 }}>{erro}</div>}
      {!dados && !erro && <div style={vazio}>Carregando…</div>}
      {dados && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))", gap: 10, marginBottom: 18 }}>
            {tiles.map((t) => (
              <button key={t.k} type="button" onClick={() => setFiltro(t.k)} className="kb-card kb-hover" style={{ ...card, cursor: "pointer", textAlign: "left", display: "flex", gap: 10, alignItems: "center", padding: "12px 14px", ["--kb-cor" as string]: t.cor, borderColor: filtro === t.k ? `color-mix(in srgb, ${t.cor} 45%, transparent)` : undefined, fontFamily: "inherit" }}>
                <Icone icone={t.icone} cor={t.cor} tam={32} />
                <span><span style={{ display: "block", fontSize: 20, fontWeight: 500, color: T1, fontVariantNumeric: "tabular-nums" }}>{t.v}</span><span style={{ fontSize: 12, color: T2 }}>{t.rotulo}</span></span>
              </button>
            ))}
            {r && <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", padding: "12px 14px" }}>
              <Icone icone="fa-star" cor="#ca8a04" tam={32} />
              <span><span style={{ display: "block", fontSize: 20, fontWeight: 500, color: T1 }}>{r.notaMedia != null ? `${r.notaMedia}%` : "—"}</span><span style={{ fontSize: 12, color: T2 }}>nota média</span></span>
            </div>}
          </div>

          {dados.porTrilha.length === 0 && <div style={vazio}>Nenhuma trilha ativa. <Link href="/treinamento/trilhas">Criar uma trilha</Link>.</div>}
          {dados.porTrilha.map(({ trilha, linhas, resumo }) => {
            const ls = filtro === "todas" ? linhas : linhas.filter((l) => l.situacao === filtro);
            return (
              <section key={trilha.id} style={{ ...card, marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                  <Icone icone="fa-route" cor={corModulo(trilha.modulo)} tam={32} />
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <Link href={`/treinamento/editar/${trilha.id}`} style={{ fontSize: 15, fontWeight: 500, color: T1, textDecoration: "none" }}>{trilha.titulo}</Link>
                    <div style={{ fontSize: 12, color: T3 }}>{rotuloModulo(trilha.modulo)} · {trilha.status === "ativa" ? "ativa" : trilha.status} · público: {trilha.publico.join(", ") || "só manual"} · {resumo.concluidas}/{resumo.total} concluídas{resumo.atrasadas ? ` · ${resumo.atrasadas} atrasada${resumo.atrasadas > 1 ? "s" : ""}` : ""}</div>
                  </div>
                  <Link href={`/treinamento/${trilha.id}`} style={botao(ROXO)}>Abrir</Link>
                </div>
                {ls.length === 0 ? <div style={{ fontSize: 13, color: T3 }}>Ninguém {filtro === "todas" ? "atribuído ainda" : "nesta situação"}.</div> : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                      <thead><tr style={{ color: T3, fontSize: 12, textAlign: "left" }}><th style={th}>Pessoa</th><th style={th}>Situação</th><th style={th}>Progresso</th><th style={th}>Prazo</th><th style={th}>Nota</th><th style={th}>Tentativas</th><th style={th}></th></tr></thead>
                      <tbody>{ls.map((l) => <Linha key={l.atribuicao.id} l={l} trilhaId={trilha.id} aoMudar={() => setRodada((n) => n + 1)} />)}</tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid var(--portal-border, #e2e8f0)", fontWeight: 500 };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid var(--portal-border, #e2e8f0)", verticalAlign: "middle", color: T1 };

function Linha({ l, trilhaId, aoMudar }: { l: LinhaEquipe; trilhaId: string; aoMudar: () => void }) {
  const s = SITUACAO_ROTULO[l.situacao];
  const a = l.atribuicao;
  return (
    <tr>
      <td style={td}>{a.user_nome || a.user_id.slice(0, 8)}{a.ciclo > 1 && <Selo cor={ROXO}> reciclagem</Selo>}</td>
      <td style={td}><Selo cor={s.cor}><i className={`fa-solid ${s.icone}`} /> {s.rotulo}</Selo></td>
      <td style={{ ...td, minWidth: 140 }}><Barra pct={l.pct} cor={l.situacao === "vencida" ? "#dc2626" : l.situacao === "concluida" ? "#15803d" : ROXO} /><span style={{ fontSize: 11, color: T3 }}>{l.pct}%</span></td>
      <td style={{ ...td, color: l.situacao === "vencida" ? "#dc2626" : T2 }}>{dataBR(a.prazo)}{l.situacao !== "concluida" && (l.dias < 0 ? ` · ${-l.dias} d atrás` : ` · ${l.dias} d`)}</td>
      <td style={td}>{a.nota != null ? `${a.nota}%` : "—"}</td>
      <td style={td}>{a.tentativas}</td>
      <td style={td}>{a.situacao === "concluida" && <button type="button" onClick={async () => { if (confirm(`Reabrir a prova para ${a.user_nome}?`)) { await reabrir(trilhaId, a.id).catch(() => {}); aoMudar(); } }} style={{ ...botao(ROXO), height: 30, fontSize: 12.5 }}>Reabrir</button>}</td>
    </tr>
  );
}
