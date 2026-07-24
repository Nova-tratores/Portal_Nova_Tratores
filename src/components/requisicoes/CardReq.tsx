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
  Package, CreditCard, Upload, Check, Lock, ShieldCheck, ShieldAlert, Clock, FolderOpen, Link2, ChevronDown
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { isValorAlto, buscarAutorizacaoAtiva, criarPedidoPermissao, consumirAutorizacao, parseValorBR, LIMITE_BLOQUEIO, type Autorizacao } from '@/lib/requisicoes/autorizacao';
import HistoricoModal from './HistoricoModal';
import RecorteAnexo from './RecorteAnexo';
import DialogoImprimirReq from './DialogoImprimirReq';
import { anexosDaReq, anexosNoDrive as anexosNoDriveDe } from '@/lib/requisicoes/anexos';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxyIatVqhjdeBeo4PYNWr992vCsPpvEEjOxabWB7mz5JRJ7BroxnvR8CRIcXIgTfLSm/exec';
const DEPARTAMENTOS = ["Trator-Loja", "Trator-Cliente", "Oficina", "Comercial"];
const TIPOS_REQ = ["Peças", "Alimentação", "Ferramenta", "Serviço de Terceiros", "Almoxarifado", "Insumo Infra", "Veicular Abastecimento", "Veicular Manutenção", "Trator Abastecimento", "Quadri Abastecimento", "Hospedagem"];

