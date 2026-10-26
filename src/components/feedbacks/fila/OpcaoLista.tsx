"use client";
// Opção 3 · Lista com painel ao lado: tabela compacta que ordena pelo cabeçalho, atalhos de filtro
// em cima e, ao clicar numa linha, a ficha + ações no painel da direita (no celular, de baixo).
import { useMemo, useState } from "react";
import type { Acao, ItemFila } from "@/lib/feedbacks/fila";
import type { Fila } from "./useFila";
import FichaCliente, { COR_ACAO, ICO_ACAO, comOS, fmtValor, primeiroTecnico, rotuloDias } from "./FichaCliente";
import AcoesAtendimento from "./AcoesAtendimento";

type Col = "pos" | "cliente" | "tecnico" | "servico" | "dias" | "valor" | "oque";
const ROT_ACAO: Record<Acao, string> = { ligar: "Ligar", whatsapp: "WhatsApp", retentar: "Tentar amanhã", aguardar: "Esperar", concluido: "Concluídos" };

export default function OpcaoLista({ fila }: { fila: Fila }) {
  const [ordem, setOrdem] = useState<{ col: Col; dir: 1 | -1 }>({ col: "pos", dir: 1 });
  const [acao, setAcao] = useState<Acao | "">("");
  const [selId, setSelId] = useState<number | null>(null);
  const crm = fila.tipo === "crm";

  const contagem = useMemo(() => {
    const m = new Map<Acao, number>();
    for (const it of fila.itens) m.set(it.acao, (m.get(it.acao) || 0) + 1);
    return m;
  }, [fila.itens]);
  const acaoValida = acao && contagem.has(acao) ? acao : "";

  const pos = useMemo(() => new Map(fila.itens.map((it, i) => [it.registro.id, i])), [fila.itens]);
  const linhas = useMemo(() => {
    const l = fila.itens.filter((it) => !acaoValida || it.acao === acaoValida);
    const chave = (it: ItemFila): string | number => {
      const r = comOS(it.registro);
      switch (ordem.col) {
        case "cliente": return (r.nome || "").toLowerCase();
        case "tecnico": return (r.tecnico || "~").toLowerCase();
        case "servico": return ((crm ? r.servico : r.trator) || "~").toLowerCase();
        case "dias": return it.dias ?? -1;
        case "valor": return Number(r.os_valor) || 0;
        case "oque": return it.oQueFazer.toLowerCase();
        default: return pos.get(r.id) ?? 0;
      }
    };
    return [...l].sort((a, b) => { const x = chave(a), y = chave(b); return (x < y ? -1 : x > y ? 1 : 0) * ordem.dir; });
  }, [fila.itens, pos, acaoValida, ordem, crm]);

  const sel = selId != null ? fila.base.find((it) => it.registro.id === selId) ?? null : null;
  const th = (col: Col, rot: string, num = false) => {
    const on = ordem.col === col;
    return (
      <th className={`${on ? "on" : ""} ${num ? "num" : ""}`} aria-sort={on ? (ordem.dir === 1 ? "ascending" : "descending") : "none"}
        onClick={() => setOrdem((o) => ({ col, dir: o.col === col ? (o.dir === 1 ? -1 : 1) : (col === "dias" || col === "valor" ? -1 : 1) }))}>
        {rot}<i className={`fa-solid ${on ? (ordem.dir === 1 ? "fa-arrow-up" : "fa-arrow-down") : "fa-sort"}`} />
      </th>
    );
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {contagem.size > 1 && (
        <div className="fbn-chips">
          <button type="button" className={`fbn-chip ${!acaoValida ? "on" : ""}`} style={{ ["--k" as string]: "#475569" }} onClick={() => setAcao("")}>
            <i className="fa-solid fa-list" /> Todos <span className="n">{fila.itens.length}</span>
          </button>
          {(Object.keys(ROT_ACAO) as Acao[]).filter((a) => contagem.has(a)).map((a) => (
            <button key={a} type="button" className={`fbn-chip ${acaoValida === a ? "on" : ""}`} style={{ ["--k" as string]: COR_ACAO[a] }} onClick={() => setAcao(acaoValida === a ? "" : a)}>
              <i className={`fa-solid ${ICO_ACAO[a]}`} /> {ROT_ACAO[a]} <span className="n">{contagem.get(a)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="fbf-o3">
        <div className="fbf-tabela-caixa">
          {linhas.length === 0 ? <div className="fbn-vazio" style={{ border: 0 }}>Nenhum cliente nesta situação.</div> : (
            <table className="fbf-tabela">
              <thead>
                <tr>
                  {th("pos", "#", true)}
                  {th("cliente", "Cliente")}
                  {th("tecnico", "Técnico")}
                  {th("servico", crm ? "Serviço" : "Equipamento")}
                  {th("dias", crm ? "Dias" : "Sem vir", true)}
                  {crm && th("valor", "Valor", true)}
                  {th("oque", "O que fazer")}
                </tr>
              </thead>
              <tbody>
                {linhas.map((it) => {
                  const r = comOS(it.registro);
                  return (
                    <tr key={r.id} className={selId === r.id ? "sel" : ""} onClick={() => setSelId(r.id)}>
                      <td className="num" style={{ color: "var(--t3)" }}>{(pos.get(r.id) ?? 0) + 1}</td>
                      <td className="cli">{r.nome}<small>{r.trator && crm ? r.trator : r.telefone || ""}</small></td>
                      <td style={{ whiteSpace: "nowrap" }}>{primeiroTecnico(r.tecnico)}</td>
                      <td style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={(crm ? r.servico : r.trator) || ""}>{(crm ? r.servico : r.trator) || "—"}</td>
                      <td className="num">{rotuloDias(it)}</td>
                      {crm && <td className="num">{fmtValor(r.os_valor)}</td>}
                      <td><span className="fbn-pilula" style={{ ["--k" as string]: COR_ACAO[it.acao] }}><i className={`fa-solid ${ICO_ACAO[it.acao]}`} /> {it.oQueFazer}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <aside className={`fbf-lado ${sel ? "" : "vazio"}`}>
          {sel ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div className="fbf-fechar-lado"><button type="button" className="fbn-acao cinza" onClick={() => setSelId(null)}><i className="fa-solid fa-chevron-down" /> Fechar</button></div>
              <div className="fbn-card"><FichaCliente item={sel} tags={fila.tagsDe(sel.registro)} onHistorico={() => fila.abrirHistorico(sel.registro)} /></div>
              <div className="fbn-card"><AcoesAtendimento item={sel} fila={fila} /></div>
            </div>
          ) : <div className="fbf-lado-vazio"><i className="fa-regular fa-hand-pointer" /> Clique num cliente da lista para ver a ficha e atender.</div>}
        </aside>
      </div>
    </div>
  );
}
