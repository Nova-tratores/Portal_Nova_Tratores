"use client";
// Clientes → Contatos do WhatsApp (antes /feedbacks/atendimento/contatos, 23/10/2026 veio para cá):
// quem é proprietário, tratorista, gerente… de cada cliente no NovaZap, com o caminho para o cockpit.
// Mesma API de antes (/api/feedbacks/atendimento/contatos, exige feedbacks:atendimento).
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authHeaders } from "@/lib/auth/client";
import { linkWhatsapp } from "@/lib/feedbacks/telefone";
import type { ContatoPorCargo } from "@/lib/chatwoot/parsers";

interface Resposta { estado: "nao_configurado" | "ok"; contatos: ContatoPorCargo[]; cargos: string[]; truncados: string[] }

export default function ContatosPorCargoAba() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [cargo, setCargo] = useState("");
  const [busca, setBusca] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const res = await fetch("/api/feedbacks/atendimento/contatos", { headers: await authHeaders(), cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.erro || `HTTP ${res.status}`);
      setDados(data as Resposta);
    } catch (e) { setErro(e instanceof Error ? e.message : "erro ao carregar os contatos"); } finally { setCarregando(false); }
  }, []);
  useEffect(() => {
    let vivo = true;
    Promise.resolve().then(() => { if (vivo) void carregar(); });
    return () => { vivo = false; };
  }, [carregar]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (dados?.contatos ?? []).filter((c) => (!cargo || c.cargo === cargo) && (!q || c.nome.toLowerCase().includes(q) || (c.cliente || "").toLowerCase().includes(q)));
  }, [dados, cargo, busca]);
  const conta = (cg: string) => (dados?.contatos ?? []).filter((c) => c.cargo === cg).length;

  return (
    <section className="fbh-cartao" style={{ ["--k" as string]: "#16a34a" }}>
      <h3><span className="fbn-ico"><i className="fa-brands fa-whatsapp" /></span> Contatos do WhatsApp por cargo <small>{carregando ? "lendo o NovaZap…" : `${lista.length} contato${lista.length === 1 ? "" : "s"}`}</small></h3>
      <div className="fbh-filtros">
        <label className="fbn-busca">
          <i className="fa-solid fa-magnifying-glass" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar contato ou cliente" />
        </label>
        <button type="button" className="fbn-btn" onClick={() => void carregar()} disabled={carregando}><i className="fa-solid fa-rotate" /> Atualizar</button>
      </div>
      <div className="fbn-chips">
        <button type="button" className={`fbn-chip ${!cargo ? "on" : ""}`} style={{ ["--k" as string]: "#16a34a" }} onClick={() => setCargo("")}>Todos <span className="n">{dados?.contatos.length ?? 0}</span></button>
        {(dados?.cargos ?? []).map((cg) => (
          <button key={cg} type="button" className={`fbn-chip ${cargo === cg ? "on" : ""}`} style={{ ["--k" as string]: cg === "Proprietário" ? "#ca8a04" : "#64748b" }} onClick={() => setCargo(cargo === cg ? "" : cg)}>
            {cg === "Proprietário" && <i className="fa-solid fa-crown" />} {cg} <span className="n">{conta(cg)}</span>
          </button>
        ))}
      </div>
      {erro && <div className="fbn-erro">{erro}</div>}
      {dados?.estado === "nao_configurado" && <div className="fbf-aviso"><i className="fa-solid fa-triangle-exclamation" /><span>A ligação com o NovaZap não está configurada neste servidor (só existe na produção).</span></div>}
      {(dados?.truncados.length ?? 0) > 0 && <div style={{ fontSize: 12.5, color: "var(--t2)" }}>Lista cortada em 90 contatos para: {dados!.truncados.join(", ")} — use a busca.</div>}
      {carregando && !dados ? <div className="fbn-vazio"><i className="fa-solid fa-circle-notch fa-spin" /> Carregando…</div>
        : lista.length === 0 ? <div className="fbn-vazio">Nenhum contato com esse filtro.</div>
        : (
          <div className="fbr-rola">
            <table className="fbr-tab">
              <thead><tr><th>Contato</th><th>Cargo</th><th>Cliente</th><th>Telefone</th><th>Fazendas</th><th /></tr></thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nome}</td>
                    <td><span className="fbn-pilula" style={{ ["--k" as string]: c.cargo === "Proprietário" ? "#ca8a04" : "#64748b" }}>{c.cargo}</span></td>
                    <td>{c.cliente ?? <span style={{ color: "var(--t3)" }}>sem vínculo</span>}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {c.telefone ?? "—"}
                      {c.telefone_wa && <> <a href={linkWhatsapp(c.telefone_wa) ?? "#"} target="_blank" rel="noopener noreferrer" style={{ color: "#16a34a" }} title="Abrir no WhatsApp"><i className="fa-brands fa-whatsapp" /></a></>}
                    </td>
                    <td>{c.localizacoes.map((l) => l.nome).join(", ") || "—"}</td>
                    <td>{c.cliente_key && <Link className="fbn-acao cinza" href={`/feedbacks/atendimento/${encodeURIComponent(c.cliente_key)}`}><i className="fa-solid fa-headset" /> Cockpit</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </section>
  );
}
