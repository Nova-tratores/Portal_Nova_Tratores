"use client";

// Painel "Cheques atrasados" da tela de Revisões — o que o Vigia de revisões
// marcou nas OS (pendencia_mahindra). Quem envia o cheque vê tudo num lugar,
// sem abrir OS por OS. "Verificar agora" roda a varredura na hora.
import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth/client";

interface Item {
  id: string;
  cliente: string;
  status: string;
  data: string | null;
  dataFim: string | null;
  chassis: string;
  horas: number | null;
  detalhes: string[];
  nova: boolean;
}

function fmt(d: string | null): string {
  if (!d) return "—";
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

export default function ChequesAtrasados({ podeVarrer, onIrParaChassi }: { podeVarrer: boolean; onIrParaChassi?: (chassis: string) => void }) {
  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [varrendo, setVarrendo] = useState(false);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState(true);
  const [resumo, setResumo] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await fetch("/api/pos/vigia-revisoes", { headers: await authHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "falha ao carregar");
      setItens(j.itens || []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao carregar");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const varrer = async () => {
    setVarrendo(true);
    setErro("");
    setResumo("");
    try {
      const r = await fetch("/api/pos/vigia-revisoes", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: "{}" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "falha na varredura");
      setResumo(`${j.analisadas} OS analisadas · ${j.comPendencia} com pendência · ${j.novas} novas · ${j.limpas} resolvidas`);
      setItens(j.itens || []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha na varredura");
    } finally {
      setVarrendo(false);
    }
  };

  const total = itens.length;

  return (
    <section className={`mb-8 rounded-lg border ${total ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <button type="button" onClick={() => setAberto((v) => !v)} className="flex items-center gap-2 text-left">
          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold ${total ? "bg-red-600 text-white" : "bg-emerald-500 text-white"}`}>
            {total ? "!" : "✓"}
          </span>
          <span className="font-semibold text-zinc-900">
            Cheques atrasados
            {carregando ? <span className="ml-2 text-sm font-normal text-zinc-500 animate-pulse">carregando…</span>
              : <span className="ml-2 text-sm font-normal text-zinc-600">{total ? `${total} OS com pendência` : "nenhuma pendência"}</span>}
          </span>
          <span className="text-zinc-400 text-sm">{aberto ? "▾" : "▸"}</span>
        </button>
        <div className="flex items-center gap-2">
          {resumo && <span className="text-xs text-zinc-600 hidden md:inline">{resumo}</span>}
          {podeVarrer && (
            <button
              type="button"
              onClick={varrer}
              disabled={varrendo}
              title="Recalcula agora: OS de revisão dos últimos 60 dias faturadas no Omie e sem cheque enviado"
              className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {varrendo ? "Verificando…" : "Verificar agora"}
            </button>
          )}
        </div>
      </div>
      {erro && <p className="px-4 pb-3 text-sm text-red-600">{erro}</p>}
      {aberto && total > 0 && (
        <div className="border-t border-red-200 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-2">OS</th>
                <th className="px-2 py-2">Cliente</th>
                <th className="px-2 py-2">Chassi</th>
                <th className="px-2 py-2">Revisão</th>
                <th className="px-2 py-2">Data</th>
                <th className="px-2 py-2">Fase</th>
                <th className="px-2 py-2">O que falta</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((it) => (
                <tr key={it.id} className="border-t border-red-100 align-top">
                  <td className="px-4 py-2 whitespace-nowrap">
                    <a href={`/pos?id=${encodeURIComponent(it.id)}`} className="font-semibold text-red-700 hover:underline">{it.id}</a>
                    {it.nova && <span className="ml-1 text-[10px] font-bold text-white bg-red-600 rounded px-1">NOVA</span>}
                  </td>
                  <td className="px-2 py-2">{it.cliente || "—"}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {onIrParaChassi
                      ? <button type="button" className="font-mono text-zinc-800 hover:underline" onClick={() => onIrParaChassi(it.chassis)} title="Ver na lista de tratores">{it.chassis}</button>
                      : <span className="font-mono">{it.chassis}</span>}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">{it.horas ? `${it.horas}h` : "—"}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{fmt(it.dataFim || it.data)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{it.status || "—"}</td>
                  <td className="px-2 py-2">
                    <ul className="list-disc pl-4 space-y-0.5">
                      {it.detalhes.map((d, i) => <li key={i} className="text-zinc-800">{d}</li>)}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
