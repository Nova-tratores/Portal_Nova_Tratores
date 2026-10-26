"use client";
// Opção 2 · Quadro por etapa: 4 colunas (A ligar · Tentando · Esperando · Concluídos nos últimos
// 30 dias) com cartões pequenos. Clicar abre a gaveta do lado com a ficha e as ações.
import { useEffect, useMemo, useState } from "react";
import type { ItemFila } from "@/lib/feedbacks/fila";
import { concluidoRecente, type Fila } from "./useFila";
import FichaCliente, { COR_ACAO, ICO_ACAO, rotuloDias, fmtValor, comOS, primeiroTecnico } from "./FichaCliente";
import AcoesAtendimento from "./AcoesAtendimento";

type Coluna = "ligar" | "tentando" | "esperando" | "concluidos";
const COLUNAS: { k: Coluna; rot: string; ico: string; cor: string; dica: string }[] = [
  { k: "ligar", rot: "A ligar", ico: "fa-phone", cor: "#2563eb", dica: "Ninguém tentou ainda: dá para ligar agora" },
  { k: "tentando", rot: "Tentando", ico: "fa-rotate-right", cor: "#d97706", dica: "Já tentou e não conseguiu falar" },
  { k: "esperando", rot: "Esperando", ico: "fa-hourglass-half", cor: "#64748b", dica: "Ainda não é hora: serviço recente ou retorno combinado" },
  { k: "concluidos", rot: "Concluídos", ico: "fa-circle-check", cor: "#16a34a", dica: "Fechados nos últimos 30 dias" },
];
const LIMITE = 40;

function colunaDe(it: ItemFila): Coluna | null {
  if (it.acao === "concluido") return concluidoRecente(it) ? "concluidos" : null;
  const tent = Array.isArray(it.registro.tentativas) ? it.registro.tentativas.length : 0;
  if (it.acao === "retentar" || ((it.acao === "ligar" || it.acao === "whatsapp") && tent > 0)) return "tentando";
  if (it.acao === "ligar" || it.acao === "whatsapp") return "ligar";
  return "esperando";
}

export default function OpcaoQuadro({ fila }: { fila: Fila }) {
  const [selId, setSelId] = useState<number | null>(null);
  const [mais, setMais] = useState<Record<Coluna, boolean>>({ ligar: false, tentando: false, esperando: false, concluidos: false });

  const cols = useMemo(() => {
    const m: Record<Coluna, ItemFila[]> = { ligar: [], tentando: [], esperando: [], concluidos: [] };
    for (const it of fila.base) { const c = colunaDe(it); if (c) m[c].push(it); }
    m.concluidos.sort((a, b) => String(b.registro.concluido_em || "").localeCompare(String(a.registro.concluido_em || "")));
    return m;
  }, [fila.base]);

  const sel = selId != null ? fila.base.find((it) => it.registro.id === selId) ?? null : null;

  useEffect(() => {
    if (selId == null) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setSelId(null); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [selId]);

  return (
    <>
      <div className="fbf-quadro">
        {COLUNAS.map((c) => {
          const lista = cols[c.k];
          const vis = mais[c.k] ? lista : lista.slice(0, LIMITE);
          return (
            <section key={c.k} className="fbf-col" style={{ ["--k" as string]: c.cor }}>
              <div className="fbf-col-cab" title={c.dica}>
                <span className="fbn-ico p"><i className={`fa-solid ${c.ico}`} /></span>
                {c.rot}
                <span className="n">{lista.length}</span>
              </div>
              {vis.length === 0 && <div className="fbf-mais">Nenhum cliente aqui.</div>}
              {vis.map((it) => {
                const r = comOS(it.registro);
                return (
                  <button key={r.id} type="button" className={`fbf-cartao ${selId === r.id ? "sel" : ""}`} onClick={() => setSelId(r.id)}>
                    <span className="nm">{r.nome}</span>
                    <span className="lin">
                      <i className="fa-regular fa-clock" /> {rotuloDias(it)}
                      {r.tecnico && <> · {primeiroTecnico(r.tecnico)}</>}
                      {Number(r.os_valor) > 0 && <> · {fmtValor(r.os_valor)}</>}
                    </span>
                    <span><span className="fbn-pilula" style={{ ["--k" as string]: COR_ACAO[it.acao] }}><i className={`fa-solid ${ICO_ACAO[it.acao]}`} /> {it.oQueFazer}</span></span>
                  </button>
                );
              })}
              {lista.length > LIMITE && (
                <button type="button" className="fbn-acao cinza" style={{ justifyContent: "center" }} onClick={() => setMais((m) => ({ ...m, [c.k]: !m[c.k] }))}>
                  {mais[c.k] ? "Mostrar menos" : `Mostrar mais ${lista.length - LIMITE}`}
                </button>
              )}
            </section>
          );
        })}
      </div>

      {sel && (
        <>
          <div className="fbf-gaveta-fundo" onClick={() => setSelId(null)} />
          <aside className="fbf-gaveta" role="dialog" aria-label={`Atendimento de ${sel.registro.nome}`}>
            <div className="fbf-gaveta-cab">
              <span className="fbf-falta"><i className="fa-solid fa-user" style={{ color: "var(--c)" }} /> Atendimento</span>
              <button type="button" className="fbn-acao cinza" onClick={() => setSelId(null)} aria-label="Fechar"><i className="fa-solid fa-xmark" /> Fechar</button>
            </div>
            <div className="fbn-card"><FichaCliente item={sel} tags={fila.tagsDe(sel.registro)} onHistorico={() => fila.abrirHistorico(sel.registro)} /></div>
            <div className="fbn-card"><AcoesAtendimento item={sel} fila={fila} /></div>
          </aside>
        </>
      )}
    </>
  );
}
