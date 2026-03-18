"use client";

import { useState, useEffect, useCallback } from "react";

interface Peca {
  catalogo_nome: string;
  secao_nome: string;
  conjunto_nome: string;
  referencia_desenho: string;
  codigo_peca: string;
  nome_peca: string;
  quantidade: string;
  unidade: string;
  tipo_filho: string;
  observacoes: string;
}

interface Filtros {
  catalogos: string[];
  secoes: string[];
  conjuntos: string[];
}

export default function CatalogoPecas() {
  const [busca, setBusca] = useState("");
  const [catalogo, setCatalogo] = useState("");
  const [secao, setSecao] = useState("");
  const [conjunto, setConjunto] = useState("");
  const [tipo, setTipo] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Peca[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [filtros, setFiltros] = useState<Filtros>({ catalogos: [], secoes: [], conjuntos: [] });
  const [loading, setLoading] = useState(false);

  // Load filter options (cascading)
  const loadFiltros = useCallback(async () => {
    const params = new URLSearchParams({ mode: "filtros" });
    if (catalogo) params.set("catalogo", catalogo);
    if (secao) params.set("secao", secao);
    const res = await fetch(`/api/ppv/pecas?${params}`);
    const data = await res.json();
    setFiltros(data);
  }, [catalogo, secao]);

  useEffect(() => { loadFiltros(); }, [loadFiltros]);

  // Load results
  const loadResults = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (busca) params.set("busca", busca);
    if (catalogo) params.set("catalogo", catalogo);
    if (secao) params.set("secao", secao);
    if (conjunto) params.set("conjunto", conjunto);
    if (tipo) params.set("tipo", tipo);
    const res = await fetch(`/api/ppv/pecas?${params}`);
    const data = await res.json();
    setItems(data.items);
    setTotal(data.total);
    setTotalPages(data.totalPages);
    setLoading(false);
  }, [busca, catalogo, secao, conjunto, tipo, page]);

  useEffect(() => { loadResults(); }, [loadResults]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [busca, catalogo, secao, conjunto, tipo]);

  // Reset dependent filters on cascade
  function handleCatalogoChange(val: string) {
    setCatalogo(val);
    setSecao("");
    setConjunto("");
  }

  function handleSecaoChange(val: string) {
    setSecao(val);
    setConjunto("");
  }

  return (
    <div className="flex h-full flex-col gap-5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-600 text-lg text-white">
          <i className="fas fa-cogs" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-100">Catálogo de Peças</h2>
          <p className="text-sm text-slate-400">{total.toLocaleString("pt-BR")} peças encontradas</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 rounded-2xl bg-red-950/80 p-5 shadow-lg">
        {/* Search */}
        <div className="min-w-[300px] flex-1">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-red-300/60">
            Buscar peça
          </label>
          <div className="relative">
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-red-400/50" />
            <input
              type="text"
              placeholder="Código ou nome da peça..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full rounded-xl border border-red-800 bg-red-900/50 py-3 pl-11 pr-4 text-base text-slate-100 placeholder-red-400/40 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/30"
            />
          </div>
        </div>

        {/* Catalogo */}
        <div className="min-w-[200px]">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-red-300/60">
            Catálogo / Modelo
          </label>
          <select
            value={catalogo}
            onChange={(e) => handleCatalogoChange(e.target.value)}
            className="w-full rounded-xl border border-red-800 bg-red-900/50 px-4 py-3 text-base text-slate-100 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/30"
          >
            <option value="">Todos</option>
            {filtros.catalogos.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Seção */}
        <div className="min-w-[200px]">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-red-300/60">
            Seção
          </label>
          <select
            value={secao}
            onChange={(e) => handleSecaoChange(e.target.value)}
            className="w-full rounded-xl border border-red-800 bg-red-900/50 px-4 py-3 text-base text-slate-100 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/30"
          >
            <option value="">Todas</option>
            {filtros.secoes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Conjunto */}
        <div className="min-w-[200px]">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-red-300/60">
            Conjunto
          </label>
          <select
            value={conjunto}
            onChange={(e) => setConjunto(e.target.value)}
            className="w-full rounded-xl border border-red-800 bg-red-900/50 px-4 py-3 text-base text-slate-100 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/30"
          >
            <option value="">Todos</option>
            {filtros.conjuntos.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Tipo */}
        <div className="min-w-[150px]">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-red-300/60">
            Tipo
          </label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="w-full rounded-xl border border-red-800 bg-red-900/50 px-4 py-3 text-base text-slate-100 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/30"
          >
            <option value="">Todos</option>
            <option value="part">Peça</option>
            <option value="assembly">Conjunto</option>
          </select>
        </div>

        {/* Clear */}
        <button
          onClick={() => { setBusca(""); setCatalogo(""); setSecao(""); setConjunto(""); setTipo(""); }}
          className="rounded-xl border border-red-800 px-5 py-3 text-base text-red-300/70 transition hover:bg-red-800/50"
        >
          <i className="fas fa-times mr-2" /> Limpar
        </button>
      </div>

      {/* Table */}
      <div className="relative flex-1 overflow-auto rounded-2xl bg-red-950/80 shadow-lg">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-red-950/80">
            <i className="fas fa-spinner fa-spin text-3xl text-red-500" />
          </div>
        )}
        <table className="w-full text-left text-[15px]">
          <thead className="sticky top-0 z-[5] bg-red-900/80 text-xs uppercase tracking-wider text-red-300/60">
            <tr>
              <th className="px-5 py-4 font-semibold">Código</th>
              <th className="px-5 py-4 font-semibold">Nome da Peça</th>
              <th className="px-5 py-4 font-semibold">Catálogo</th>
              <th className="px-5 py-4 font-semibold">Seção</th>
              <th className="px-5 py-4 font-semibold">Conjunto</th>
              <th className="px-5 py-4 font-semibold text-center">Ref.</th>
              <th className="px-5 py-4 font-semibold text-center">Qtd</th>
              <th className="px-5 py-4 font-semibold text-center">Tipo</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="px-5 py-16 text-center text-red-400/50">
                  <i className="fas fa-search mb-3 text-4xl" />
                  <p className="text-base">Nenhuma peça encontrada</p>
                </td>
              </tr>
            )}
            {items.map((p, i) => (
              <tr
                key={`${p.codigo_peca}-${p.catalogo_nome}-${p.conjunto_nome}-${i}`}
                className="border-t border-red-800/40 transition hover:bg-red-900/40"
              >
                <td className="px-5 py-3 font-mono text-sm font-semibold text-orange-400">
                  {p.codigo_peca}
                </td>
                <td className="px-5 py-3 font-medium text-slate-200">{p.nome_peca}</td>
                <td className="px-5 py-3 text-sm text-slate-400">{p.catalogo_nome}</td>
                <td className="px-5 py-3 text-sm text-slate-400">{p.secao_nome}</td>
                <td className="px-5 py-3 text-sm text-slate-400">{p.conjunto_nome}</td>
                <td className="px-5 py-3 text-center text-sm text-slate-500">{p.referencia_desenho}</td>
                <td className="px-5 py-3 text-center text-base font-semibold text-slate-200">{p.quantidade}</td>
                <td className="px-5 py-3 text-center">
                  <span
                    className={`inline-block rounded-full px-3 py-1 text-xs font-bold uppercase ${
                      p.tipo_filho === "part"
                        ? "bg-blue-500/20 text-blue-400"
                        : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {p.tipo_filho === "part" ? "Peça" : "Conjunto"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-2xl bg-red-950/80 px-5 py-4 shadow-lg">
          <span className="text-sm text-red-300/60">
            Página {page} de {totalPages} ({total.toLocaleString("pt-BR")} resultados)
          </span>
          <div className="flex gap-1.5">
            <button
              disabled={page <= 1}
              onClick={() => setPage(1)}
              className="rounded-lg px-3.5 py-2 text-sm text-red-300/70 transition hover:bg-red-800/50 disabled:opacity-30"
            >
              <i className="fas fa-angle-double-left" />
            </button>
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded-lg px-3.5 py-2 text-sm text-red-300/70 transition hover:bg-red-800/50 disabled:opacity-30"
            >
              <i className="fas fa-angle-left" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p: number;
              if (totalPages <= 5) p = i + 1;
              else if (page <= 3) p = i + 1;
              else if (page >= totalPages - 2) p = totalPages - 4 + i;
              else p = page - 2 + i;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                    p === page
                      ? "bg-red-600 text-white"
                      : "text-red-300/70 hover:bg-red-800/50"
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="rounded-lg px-3.5 py-2 text-sm text-red-300/70 transition hover:bg-red-800/50 disabled:opacity-30"
            >
              <i className="fas fa-angle-right" />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
              className="rounded-lg px-3.5 py-2 text-sm text-red-300/70 transition hover:bg-red-800/50 disabled:opacity-30"
            >
              <i className="fas fa-angle-double-right" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