function formatarMoeda(valor: string): string {
  const nums = valor.replace(/\D/g, '');
  if (!nums) return '';
  const centavos = parseInt(nums, 10);
  return (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseMoeda(valorFmt: string): string {
  if (!valorFmt) return '';
  return valorFmt.replace(/\./g, '').replace(',', '.');
}

export default function CardReq({ req, onUpdate, onPrint, dadosCompartilhados, aberto = false, onFechar, podeEditar = true, grupos = [], usuarioAtual = '', onGruposChange, onExpandirGrupo }: { req: any, onUpdate: any, onPrint: any, dadosCompartilhados?: any, aberto?: boolean, onFechar?: () => void, podeEditar?: boolean, grupos?: any[], usuarioAtual?: string, onGruposChange?: () => void, onExpandirGrupo?: (id: number) => void }) {
  const [modalAberto, setModalAberto] = useState(aberto);
  const [modalCotacaoAberto, setModalCotacaoAberto] = useState(false);
  const [histAberto, setHistAberto] = useState(false);

  // ── Bloqueio de valor alto (precisa de permissão de Dev) ──
  const { userProfile } = useAuth();
  const { isDev } = usePermissoes(userProfile?.id);
  const [autoriz, setAutoriz] = useState<Autorizacao | null>(null);
  const [pedirOpen, setPedirOpen] = useState(false);
  const [motivoPedido, setMotivoPedido] = useState('');
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  const valorAlto = isValorAlto(req);
  const bloqueada = valorAlto && !isDev && !autoriz;

  useEffect(() => {
    if (!valorAlto || isDev) { setAutoriz(null); return; }
    let ativo = true;
    buscarAutorizacaoAtiva(req.id).then(a => { if (ativo) setAutoriz(a); });
    return () => { ativo = false; };
  }, [req.id, valorAlto, isDev]);
  const [localData, setLocalData] = useState(() => ({
    ...req,
    quem_ferramenta: req.quem_ferramenta || req.ferramenta_quem || ""
  }));
  const [cotacaoData, setCotacaoData] = useState<any>({});
  const [cotacaoCarregada, setCotacaoCarregada] = useState(false);
  const [fornecedoresVisiveis, setFornecedoresVisiveis] = useState(1);
  const [userEmail, setUserEmail] = useState('');
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadOk, setUploadOk] = useState<string | null>(null);
  const [ordensAbertas, setOrdensAbertas] = useState<any[]>([]);
  const [osBusca, setOsBusca] = useState('');
  const [osDropdownOpen, setOsDropdownOpen] = useState(false);
  const osDropdownRef = useRef<HTMLDivElement>(null);
  const [fornBusca, setFornBusca] = useState('');
  const [fornDropdownOpen, setFornDropdownOpen] = useState(false);
  const fornDropdownRef = useRef<HTMLDivElement>(null);
  const [cliBusca, setCliBusca] = useState('');
  const [cliDropdownOpen, setCliDropdownOpen] = useState(false);
  const [cliResultados, setCliResultados] = useState<{ cnpj_cpf: string; nome_fantasia: string; razao_social: string; cidade: string }[]>([]);
  const cliDropdownRef = useRef<HTMLDivElement>(null);
  const [projBusca, setProjBusca] = useState('');
  const [projDropdownOpen, setProjDropdownOpen] = useState(false);
  const [projResultados, setProjResultados] = useState<{ codigo: number; nome: string; empresa: string }[]>([]);
  const projDropdownRef = useRef<HTMLDivElement>(null);

  // Campos monetários formatados
  const [valorDespesaFmt, setValorDespesaFmt] = useState(() => {
    const v = req.valor_despeza;
    if (!v) return '';
    const n = parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });
  const [valorCobradoFmt, setValorCobradoFmt] = useState(() => {
    const v = req.valor_cobrado_cliente;
    if (!v) return '';
    const n = parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });

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

  useEffect(() => {
    if (!modalAberto || userEmail) return;
    supabase.auth.getUser().then(({ data: { user }, error }) => {
      if (!error && user?.email) setUserEmail(user.email);
    }).catch(() => {});
  }, [modalAberto, userEmail]);

  useEffect(() => {
    if (!modalAberto || ordensAbertas.length > 0) return;
    supabase.from('Ordem_Servico').select('Id_Ordem, Os_Cliente, Os_Tecnico, Status')
      .not('Status', 'in', '("Concluída","Cancelada")')
      .order('Id_Ordem', { ascending: false })
      .then(({ data }) => { if (data) setOrdensAbertas(data); });
  }, [modalAberto, ordensAbertas.length]);

  useEffect(() => {
    if (req.fornecedor && !fornBusca) setFornBusca(req.fornecedor);
  }, [req.fornecedor]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (osDropdownRef.current && !osDropdownRef.current.contains(e.target as Node)) setOsDropdownOpen(false);
      if (fornDropdownRef.current && !fornDropdownRef.current.contains(e.target as Node)) setFornDropdownOpen(false);
      if (cliDropdownRef.current && !cliDropdownRef.current.contains(e.target as Node)) setCliDropdownOpen(false);
      if (projDropdownRef.current && !projDropdownRef.current.contains(e.target as Node)) setProjDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (cliBusca.trim().length < 2) { setCliResultados([]); return; }
    const timer = setTimeout(async () => {
      const termo = cliBusca.trim();
      const { data } = await supabase
        .from('portal_nt_clientes_PRINCIPAL')
        .select('cnpj_cpf, nome_fantasia, razao_social, cidade')
        .or(`nome_fantasia.ilike.%${termo}%,razao_social.ilike.%${termo}%,cnpj_cpf.ilike.%${termo}%`)
        .limit(20);
      const seen = new Set<string>();
      setCliResultados((data || []).filter(c => {
        if (!c.cnpj_cpf || seen.has(c.cnpj_cpf)) return false;
        seen.add(c.cnpj_cpf);
        return true;
      }));
    }, 300);
    return () => clearTimeout(timer);
  }, [cliBusca]);

  useEffect(() => {
    if (projBusca.trim().length < 2) { setProjResultados([]); return; }
    const timer = setTimeout(async () => {
      const termo = projBusca.trim();
      const { data } = await supabase
        .from('portal_nt_projetos_PRINCIPAL')
        .select('codigo, nome, empresa')
        .ilike('nome', `%${termo}%`)
        .limit(15);
      setProjResultados(data || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [projBusca]);

  useEffect(() => {
    setLocalData((prev: any) => ({
      ...prev,
      ...req,
      solicitante: nomeExibicao || req.solicitante,
      quem_ferramenta: req.quem_ferramenta || req.ferramenta_quem || prev.quem_ferramenta || ""
    }));
  }, [req.id, req.status, req.fornecedor, req.valor_despeza, req.numero_nota, req.foto_nf, req.boleto_fornecedor, req.recibo_fornecedor, nomeExibicao]);

  useEffect(() => {
    if (!modalAberto && !modalCotacaoAberto) return;
    if (cotacaoCarregada) return;
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

  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  useEffect(() => {
    if (req.status === 'financeiro' && !req.enviado_financeiro_data) {
      const agora = new Date().toISOString();
      setLocalData((prev: any) => ({ ...prev, enviado_financeiro_data: agora }));
      onUpdateRef.current(req.id, { enviado_financeiro_data: agora });
    }
  }, [req.status, req.enviado_financeiro_data, req.id]);

  const persist = useCallback((name: string, value: any) => {
    // Requisição de valor alto bloqueada: abre o pedido de permissão em vez de gravar
    if (bloqueada) { setPedirOpen(true); return; }
    setLocalData((prev: any) => {
      if (prev[name] === value) return prev;
      return { ...prev, [name]: value };
    });
    if (req[name] === value) return;
    onUpdate(req.id, { [name]: value });
    // Permissão concedida vale para UMA alteração: consome e volta a bloquear
    if (autoriz && valorAlto && !isDev) {
      consumirAutorizacao(autoriz.id);
      setAutoriz(null);
    }
  }, [req.id, req, onUpdate, bloqueada, autoriz, valorAlto, isDev]);

  const enviarPedidoPermissao = useCallback(async () => {
    const motivo = motivoPedido.trim();
    if (!motivo) return;
    setEnviandoPedido(true);
    try {
      await criarPedidoPermissao({ requisicaoId: req.id, solicitanteId: userProfile?.id, solicitanteNome: userProfile?.nome, motivo });
      const { data: devs } = await supabase.from('portal_permissoes').select('user_id').eq('is_dev', true);
      if (devs && devs.length) {
        await supabase.from('portal_notificacoes').insert(devs.map((d: any) => ({
          user_id: d.user_id, tipo: 'requisicao',
          titulo: `${userProfile?.nome || 'Alguém'} pediu permissão p/ alterar a Req #${req.id}`,
          descricao: motivo, link: '/requisicoes',
        })));
      }
    } catch (e) { console.error('Erro ao pedir permissão', e); }
    setEnviandoPedido(false);
    setPedirOpen(false);
    setMotivoPedido('');
    alert('Pedido enviado! Um Dev vai analisar.');
  }, [motivoPedido, req.id, userProfile?.id, userProfile?.nome]);

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

  // Anexo de imagem passa OBRIGATORIAMENTE pelo recorte antes de subir — as
  // fotos vinham com mesa e chão em volta do papel. PDF vai direto (não dá pra
  // recortar aqui, e quem manda PDF já manda o documento enquadrado).
  const [recorte, setRecorte] = useState<{ arquivo: File; field: string; label: string } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, fieldName: string, label: string) => {
    const file = e.target.files?.[0];
    e.target.value = '';   // deixa reescolher o MESMO arquivo depois de cancelar
    if (!file) return;
    if (file.type.startsWith('image/')) { setRecorte({ arquivo: file, field: fieldName, label }); return; }
    enviarAnexo(file, fieldName);
  };

  const enviarAnexo = async (file: File, fieldName: string) => {
    setUploading(fieldName);
    setUploadOk(null);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${req.id}-${fieldName}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('requisicoes').upload(filePath, file);
      if (uploadError) throw uploadError;
      persist(fieldName, filePath);
      // Nota anexada não muda mais status automaticamente
      setUploadOk(fieldName);
      setTimeout(() => setUploadOk(null), 2000);
    } catch (error: any) {
      alert('Erro ao realizar upload: ' + error.message);
    } finally {
      setUploading(null);
    }
  };

  // Impressão: o diálogo (DialogoImprimirReq) pergunta quais anexos entram e
  // devolve as folhas prontas; aqui só disparamos a impressão.
  const [dlgImprimir, setDlgImprimir] = useState(false);

  const imprimir = (folhas: { label: string; dataUrl: string }[] = []) => {
    onPrint({ ...localData, solicitante: nomeExibicao, veiculo: veiculoExibicao, impresso_por: userEmail }, folhas);
  };

  const handlePrint = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!anexosDisponiveis.length) { imprimir(); return; }   // sem anexo, não há o que perguntar
    setDlgImprimir(true);
  };

  const fecharModal = () => {
    setModalAberto(false);
    onFechar?.();
  };

  // Link direto pra esta requisição (o Kanban já abre o card com ?req=<id>).
  const [linkCopiado, setLinkCopiado] = useState(false);
  const linkDaReq = typeof window !== 'undefined' ? `${window.location.origin}/requisicoes?req=${req.id}` : '';
  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(linkDaReq);
    } catch {
      // clipboard bloqueado (http/permissão): cai no seletor manual
      const el = document.createElement('textarea');
      el.value = linkDaReq; document.body.appendChild(el); el.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      el.remove();
    }
    setLinkCopiado(true);
    setTimeout(() => setLinkCopiado(false), 2000);
  };

  // ── Grupos (coletivos) desta requisição ──
  const [grupoParaAdd, setGrupoParaAdd] = useState('');
  const [gruposAberto, setGruposAberto] = useState(false);
  const gruposDaReq = (grupos || []).filter((g: any) => (g.membros || []).map((x: any) => Number(x)).includes(Number(req.id)));
  const gruposDisponiveis = (grupos || []).filter((g: any) => g.status === 'aberto' && !gruposDaReq.some((d: any) => d.id === g.id));
  const alterarGrupoReq = async (grupoId: number, acao: 'add' | 'remove') => {
    try {
      await fetch('/api/pos/requisicoes/grupos/membros', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grupo_id: grupoId, req_id: req.id, acao, usuario: usuarioAtual }),
      });
      setGrupoParaAdd('');
      onGruposChange?.();
    } catch { /* ignore */ }
  };

  const inputBase = "w-full text-[15px] text-zinc-900 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:border-red-500 focus:bg-white transition-all placeholder:text-zinc-300";
  const selectBase = `${inputBase} [&>option]:text-black [&>option]:bg-white cursor-pointer`;
  const labelBase = "text-[13px] font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-2";
  const sectionTitle = "text-[13px] font-bold uppercase tracking-wider mb-4 flex items-center gap-2";

  const statusColors: Record<string, string> = {
    pedido: 'bg-red-500',
    completa: 'bg-cyan-500',
    aguardando: 'bg-orange-400',
    financeiro: 'bg-indigo-600',
  };

  // Anexos com link utilizável (fora os do Drive antigo, que não têm URL direta).
  const anexosDisponiveis = anexosDaReq(localData);
  const anexosNoDrive = anexosNoDriveDe(localData);

  const renderAnexo = (label: string, field: string, icon: React.ReactNode) => {
    const fileUrl = getUrlAnexo(localData[field]);
    const isDriveFile = localData[field]?.startsWith('SupaAtualizarReq_Images/');
    const hasFile = !!localData[field];
    const isUploading = uploading === field;
    const justUploaded = uploadOk === field;

    return (
      <div key={field} className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${hasFile ? 'border-emerald-200 bg-emerald-50/50' : 'border-zinc-200 bg-zinc-50'}`}>
        <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${hasFile ? 'text-emerald-600' : 'text-zinc-400'}`}>
          {icon}
        </div>
        <span className={`text-sm font-medium flex-1 min-w-0 truncate ${hasFile ? 'text-emerald-700' : 'text-zinc-500'}`}>
          {isUploading ? 'Enviando...' : justUploaded ? 'Enviado!' : label}
        </span>
        {hasFile && (
          isDriveFile ? (
            <button onClick={() => abrirArquivoDrive(localData[field])} className="w-7 h-7 flex items-center justify-center rounded bg-emerald-600 text-white hover:bg-emerald-500 transition-all shrink-0" title="Abrir">
              <ExternalLink size={12} />
            </button>
          ) : (
            <a href={fileUrl || '#'} target="_blank" rel="noopener noreferrer" className="w-7 h-7 flex items-center justify-center rounded bg-red-600 text-white hover:bg-red-500 transition-all shrink-0" title="Ver">
              <Eye size={12} />
            </a>
          )
        )}
        <label className={`w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-all shrink-0 ${
          justUploaded ? 'bg-emerald-500 text-white' : isUploading ? 'bg-zinc-200 text-zinc-400' : 'bg-zinc-200 text-zinc-600 hover:bg-red-600 hover:text-white'
        }`} title="Upload">
          {justUploaded ? <Check size={12} /> : <Upload size={12} />}
          <input type="file" className="hidden" onChange={e => handleFileUpload(e, field, label)} disabled={isUploading} />
        </label>
      </div>
    );
  };

  return (
    <div className="font-montserrat">
      {/* MODAL COTAÇÃO */}
      {modalCotacaoAberto && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl shadow-xl border border-zinc-200">
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
                    <div className="grid grid-cols-3 gap-4">
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
                  <button onClick={() => setFornecedoresVisiveis(prev => prev + 1)} className="flex-1 border-2 border-dashed border-zinc-200 text-zinc-500 py-3 rounded-xl text-sm font-semibold uppercase tracking-wider hover:border-red-200 hover:text-red-600 transition-all flex items-center justify-center gap-2"><Plus size={16}/> Adicionar</button>
                )}
                <button onClick={salvarCotacao} className="flex-1 bg-red-600 text-white py-3 rounded-xl text-sm font-semibold uppercase tracking-wider hover:bg-red-500 transition-all flex items-center justify-center gap-2"><CheckCheck size={16}/> Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PRINCIPAL — Página única */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white w-full max-w-5xl max-h-[95vh] rounded-2xl shadow-xl border border-zinc-200 flex flex-col overflow-hidden">

            {!podeEditar && (
              <div className="px-8 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs font-semibold shrink-0">
                🔒 Modo somente leitura — você não tem permissão para editar requisições.
              </div>
            )}

            {/* HEADER */}
            <div className="px-8 py-5 border-b border-zinc-200 flex items-center gap-5 shrink-0 bg-zinc-50/50">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold ${veioDoApp ? 'bg-red-500/15 text-red-600' : 'bg-zinc-100 text-zinc-600'}`}>
                {req.id}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-zinc-900 truncate">{localData.titulo || 'Sem título'}</h2>
                  {veioDoApp && <span className="bg-red-600 text-white text-[10px] px-2.5 py-0.5 rounded-md font-bold shrink-0">APP</span>}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <div className={`w-2.5 h-2.5 rounded-full ${statusColors[req.status] || 'bg-slate-500'}`}></div>
                  <span className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">{req.status}</span>
                  {nomeExibicao && <span className="text-xs text-zinc-400">· {nomeExibicao}</span>}
                </div>
              </div>
              <button onClick={() => setHistAberto(true)} className="w-10 h-10 flex items-center justify-center rounded-lg bg-white border border-zinc-200 text-zinc-500 hover:bg-zinc-800 hover:text-white hover:border-zinc-800 transition-all shrink-0" title="Histórico"><Clock size={16}/></button>
              <button onClick={handlePrint} className="h-10 px-4 flex items-center gap-2 rounded-lg bg-red-600 border border-red-600 text-white text-sm hover:bg-red-500 transition-all shrink-0" title="Imprimir a requisição com os anexos"><Printer size={16}/> Imprimir</button>
              <button onClick={fecharModal} className="w-10 h-10 flex items-center justify-center rounded-lg bg-white border border-zinc-200 text-zinc-500 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all shrink-0"><X size={18}/></button>
            </div>

            {/* MODAL — Pedir permissão ao Dev */}
            {pedirOpen && (
              <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setPedirOpen(false); }}>
                <div className="bg-white rounded-2xl shadow-xl border border-zinc-200 w-full max-w-md overflow-hidden">
                  <div className="px-6 py-4 border-b border-zinc-200 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600"><Lock size={18} /></div>
                    <div>
                      <h3 className="text-base font-bold text-zinc-900">Pedir permissão ao Dev</h3>
                      <p className="text-xs text-zinc-400">Requisição #{req.id} — valor alto</p>
                    </div>
                  </div>
                  <div className="p-6">
                    <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">O que pretende alterar?</label>
                    <textarea value={motivoPedido} onChange={e => setMotivoPedido(e.target.value)} rows={4} placeholder="Explique a alteração que precisa de fazer..." className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm outline-none focus:border-red-400 resize-none" />
                    <div className="flex gap-3 mt-4">
                      <button onClick={() => setPedirOpen(false)} className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-zinc-600 text-sm font-semibold hover:bg-zinc-50">Cancelar</button>
                      <button onClick={enviarPedidoPermissao} disabled={!motivoPedido.trim() || enviandoPedido} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50">{enviandoPedido ? 'A enviar...' : 'Enviar pedido'}</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* CONTEÚDO — Scroll único */}
            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">

              {/* ── LINK DIRETO ── */}
              {/* Cada requisição tem o próprio endereço; copiar aqui pra colar no
                  chat/WhatsApp e a pessoa cair direto neste card. */}
              <div className="flex items-center gap-3 bg-white border border-zinc-200 rounded-xl px-4 py-2.5">
                <Link2 size={15} className="text-zinc-400 shrink-0" />
                <span className="text-[13px] text-zinc-500 font-mono truncate flex-1" title={linkDaReq}>
                  /requisicoes?req={req.id}
                </span>
                <button onClick={copiarLink}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all shrink-0 ${
                    linkCopiado ? 'bg-emerald-500 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-red-600 hover:text-white'
                  }`}>
                  {linkCopiado ? <><Check size={14} /> Copiado!</> : <><Link2 size={14} /> Copiar link</>}
                </button>
              </div>

              {/* ── GRUPOS (coletivos) — dropdown pra não poluir ── */}
              {/* Fechado mostra só o resumo (quantos grupos). Abre ao clicar. */}
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl">
                <button type="button" onClick={() => setGruposAberto(o => !o)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-left">
                  <FolderOpen size={14} className="text-red-600 shrink-0" />
                  <span className="text-[13px] font-bold text-zinc-600">Grupos</span>
                  <span className="text-[12px] text-zinc-400">
                    {gruposDaReq.length === 0 ? 'nenhum grupo' : gruposDaReq.length === 1 ? gruposDaReq[0].nome : `${gruposDaReq.length} grupos`}
                  </span>
                  <ChevronDown size={16} className={`ml-auto text-zinc-400 transition-transform ${gruposAberto ? 'rotate-180' : ''}`} />
                </button>
                {gruposAberto && (
                  <div className="px-4 pb-3 -mt-1">
                    {gruposDaReq.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {gruposDaReq.map((g: any) => (
                          <span key={g.id} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full pl-2.5 pr-1.5 py-1">
                            <button onClick={() => onExpandirGrupo?.(g.id)} title="Expandir grupo no kanban" className="hover:underline flex items-center gap-1"><FolderOpen size={12} /> {g.nome}</button>
                            {g.status !== 'aberto' && <span className="text-[9px] uppercase text-zinc-400">({g.status})</span>}
                            {podeEditar && (
                              <button onClick={() => alterarGrupoReq(g.id, 'remove')} title="Remover deste grupo" className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full text-red-400 hover:bg-red-200 hover:text-red-700"><X size={11} /></button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                    {podeEditar && gruposDisponiveis.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <select value={grupoParaAdd} onChange={e => setGrupoParaAdd(e.target.value)} className="text-[13px] bg-white border border-zinc-200 rounded-lg px-2 py-1.5 outline-none focus:border-red-400 flex-1 max-w-[240px]">
                          <option value="">Adicionar a um grupo...</option>
                          {gruposDisponiveis.map((g: any) => <option key={g.id} value={g.id}>{g.nome}</option>)}
                        </select>
                        <button onClick={() => grupoParaAdd && alterarGrupoReq(Number(grupoParaAdd), 'add')} disabled={!grupoParaAdd}
                          className="text-[12px] font-bold text-white bg-red-600 px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-40 flex items-center gap-1"><Plus size={13} /> Adicionar</button>
                      </div>
                    ) : gruposDaReq.length === 0 && (
                      <span className="text-[12px] text-zinc-400 italic">esta requisição não está em nenhum grupo</span>
                    )}
                  </div>
                )}
              </div>


              {/* ── BLOQUEIO DE VALOR ALTO ── */}
              {valorAlto && (
                bloqueada ? (
                  <div className="flex items-center gap-3 p-4 rounded-xl border border-red-200 bg-red-50">
                    <Lock size={20} className="text-red-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-red-700">Requisição bloqueada — valor acima de R$ {LIMITE_BLOQUEIO},00</p>
                      <p className="text-xs text-red-600">Para alterar, peça permissão a um Dev. A impressão continua disponível.</p>
                    </div>
                    <button onClick={() => setPedirOpen(true)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2 rounded-lg whitespace-nowrap shrink-0">Pedir permissão</button>
                  </div>
                ) : autoriz ? (
                  <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-200 bg-emerald-50">
                    <ShieldCheck size={20} className="text-emerald-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-emerald-700">Permissão concedida{autoriz.dev_nome ? ` por ${autoriz.dev_nome}` : ''}</p>
                      <p className="text-xs text-emerald-600">Válida para UMA alteração — depois volta a bloquear.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50">
                    <ShieldAlert size={18} className="text-amber-600 shrink-0" />
                    <p className="text-xs font-semibold text-amber-700">Valor alto — como Dev, pode editar livremente.</p>
                  </div>
                )
              )}

              {/* ── DADOS ── */}
              <div className="grid grid-cols-[1fr_180px] gap-4">
                <div>
                  <label className={labelBase}><Tag size={11}/> Título</label>
                  <input value={localData.titulo || ""} onChange={e => setField('titulo', e.target.value)} onBlur={e => persist('titulo', e.target.value.toUpperCase())} className={inputBase} />
                </div>
                <div>
                  <label className={labelBase}><Calendar size={11}/> Data</label>
                  <input type="date" value={localData.data || ""} onChange={e => setField('data', e.target.value)} onBlur={e => persist('data', e.target.value)} className={inputBase} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
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

              {/* Condicionais de setor/tipo */}
              {localData.setor === "Trator-Cliente" && (
                <div className="border border-amber-200 bg-amber-50/50 rounded-xl p-4 space-y-3">
                  <span className={`${sectionTitle} text-amber-600`}><Truck size={12}/> Cliente / Trator</span>
                  <div className="grid grid-cols-2 gap-4">
                    <div ref={cliDropdownRef} className="relative">
                      <label className={labelBase}><User size={11}/> Cliente</label>
                      <div
                        className={`${inputBase} cursor-pointer flex items-center justify-between`}
                        onClick={() => setCliDropdownOpen(!cliDropdownOpen)}
                      >
                        <span className={localData.cliente ? 'text-zinc-900 text-sm' : 'text-zinc-400 text-sm'}>
                          {localData.cliente
                            ? `${localData.cliente}${localData.cliente_cnpj ? ` — ${localData.cliente_cnpj}` : ''}`
                            : 'Buscar cliente por nome ou CNPJ...'}
                        </span>
                        <svg className="w-3 h-3 text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>
                      {cliDropdownOpen && (
                        <div className="absolute z-[70] mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-xl max-h-56 overflow-auto">
                          <div className="sticky top-0 bg-white p-2 border-b border-zinc-100">
                            <input
                              autoFocus
                              placeholder="Nome fantasia, razão social ou CNPJ/CPF..."
                              value={cliBusca}
                              onChange={e => setCliBusca(e.target.value)}
                              className="w-full px-4 py-3 rounded-xl border border-zinc-200 text-sm outline-none focus:border-amber-400"
                            />
                          </div>
                          {localData.cliente_cnpj && (
                            <button type="button"
                              onClick={() => { persist('cliente', ''); persist('cliente_cnpj', ''); setCliDropdownOpen(false); setCliBusca(''); }}
                              className="w-full px-4 py-2 text-left text-xs text-red-500 hover:bg-red-50 border-b border-zinc-100">
                              Remover vínculo
                            </button>
                          )}
                          {cliResultados.map(c => (
                            <button type="button" key={c.cnpj_cpf}
                              onClick={() => {
                                persist('cliente', c.nome_fantasia || c.razao_social);
                                persist('cliente_cnpj', c.cnpj_cpf);
                                setCliDropdownOpen(false); setCliBusca('');
                              }}
                              className={`w-full px-4 py-2 text-left hover:bg-zinc-50 border-b border-zinc-50 ${localData.cliente_cnpj === c.cnpj_cpf ? 'bg-amber-50' : ''}`}>
                              <span className="font-bold text-sm text-zinc-800">{c.nome_fantasia || c.razao_social}</span>
                              <span className="text-xs text-zinc-500 ml-2">{c.cnpj_cpf}</span>
                              {c.cidade && <span className="text-xs text-zinc-400 ml-2">({c.cidade})</span>}
                            </button>
                          ))}
                          {cliBusca.trim().length >= 2 && cliResultados.length === 0 && (
                            <p className="px-4 py-3 text-xs text-zinc-400 text-center">Nenhum cliente encontrado</p>
                          )}
                          {cliBusca.trim().length < 2 && (
                            <p className="px-4 py-3 text-xs text-zinc-400 text-center">Digite pelo menos 2 caracteres</p>
                          )}
                        </div>
                      )}
                    </div>
                    <div ref={osDropdownRef} className="relative">
                      <label className={labelBase}><ClipboardList size={11}/> Ordem de Serviço</label>
                      <div
                        className={`${inputBase} cursor-pointer flex items-center justify-between`}
                        onClick={() => setOsDropdownOpen(!osDropdownOpen)}
                      >
                        <span className={localData.ordem_servico ? 'text-zinc-900 text-sm' : 'text-zinc-400 text-sm'}>
                          {localData.ordem_servico
                            ? `OS ${localData.ordem_servico} - ${ordensAbertas.find(o => String(o.Id_Ordem) === String(localData.ordem_servico))?.Os_Cliente || ''}`
                            : 'Selecione a O.S...'}
                        </span>
                        <svg className="w-3 h-3 text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>
                      {osDropdownOpen && (
                        <div className="absolute z-[70] mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-xl max-h-56 overflow-auto">
                          <div className="sticky top-0 bg-white p-2 border-b border-zinc-100">
                            <input
                              autoFocus
                              placeholder="Buscar OS, cliente ou técnico..."
                              value={osBusca}
                              onChange={e => setOsBusca(e.target.value)}
                              className="w-full px-4 py-3 rounded-xl border border-zinc-200 text-sm outline-none focus:border-red-400"
                            />
                          </div>
                          {localData.ordem_servico && (
                            <button
                              type="button"
                              onClick={() => { persist('ordem_servico', null); setOsDropdownOpen(false); setOsBusca(''); }}
                              className="w-full px-4 py-2 text-left text-xs text-red-500 hover:bg-red-50 border-b border-zinc-100"
                            >
                              Remover vínculo
                            </button>
                          )}
                          {ordensAbertas
                            .filter(o => {
                              if (!osBusca.trim()) return true;
                              const q = osBusca.toLowerCase();
                              return String(o.Id_Ordem).toLowerCase().includes(q) || (o.Os_Cliente || '').toLowerCase().includes(q) || (o.Os_Tecnico || '').toLowerCase().includes(q);
                            })
                            .map(o => (
                              <button
                                type="button"
                                key={o.Id_Ordem}
                                onClick={() => {
                                  persist('ordem_servico', String(o.Id_Ordem));
                                  if (o.Os_Cliente) persist('cliente', o.Os_Cliente);
                                  setOsDropdownOpen(false);
                                  setOsBusca('');
                                }}
                                className={`w-full px-4 py-2 text-left hover:bg-zinc-50 border-b border-zinc-50 ${String(localData.ordem_servico) === String(o.Id_Ordem) ? 'bg-red-50' : ''}`}
                              >
                                <span className="font-bold text-sm text-zinc-800">OS {o.Id_Ordem}</span>
                                <span className="text-sm text-zinc-500 ml-2">{o.Os_Cliente}</span>
                                <span className="text-xs text-zinc-400 ml-1">({o.Os_Tecnico})</span>
                              </button>
                            ))
                          }
                          {ordensAbertas.filter(o => {
                            if (!osBusca.trim()) return true;
                            const q = osBusca.toLowerCase();
                            return String(o.Id_Ordem).toLowerCase().includes(q) || (o.Os_Cliente || '').toLowerCase().includes(q) || (o.Os_Tecnico || '').toLowerCase().includes(q);
                          }).length === 0 && (
                            <p className="px-4 py-3 text-xs text-zinc-400 text-center">Nenhuma O.S. encontrada</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div ref={projDropdownRef} className="relative">
                      <label className={labelBase}><Cpu size={11}/> Projeto / Chassis</label>
                      <div
                        className={`${inputBase} cursor-pointer flex items-center justify-between`}
                        onClick={() => setProjDropdownOpen(!projDropdownOpen)}
                      >
                        <span className={localData.Chassis_Modelo ? 'text-zinc-900 text-sm' : 'text-zinc-400 text-sm'}>
                          {localData.Chassis_Modelo || 'Buscar projeto ou chassis...'}
                        </span>
                        <svg className="w-3 h-3 text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>
                      {projDropdownOpen && (
                        <div className="absolute z-[70] mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-xl max-h-56 overflow-auto">
                          <div className="sticky top-0 bg-white p-2 border-b border-zinc-100">
                            <input
                              autoFocus
                              placeholder="Buscar por nome, chassis, modelo..."
                              value={projBusca}
                              onChange={e => setProjBusca(e.target.value)}
                              className="w-full px-4 py-3 rounded-xl border border-zinc-200 text-sm outline-none focus:border-amber-400"
                            />
                          </div>
                          {localData.Chassis_Modelo && (
                            <button type="button"
                              onClick={() => { persist('Chassis_Modelo', ''); persist('projeto_codigo', ''); persist('projeto_nome', ''); setProjDropdownOpen(false); setProjBusca(''); }}
                              className="w-full px-4 py-2 text-left text-xs text-red-500 hover:bg-red-50 border-b border-zinc-100">
                              Remover seleção
                            </button>
                          )}
                          {projResultados.map(p => (
                            <button type="button" key={`${p.codigo}-${p.empresa}`}
                              onClick={() => {
                                persist('projeto_codigo', String(p.codigo));
                                persist('projeto_nome', p.nome);
                                persist('Chassis_Modelo', p.nome);
                                setProjDropdownOpen(false); setProjBusca('');
                              }}
                              className={`w-full px-4 py-2 text-left hover:bg-zinc-50 border-b border-zinc-50 ${localData.projeto_nome === p.nome ? 'bg-amber-50' : ''}`}>
                              <span className="font-bold text-sm text-zinc-800">{p.nome}</span>
                              <span className="text-xs text-zinc-400 ml-2">{p.empresa}</span>
                            </button>
                          ))}
                          {projBusca.trim().length >= 2 && projResultados.length === 0 && (
                            <p className="px-4 py-3 text-xs text-zinc-400 text-center">Nenhum projeto encontrado</p>
                          )}
                          {projBusca.trim().length < 2 && (
                            <p className="px-4 py-3 text-xs text-zinc-400 text-center">Digite pelo menos 2 caracteres</p>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className={labelBase}><DollarSign size={11}/> Valor Cobrado</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500 text-xs font-bold">R$</span>
                        <input
                          inputMode="decimal"
                          value={valorCobradoFmt}
                          onChange={e => setValorCobradoFmt(formatarMoeda(e.target.value))}
                          onBlur={() => { const raw = parseMoeda(valorCobradoFmt); if (parseValorBR(raw) !== parseValorBR(req.valor_cobrado_cliente)) persist('valor_cobrado_cliente', raw); }}
                          className={`${inputBase} pl-10 font-semibold`}
                          placeholder="0,00"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {localData.setor === "Trator-Loja" && (
                <div className="border border-zinc-200 rounded-xl p-4">
                  <span className={`${sectionTitle} text-zinc-500`}><Cpu size={12}/> Trator (Loja)</span>
                  <div>
                    <label className={labelBase}><Cpu size={11}/> Chassis / Modelo</label>
                    <input value={localData.Chassis_Modelo || ''} onChange={e => setField('Chassis_Modelo', e.target.value)} onBlur={e => persist('Chassis_Modelo', e.target.value.toUpperCase())} className={inputBase} />
                  </div>
                </div>
              )}

              {localData.tipo === 'Ferramenta' && (
                <div className="border border-red-200 bg-red-50/50 rounded-xl p-4">
                  <span className={`${sectionTitle} text-red-600`}><Tag size={12}/> Ferramenta</span>
                  <label className={labelBase}><Tag size={11}/> Destinação</label>
                  <select value={localData.quem_ferramenta || ''} onChange={e => { setField('quem_ferramenta', e.target.value); persist('quem_ferramenta', e.target.value); }} className={selectBase}>
                    <option value="">Selecione...</option>
                    <option value="Uso Pessoal">Uso Pessoal (Individual)</option>
                    <option value="Geral">Uso Geral (Oficina/Setor)</option>
                  </select>
                </div>
              )}

              {['Veicular Abastecimento', 'Veicular Manutenção'].includes(localData.tipo) && (
                <div className="border border-red-200 bg-red-50/50 rounded-xl p-4">
                  <span className={`${sectionTitle} text-red-600`}><Car size={12}/> Veículo</span>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelBase}><Car size={11}/> Placa</label>
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

              {['Veicular Abastecimento', 'Trator Abastecimento', 'Quadri Abastecimento'].includes(localData.tipo) && (
                <div className="border border-amber-200 bg-amber-50/50 rounded-xl p-4">
                  <span className={`${sectionTitle} text-amber-600`}><Gauge size={12}/> Abastecimento</span>
                  <label className={labelBase}><Gauge size={11}/> Litros</label>
                  <input value={localData.litros_combustivel || ''} onChange={e => setField('litros_combustivel', e.target.value)} onBlur={e => persist('litros_combustivel', e.target.value)} className={inputBase} placeholder="Ex: 150" />
                </div>
              )}

              {/* Observações */}
              <div>
                <label className={labelBase}><FileText size={11}/> Observações</label>
                <textarea value={localData.obs || ""} onChange={e => { setField('obs', e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} onBlur={e => persist('obs', e.target.value)} onFocus={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} className={`${inputBase} min-h-[80px] resize-none overflow-hidden`} placeholder="Descrição, justificativa..." style={{ height: 'auto' }} ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} />
              </div>

              {/* ── DIVISOR ── */}
              <div className="border-t border-zinc-200" />

              {/* ── FINANCEIRO ── */}
              <div>
                <span className={`${sectionTitle} text-zinc-500`}><CreditCard size={12}/> Financeiro</span>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div ref={fornDropdownRef} className="relative">
                    <label className={labelBase}><Store size={11}/> Fornecedor</label>
                    <input
                      type="text"
                      value={fornBusca}
                      onChange={e => { setFornBusca(e.target.value); setFornDropdownOpen(true); }}
                      onFocus={() => setFornDropdownOpen(true)}
                      placeholder="Pesquisar..."
                      className={inputBase}
                    />
                    {fornDropdownOpen && (
                      <div className="absolute z-[70] mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-xl max-h-52 overflow-auto">
                        {localData.fornecedor && (
                          <button type="button" onClick={() => { persist('fornecedor', ''); setFornBusca(''); setFornDropdownOpen(false); }}
                            className="w-full px-4 py-2 text-left text-xs text-red-500 hover:bg-red-50 border-b border-zinc-100">
                            Remover seleção
                          </button>
                        )}
                        {fornecedoresBanco
                          .filter((f: any) => f.nome?.toLowerCase().includes(fornBusca.toLowerCase()))
                          .map((f: any, i: number) => (
                            <button type="button" key={`${f.nome}-${i}`}
                              onClick={() => { persist('fornecedor', f.nome); setFornBusca(f.nome); setFornDropdownOpen(false); }}
                              className={`w-full px-4 py-2 text-left text-sm hover:bg-zinc-50 border-b border-zinc-50 ${localData.fornecedor === f.nome ? 'bg-red-50 font-semibold' : 'text-zinc-700'}`}>
                              {f.nome}
                            </button>
                          ))
                        }
                        {fornecedoresBanco.filter((f: any) => f.nome?.toLowerCase().includes(fornBusca.toLowerCase())).length === 0 && (
                          <p className="px-4 py-3 text-xs text-zinc-400 text-center">Nenhum fornecedor encontrado</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className={labelBase}><Receipt size={11}/> Nota Fiscal</label>
                    <input value={localData.numero_nota || ''} onChange={e => setField('numero_nota', e.target.value)} onBlur={e => persist('numero_nota', e.target.value)} className={inputBase} placeholder="Nº do documento" />
                  </div>
                </div>

                {/* Valor da despesa */}
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-3">
                  <label className="text-[13px] font-bold text-red-600 uppercase tracking-wider block mb-2">Custo Real</label>
                  <div className="flex items-center gap-2">
                    <span className="text-red-600 text-lg font-bold select-none">R$</span>
                    <input
                      inputMode="decimal"
                      value={valorDespesaFmt}
                      onChange={e => setValorDespesaFmt(formatarMoeda(e.target.value))}
                      onBlur={() => { const raw = parseMoeda(valorDespesaFmt); if (parseValorBR(raw) !== parseValorBR(req.valor_despeza)) persist('valor_despeza', raw); }}
                      className="w-full text-xl font-bold text-red-700 bg-white border border-red-200 rounded-lg px-3 py-2 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all placeholder:text-red-200"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                {/* Cotação */}
                <div className="flex items-center gap-3 mb-2">
                  <button
                    onClick={() => setModalCotacaoAberto(true)}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-all text-sm font-semibold"
                  >
                    <ClipboardList size={14} />
                    Cotações ({fornecedoresVisiveis})
                  </button>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={cotacaoData.incluir_pdf !== false}
                      onChange={async (e) => {
                        const val = e.target.checked;
                        const novo = { ...cotacaoData, id: req.id, incluir_pdf: val };
                        setCotacaoData(novo);
                        await supabase.from('req_cotacao').upsert(novo);
                      }}
                      className="w-3.5 h-3.5 accent-red-600 cursor-pointer"
                    />
                    <span className="text-xs text-zinc-500">No PDF</span>
                  </label>
                </div>

                {req.enviado_financeiro_data && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-indigo-50 border border-indigo-200 mt-2">
                    <Calendar size={13} className="text-indigo-500" />
                    <span className="text-sm text-indigo-600">Enviado ao financeiro: <strong>{new Date(req.enviado_financeiro_data.length > 10 ? req.enviado_financeiro_data : req.enviado_financeiro_data + 'T12:00:00').toLocaleDateString('pt-BR')}</strong></span>
                  </div>
                )}
              </div>

              {/* ── DIVISOR ── */}
              <div className="border-t border-zinc-200" />

              {/* ── ANEXOS ── */}
              <div>
                <span className={`${sectionTitle} text-zinc-500`}><Paperclip size={12}/> Anexos</span>
                <div className="space-y-2">
                  {renderAnexo('Nota Fiscal', 'foto_nf', <Camera size={14}/>)}
                  {renderAnexo('Boleto', 'boleto_fornecedor', <Receipt size={14}/>)}
                  {renderAnexo('Recibo / Outros', 'recibo_fornecedor', <Paperclip size={14}/>)}
                </div>

                {anexosNoDrive.length > 0 && (
                  <div className="mt-2 text-[13px] text-zinc-500">
                    {anexosNoDrive.map(a => a.label).join(', ')} está no Drive antigo e não entra na impressão — abra pelo olhinho.
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
      <HistoricoModal reqId={req.id} titulo={req.titulo} open={histAberto} onClose={() => setHistAberto(false)} />
      {dlgImprimir && (
        <DialogoImprimirReq
          req={{ ...localData, id: req.id }}
          onFechar={() => setDlgImprimir(false)}
          onImprimir={(folhas) => imprimir(folhas)}
        />
      )}

      {recorte && (
        <RecorteAnexo
          arquivo={recorte.arquivo}
          titulo={recorte.label}
          onCancelar={() => setRecorte(null)}
          onConfirmar={(cortado) => { const f = recorte.field; setRecorte(null); enviarAnexo(cortado, f); }}
        />
      )}
    </div>
  );
}
