'use client';
// Pergunta o que entra na impressão — a folha da requisição sempre vai, os
// anexos vêm todos marcados e é só desmarcar o que não quer. Ao confirmar,
// converte os anexos em folhas e devolve pro pai imprimir (requisição + anexos
// num documento só). Usado na capa do card E no modal completo.
import { useState } from 'react';
import { Printer, Check } from 'lucide-react';
import { anexosDaReq, type AnexoDaReq } from '@/lib/requisicoes/anexos';
import { folhasDosAnexos, type FolhaAnexo } from '@/lib/requisicoes/anexos-pdf';

interface Props {
  req: any;                                   // dados da requisição (com foto_nf, etc.)
  onFechar: () => void;
  onImprimir: (folhas: FolhaAnexo[]) => void; // pai dispara a impressão
}

export default function DialogoImprimirReq({ req, onFechar, onImprimir }: Props) {
  const disponiveis: AnexoDaReq[] = anexosDaReq(req);
  const [marcados, setMarcados] = useState<Record<string, boolean>>(
    Object.fromEntries(disponiveis.map(a => [a.field, true]))
  );
  const [preparando, setPreparando] = useState(false);

  const confirmar = async () => {
    const escolhidos = disponiveis.filter(a => marcados[a.field]);
    setPreparando(true);
    try {
      const { folhas, falhas } = escolhidos.length
        ? await folhasDosAnexos(escolhidos.map(a => ({ label: a.label, url: a.url })))
        : { folhas: [], falhas: [] };
      if (falhas.length) alert('Estes anexos ficaram de fora:\n\n' + falhas.join('\n'));
      onImprimir(folhas);
      onFechar();
    } catch (e: any) {
      alert('Erro ao preparar os anexos: ' + (e?.message || e));
    } finally {
      setPreparando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => { e.stopPropagation(); if (!preparando) onFechar(); }}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center gap-3">
          <Printer size={18} className="text-red-600" />
          <div className="flex-1">
            <div className="text-[15px] text-zinc-900">Imprimir requisição #{req.id}</div>
            <div className="text-[13px] text-zinc-500">Sai tudo num documento só, cada anexo numa folha.</div>
          </div>
        </div>

        <div className="px-6 py-4 space-y-2">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200">
            <Check size={16} className="text-emerald-600 shrink-0" />
            <span className="text-[14px] text-zinc-700 flex-1">Folha da requisição</span>
            <span className="text-[12px] text-zinc-400">sempre</span>
          </div>
          {disponiveis.length === 0 ? (
            <div className="text-[13px] text-zinc-400 px-1 py-1">Esta requisição não tem anexos.</div>
          ) : disponiveis.map(a => (
            <label key={a.field} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-zinc-200 cursor-pointer hover:bg-zinc-50">
              <input type="checkbox" checked={!!marcados[a.field]}
                onChange={e => setMarcados(m => ({ ...m, [a.field]: e.target.checked }))}
                className="w-4 h-4 accent-red-600" />
              <span className="text-[14px] text-zinc-700">{a.label}</span>
            </label>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-zinc-200 flex items-center gap-3">
          <div className="flex-1" />
          <button onClick={onFechar} disabled={preparando}
            className="px-5 py-2.5 rounded-xl border border-zinc-200 text-[14px] text-zinc-600 hover:bg-zinc-50 disabled:opacity-60">
            Cancelar
          </button>
          <button onClick={confirmar} disabled={preparando}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-red-600 text-white text-[14px] hover:bg-red-500 disabled:opacity-60">
            <Printer size={15} /> {preparando ? 'Preparando...' : 'Imprimir'}
          </button>
        </div>
      </div>
    </div>
  );
}
