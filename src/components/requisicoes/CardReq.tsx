'use client';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  FileText, Calendar, Layers, UserCircle,
  Truck, DollarSign, Tag, ClipboardList,
  Paperclip, X, Printer, Camera,
  Store, ArrowRight, Gauge,
  Receipt, Eye, ExternalLink, Car,
  Plus, CheckCheck, Building2, User, Cpu,
  Package, CreditCard, Upload
} from 'lucide-react';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxyIatVqhjdeBeo4PYNWr992vCsPpvEEjOxabWB7mz5JRJ7BroxnvR8CRIcXIgTfLSm/exec';
const DEPARTAMENTOS = ["Trator-Loja", "Trator-Cliente", "Oficina", "Comercial"];
const TIPOS_REQ = ["Peça", "Alimentação", "Ferramenta", "Serviço de Terceiros", "Almoxarifado", "Frota-Veículos", "Insumo Infra"];

type Aba = 'dados' | 'financeiro' | 'anexos';

export default function CardReq({ req, onUpdate, onPrint, dadosCompartilhados, aberto = false, onFechar }: { req: any, onUpdate: any, onPrint: any, dadosCompartilhados?: any, aberto?: boolean, onFechar?: () => void }) {
  const [modalAberto, setModalAberto] = useState(aberto);
  const [abaAtiva, setAbaAtiva] = useState<Aba>('dados');
  const [modalCotacaoAberto, setModalCotacaoAberto] = useState(false);
  const [localData, setLocalData] = useState(() => ({
    ...req,
    quem_ferramenta: req.quem_ferramenta || req.ferramenta_quem || ""
  }));
  const [cotacaoData, setCotacaoData] = useState<any>({});
  const [cotacaoCarregada, setCotacaoCarregada] = useState(false);
  const [fornecedoresVisiveis, setFornecedoresVisiveis] = useState(1);
  const [userEmail, setUserEmail] = useState('');
  const [uploading, setUploading] = useState<string | null>(null);

  const fornecedoresBanco = dadosCompartilhados?.fornecedores || [];
  const usuariosBanco = dadosCompartilhados?.usuarios || [];
  const veiculosBanco = dadosCompartilhados?.veiculos || [];

  const nomeExibicao = useMemo(() => {
    if (req.solicitante && req.solicitante.includes('@')) {
      const usuario = usuariosBanco.find((u: any) => u.email === req.solicitante.trim());
      return usuario?.nome || req.solicitante;
    }
    return req.solicitante;
  }, [req.solicitante, usuariosBanco]);

  const veiculoExibicao = useMemo(() => {
    if (req.veiculo && !isNaN(req.veiculo) && String(req.veiculo).length < 5) {
      const vei = veiculosBanco.find((v: any) => String(v.IdPlaca) === String(req.veiculo));
      return vei?.NumPlaca || req.veiculo;
    }
    return req.veiculo;
  }, [req.veiculo, veiculosBanco]);

  const veioDoApp = req.obs?.includes('[APPSHEET_ID:');

  // Busca email do usuário logado
  useEffect(() => {
    if (!modalAberto || userEmail) return;
    supabase.auth.getUser().then(({ data: { user }, error }) => {
      if (!error && user?.email) setUserEmail(user.email);
    }).catch(() => {});
  }, [modalAberto, userEmail]);

  // Sincroniza quando req muda externamente (realtime)
  useEffect(() => {
    setLocalData((prev: any) => ({
      ...prev,
      ...req,
      solicitante: nomeExibicao || req.solicitante,
      quem_ferramenta: req.quem_ferramenta || req.ferramenta_quem || prev.quem_ferramenta || ""
    }));
  }, [req.id, req.status, req.fornecedor, req.valor_despeza, req.numero_nota, req.foto_nf, req.boleto_fornecedor, req.recibo_fornecedor, nomeExibicao]);

  // Busca cotação quando necessário
  useEffect(() => {
    if ((!modalAberto && !modalCotacaoAberto) || cotacaoCarregada) return;
    supabase.from('req_cotacao').select('*').eq('id', req.id).single().then(({ data }) => {
      if (data) {
        setCotacaoData(data);
        let count = 1;
        for (let i = 2; i <= 5; i++) {
          if (data[`fornecedor${i}`]) count = i;
        }
        setFornecedoresVisiveis(count);
      }
      setCotacaoCarregada(true);
    });
  }, [modalAberto, modalCotacaoAberto, cotacaoCarregada, req.id]);

  // Data automática financeiro
  useEffect(() => {
    if (req.status === 'financeiro' && !req.enviado_financeiro_data) {
      const hoje = new Date().toISOString().split('T')[0];
      setLocalData((prev: any) => ({ ...prev, enviado_financeiro_data: hoje }));
      onUpdate(req.id, { enviado_financeiro_data: hoje });
    }
  }, [req.status, req.enviado_financeiro_data, req.id, onUpdate]);

  const persist = useCallback((name: string, value: any) => {
    setLocalData((prev: any) => ({ ...prev, [name]: value }));
    onUpdate(req.id, { [name]: value });
  }, [req.id, onUpdate]);

  const setField = useCallback((name: string, value: any) => {
    setLocalData((prev: any) => ({ ...prev, [name]: value }));
  }, []);

  const removerCotacao = (idx: number) => {
    if (confirm(`Remover o Fornecedor ${idx} e reorganizar a lista?`)) {
      const newData = { ...cotacaoData };
      for (let j = idx; j < 5; j++) {
        newData[`fornecedor${j}`] = newData[`fornecedor${j + 1}`] || '';
        newData[`servico_material${j}`] = newData[`servico_material${j + 1}`] || '';
        newData[`valor${j}`] = newData[`valor${j + 1}`] || '';
        newData[`obs${j}`] = newData[`obs${j + 1}`] || '';
      }
      newData.fornecedor5 = ''; newData.servico_material5 = ''; newData.valor5 = ''; newData.obs5 = '';
      setCotacaoData(newData);
      setFornecedoresVisiveis(prev => Math.max(1, prev - 1));
      supabase.from('req_cotacao').upsert({ id: req.id, ...newData });
    }
  };

  const salvarCotacao = async () => {
    const { error } = await supabase.from('req_cotacao').upsert({ id: req.id, ...cotacaoData });
    if (!error) alert("Mapa de Cotação atualizado!");
  };

  const getUrlAnexo = (caminho: string) => {
    if (!caminho) return null;
    if (caminho.startsWith('http')) return caminho;
    if (caminho.startsWith('SupaAtualizarReq_Images/')) return null;
    const { data } = supabase.storage.from('requisicoes').getPublicUrl(caminho);
    return data.publicUrl;
  };

  const abrirArquivoDrive = (caminho: string) => {
    const nomeArquivo = caminho.replace('SupaAtualizarReq_Images/', '');
    const novaAba = window.open('about:blank', '_blank');
    const callbackName = `_driveCb${Date.now()}`;
    (window as any)[callbackName] = (data: any) => {
      if (data.url && novaAba) { novaAba.location.href = data.url; }
      else { novaAba?.close(); alert('Arquivo não encontrado no Google Drive'); }
      delete (window as any)[callbackName]; script.remove();
    };
    const script = document.createElement('script');
    script.src = `${APPS_SCRIPT_URL}?name=${encodeURIComponent(nomeArquivo)}&callback=${callbackName}`;
    script.onerror = () => { novaAba?.close(); alert('Erro ao buscar arquivo no Google Drive'); delete (window as any)[callbackName]; script.remove(); };
    document.body.appendChild(script);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(fieldName);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${req.id}-${fieldName}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('requisicoes').upload(filePath, file);
      if (uploadError) throw uploadError;
      persist(fieldName, filePath);
      if (fieldName === 'foto_nf') persist('status', 'completa');
      alert('Arquivo enviado com sucesso!');
    } catch (error: any) {
      alert('Erro ao realizar upload: ' + error.message);
    } finally {
      setUploading(null);
    }
  };

  const handlePrint = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onPrint({ ...localData, solicitante: nomeExibicao, veiculo: veiculoExibicao, impresso_por: userEmail });
  };

  const fecharModal = () => {
    setModalAberto(false);
    onFechar?.();
  };

  // Estilos
  const inputBase = "w-full text-sm text-zinc-900 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 outline-none focus:border-red-500 focus:bg-zinc-50 transition-all placeholder:text-zinc-300";
  const selectBase = `${inputBase} [&>option]:text-black [&>option]:bg-white cursor-pointer`;
  const labelBase = "text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5";

  const abas: { id: Aba; label: string; icon: React.ReactNode }[] = [
    { id: 'dados', label: 'Dados', icon: <Package size={14} /> },
    { id: 'financeiro', label: 'Financeiro', icon: <CreditCard size={14} /> },
    { id: 'anexos', label: 'Anexos', icon: <Paperclip size={14} /> },
  ];

  const statusColors: Record<string, string> = {
    pedido: 'bg-red-500',
    completa: 'bg-cyan-500',
    aguardando: 'bg-orange-400',
    financeiro: 'bg-indigo-600',
  };

  return (
    <div className="font-montserrat">
      {/* MODAL COTAÇÃO */}
      {modalCotacaoAberto && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl shadow-lg border border-zinc-200">
            {/* Header cotação */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm px-6 py-4 border-b border-zinc-200 flex justify-between items-center z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-red-600 text-white flex items-center justify-center"><ClipboardList size={18}/></div>
                <div>
                  <h2 className="text-base font-semibold text-zinc-900">Mapa de Cotações</h2>
                  <p className="text-[11px] text-zinc-400">REQ #{req.id}</p>
                </div>
              </div>
              <button onClick={() => setModalCotacaoAberto(false)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-50 text-zinc-500 hover:bg-red-500 hover:text-white transition-all"><X size={16}/></button>
            </div>

            <div className="p-6 space-y-4">
              {[...Array(fornecedoresVisiveis)].map((_, i) => {
                const idx = i + 1;
                return (
                  <div key={idx} className="bg-zinc-50 border border-zinc-200 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] font-bold">{idx}</div>
                      <span className="text-xs font-semibold text-zinc-600">Fornecedor {idx}</span>
                      <button onClick={() => removerCotacao(idx)} className="ml-auto p-1.5 rounded-lg bg-zinc-50 text-zinc-400 hover:bg-red-500/20 hover:text-red-400 transition-all"><X size={12}/></button>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelBase}><Store size={11}/> Empresa</label>
                        <input value={cotacaoData[`fornecedor${idx}`] || ''} onChange={e => setCotacaoData({...cotacaoData, [`fornecedor${idx}`]: e.target.value.toUpperCase()})} className={inputBase} />
                      </div>
                      <div>
                        <label className={labelBase}><Layers size={11}/> Material</label>
                        <input value={cotacaoData[`servico_material${idx}`] || ''} onChange={e => setCotacaoData({...cotacaoData, [`servico_material${idx}`]: e.target.value.toUpperCase()})} className={inputBase} />
                      </div>
                      <div>
                        <label className={labelBase}><DollarSign size={11}/> Valor</label>
                        <input value={cotacaoData[`valor${idx}`] || ''} onChange={e => setCotacaoData({...cotacaoData, [`valor${idx}`]: e.target.value})} className={inputBase} placeholder="0,00" />
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex gap-3 pt-2">
                {fornecedoresVisiveis < 5 && (
                  <button onClick={() => setFornecedoresVisiveis(prev => prev + 1)} className="flex-1 border-2 border-dashed border-zinc-200 text-zinc-500 py-3 rounded-xl text-xs font-semibold uppercase tracking-wider hover:border-red-200 hover:text-red-600 transition-all flex items-center justify-center gap-2"><Plus size={14}/> Adicionar</button>
                )}
                <button onClick={salvarCotacao} className="flex-1 bg-red-600 text-white py-3 rounded-xl text-xs font-semibold uppercase tracking-wider hover:bg-red-500 transition-all flex items-center justify-center gap-2"><CheckCheck size={14}/> Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PRINCIPAL */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-lg border border-zinc-200 flex flex-col overflow-hidden">

            {/* HEADER */}
            <div className="px-6 py-4 border-b border-zinc-200 flex items-center gap-4 shrink-0">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-semibold ${veioDoApp ? 'bg-red-500/15 text-red-600' : 'bg-zinc-50 text-zinc-600'}`}>
                {req.id}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-zinc-900 truncate">{localData.titulo || 'Sem título'}</h2>
                  {veioDoApp && <span className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded font-bold shrink-0">APP</span>}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className={`w-2 h-2 rounded-full ${statusColors[req.status] || 'bg-slate-500'}`}></div>
                  <span className="text-[11px] text-zinc-400 uppercase tracking-wider">{req.status}</span>
                  {nomeExibicao && <span className="text-[11px] text-zinc-400">• {nomeExibicao}</span>}
                </div>
              </div>
              <button onClick={fecharModal} className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-50 text-zinc-500 hover:bg-red-500 hover:text-white transition-all shrink-0"><X size={16}/></button>
            </div>

            {/* TABS */}
            <div className="flex border-b border-zinc-200 px-6 shrink-0">
              {abas.map(aba => (
                <button
                  key={aba.id}
                  onClick={() => setAbaAtiva(aba.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all ${
                    abaAtiva === aba.id
                      ? 'border-red-500 text-red-600'
                      : 'border-transparent text-zinc-400 hover:text-zinc-600'
                  }`}
                >
                  {aba.icon} {aba.label}
                </button>
              ))}
            </div>

            {/* CONTEÚDO DAS ABAS */}
            <div className="flex-1 overflow-y-auto p-6">

              {/* ABA DADOS */}
              {abaAtiva === 'dados' && (
                <div className="space-y-5">
                  {/* Título + Data */}
                  <div className="grid grid-cols-[1fr_160px] gap-3">
                    <div>
                      <label className={labelBase}><Tag size={11}/> Título / Assunto</label>
                      <input value={localData.titulo || ""} onChange={e => setField('titulo', e.target.value)} onBlur={e => persist('titulo', e.target.value.toUpperCase())} className={inputBase} />
                    </div>
                    <div>
                      <label className={labelBase}><Calendar size={11}/> Data</label>
                      <input type="date" value={localData.data || ""} onChange={e => setField('data', e.target.value)} onBlur={e => persist('data', e.target.value)} className={inputBase} />
                    </div>
                  </div>

                  {/* Tipo + Solicitante + Setor */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={labelBase}><Layers size={11}/> Tipo</label>
                      <select value={localData.tipo || ""} onChange={e => persist('tipo', e.target.value)} className={selectBase}>
                        <option value="">Selecionar...</option>
                        {TIPOS_REQ.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelBase}><UserCircle size={11}/> Solicitante</label>
                      <select value={localData.solicitante || ""} onChange={e => persist('solicitante', e.target.value)} className={selectBase}>
                        <option value="">Selecionar...</option>
                        {usuariosBanco.map((u: any) => <option key={u.nome} value={u.nome}>{u.nome}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelBase}><Building2 size={11}/> Setor</label>
                      <select value={localData.setor || ""} onChange={e => persist('setor', e.target.value)} className={selectBase}>
                        <option value="">Selecionar...</option>
                        {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* CAMPOS CONDICIONAIS - Trator-Cliente */}
                  {localData.setor === "Trator-Cliente" && (
                    <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-4 space-y-3">
                      <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Cliente / Trator</span>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelBase}><User size={11}/> Cliente</label>
                          <input value={localData.cliente || ''} onChange={e => setField('cliente', e.target.value)} onBlur={e => persist('cliente', e.target.value.toUpperCase())} className={inputBase} />
                        </div>
                        <div>
                          <label className={labelBase}><ClipboardList size={11}/> Ordem de Serviço</label>
                          <input value={localData.ordem_servico || ''} onChange={e => setField('ordem_servico', e.target.value)} onBlur={e => persist('ordem_servico', e.target.value.toUpperCase())} className={inputBase} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelBase}><Cpu size={11}/> Chassis / Modelo</label>
                          <input value={localData.Chassis_Modelo || ''} onChange={e => setField('Chassis_Modelo', e.target.value)} onBlur={e => persist('Chassis_Modelo', e.target.value.toUpperCase())} className={inputBase} />
                        </div>
                        <div>
                          <label className={labelBase}><DollarSign size={11}/> Valor Cobrado</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 text-xs font-bold">R$</span>
                            <input value={localData.valor_cobrado_cliente || ''} onChange={e => setField('valor_cobrado_cliente', e.target.value)} onBlur={e => persist('valor_cobrado_cliente', e.target.value)} className={`${inputBase} pl-10 text-amber-300 font-semibold`} placeholder="0,00" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CAMPOS CONDICIONAIS - Trator-Loja */}
                  {localData.setor === "Trator-Loja" && (
                    <div className="border border-zinc-200 bg-transparent rounded-xl p-4">
                      <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-3">Trator (Loja)</span>
                      <div>
                        <label className={labelBase}><Cpu size={11}/> Chassis / Modelo</label>
                        <input value={localData.Chassis_Modelo || ''} onChange={e => setField('Chassis_Modelo', e.target.value)} onBlur={e => persist('Chassis_Modelo', e.target.value.toUpperCase())} className={inputBase} />
                      </div>
                    </div>
                  )}

                  {/* CAMPOS CONDICIONAIS - Ferramenta */}
                  {localData.tipo === 'Ferramenta' && (
                    <div className="border border-red-200 bg-red-500/5 rounded-xl p-4">
                      <span className="text-[11px] font-bold text-red-600 uppercase tracking-wider block mb-3">Ferramenta</span>
                      <label className={labelBase}><Tag size={11}/> Destinação</label>
                      <select value={localData.quem_ferramenta || ''} onChange={e => { setField('quem_ferramenta', e.target.value); persist('quem_ferramenta', e.target.value); }} className={selectBase}>
                        <option value="">Selecione...</option>
                        <option value="Uso Pessoal">Uso Pessoal (Individual)</option>
                        <option value="Geral">Uso Geral (Oficina/Setor)</option>
                      </select>
                    </div>
                  )}

                  {/* CAMPOS CONDICIONAIS - Frota */}
                  {localData.tipo === 'Frota-Veículos' && (
                    <div className="border border-red-200 bg-red-500/5 rounded-xl p-4">
                      <span className="text-[11px] font-bold text-red-600 uppercase tracking-wider block mb-3">Frota</span>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelBase}><Car size={11}/> Veículo / Placa</label>
                          <select value={String(localData.veiculo || '')} onChange={e => persist('veiculo', e.target.value)} className={selectBase}>
                            <option value="">Selecionar...</option>
                            {veiculosBanco.map((v: any) => <option key={v.IdPlaca} value={String(v.IdPlaca)}>{v.NumPlaca}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={labelBase}><Gauge size={11}/> Hodômetro</label>
                          <input value={localData.hodometro || ''} onChange={e => setField('hodometro', e.target.value)} onBlur={e => persist('hodometro', e.target.value)} className={inputBase} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Observações */}
                  <div>
                    <label className={labelBase}><FileText size={11}/> Observações</label>
                    <textarea value={localData.obs || ""} onChange={e => setField('obs', e.target.value)} onBlur={e => persist('obs', e.target.value)} className={`${inputBase} h-28 resize-none`} placeholder="Descrição detalhada, justificativa..." />
                  </div>
                </div>
              )}

              {/* ABA FINANCEIRO */}
              {abaAtiva === 'financeiro' && (
                <div className="space-y-5">
                  {/* Fornecedor + NF */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelBase}><Store size={11}/> Fornecedor</label>
                      <select value={localData.fornecedor || ''} onChange={e => persist('fornecedor', e.target.value)} className={selectBase}>
                        <option value="">Selecionar...</option>
                        {fornecedoresBanco.map((f: any, i: number) => <option key={`${f.nome}-${i}`} value={f.nome}>{f.nome}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelBase}><Receipt size={11}/> Nota Fiscal</label>
                      <input value={localData.numero_nota || ''} onChange={e => setField('numero_nota', e.target.value)} onBlur={e => persist('numero_nota', e.target.value)} className={inputBase} placeholder="Nº do documento" />
                    </div>
                  </div>

                  {/* Valor da Despesa - destaque */}
                  <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                    <label className="text-[11px] font-bold text-red-600 uppercase tracking-wider block mb-2">Custo Real da Despesa</label>
                    <div className="flex items-center gap-2">
                      <span className="text-red-600 text-lg font-bold">R$</span>
                      <input
                        value={localData.valor_despeza || ''}
                        onChange={e => setField('valor_despeza', e.target.value)}
                        onBlur={e => persist('valor_despeza', e.target.value)}
                        className="w-full text-3xl font-bold text-red-700 bg-transparent outline-none placeholder:text-red-300"
                        placeholder="0,00"
                      />
                    </div>
                  </div>

                  {/* Botão Cotação */}
                  <button
                    onClick={() => setModalCotacaoAberto(true)}
                    className="w-full flex items-center justify-between p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 hover:bg-red-50 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <ClipboardList size={18} />
                      <div className="text-left">
                        <span className="text-sm font-semibold block">Mapa de Cotações</span>
                        <span className="text-[11px] text-red-600/60">{fornecedoresVisiveis} fornecedor{fornecedoresVisiveis > 1 ? 'es' : ''} cadastrado{fornecedoresVisiveis > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </button>

                  {/* Datas */}
                  {req.enviado_financeiro_data && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                      <Calendar size={14} className="text-indigo-400" />
                      <span className="text-xs text-indigo-300">Enviado ao financeiro em: <strong>{new Date(req.enviado_financeiro_data + 'T12:00:00').toLocaleDateString('pt-BR')}</strong></span>
                    </div>
                  )}
                </div>
              )}

              {/* ABA ANEXOS */}
              {abaAtiva === 'anexos' && (
                <div className="space-y-3">
                  {[
                    { label: 'Nota Fiscal', field: 'foto_nf', icon: <Camera size={16}/>, color: 'blue' },
                    { label: 'Boleto', field: 'boleto_fornecedor', icon: <Receipt size={16}/>, color: 'purple' },
                    { label: 'Recibo / Outros', field: 'recibo_fornecedor', icon: <Paperclip size={16}/>, color: 'slate' },
                  ].map((item) => {
                    const fileUrl = getUrlAnexo(localData[item.field]);
                    const isDriveFile = localData[item.field]?.startsWith('SupaAtualizarReq_Images/');
                    const hasFile = !!localData[item.field];
                    const isUploading = uploading === item.field;

                    return (
                      <div key={item.field} className={`rounded-xl border transition-all ${hasFile ? 'border-green-500/20 bg-emerald-500/5' : 'border-zinc-200 bg-transparent'}`}>
                        <div className="flex items-center gap-3 p-4">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${hasFile ? 'bg-emerald-500/15 text-green-400' : 'bg-zinc-50 text-zinc-400'}`}>
                            {item.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-zinc-700 block">{item.label}</span>
                            <span className="text-[11px] text-zinc-400">
                              {isUploading ? 'Enviando...' : hasFile ? 'Arquivo anexado' : 'Nenhum arquivo'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {hasFile && (
                              isDriveFile ? (
                                <button onClick={() => abrirArquivoDrive(localData[item.field])} className="w-9 h-9 flex items-center justify-center rounded-lg bg-green-600 text-white hover:bg-emerald-500 transition-all" title="Abrir no Drive">
                                  <ExternalLink size={14} />
                                </button>
                              ) : (
                                <a href={fileUrl || '#'} target="_blank" rel="noopener noreferrer" className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-500 transition-all" title="Visualizar">
                                  <Eye size={14} />
                                </a>
                              )
                            )}
                            <label className={`w-9 h-9 flex items-center justify-center rounded-lg cursor-pointer transition-all ${hasFile ? 'bg-zinc-100 text-zinc-500 hover:bg-zinc-100' : 'bg-red-600 text-white hover:bg-red-500'}`} title="Upload">
                              <Upload size={14} />
                              <input type="file" className="hidden" onChange={e => handleFileUpload(e, item.field)} disabled={isUploading} />
                            </label>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* FOOTER - Ações */}
            <div className="px-6 py-4 border-t border-zinc-200 flex gap-3 shrink-0">
              <button onClick={handlePrint} className="flex-1 flex items-center justify-center gap-2 bg-zinc-50 hover:bg-red-600 text-zinc-600 hover:text-white py-3 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all">
                <Printer size={14} /> Imprimir
              </button>
              <button onClick={fecharModal} className="flex-1 flex items-center justify-center gap-2 bg-zinc-50 hover:bg-zinc-100 text-zinc-500 py-3 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
