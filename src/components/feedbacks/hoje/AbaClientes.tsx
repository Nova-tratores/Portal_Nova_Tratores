"use client";
// Aba "Clientes" da tela Hoje (simples nesta entrega): busca um cliente na fila ou no cadastro Omie
// e abre o histórico (ModalHistoricoCliente: serviços, máquinas e revisões, compras, requisições).
import { useMemo, useState } from "react";
import ClienteAutocomplete from "@/components/feedbacks/ClienteAutocomplete";
import type { Hoje } from "./useHoje";
import { LinhaCliente } from "./kit";

export default function AbaClientes({ hoje, verNaFila }: { hoje: Hoje; verNaFila: (key: string) => void }) {
  const [q, setQ] = useState("");
  const [omie, setOmie] = useState("");
  const achados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    const dig = t.replace(/\D/g, "");
    return hoje.clientes.filter((c) => [c.nome, c.cidade, c.email].filter(Boolean).join(" ").toLowerCase().includes(t) || (dig.length >= 4 && String(c.telefone || "").replace(/\D/g, "").includes(dig))).slice(0, 30);
  }, [q, hoje.clientes]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <p className="fbf-explica">Procure um cliente para ver <b>tudo o que ele tem com a gente</b> (serviços, máquinas e revisões, compras, requisições) e se ele está na fila de hoje.</p>
      <span className="fbh-construcao" style={{ justifySelf: "start" }}><i className="fa-solid fa-person-digging" /> Em construção: ficha completa do cliente aqui (cadastro, tags, máquinas e atendimentos numa tela só)</span>

      <section className="fbh-cartao" style={{ ["--k" as string]: "#dc2626" }}>
        <h3><span className="fbn-ico"><i className="fa-solid fa-magnifying-glass" /></span> Na fila <small>{hoje.clientes.length.toLocaleString("pt-BR")} clientes com algum motivo</small></h3>
        <label className="fbn-busca">
          <i className="fa-solid fa-magnifying-glass" />
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, cidade ou telefone (2 letras ou mais)" />
        </label>
        {q.trim().length >= 2 && !achados.length && <div style={{ fontSize: 13.5, color: "var(--t2)" }}>Ninguém da fila com esse nome. Tente no cadastro Omie abaixo.</div>}
        <div className="fbh-sec">
          {achados.map((c, i) => (
            <div key={c.key} style={{ display: "grid", gap: 6 }}>
              <LinhaCliente c={c} pos={null} onClick={() => verNaFila(c.key)} atraso={i} maxSelos={4} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginLeft: 40 }}>
                <button type="button" className="fbn-acao" onClick={() => verNaFila(c.key)}><i className="fa-solid fa-sun" /> Ver na fila de hoje</button>
                <button type="button" className="fbn-acao cinza" onClick={() => hoje.abrirHistorico(c)}><i className="fa-solid fa-clock-rotate-left" /> Histórico</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="fbh-cartao" style={{ ["--k" as string]: "#2563eb" }}>
        <h3><span className="fbn-ico"><i className="fa-solid fa-address-book" /></span> No cadastro Omie <small>qualquer cliente, mesmo fora da fila</small></h3>
        {hoje.exemplo
          ? <div style={{ fontSize: 13.5, color: "var(--t2)" }}>Com os dados de exemplo a busca no cadastro Omie fica desligada. Troque para <b>Dados reais</b>.</div>
          : <ClienteAutocomplete valor={omie} onChange={setOmie} onSelecionar={(c) => { setOmie(c.nome_fantasia || c.razao_social || ""); hoje.abrirHistorico({ nome: c.razao_social || c.nome_fantasia || "", codigo_omie: c.id_omie }); }} placeholder="Nome, CNPJ ou CPF do cliente" />}
      </section>
    </div>
  );
}
