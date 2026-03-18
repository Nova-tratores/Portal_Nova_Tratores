"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/ppv/api";
import { usePPV } from "@/lib/ppv/PPVContext";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editData?: { id: string; codigo: string; descricao: string; preco: number } | null;
}

export default function ModalProdutoManual({ open, onClose, onSaved, editData }: Props) {
  const { showToast } = usePPV();
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [preco, setPreco] = useState("0.00");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) {
      if (editData) {
        setCodigo(editData.codigo);
        setDescricao(editData.descricao);
        setPreco(String(editData.preco));
      } else {
        setCodigo("");
        setDescricao("");
        setPreco("0.00");
      }
    }
  }, [open, editData]);

  async function salvar() {
    if (!codigo.trim() || !descricao.trim()) {
      showToast("error", "Preencha código e descrição");
      return;
    }
    setSalvando(true);
    try {
      await api.salvarProdutoManual({
        id: editData?.id || "",
        codigo: codigo.trim(),
        descricao: descricao.trim(),
        preco: parseFloat(preco || "0"),
      });
      showToast("success", "Produto manual salvo com sucesso!");
      onSaved();
      onClose();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Erro ao salvar");
    }
    setSalvando(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-red-900/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex w-[500px] flex-col rounded-lg bg-[#FFFAF5] shadow-2xl">
        <div className="flex items-center justify-between rounded-t-lg border-b border-orange-200/60 bg-[#FFFAF5] px-10 py-5">
          <h2 className="text-xl font-bold text-slate-800">
            {editData ? "Editar Produto Manual" : "Novo Produto Manual"}
          </h2>
          <button onClick={onClose} className="border-none bg-transparent text-2xl text-slate-400 transition-colors hover:text-red-500">&times;</button>
        </div>
        <div className="bg-[#FFFAF5] px-10 py-7">
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-semibold text-slate-400">Código do Produto</label>
            <input type="text" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex: MAN-001" className="w-full rounded-lg border border-orange-200/60 p-3 font-[Poppins] text-[13px] focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100" />
          </div>
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-semibold text-slate-400">Descrição / Nome</label>
            <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Peça fabricada em oficina" className="w-full rounded-lg border border-orange-200/60 p-3 font-[Poppins] text-[13px] focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100" />
          </div>
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-semibold text-slate-400">Preço de Venda (R$)</label>
            <input type="number" step="0.01" value={preco} onChange={(e) => setPreco(e.target.value)} className="w-full rounded-lg border border-orange-200/60 p-3 font-[Poppins] text-[13px] focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100" />
          </div>
        </div>
        <div className="flex justify-end gap-4 rounded-b-lg border-t border-orange-200/60 bg-orange-50/50 px-10 py-4">
          <button onClick={onClose} className="rounded-[10px] border border-orange-200/60 bg-[#FFFAF5] px-5 py-3 text-[13px] font-semibold text-slate-400 transition-colors hover:border-red-600 hover:text-red-600">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="rounded-[10px] border-none bg-red-600 px-5 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50">
            {salvando ? "Salvando..." : "Salvar Produto"}
          </button>
        </div>
      </div>
    </div>
  );
}
