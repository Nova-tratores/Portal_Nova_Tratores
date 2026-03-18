'use client';
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const EMPRESAS = {
  NOVA: { nome: "NOVA TRATORES MÁQUINAS AGRÍCOLAS LTDA", endereco: "AVENIDA SÃO SEBASTIÃO, 1065 | Piraju - SP" },
  CASTRO: { nome: "CASTRO MÁQUINAS E PEÇAS AGRÍCOLAS LTDA", endereco: "RUA DOUTOR FARTURA, 140 | FARTURA - SP" }
};

export default function FormReq({ onSave }: { onSave: (data: any) => void }) {
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [veiculos, setVeiculos] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    titulo: '', tipo: '', solicitante: '', setor: '',
    data: new Date().toISOString().split('T')[0],
    empresa: '', endereco_empr: '', veiculo: '', hodometro: '',
    cliente: '', ordem_servico: '', fornecedor: '', obs: '',
    valor_cobrado_cliente: '', quem_ferramenta: '', Chassis_Modelo: '', status: 'pedido'
  });

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: users }, { data: veic }] = await Promise.all([
        supabase.from('req_usuarios').select('nome').order('nome'),
        supabase.from('SupaPlacas').select('IdPlaca, NumPlaca').order('NumPlaca'),
      ]);
      if (users) setUsuarios(users);
      if (veic) setVeiculos(veic);
    };
    fetchData();
  }, []);

  useEffect(() => {
    const config = formData.tipo === 'Frota-Veiculos' ? EMPRESAS.CASTRO : EMPRESAS.NOVA;
    setFormData(p => ({ ...p, empresa: config.nome, endereco_empr: config.endereco }));
  }, [formData.tipo]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  // Estilos atualizados: letras maiores e brancas
  const inputStyle = "w-full px-5 py-4 rounded-xl border border-zinc-200 bg-zinc-50 focus:border-red-500 focus:ring-4 focus:ring-red-500/20 outline-none transition-all text-lg font-medium text-zinc-900 placeholder:text-zinc-400";
  const labelStyle = "text-xs font-bold text-zinc-900 uppercase tracking-[0.2em] mb-2 block ml-1";

  return (
    <div className="max-w-4xl mx-auto">
      {/* Fundo alterado para escuro para suportar as letras brancas pedidas */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-lg p-8 md:p-12 text-zinc-900">
        <div className="mb-10">
          <h2 className="text-3xl font-black uppercase tracking-tighter text-zinc-900">Nova Requisição</h2>
          <p className="text-base text-zinc-500 mt-2">Preencha os dados técnicos abaixo para iniciar o processo.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <label className={labelStyle}>Título do Pedido</label>
              <input required placeholder="EX: COMPRA DE PEÇAS PARA TRATOR" onChange={e => setFormData({...formData, titulo: e.target.value.toUpperCase()})} className={inputStyle} />
            </div>
            <div>
              <label className={labelStyle}>Data</label>
              <input type="date" value={formData.data} onChange={e => setFormData({...formData, data: e.target.value})} className={inputStyle} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className={labelStyle}>Tipo</label>
              <select required onChange={e => setFormData({...formData, tipo: e.target.value})} className={inputStyle}>
                <option value="" className="bg-white">Selecione...</option>
                {["Peças", "Alimentação", "Trator-Loja", "Trator-Cliente", "Frota-Veiculos", "Serviço de Terceiros", "Almoxarifado", "Ferramenta"].map(t => <option key={t} value={t} className="bg-white">{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelStyle}>Solicitante</label>
              <select required onChange={e => setFormData({...formData, solicitante: e.target.value})} className={inputStyle}>
                <option value="" className="bg-white">Quem pede?</option>
                {usuarios.map(u => <option key={u.nome} value={u.nome} className="bg-white">{u.nome}</option>)}
              </select>
            </div>
            <div>
              <label className={labelStyle}>Setor Destino</label>
              <select required onChange={e => setFormData({...formData, setor: e.target.value})} className={inputStyle}>
                <option value="" className="bg-white">Selecione...</option>
                {["Trator-Loja", "Trator-Cliente", "Oficina", "Comercial"].map(s => <option key={s} value={s} className="bg-white">{s}</option>)}
              </select>
            </div>
          </div>

          {/* NOVO CAMPO: QUEM FERRAMENTA (Aparece apenas se tipo for Ferramenta) */}
          {formData.tipo === 'Ferramenta' && (
            <div className="p-8 bg-red-50 rounded-2xl border border-red-200">
              <label className={labelStyle}>Destinação da Ferramenta</label>
              <select 
                required 
                value={formData.quem_ferramenta}
                onChange={e => setFormData({...formData, quem_ferramenta: e.target.value})} 
                className={`${inputStyle} !border-red-300`}
              >
                <option value="" className="bg-white">Selecione o uso...</option>
                <option value="Uso Pessoal" className="bg-white">Uso Pessoal (Individual)</option>
                <option value="Geral" className="bg-white">Uso Geral (Oficina/Setor)</option>
              </select>
            </div>
          )}

          {/* FROTA-VEICULOS */}
          {formData.tipo === 'Frota-Veiculos' && (
            <div className="p-6 bg-red-50 rounded-2xl border border-red-200">
              <p className="text-xs font-black text-red-600 uppercase tracking-widest mb-4">Informacoes do Veiculo</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={labelStyle}>Veiculo / Placa</label>
                  <select required value={formData.veiculo} onChange={e => setFormData({...formData, veiculo: e.target.value})} className={`${inputStyle} !border-red-300`}>
                    <option value="" className="bg-white">Selecione o veiculo...</option>
                    {veiculos.map(v => <option key={v.IdPlaca} value={v.IdPlaca} className="bg-white">{v.NumPlaca}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelStyle}>Hodometro / Horimetro</label>
                  <input placeholder="Ex: 12.500 km" value={formData.hodometro} onChange={e => setFormData({...formData, hodometro: e.target.value})} className={`${inputStyle} !border-red-300`} />
                </div>
              </div>
            </div>
          )}

          {/* TRATOR-LOJA */}
          {formData.tipo === 'Trator-Loja' && (
            <div className="p-6 bg-zinc-100/30 rounded-2xl border border-zinc-300/50">
              <p className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-4">Informacoes do Trator (Loja)</p>
              <div>
                <label className={labelStyle}>Chassis / Modelo do Trator</label>
                <input placeholder="Ex: VALTRA BM110 - CHASSIS 123456" value={formData.Chassis_Modelo} onChange={e => setFormData({...formData, Chassis_Modelo: e.target.value.toUpperCase()})} className={inputStyle} />
              </div>
            </div>
          )}

          {/* TRATOR-CLIENTE */}
          {formData.tipo === 'Trator-Cliente' && (
            <div className="p-6 bg-amber-500/10 rounded-2xl border border-orange-500/20">
              <p className="text-xs font-black text-orange-400 uppercase tracking-widest mb-4">Informacoes do Cliente</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-bold text-orange-400 uppercase">Cliente</label>
                  <input onChange={e => setFormData({...formData, cliente: e.target.value.toUpperCase()})} className={`${inputStyle} !text-base border-orange-500/20`} />
                </div>
                <div>
                  <label className="text-xs font-bold text-orange-400 uppercase">O.S.</label>
                  <input onChange={e => setFormData({...formData, ordem_servico: e.target.value})} className={`${inputStyle} !text-base border-orange-500/20`} />
                </div>
                <div>
                  <label className="text-xs font-bold text-orange-400 uppercase">Chassis / Modelo do Trator</label>
                  <input placeholder="Ex: VALTRA BM110 - CHASSIS 123456" value={formData.Chassis_Modelo} onChange={e => setFormData({...formData, Chassis_Modelo: e.target.value.toUpperCase()})} className={`${inputStyle} !text-base border-orange-500/20`} />
                </div>
                <div>
                  <label className="text-xs font-bold text-orange-400 uppercase">Valor Cobrado do Cliente</label>
                  <input placeholder="0,00" onChange={e => setFormData({...formData, valor_cobrado_cliente: e.target.value})} className={`${inputStyle} !text-base border-orange-500/40 font-bold text-orange-400`} />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className={labelStyle}>Observações Técnicas</label>
            <textarea rows={4} onChange={e => setFormData({...formData, obs: e.target.value})} className={`${inputStyle} resize-none italic`} placeholder="Descreva os itens ou serviços necessários..." />
          </div>

          <button type="submit" className="w-full bg-white text-slate-900 font-black py-6 rounded-xl shadow-lg hover:bg-red-500 hover:text-white transition-all uppercase text-sm tracking-[0.4em]">
            Confirmar e Enviar Pedido
          </button>
        </form>
      </div>
    </div>
  );
}