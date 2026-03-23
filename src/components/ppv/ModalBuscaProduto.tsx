"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ProdutoBusca } from "@/lib/ppv/types";
import { api } from "@/lib/ppv/api";
import { usePPV } from "@/lib/ppv/PPVContext";

interface Props {
  open: boolean;
  mode: "main" | "modal" | "edit";
  onClose: () => void;
  onSelect: (codigo: string, descricao: string, preco: number, empresa?: string) => void;
  onEditManual?: (id: number, codigo: string, descricao: string, preco: number) => void;
}

export default function ModalBuscaProduto({ open, mode, onClose, onSelect, onEditManual }: Props) {
  const { cacheProduct, showToast } = usePPV();
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ProdutoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [mensagem, setMensagem] = useState("Digite para pesquisar produtos...");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setTermo("");
      setResultados([]);
      setMensagem("Digite para pesquisar produtos...");
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  const buscar = useCallback(async (searchTermo: string) => {
    if (searchTermo.trim().length < 2) {
      setResultados([]);
      setMensagem("Digite ao menos 2 caracteres...");
      return;
    }
    setBuscando(true);
    setMensagem("");
    try {
      const data = await api.buscarProdutos(searchTermo.trim());
      setResultados(data);
      data.forEach((p) => cacheProduct(p.codigo, p.descricao, p.preco, p.empresa));
      if (data.length === 0) setMensagem("Nenhum produto encontrado.");
    } catch {
      setMensagem("Erro na busca.");
    }
    setBuscando(false);
  }, [cacheProduct]);

  function handleChange(value: string) {
    setTermo(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => buscar(value), 400);
  }

  function handleClick(p: ProdutoBusca) {
    if (mode === "edit") {
      if (p.origem === "manuais" && p.id_manual) {
        onEditManual?.(p.id_manual, p.codigo, p.descricao, p.preco);
      } else {
        showToast("error", "Produtos de estoque nao podem ser editados manualmente.");
        return;
      }
    } else {
      onSelect(p.codigo, p.descricao, p.preco, p.empresa);
    }
    onClose();
  }

  function highlightMatch(text: string) {
    if (!termo.trim()) return text;
    const regex = new RegExp(`(${termo.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? <mark key={i} className="rounded bg-orange-200 px-0.5">{part}</mark> : part
    );
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-red-900/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex h-[550px] w-[800px] flex-col rounded-lg bg-[#FFFAF5] shadow-2xl">
        <div className="flex items-center justify-between rounded-t-lg border-b border-orange-200/60 bg-[#FFFAF5] px-10 py-5">
          <h2 className="text-xl font-bold text-slate-800">{mode === "edit" ? "Editar Produto Manual" : "Pesquisar Produto"}</h2>
          <button onClick={onClose} className="border-none bg-transparent text-2xl text-slate-400 transition-colors hover:text-red-500">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto bg-[#FFFAF5] px-10 py-7">
          <div className="relative mb-3">
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-red-400" />
            <input
              ref={inputRef}
              type="text"
              value={termo}
              onChange={(e) => handleChange(e.target.value)}
              onKeyUp={(e) => e.key === "Enter" && buscar(termo)}
              placeholder="Codigo ou nome do produto..."
              className="w-full rounded-lg border-2 border-red-500 py-4 pl-11 pr-20 text-base font-[Poppins] focus:outline-none focus:ring-2 focus:ring-red-200"
            />
            <button
              onClick={() => buscar(termo)}
              disabled={buscando || termo.trim().length < 2}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-red-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {buscando ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" /> : "Buscar"}
            </button>
          </div>

          {resultados.length > 0 && (
            <div className="mb-2 text-[11px] text-slate-400">
              {resultados.length} resultado{resultados.length !== 1 && "s"} encontrado{resultados.length !== 1 && "s"}
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-orange-200/60" style={{ maxHeight: 330, overflowY: "auto" }}>
            <table className="w-full border-collapse">
              <thead>
                <tr className="sticky top-0 z-10 bg-orange-50/50">
                  <th className="border-b border-orange-200/60 px-4 py-3 text-left text-[11px] font-bold uppercase text-slate-400">CODIGO</th>
                  <th className="border-b border-orange-200/60 px-4 py-3 text-left text-[11px] font-bold uppercase text-slate-400">DESCRICAO</th>
                  <th className="border-b border-orange-200/60 px-4 py-3 text-right text-[11px] font-bold uppercase text-slate-400">PRECO</th>
                  <th className="border-b border-orange-200/60 px-4 py-3 text-center text-[11px] font-bold uppercase text-slate-400">EMPRESA</th>
                  <th className="border-b border-orange-200/60 px-4 py-3 text-center text-[11px] font-bold uppercase text-slate-400">ORIGEM</th>
                </tr>
              </thead>
              <tbody>
                {buscando ? (
                  <tr><td colSpan={5} className="p-5 text-center">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-red-600" />
                    <span className="ml-2 text-sm text-slate-500">Buscando produtos...</span>
                  </td></tr>
                ) : resultados.length > 0 ? (
                  resultados.map((p, idx) => (
                    <tr key={idx} onClick={() => handleClick(p)} className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-orange-50">
                      <td className="px-4 py-3 text-[13px] font-bold text-slate-800">
                        {highlightMatch(p.codigo)}
                      </td>
                      <td className="max-w-[280px] px-4 py-3 text-[13px] text-slate-700">
                        <div className="truncate" title={p.descricao}>{highlightMatch(p.descricao)}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold text-slate-800">
                        R$ {p.preco.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {p.empresa ? (() => {
                          const isPrimario = p.empresa.toLowerCase().includes("primari");
                          const label = isPrimario ? "CASTRO" : "NOVA";
                          return (
                            <span className="rounded-full px-3 py-1.5 text-[13px] font-bold" style={{
                              background: isPrimario ? "#DBEAFE" : "#FEE2E2",
                              color: isPrimario ? "#2563EB" : "#DC2626",
                            }}>
                              {label}
                            </span>
                          );
                        })() : (
                          <span className="text-[12px] text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${p.origem === "manuais" ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"}`}>
                          {p.origem === "manuais" ? "MANUAL" : "ESTOQUE"}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={5} className="p-8 text-center">
                    <i className="fas fa-box-open mb-2 text-2xl text-slate-200" />
                    <div className="text-sm text-slate-400">{mensagem}</div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
