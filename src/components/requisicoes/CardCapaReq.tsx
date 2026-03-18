'use client';
import React, { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  Calendar, UserCircle, Briefcase,
  HardHat, ClipboardList, Printer, Trash2,
  Receipt, Paperclip, Building2, Tag, BadgeCheck
} from 'lucide-react';

// Carrega CardReq completo só quando o modal abre
const CardReq = dynamic(() => import('./CardReq'), { ssr: false });

export default function CardCapaReq({ req, onUpdate, onPrint, dadosCompartilhados }: any) {
  const [modalAberto, setModalAberto] = useState(false);

  const veioDoApp = req.obs?.includes('[APPSHEET_ID:');

  // Traduz email->nome usando dados locais
  const nomeExibicao = useMemo(() => {
    const usuarios = dadosCompartilhados?.usuarios || [];
    if (req.solicitante && req.solicitante.includes('@')) {
      const usuario = usuarios.find((u: any) => u.email === req.solicitante.trim());
      return usuario?.nome || req.solicitante;
    }
    return req.solicitante;
  }, [req.solicitante, dadosCompartilhados?.usuarios]);

  const handleTrash = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Mover esta requisição para a lixeira?")) {
      onUpdate(req.id, { status: 'lixeira' });
    }
  };

  const handlePrintClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPrint({ ...req, solicitante: nomeExibicao, impresso_por: 'MANUAL' });
  };

  return (
    <>
      {/* CAPA DO CARD NO KANBAN - LEVE */}
      <div
        draggable
        onDragStart={(e) => e.dataTransfer.setData("idRequisicao", req.id.toString())}
        onClick={() => setModalAberto(true)}
        className={`bg-white border rounded-2xl p-6 hover:border-red-500 hover:shadow-lg transition-all cursor-grab group mb-5 active:cursor-grabbing border-l-[6px] relative overflow-hidden ${veioDoApp ? 'border-red-500 border-l-blue-600 shadow-md shadow-blue-900/10' : 'border-zinc-200 border-l-zinc-400'}`}
      >
        {veioDoApp && (
          <div className="absolute top-0 left-0 bg-red-600 text-white text-xs font-black px-3 py-1 rounded-br-xl flex items-center gap-1 uppercase tracking-tighter z-10">
            <HardHat size={10} /> TÉCNICO (APP)
          </div>
        )}

        <div className="absolute top-6 right-6 flex gap-2">
          <button onClick={(e) => { e.stopPropagation(); setModalAberto(true); }} className="p-3 rounded-xl bg-zinc-100 text-red-600 hover:bg-red-600 hover:text-white transition-all opacity-0 group-hover:opacity-100" title="Mapa de Cotações"><ClipboardList size={16} /></button>
          <button onClick={handlePrintClick} className="p-3 rounded-xl bg-zinc-100 text-zinc-500 hover:bg-red-600 hover:text-white transition-all opacity-0 group-hover:opacity-100"><Printer size={16} /></button>
        </div>

        <button onClick={handleTrash} className="absolute bottom-6 right-6 p-3 rounded-xl bg-zinc-100 text-zinc-500 hover:bg-red-600 hover:text-white transition-all opacity-0 group-hover:opacity-100"><Trash2 size={16} /></button>

        <div className="flex items-start gap-4 mb-5 mt-2">
          <div className={`min-w-[50px] h-[50px] rounded-xl flex items-center justify-center ${veioDoApp ? 'bg-red-500/15 text-red-600' : 'bg-zinc-50 text-zinc-500'}`}>
            <span className="text-lg font-light tracking-tighter">{req.id}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-red-600 uppercase tracking-[0.2em] bg-red-50 px-2 py-0.5 rounded-md self-start">{req.tipo || req.ReqTipo}</span>
            <h4 className="text-[15px] font-normal text-zinc-700 leading-tight group-hover:text-red-600 transition-colors pr-8 line-clamp-2">{req.titulo}</h4>
          </div>
        </div>

        <div className="space-y-3 border-t border-zinc-200 pt-5 text-zinc-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-normal uppercase tracking-widest flex items-center gap-2">
              <UserCircle size={12} className="text-zinc-400" /> Solicitante:
            </span>
            <span className="text-xs font-medium text-zinc-600 truncate max-w-[180px]">{nomeExibicao}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-normal uppercase tracking-widest flex items-center gap-2">
              <Calendar size={12} className="text-zinc-400" /> Data:
            </span>
            <span className="text-xs font-medium text-zinc-600">{req.data ? new Date(req.data + 'T12:00:00').toLocaleDateString('pt-BR') : '---'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-normal uppercase tracking-widest flex items-center gap-2">
              <Building2 size={12} className="text-zinc-400" /> Setor:
            </span>
            <span className="text-xs font-medium text-zinc-600 truncate max-w-[180px]">{req.setor || req.ReqQuem || '---'}</span>
          </div>
          {(req.tipo === 'Ferramenta' || req.ReqTipo === 'Ferramenta') && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-normal uppercase tracking-widest flex items-center gap-2">
                <Tag size={12} className="text-zinc-400" /> Destinação:
              </span>
              <span className="text-xs font-medium text-zinc-600 truncate max-w-[180px]">{req.quem_ferramenta || req.ferramenta_quem || '---'}</span>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-start items-center gap-3">
          <div className="text-[18px] font-bold text-zinc-900 tracking-tighter"><span className="text-xs text-zinc-400 mr-1 italic font-normal">R$</span>{req.valor_despeza || '0,00'}</div>
          {(req.foto_nf || req.recibo_fornecedor) && <div className="flex gap-1 ml-auto">{req.foto_nf && <Receipt size={14} className="text-red-600" />}{req.recibo_fornecedor && <Paperclip size={14} className="text-zinc-400" />}</div>}
        </div>
      </div>

      {/* CardReq COMPLETO - só monta quando abre o modal */}
      {modalAberto && (
        <CardReq
          req={req}
          onUpdate={onUpdate}
          onPrint={onPrint}
          dadosCompartilhados={dadosCompartilhados}
          aberto={true}
          onFechar={() => setModalAberto(false)}
        />
      )}
    </>
  );
}
