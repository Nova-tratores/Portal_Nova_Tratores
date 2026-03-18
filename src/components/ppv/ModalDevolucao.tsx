"use client";

import { useState, useEffect } from "react";

interface Props {
  open: boolean;
  produto: { codigo: string; descricao: string; preco: number; max: number } | null;
  onClose: () => void;
  onConfirm: (quantidade: number) => void;
  confirmando?: boolean;
}

export default function ModalDevolucao({ open, produto, onClose, onConfirm, confirmando }: Props) {
  const [qtd, setQtd] = useState(1);
  const max = produto?.max || 1;

  useEffect(() => {
    if (open) setQtd(1);
  }, [open]);

  function adj(val: number) {
    const novo = qtd + val;
    if (novo >= 0.5 && novo <= max) setQtd(novo);
  }

  if (!open || !produto) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-red-900/50">
      <div className="w-[400px] rounded-xl bg-[#FFFAF5] p-8 text-center shadow-2xl">
        <h3 className="mb-4 text-lg font-bold text-slate-800">Devolução de Item</h3>
        <p className="mb-5 text-xs text-slate-400">{produto.descricao}</p>

        <div className="mb-5 flex items-center justify-center gap-5">
          <button onClick={() => adj(-0.5)} className="flex h-10 w-10 items-center justify-center rounded-full border border-orange-200/60 bg-[#FFFAF5] text-lg font-semibold text-slate-400 transition-colors hover:border-red-600 hover:text-red-600">-</button>
          <span className="text-[32px] font-bold text-red-600">{qtd % 1 === 0 ? qtd : qtd.toFixed(1)}</span>
          <button onClick={() => adj(0.5)} className="flex h-10 w-10 items-center justify-center rounded-full border border-orange-200/60 bg-[#FFFAF5] text-lg font-semibold text-slate-400 transition-colors hover:border-red-600 hover:text-red-600">+</button>
        </div>

        <input
          type="range"
          min={0.5}
          max={max}
          step={0.5}
          value={qtd}
          onChange={(e) => setQtd(parseFloat(e.target.value))}
          className="mb-2.5 w-full accent-red-600"
        />
        <div className="mb-6 flex justify-between">
          <span className="text-[11px] text-slate-400">Máx: {max}</span>
          <span onClick={() => setQtd(max)} className="cursor-pointer text-[11px] font-bold text-red-600">Devolver Tudo</span>
        </div>

        <div className="flex gap-2.5">
          <button onClick={onClose} className="flex-1 rounded-[10px] border border-orange-200/60 bg-[#FFFAF5] px-5 py-3 text-[13px] font-semibold text-slate-400 transition-colors hover:border-red-600 hover:text-red-600">Cancelar</button>
          <button onClick={() => onConfirm(qtd)} disabled={confirmando} className="flex-1 rounded-[10px] border-none bg-red-600 px-5 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50">
            {confirmando ? <i className="fas fa-spinner fa-spin" /> : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
