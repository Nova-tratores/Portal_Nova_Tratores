'use client';
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Store, Phone, Hash, FileText, CheckCircle2, 
  ArrowRight, Edit3, Trash2, X, Search, RefreshCw,
  Fingerprint 
} from 'lucide-react';

export default function FormFornecedor({ onSave }: { onSave: any }) {
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<any>(null);
  const [filtro, setFiltro] = useState('');

  const [formData, setFormData] = useState({
    nome: '',
    numero: '',
    'cpf/cnpj': '',
    descricao: ''
  });

  // 1. CARREGAR FORNECEDORES DO BANCO
  const carregarFornecedores = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('Fornecedores')
      .select('*')
      .order('nome', { ascending: true });
    
    if (!error && data) setFornecedores(data);
    setLoading(false);
  };

  useEffect(() => {
    carregarFornecedores();
  }, []);

  // 2. PREPARAR EDIÇÃO
  const iniciarEdicao = (forn: any) => {
    setEditando(forn);
    setFormData({
      nome: forn.nome || '',
      numero: forn.numero || '',
      'cpf/cnpj': forn['cpf/cnpj'] || '',
      descricao: forn.descricao || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelarEdicao = () => {
    setEditando(null);
    setFormData({ nome: '', numero: '', 'cpf/cnpj': '', descricao: '' });
  };

  // 3. EXCLUIR FORNECEDOR
  const excluirFornecedor = async (id: number) => {
    if (confirm("Tem certeza que deseja remover este fornecedor permanentemente?")) {
      const { error } = await supabase.from('Fornecedores').delete().eq('id', id);
      if (!error) carregarFornecedores();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value.toUpperCase() });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editando) {
      const { error } = await supabase
        .from('Fornecedores')
        .update(formData)
        .eq('id', editando.id);
      
      if (!error) {
        alert("Fornecedor atualizado com sucesso!");
        cancelarEdicao();
        carregarFornecedores();
      }
    } else {
      onSave(formData);
      setFormData({ nome: '', numero: '', 'cpf/cnpj': '', descricao: '' });
      setTimeout(carregarFornecedores, 500);
    }
  };

  const fornecedoresFiltrados = fornecedores.filter(f => 
    f.nome?.toLowerCase().includes(filtro.toLowerCase()) || 
    f['cpf/cnpj']?.includes(filtro)
  );

  // Design Tokens (Dark Mode)
  const labelStyle = "text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-3 block";
  const inputStyle = "w-full text-lg font-light text-zinc-900 outline-none bg-transparent placeholder:text-slate-700 transition-all";
  const cellStyle = "p-8 border-zinc-200 transition-all focus-within:bg-transparent";

  return (
    <div className="space-y-8 animate-in fade-in duration-700 text-zinc-900">
      
      {/* FORMULÁRIO DE CADASTRO / EDIÇÃO */}
      <div className="bg-white border border-zinc-200 rounded-[3.5rem] overflow-hidden shadow-lg">
        <div className="p-12 border-b border-zinc-200 flex justify-between items-center bg-zinc-50">
          <div>
            <h2 className="text-3xl font-normal text-zinc-900 tracking-tighter uppercase">
              {editando ? 'Editar Fornecedor' : 'Novo Fornecedor'}
            </h2>
            <p className="text-[10px] text-zinc-500 uppercase tracking-[0.4em] mt-2">
              {editando ? `ID: ${editando.id} • Gestão de Cadastro` : 'Homologação de Parceiros Industriais'}
            </p>
          </div>
          <div className={`w-16 h-16 rounded-3xl bg-zinc-50 border border-zinc-200 flex items-center justify-center shadow-sm transition-colors ${editando ? 'text-red-600 border-red-200' : 'text-zinc-300'}`}>
            {editando ? <Edit3 size={32} strokeWidth={1.5} /> : <Store size={32} strokeWidth={1.5} />}
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 border border-zinc-200 rounded-[2.5rem] overflow-hidden bg-zinc-100">
            <div className={`${cellStyle} border-b md:border-r`}>
              <label className={labelStyle}>Razão Social / Nome</label>
              <input name="nome" required value={formData.nome} onChange={handleChange} className={inputStyle} placeholder="DIGITE O NOME..." />
            </div>

            <div className={`${cellStyle} border-b`}>
              <label className={labelStyle}>Documento (CNPJ/CPF)</label>
              <input name="cpf/cnpj" required value={formData['cpf/cnpj']} onChange={handleChange} className={inputStyle} placeholder="00.000.000/0001-00" />
            </div>

            <div className={`${cellStyle} md:border-r`}>
              <label className={labelStyle}>Contato / WhatsApp</label>
              <input name="numero" required value={formData.numero} onChange={handleChange} className={inputStyle} placeholder="(14) 00000-0000" />
            </div>

            <div className={cellStyle}>
              <label className={labelStyle}>Descrição de Serviço</label>
              <input name="descricao" value={formData.descricao} onChange={handleChange} className={inputStyle} placeholder="EX: PEÇAS AGRÍCOLAS" />
            </div>
          </div>

          <div className="p-8 mt-4 flex flex-col md:flex-row items-center justify-center gap-4">
            {editando && (
              <button 
                type="button" 
                onClick={cancelarEdicao}
                className="group flex items-center gap-4 bg-zinc-50 border border-zinc-200 text-zinc-500 px-10 py-6 rounded-full font-light uppercase text-[11px] tracking-[0.5em] hover:bg-zinc-100 transition-all"
              >
                <X size={18} /> Cancelar
              </button>
            )}
            <button 
              type="submit"
              className={`group flex items-center gap-6 ${editando ? 'bg-red-600' : 'bg-white text-slate-950'} px-16 py-6 rounded-full font-bold uppercase text-[11px] tracking-[0.5em] hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] transition-all duration-500 transform active:scale-95`}
            >
              <CheckCircle2 size={18} className={editando ? "text-zinc-900" : "text-red-600"} /> 
              {editando ? 'Salvar Alterações' : 'Finalizar Cadastro'}
              <ArrowRight size={14} className="opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-500" />
            </button>
          </div>
        </form>
      </div>

      {/* LISTA DE FORNECEDORES JÁ CADASTRADOS */}
      <div className="bg-white border border-zinc-200 rounded-[3.5rem] overflow-hidden shadow-xl">
        <div className="p-10 border-b border-zinc-200 flex flex-col md:flex-row justify-between items-center gap-6 bg-zinc-50/30">
          <div className="flex items-center gap-4">
            <h3 className="text-xl font-normal text-zinc-900 uppercase tracking-tighter">Parceiros Ativos</h3>
            <span className="bg-red-50 text-red-600 text-[10px] font-bold px-3 py-1 rounded-full border border-red-200">{fornecedores.length}</span>
          </div>
          
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-300" size={16} />
            <input 
              type="text" 
              placeholder="PESQUISAR..." 
              value={filtro}
              onChange={e => setFiltro(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-zinc-500 border border-zinc-200 rounded-2xl text-xs text-zinc-900 outline-none focus:border-red-500 transition-all"
            />
          </div>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {loading ? (
              <div className="col-span-full py-20 flex flex-col items-center justify-center text-zinc-300 gap-4">
                <RefreshCw size={32} className="animate-spin" />
                <p className="text-[10px] uppercase tracking-[0.3em]">Sincronizando Banco...</p>
              </div>
            ) : fornecedoresFiltrados.length > 0 ? (
              fornecedoresFiltrados.map((forn) => (
                <div key={forn.id} className="group p-6 bg-zinc-50/40 border border-zinc-200 rounded-[2rem] hover:bg-zinc-50 hover:border-red-200 transition-all duration-300">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-zinc-400 group-hover:text-red-600 transition-colors">
                      <Store size={20} strokeWidth={1.5} />
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                      <button onClick={() => iniciarEdicao(forn)} className="p-2 bg-white border border-zinc-200 text-zinc-500 hover:text-red-600 rounded-lg transition-colors"><Edit3 size={14}/></button>
                      <button onClick={() => excluirFornecedor(forn.id)} className="p-2 bg-white border border-zinc-200 text-zinc-500 hover:text-red-400 rounded-lg transition-colors"><Trash2 size={14}/></button>
                    </div>
                  </div>
                  
                  <h4 className="text-sm font-bold text-zinc-900 uppercase mb-1 truncate">{forn.nome}</h4>
                  <p className="text-[10px] text-zinc-400 font-medium mb-3 uppercase tracking-tighter truncate">{forn.descricao || 'Sem descrição'}</p>
                  
                  <div className="space-y-2 pt-3 border-t border-zinc-200">
                    <div className="flex items-center gap-2 text-zinc-500">
                      <Phone size={10} className="text-red-500/50" />
                      <span className="text-[10px] font-bold">{forn.numero || 'NÃO INFORMADO'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-300">
                      <Fingerprint size={10} />
                      <span className="text-[10px] font-medium">{forn['cpf/cnpj'] || '---'}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-20 text-center">
                <p className="text-[10px] text-zinc-300 uppercase tracking-[0.5em]">Nenhum registro encontrado</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 text-center">
        <p className="text-[8px] text-zinc-300 font-bold uppercase tracking-[0.5em]">Sincronização via Supabase Realtime • Nova Tratores v3.6</p>
      </div>
    </div>
  );
}