'use client';
import { useState, useEffect } from 'react';
import { Car, Save, X, Loader2, Hash } from 'lucide-react';

export default function FormVeiculo({ veiculoParaEditar, onSave, onCancel }: any) {
  const [numPlaca, setNumPlaca] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (veiculoParaEditar) {
      setNumPlaca(veiculoParaEditar.NumPlaca || '');
    }
  }, [veiculoParaEditar]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await onSave({ NumPlaca: numPlaca });
    setLoading(false);
  };

  const inputStyle = "w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-5 py-4 text-zinc-900 outline-none focus:border-red-500 transition-all placeholder:text-zinc-400";
  const labelStyle = "text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-2 mb-2 flex items-center gap-2";

  return (
    <div className="p-10">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tighter text-zinc-900">
            {veiculoParaEditar ? 'Editar Veículo' : 'Novo Veículo'}
          </h2>
          <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest">Gestão de Placas da Frota</p>
        </div>
        <button type="button" onClick={onCancel} className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-500 hover:bg-red-500 hover:text-white transition-all">
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-zinc-50 p-8 rounded-[2.5rem] border border-zinc-200">
          <label className={labelStyle}><Hash size={12}/> Identificação / Placa</label>
          <input 
            required 
            value={numPlaca} 
            onChange={e => setNumPlaca(e.target.value.toUpperCase())} 
            placeholder="Ex: SAVEIRO - DLZ1967" 
            className={inputStyle} 
          />
        </div>

        <button type="submit" disabled={loading} className="w-full bg-red-600 hover:bg-red-500 disabled:bg-zinc-100 text-zinc-900 py-5 rounded-3xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 shadow-xl shadow-blue-900/20 transition-all mt-6">
          {loading ? <Loader2 className="animate-spin" /> : <Save size={18} />}
          {veiculoParaEditar ? 'Atualizar Placa' : 'Cadastrar Veículo'}
        </button>
      </form>
    </div>
  );
}