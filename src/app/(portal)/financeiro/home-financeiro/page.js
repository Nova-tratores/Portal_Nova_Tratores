'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useAuditLog } from '@/hooks/useAuditLog'
import { notificarAdminsClient } from '@/hooks/useNotificarAdmins'
import { marcarMinhaAcao } from '@/components/financeiro/NotificationSystem'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import { formatarDataBR, formatarMoeda, getRequisicoes } from '@/lib/financeiro/utils'
import {
 X, PlusCircle, FileText, Download,
 CheckCircle, User, Upload, Send,
 Calendar, CreditCard, Hash, ArrowLeft, Paperclip,
 CheckCheck, Eye, Search, Trash2, RefreshCw, AlertCircle, DollarSign, Lock, Barcode, ZoomIn, ZoomOut
} from 'lucide-react'

const formatarData = formatarDataBR;

// FinanceiroSubNav removido — agora usa componente compartilhado FinanceiroNav

// --- COMPONENTE TAG DE ANEXO ---
function AttachmentTag({ icon, label, fileUrl, onUpload, onRemove, disabled }) {
    const fileInputRef = useRef(null);
    return (
        <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', minWidth:'320px', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
            <div style={{ padding: '0 18px', color: '#64748b', background: '#f1f5f9' }}>{icon || <Paperclip size={18}/>}</div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '12px 15px' }}>
                <span style={{ fontSize: '13px', color: '#1e293b', fontWeight: '500', letterSpacing: '0.5px' }}>{label}</span>
                <span style={{ fontSize: '11px', color: fileUrl ? '#10b981' : '#f43f5e', fontWeight: '500' }}>{fileUrl ? 'ARQUIVO PRONTO' : 'PENDENTE'}</span>
            </div>
            <div style={{ display: 'flex', borderLeft: '1px solid #e2e8f0' }}>
                {fileUrl && <button onClick={() => window.open(fileUrl, '_blank')} style={miniActionBtn} title="Visualizar"><Eye size={18} color="#1e293b" /></button>}
                {!disabled && onUpload && (
                    <button onClick={() => fileInputRef.current.click()} style={miniActionBtn} title="Substituir ou Anexar">
                        <RefreshCw size={18} color="#1e293b" />
                        <input type="file" ref={fileInputRef} hidden onChange={e => onUpload(e.target.files[0])} />
                    </button>
                )}
                {!disabled && fileUrl && onRemove && (
                    <button onClick={() => { if (confirm('Remover este anexo?')) onRemove(); }} style={miniActionBtn} title="Remover">
                        <Trash2 size={18} color="#ef4444" />
                    </button>
                )}
            </div>
        </div>
    );
}

// ESTILOS GERAIS
const cascadeRowStyle = { display: 'grid', gridTemplateColumns: '140px 180px 150px 320px', gap: '25px', alignItems: 'center', background: '#ffffff', padding: '15px', borderBottom: '1px solid #f1f5f9' };
const cascadeLabelStyle = { fontSize: '11px', color: '#94a3b8', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase' };
const inputCascadeStyle = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', padding: '10px', fontSize: '14px', outline: 'none', transition: '0.2s' };
const cascadeValueStyle = { fontSize: '18px', color: '#0f172a', fontWeight: '500' };
const dropItemStyle_Container = { position:'absolute', top:'60px', right: 0, background:'#ffffff', zIndex:2000, width:'250px', border:'0.5px solid #dcdde1', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' };
const dropItemStyle = { padding:'15px 20px', cursor:'pointer', color:'#1e293b', borderBottom:'0.5px solid #dcdde1', fontSize:'14px', fontWeight: '600' };
const colWrapperStyle = { padding: '20px', background: 'rgba(255, 255, 255, 0.4)', border: '0.5px solid #dcdde1' };
const colTitleStyle = { textAlign: 'center', fontSize: '22px', color:'#0f172a', fontWeight:'500', marginBottom:'30px', textTransform:'uppercase' };
const miniTagStyle = { background: '#f1f5f9', padding: '4px 10px', color: '#64748b', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px', border: '0.5px solid #dcdde1', fontWeight: '600' };
const labelMStyle = { fontSize:'14px', color:'#64748b', textTransform:'uppercase', fontWeight: '500', marginBottom: '8px', display: 'block' };
const pModalStyle = { fontSize:'24px', color:'#0f172a', margin: 0, fontWeight: '400' };
const fieldBoxModal = { border: '1px solid #e5e7eb', padding: '30px', background: '#ffffff', flex: 1, borderRadius: '15px' };
const fieldBoxInner = { padding: '15px 10px', borderBottom: '1px solid #f0f0f0' };
const inputStyleLight = { width: '100%', padding: '15px', border: '1px solid #dcdde1', outline: 'none', background:'#fff', color:'#000', fontSize: '18px', fontFamily: 'Montserrat, sans-serif' };
const miniActionBtn = { background: 'transparent', border: 'none', padding: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: '0.2s', borderRadius: '8px' };
const btnPrimaryBeautified = { background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)', color:'#ffffff', border:'none', padding:'18px 40px', borderRadius:'15px', cursor:'pointer', fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 10px 20px rgba(14, 165, 233, 0.2)', transition: '0.3s' };
const btnSuccessBeautified = { flex: 1, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color:'#ffffff', border:'none', padding:'25px', borderRadius:'15px', cursor:'pointer', fontSize: '18px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', boxShadow: '0 10px 20px rgba(16, 185, 129, 0.2)', transition: '0.3s' };
const zoomBtnStyle = { background: 'transparent', border: 'none', cursor: 'pointer' };

export default function HomeFinanceiro() {
  return (
    <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: '#6b7280', fontFamily: 'Montserrat, sans-serif' }}>Carregando...</div>}>
      <HomeFinanceiroContent />
    </Suspense>
  )
}

function HomeFinanceiroContent() {
 const { userProfile } = useAuth();
 const { log: auditLog } = useAuditLog();
 const [showNovoMenu, setShowNovoMenu] = useState(false);
 const [tarefaSelecionada, setTarefaSelecionada] = useState(null);
 const [listaBoletos, setListaBoletos] = useState([]); const [listaSemBoleto, setListaSemBoleto] = useState([]); const [listaPagar, setListaPagar] = useState([]); const [listaRH, setListaRH] = useState([]);
 const [fileBoleto, setFileBoleto] = useState(null);
 const [zoom, setZoom] = useState(1);
 const router = useRouter();
 const searchParams = useSearchParams();

 // --- CARREGAMENTO UNIFICADO ---
 const carregarDados = async () => {
  try {
    const { data: bolds } = await supabase.from('Chamado_NF').select('*').neq('status', 'concluido').neq('status', 'pago').order('id', {ascending: false});
    const hoje = new Date(); hoje.setHours(0,0,0,0);

    const faturamentoFormatado = (bolds || []).map(c => {
      const venc = c.vencimento_boleto ? new Date(c.vencimento_boleto) : null;
      if (venc) venc.setHours(0,0,0,0);

      let todosPagos = false;
      const isParceladoLocal = c.forma_pagamento?.toLowerCase().includes('parcelado');

      if (isParceladoLocal) {
          const qtd = parseInt(c.qtd_parcelas || 1);
          let conferidos = 0;
          for (let i = 1; i <= qtd; i++) {
              if (i === 1 ? (c.comprovante_pagamento_p1 || c.comprovante_pagamento) : c[`comprovante_pagamento_p${i}`]) conferidos++;
          }
          todosPagos = conferidos === qtd;
      } else {
          todosPagos = !!(c.comprovante_pagamento || c.comprovante_pagamento_p1);
      }

      let parcelaVencida = false;
      if (isParceladoLocal && c.status === 'aguardando_vencimento') {
        const qtd = parseInt(c.qtd_parcelas || 1);
        const rawDatasF = (c.datas_parcelas || '').split(/[\s,]+/).filter(d => d.includes('-'));
        if (rawDatasF.length > 0 && rawDatasF[0] === c.vencimento_boleto) rawDatasF.shift();
        const datas = [c.vencimento_boleto, ...rawDatasF];
        for (let i = 0; i < qtd; i++) {
          const comp = i === 0 ? (c.comprovante_pagamento || c.comprovante_pagamento_p1) : c[`comprovante_pagamento_p${i + 1}`];
          const dp = datas[i] ? new Date(datas[i]) : null;
          if (dp) dp.setHours(0,0,0,0);
          if (dp && dp < hoje && !comp) { parcelaVencida = true; break; }
        }
      }

      return {
        ...c,
        gTipo: 'boleto',
        valor_exibicao: c.valor_servico,
        isVencidoDisplay: venc && venc < hoje && !todosPagos && !isParceladoLocal,
        isTarefaPagamentoRealizado: todosPagos,
        isPagamentoRealizado: todosPagos,
        parcelaVencida
      }
    });

    setListaBoletos(faturamentoFormatado.filter(c => c.status !== 'sem_boleto'));
    setListaSemBoleto(faturamentoFormatado.filter(c => c.status === 'sem_boleto'));

    const { data: pag } = await supabase.from('finan_pagar').select('*').eq('status', 'financeiro').order('id', {ascending: false});
    const { data: rhData } = await supabase.from('finan_rh').select('*').neq('status', 'concluido');

    setListaPagar((pag || []).map(p => ({...p, gTipo: 'pagar'})));
    setListaRH((rhData || []).map(rh => ({...rh, gTipo: 'rh'})));
  } catch (err) { console.error(err); }
 }

 useEffect(() => {
  if (userProfile) carregarDados()
 }, [userProfile]);

 useEffect(() => {
    const channel = supabase
      .channel('home_financeiro_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Chamado_NF' }, () => carregarDados())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finan_pagar' }, () => carregarDados())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finan_rh' }, () => carregarDados())
      .subscribe();
    return () => { supabase.removeChannel(channel) };
 }, []);

 useEffect(() => {
  const id = searchParams.get('id');
  const tipo = searchParams.get('tipo');
  if (!id || !tipo) return;
  const listas = { boleto: listaBoletos, pagar: listaPagar, rh: listaRH };
  const card = (listas[tipo] || []).find(t => String(t.id) === id);
  if (card) setTarefaSelecionada(card);
 }, [searchParams, listaBoletos, listaPagar, listaRH]);

 const getCardLabel = (t) => {
    if (t.gTipo === 'pagar') return `Pagar #${t.id} - ${t.fornecedor || ''}`;
    if (t.gTipo === 'receber') return `Receber #${t.id} - ${t.cliente || ''}`;
    if (t.gTipo === 'rh') return `RH #${t.id} - ${t.funcionario || ''}`;
    return `NF #${t.id} - ${t.nom_cliente || t.tarefa || ''}`;
 };

 const notificarMovimento = (tabela, t, novoStatus, descExtra) => {
    const label = getCardLabel(t);
    const statusLabels = { gerar_boleto: 'Gerar Boleto', enviar_cliente: 'Enviar ao Cliente', aguardando_vencimento: 'Aguardando Vencimento', pago: 'Pago', vencido: 'Vencido', concluido: 'Concluído', financeiro: 'Financeiro' };
    const titulo = `Card movimentado → ${statusLabels[novoStatus] || novoStatus}`;
    const descricao = descExtra || label;
    const tipo = t.gTipo || 'boleto';
    marcarMinhaAcao(tabela, t.id, {
      titulo, descricao,
      link: `/financeiro/home-financeiro?id=${t.id}&tipo=${tipo}`,
      userId: userProfile?.id,
      alvo: 'posvendas',
    });
 };
 const getCardTable = (t) => t.gTipo === 'pagar' ? 'finan_pagar' : t.gTipo === 'receber' ? 'finan_receber' : t.gTipo === 'rh' ? 'finan_rh' : 'Chamado_NF';

 const handleUpdateField = async (t, field, value) => {
    const table = getCardTable(t);
    await supabase.from(table).update({ [field]: value }).eq('id', t.id);
    auditLog({ sistema: 'financeiro', acao: 'editar', entidade: table, entidade_id: String(t.id), entidade_label: getCardLabel(t), detalhes: { campo: field, valor: value } });
    notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} alterou ${getCardLabel(t)}`, `Campo: ${field}`, `/financeiro/home-financeiro`)
    carregarDados();
    if(tarefaSelecionada) setTarefaSelecionada(prev => ({ ...prev, [field]: value }));
 };

 const handleUpdateFileDirect = async (t, field, file) => {
    if(!file) return;
    try {
      const table = getCardTable(t);
      const path = `anexos/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { error: uploadError } = await supabase.storage.from('anexos').upload(path, file);
      if (uploadError) throw uploadError;
      const { data: linkData } = supabase.storage.from('anexos').getPublicUrl(path);

      let updateData = { [field]: linkData.publicUrl };

      // Auto-move: ao anexar boleto em card "gerar_boleto" → mover para "enviar_cliente"
      if (field.startsWith('anexo_boleto') && t.status === 'gerar_boleto' && table === 'Chamado_NF') {
        updateData.status = 'enviar_cliente';
        updateData.tarefa = 'Enviar para o Cliente';
        updateData.setor = 'Pós-Vendas';
      }

      await supabase.from(table).update(updateData).eq('id', t.id);
      auditLog({ sistema: 'financeiro', acao: 'upload', entidade: table, entidade_id: String(t.id), entidade_label: getCardLabel(t), detalhes: { campo: field, arquivo: file.name } });

      if (updateData.status === 'enviar_cliente') {
        notificarMovimento('Chamado_NF', t, 'enviar_cliente', `${getCardLabel(t)} — Boleto anexado, enviar ao cliente`);
        notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} anexou boleto em ${getCardLabel(t)}`, `Card movido para Enviar ao Cliente`, `/financeiro/home-financeiro`)
        alert("Boleto anexado! Card movido para Enviar ao Cliente.");
      } else {
        notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} atualizou arquivo em ${getCardLabel(t)}`, `Campo: ${field}`, `/financeiro/home-financeiro`)
        alert("Arquivo atualizado!");
      }
      carregarDados();
      if(tarefaSelecionada) setTarefaSelecionada(prev => ({ ...prev, ...updateData }));
    } catch (err) { alert("Erro: " + err.message); }
 };

 const handleGerarBoletoFinanceiro = async (t) => {
  if (!fileBoleto) return alert("Anexe o arquivo.");
  try {
    const path = `boletos/${Date.now()}-${fileBoleto.name}`;
    await supabase.storage.from('anexos').upload(path, fileBoleto);
    const { data } = supabase.storage.from('anexos').getPublicUrl(path);

    notificarMovimento('Chamado_NF', t, 'enviar_cliente', `${getCardLabel(t)} — Boleto gerado`);
    await supabase.from('Chamado_NF').update({
        status: 'enviar_cliente',
        tarefa: 'Enviar Boleto para o Cliente',
        setor: 'Pós-Vendas',
        anexo_boleto: data.publicUrl
    }).eq('id', t.id);

    auditLog({ sistema: 'financeiro', acao: 'mover_status', entidade: 'Chamado_NF', entidade_id: String(t.id), entidade_label: getCardLabel(t), detalhes: { de: t.status, para: 'enviar_cliente', acao_desc: 'Boleto gerado e enviado ao Pós-Vendas' } });
    notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} gerou boleto — ${getCardLabel(t)}`, `Enviado ao Pós-Vendas`, `/financeiro/home-financeiro`)
    alert("Tarefa enviada ao Pós-Vendas!"); setTarefaSelecionada(null); carregarDados();
  } catch (err) { alert("Erro: " + err.message); }
 };

 const handleMoverParaPago = async (t) => {
    notificarMovimento('Chamado_NF', t, 'pago', `${getCardLabel(t)} — Pagamento confirmado`);
    await supabase.from('Chamado_NF').update({ status: 'pago', tarefa: 'Pagamento Confirmado' }).eq('id', t.id);
    auditLog({ sistema: 'financeiro', acao: 'mover_status', entidade: 'Chamado_NF', entidade_id: String(t.id), entidade_label: getCardLabel(t), detalhes: { de: t.status, para: 'pago', acao_desc: 'Pagamento confirmado' } });
    notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} confirmou pagamento — ${getCardLabel(t)}`, null, `/financeiro/home-financeiro`)
    alert("Pagamento confirmado e processo finalizado!"); setTarefaSelecionada(null); carregarDados();
 };

 const handleConcluirGeral = async (t) => {
    const table = getCardTable(t);
    notificarMovimento(table, t, 'concluido', `${getCardLabel(t)} — Processo concluído`);
    await supabase.from(table).update({ status: 'concluido' }).eq('id', t.id);
    auditLog({ sistema: 'financeiro', acao: 'mover_status', entidade: table, entidade_id: String(t.id), entidade_label: getCardLabel(t), detalhes: { de: t.status, para: 'concluido', acao_desc: 'Processo concluído' } });
    notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} concluiu ${getCardLabel(t)}`, null, `/financeiro/home-financeiro`)
    alert("Processo concluído!"); setTarefaSelecionada(null); carregarDados();
 };

 const handlePedirRecobranca = async (t) => {
    if (!window.confirm("Deseja solicitar recobrança ao Pós-Vendas?")) return;
    const newVal = (t.recombrancas_qtd || 0) + 1;
    notificarMovimento('Chamado_NF', t, 'vencido', `${getCardLabel(t)} — Recobrança #${newVal}`);
    await supabase.from('Chamado_NF').update({
        status: 'vencido',
        tarefa: 'Cobrar Cliente (Recobrança)',
        setor: 'Pós-Vendas',
        recombrancas_qtd: newVal
    }).eq('id', t.id);
    auditLog({ sistema: 'financeiro', acao: 'mover_status', entidade: 'Chamado_NF', entidade_id: String(t.id), entidade_label: getCardLabel(t), detalhes: { de: t.status, para: 'vencido', acao_desc: `Recobrança #${newVal} solicitada ao Pós-Vendas` } });
    notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} solicitou recobrança #${newVal}`, getCardLabel(t), `/financeiro/home-financeiro`)
    alert("Recobrança solicitada ao Pós-Vendas!"); setTarefaSelecionada(null); carregarDados();
 };

 const handleSomenteVencido = async (t) => {
    notificarMovimento('Chamado_NF', t, 'vencido');
    await supabase.from('Chamado_NF').update({ status: 'vencido' }).eq('id', t.id);
    auditLog({ sistema: 'financeiro', acao: 'mover_status', entidade: 'Chamado_NF', entidade_id: String(t.id), entidade_label: getCardLabel(t), detalhes: { de: t.status, para: 'vencido' } });
    notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} moveu para Vencido — ${getCardLabel(t)}`, null, `/financeiro/home-financeiro`)
    alert("Card movido para Vencido!"); setTarefaSelecionada(null); carregarDados();
 };

 const handleAddRequisicao = async (t) => {
  const reqs = getRequisicoes(t);
  reqs.push({ numero: '', anexo_url: '' });
  await handleUpdateField(t, 'requisicoes_json', JSON.stringify(reqs));
 };

 const handleRemoveRequisicao = async (t, index) => {
  const reqs = getRequisicoes(t);
  reqs.splice(index, 1);
  await handleUpdateField(t, 'requisicoes_json', JSON.stringify(reqs));
 };

 const handleRequisicaoAnexo = async (t, index, file) => {
  if (!file) return;
  try {
   const path = `requisicoes/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
   const { error: uploadError } = await supabase.storage.from('anexos').upload(path, file);
   if (uploadError) throw uploadError;
   const { data: linkData } = supabase.storage.from('anexos').getPublicUrl(path);
   const reqs = getRequisicoes(t);
   reqs[index] = { ...reqs[index], anexo_url: linkData.publicUrl };
   await handleUpdateField(t, 'requisicoes_json', JSON.stringify(reqs));
  } catch (err) { alert("Erro: " + err.message); }
 };

 const isBoleto30 = tarefaSelecionada?.forma_pagamento === 'Boleto 30 dias';
 const isParcelamento = tarefaSelecionada?.forma_pagamento?.toLowerCase().includes('parcelado');
 const isBoletoType = tarefaSelecionada && (tarefaSelecionada.forma_pagamento?.toLowerCase().includes('boleto'));
 const isCashOrCardType = tarefaSelecionada && ['Pix', 'Cartão a vista', 'Cartão Parcelado'].includes(tarefaSelecionada.forma_pagamento);

 const valorIndividual = tarefaSelecionada ? (tarefaSelecionada.valor_servico / (tarefaSelecionada.qtd_parcelas || 1)) : 0;

 return (
  <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
   <FinanceiroNav>
      <div style={{ display: 'flex', alignItems: 'center', background: '#f5f5f5', borderRadius: '8px', padding: '4px 10px', gap: '6px' }}>
        <button onClick={() => setZoom(prev => Math.max(0.5, prev - 0.1))} style={zoomBtnStyle} title="Diminuir zoom"><ZoomOut size={15} color="#737373" /></button>
        <span style={{ fontSize: '12px', fontWeight: '500', color: '#525252', minWidth: '38px', textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(prev => Math.min(1.5, prev + 0.1))} style={zoomBtnStyle} title="Aumentar zoom"><ZoomIn size={15} color="#737373" /></button>
      </div>
      <div style={{ position: 'relative' }}>
        <button title="Novo Chamado" onClick={() => setShowNovoMenu(!showNovoMenu)} style={{
          background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color:'#fff',
          border:'none', padding:'8px 16px', borderRadius:'8px', fontWeight:'500',
          cursor:'pointer', fontSize:'12px', display: 'flex', alignItems: 'center', gap: '6px',
          boxShadow: '0 2px 6px rgba(220,38,38,0.25)', transition: '0.2s',
        }}><PlusCircle size={15} /> NOVO</button>
        {showNovoMenu && (
         <div onMouseLeave={() => setShowNovoMenu(false)} style={{
           position:'absolute', top:'calc(100% + 6px)', right: 0, background:'#fff', zIndex:2000,
           width:'200px', borderRadius: '12px', border:'1px solid #f0f0f0',
           boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
         }}>
          <div onClick={() => router.push('/financeiro/novo-chamado-nf')} style={{ padding:'12px 16px', cursor:'pointer', color:'#1a1a1a', borderBottom:'1px solid #f5f5f5', fontSize:'13px', fontWeight: '600', transition: '0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background='#fef2f2'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}>Boleto</div>
          <div onClick={() => router.push('/financeiro/novo-pagar-receber?tipo=pagar')} style={{ padding:'12px 16px', cursor:'pointer', color:'#1a1a1a', borderBottom:'1px solid #f5f5f5', fontSize:'13px', fontWeight: '600', transition: '0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background='#fef2f2'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}>Pagar</div>
          <div onClick={() => router.push('/financeiro/novo-chamado-rh')} style={{ padding:'12px 16px', cursor:'pointer', color:'#dc2626', fontSize:'13px', fontWeight: '600', transition: '0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background='#fef2f2'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}>RH</div>
         </div>
        )}
      </div>
   </FinanceiroNav>

   <div style={{ padding: '24px 32px' }}>

    <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr 1fr',
        gap: '30px',
        transform: `scale(${zoom})`,
        transformOrigin: 'top left',
        width: `${100 / zoom}%`
    }}>
      <div style={colWrapperStyle}>
       <div style={colTitleStyle}>Faturamento</div>
       <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', borderTop: '0.5px solid #dcdde1' }}>
        {listaBoletos.filter(c => c.status === 'gerar_boleto' || c.status === 'validar_pix' || (c.status === 'aguardando_vencimento' && (c.isTarefaPagamentoRealizado || c.parcelaVencida))).map((t, idx) => (
         <div key={`bol-${t.id}-${idx}`} onClick={() => setTarefaSelecionada(t)} className="task-card-grid">
          <div style={{ background: '#f1f5f9', padding: '24px', borderBottom: '0.5px solid #dcdde1' }}>
            <h4 style={{ margin: 0, fontSize: '18px', fontWeight:'500', color: '#1e293b' }}>{t.nom_cliente?.toUpperCase()}</h4>
            {t.isTarefaPagamentoRealizado && (
                <div style={{ marginTop: '12px', background: 'linear-gradient(90deg, #3b82f6, #2563eb)', color: '#fff', fontSize: '10px', fontWeight: '600', padding: '6px 12px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 10px rgba(37, 99, 235, 0.2)' }}>
                    <CheckCircle size={14}/> PAGAMENTO REALIZADO - CONFERIR
                </div>
            )}
          </div>
          <div style={{ padding: '24px', background: '#ffffff' }}>
            <div style={miniTagStyle}><CreditCard size={14}/> {t.forma_pagamento?.toUpperCase()}</div>
            {(t.num_nf_servico || t.num_nf_peca) && (
              <div style={{display:'flex', gap:'6px', marginTop:'10px', flexWrap:'wrap'}}>
                {t.num_nf_servico && <span style={{background:'#f0fdf4', color:'#16a34a', fontSize:'11px', fontWeight:'600', padding:'3px 8px', border:'1px solid #bbf7d0', borderRadius:'4px'}}>NF S {t.num_nf_servico}</span>}
                {t.num_nf_peca && <span style={{background:'#eff6ff', color:'#3b82f6', fontSize:'11px', fontWeight:'600', padding:'3px 8px', border:'1px solid #bfdbfe', borderRadius:'4px'}}>NF P {t.num_nf_peca}</span>}
              </div>
            )}
            <div style={{fontSize:'26px', color:'#0f172a', margin: '15px 0 5px 0', fontWeight: '600'}}>{formatarMoeda(t.valor_exibicao)}</div>
            <div style={{fontSize:'14px', color: '#64748b', textTransform:'uppercase', letterSpacing:'1px'}}>{t.status === 'validar_pix' ? 'VALIDAÇÃO PIX' : `Venc: ${formatarData(t.vencimento_boleto)}`}</div>
            {t.anexo_boleto && (t.status === 'gerar_boleto' || t.status === 'validar_pix') && (
                <div style={{marginTop: '12px', display:'flex', alignItems:'center', gap:'8px', color: '#4f46e5', fontSize: '12px', fontWeight: '500'}} title="Boleto já foi anexado">
                  <FileText size={16} /> BOLETO ANEXADO
                </div>
            )}
            {t.isVencidoDisplay && !t.isTarefaPagamentoRealizado && !t.parcelaVencida && (
             <div style={{marginTop: '20px', background: '#fee2e2', border: '1px solid #ef4444', padding: '15px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <span style={{color: '#ef4444', fontWeight: '600', fontSize: '14px'}}>VENCIDO</span>
                <button onClick={(e) => {e.stopPropagation(); alert('Vencimento conferido.')}} style={{background: '#ef4444', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: '500'}}>CONFERIDO</button>
             </div>
            )}
            {t.parcelaVencida && !t.isTarefaPagamentoRealizado && (
             <div style={{marginTop: '20px', background: '#fff7ed', border: '1px solid #f97316', padding: '12px 15px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                <AlertCircle size={16} color="#f97316" />
                <span style={{color: '#f97316', fontWeight: '600', fontSize: '13px'}}>PARCELA VENCIDA SEM COMPROVANTE</span>
             </div>
            )}
          </div>
         </div>
        ))}
       </div>
      </div>

      <div style={colWrapperStyle}>
       <div style={colTitleStyle}>Requisições</div>
       <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', borderTop: '0.5px solid #dcdde1' }}>
        {listaPagar.map((t, idx) => (
         <div key={`pag-${t.id}-${idx}`} onClick={() => setTarefaSelecionada(t)} className="task-card-grid">
          <div style={{ background: '#f1f5f9', padding: '24px', borderBottom: '0.5px solid #dcdde1' }}>
            <h4 style={{ margin: 0, fontSize: '18px', fontWeight:'500', color: '#1e293b' }}>{t.fornecedor?.toUpperCase()}</h4>
            {(getRequisicoes(t).filter(r => r.numero).length > 0 || t.anexo_requisicao) && (
              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {getRequisicoes(t).filter(r => r.numero).map((req, i) => (
                  <span key={i} style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '10px', fontWeight: '600', padding: '4px 8px', border: '1px solid #7dd3fc', borderRadius: '4px' }}>#{req.numero}</span>
                ))}
                {t.anexo_requisicao && t.anexo_requisicao.split(',').filter(u => u.trim()).map((_, i) => (
                  <span key={`old-${i}`} style={{ background: '#fef3c7', color: '#92400e', fontSize: '10px', fontWeight: '600', padding: '4px 8px', border: '1px solid #fcd34d', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><Paperclip size={10}/> Req {i + 1}</span>
                ))}
              </div>
            )}
          </div>
          <div style={{ padding: '24px', background: '#ffffff' }}>
            <div style={miniTagStyle}><CreditCard size={14}/> {t.metodo?.toUpperCase() || 'DESPESA'}</div>
            {t.metodo === 'Carnê ISS' && (
              <div style={{ marginTop: '8px', display: 'inline-block', background: '#fef3c7', color: '#92400e', fontSize: '11px', fontWeight: '700', padding: '4px 10px', borderRadius: '6px', border: '1px solid #fcd34d', letterSpacing: '0.5px' }}>CARNÊ ISS</div>
            )}
            <div style={{fontSize:'26px', color:'#0f172a', margin: '15px 0 5px 0', fontWeight: '600'}}>{formatarMoeda(t.valor)}</div>
            <div style={{fontSize:'14px', color: '#64748b', textTransform:'uppercase', letterSpacing:'1px'}}>Venc: {formatarData(t.data_vencimento)}</div>
          </div>
         </div>
        ))}
       </div>
      </div>

      <div style={colWrapperStyle}>
       <div style={colTitleStyle}>Cliente Sem Boleto</div>
       <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', borderTop: '0.5px solid #dcdde1' }}>
        {listaSemBoleto.map((t, idx) => (
         <div key={`sb-${t.id}-${idx}`} onClick={() => setTarefaSelecionada(t)} className="task-card-grid" style={{ cursor: 'pointer' }}>
          <div style={{ background: '#f1f5f9', padding: '24px', borderBottom: '0.5px solid #dcdde1' }}>
            <h4 style={{ margin: 0, fontSize: '18px', fontWeight:'500', color: '#1e293b' }}>{t.nom_cliente?.toUpperCase()}</h4>
          </div>
          <div style={{ padding: '24px', background: '#ffffff' }}>
            <div style={miniTagStyle}><CreditCard size={14}/> {t.forma_pagamento?.toUpperCase()}</div>
            {(t.num_nf_servico || t.num_nf_peca) && (
              <div style={{display:'flex', gap:'6px', marginTop:'10px', flexWrap:'wrap'}}>
                {t.num_nf_servico && <span style={{background:'#f0fdf4', color:'#16a34a', fontSize:'11px', fontWeight:'600', padding:'3px 8px', border:'1px solid #bbf7d0', borderRadius:'4px'}}>NF S {t.num_nf_servico}</span>}
                {t.num_nf_peca && <span style={{background:'#eff6ff', color:'#3b82f6', fontSize:'11px', fontWeight:'600', padding:'3px 8px', border:'1px solid #bfdbfe', borderRadius:'4px'}}>NF P {t.num_nf_peca}</span>}
              </div>
            )}
            <div style={{fontSize:'26px', color:'#0f172a', margin: '15px 0 5px 0', fontWeight: '600'}}>{formatarMoeda(t.valor_exibicao)}</div>
            <div style={{fontSize:'14px', color: '#64748b', textTransform:'uppercase', letterSpacing:'1px'}}>Venc: {formatarData(t.vencimento_boleto)}</div>
          </div>
         </div>
        ))}
        {listaSemBoleto.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af', fontSize: '13px' }}>Nenhum cliente sem boleto</div>
        )}
       </div>
      </div>

      <div style={colWrapperStyle}>
       <div style={colTitleStyle}>RH</div>
       <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', borderTop: '0.5px solid #dcdde1' }}>
        {listaRH.map((t, idx) => (
         <div key={`rh-${t.id}-${idx}`} onClick={() => setTarefaSelecionada(t)} className="task-card-grid">
          <div style={{padding:'24px', background: '#f1f5f9', borderLeft: '6px solid #8b5cf6', borderBottom: '0.5px solid #dcdde1'}}>
            <h4 style={{fontSize:'18px', color:'#1e293b', fontWeight:'500'}}>{t.funcionario?.toUpperCase()}</h4>
            <div style={{fontSize:'14px', color:'#0ea5e9', marginTop:'10px', textTransform:'uppercase', letterSpacing:'1px', fontWeight: '500'}}>{t.setor}</div>
          </div>
          <div style={{padding:'24px', background:'#ffffff', borderBottom: '0.5px solid #dcdde1'}}>
             <div style={{fontSize:'14px', color:'#64748b', fontWeight:'400'}}>{t.titulo}</div>
          </div>
         </div>
        ))}
       </div>
      </div>
    </div>

   {tarefaSelecionada && (
    <div onClick={(e) => { if (e.target === e.currentTarget) setTarefaSelecionada(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(10px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
     <div style={{ background: '#ffffff', width: '1100px', maxWidth: '98%', maxHeight: '95vh', borderRadius: '12px', overflow:'hidden', boxShadow:'0 50px 100px rgba(0,0,0,0.1)', border: '1px solid #dcdde1', display: 'flex', flexDirection: 'column' }}>

      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <button onClick={() => setTarefaSelecionada(null)} className="btn-back-light"><ArrowLeft size={16}/> VOLTAR AO PAINEL</button>
        <button onClick={() => setTarefaSelecionada(null)} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', cursor:'pointer', padding:'8px 12px', display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', fontSize: '13px', fontWeight: '600', transition: '0.2s' }} title="Fechar"><X size={18}/> Fechar</button>
      </div>
      <div style={{ padding: '30px 60px 60px', overflowY: 'auto', flex: 1, color: '#1e293b' }}>

        {/* TÍTULO DINÂMICO DO MODAL */}
        <div style={{marginTop:'25px', marginBottom:'45px'}}>
            <label style={labelMStyle}>{tarefaSelecionada.gTipo === 'pagar' ? 'FORNECEDOR' : 'PROCESSO'}</label>
            <h2 style={{fontSize:'36px', color:'#0f172a', fontWeight:'300', lineHeight:'1.1', margin:'10px 0 0'}}>
                {tarefaSelecionada.nom_cliente || tarefaSelecionada.fornecedor || tarefaSelecionada.funcionario}
            </h2>
        </div>

        {/* ÁREA DE VALORES E VENCIMENTO (TOP MODAL) */}
        <div style={{display:'flex', gap:'30px', marginBottom:'45px'}}>
          <div style={fieldBoxModal}>
            <label style={labelMStyle}>{tarefaSelecionada.gTipo === 'rh' ? 'MOTIVO' : 'CONDIÇÃO/MÉTODO'}</label>
            <p style={pModalStyle}>{tarefaSelecionada.gTipo === 'pagar' ? (tarefaSelecionada.metodo?.toUpperCase() || 'N/A') : (tarefaSelecionada.forma_pagamento?.toUpperCase() || tarefaSelecionada.metodo?.toUpperCase() || 'N/A')}</p>
          </div>

          {tarefaSelecionada.gTipo !== 'rh' && (
            <>
              <div style={fieldBoxModal}>
                <label style={labelMStyle}>VALOR DO REGISTRO</label>
                <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                    <span style={{fontSize:'22px', fontWeight:'500', color:'#64748b'}}>R$</span>
                    <input
                      type="number"
                      style={{ ...inputStyleLight, border:'none', padding:0, fontSize:'34px', fontWeight:'500', background:'transparent' }}
                      defaultValue={tarefaSelecionada.valor_exibicao || tarefaSelecionada.valor}
                      onBlur={e => handleUpdateField(tarefaSelecionada, tarefaSelecionada.gTipo === 'boleto' ? 'valor_servico' : 'valor', e.target.value)}
                    />
                </div>
              </div>

              <div style={fieldBoxModal}>
                <label style={labelMStyle}>DATA DE VENCIMENTO</label>
                <input
                  type="date"
                  style={{ ...inputStyleLight, border:'none', padding:0, fontSize:'30px', fontWeight:'500', background:'transparent', color:'#ef4444' }}
                  defaultValue={tarefaSelecionada.vencimento_boleto || tarefaSelecionada.data_vencimento}
                  onBlur={e => handleUpdateField(tarefaSelecionada, (tarefaSelecionada.gTipo === 'boleto' ? 'vencimento_boleto' : 'data_vencimento'), e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        {/* DISTRIBUIÇÃO ESPECÍFICA PARA PAGAR/RECEBER */}
        {tarefaSelecionada.gTipo === 'pagar' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'24px', padding:'40px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'16px', marginBottom:'45px' }}>
                {tarefaSelecionada.metodo !== 'Carnê ISS' && (
                <div style={fieldBoxInner}>
                    <label style={labelMStyle}>NÚMERO DA NOTA FISCAL</label>
                    <input
                        style={inputStyleLight}
                        placeholder="Ex: 000.000.000"
                        defaultValue={tarefaSelecionada.numero_NF || ''}
                        onBlur={e => handleUpdateField(tarefaSelecionada, 'numero_NF', e.target.value)}
                    />
                </div>
                )}
                <div style={fieldBoxInner}>
                    <label style={{...labelMStyle, display:'flex', alignItems:'center', gap:'8px', marginBottom:'14px'}}>DESCRIÇÃO / OBSERVAÇÕES</label>
                    <textarea
                        style={{...inputStyleLight, minHeight:'180px', resize:'vertical', lineHeight:'1.7', fontSize:'15px', padding:'18px 20px', fontFamily:'Montserrat, sans-serif'}}
                        defaultValue={tarefaSelecionada.motivo}
                        onBlur={e => handleUpdateField(tarefaSelecionada, 'motivo', e.target.value)}
                        placeholder="Detalhes do pagamento, observações relevantes..."
                    />
                </div>

                {/* PARCELAS — só aparece se for Boleto Parcelado */}
                {tarefaSelecionada.metodo === 'Boleto Parcelado' && tarefaSelecionada.parcelas_vencimentos && (
                  <div style={{ padding:'20px', background:'#f0f9ff', borderRadius:'12px', border:'1px solid #bae6fd' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'14px' }}>
                      <CreditCard size={16} style={{ color:'#0284c7' }} />
                      <label style={{ ...labelMStyle, marginBottom:0, color:'#0c4a6e' }}>PARCELAS ({tarefaSelecionada.qtd_parcelas || '—'}x)</label>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                      {tarefaSelecionada.parcelas_vencimentos.split(',').map((entry, i) => {
                        const [data, valor] = entry.trim().split('|')
                        return (
                          <div key={i} style={{ display:'grid', gridTemplateColumns:'80px 1fr 1fr', gap:'10px', alignItems:'center', background:'#fff', padding:'10px 14px', borderRadius:'8px', border:'1px solid #e0f2fe' }}>
                            <span style={{ fontSize:'13px', fontWeight:'700', color:'#0c4a6e' }}>Parcela {i + 1}</span>
                            <span style={{ fontSize:'14px', color:'#1e293b' }}>R$ {parseFloat(valor || 0).toFixed(2).replace('.', ',')}</span>
                            <span style={{ fontSize:'14px', color:'#64748b' }}>{data ? new Date(data + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
            </div>
        )}

        {/* REQUISIÇÕES */}
        {tarefaSelecionada.gTipo === 'pagar' && (
            <div style={{ border:'1px solid #e5e7eb', padding:'35px', background:'#f8fafc', marginBottom:'45px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
                    <label style={labelMStyle}>REQUISIÇÕES</label>
                    <button onClick={() => handleAddRequisicao(tarefaSelecionada)} style={{ background:'#dc2626', color:'#fff', border:'none', padding:'8px 16px', borderRadius:'8px', cursor:'pointer', fontSize:'12px', fontWeight:'600', display:'flex', alignItems:'center', gap:'6px' }}><PlusCircle size={14}/> Adicionar</button>
                </div>
                {/* Anexos do formato antigo (anexo_requisicao) */}
                {tarefaSelecionada.anexo_requisicao && tarefaSelecionada.anexo_requisicao.split(',').filter(u => u.trim()).map((url, i) => (
                    <div key={`old-${i}`} style={{ display:'grid', gridTemplateColumns:'180px 1fr', gap:'20px', alignItems:'center', background:'#ffffff', padding:'18px', borderBottom:'1px solid #e5e7eb', marginBottom:'4px' }}>
                        <div>
                            <label style={{ ...labelMStyle, fontSize:'14px', display:'block', marginBottom:'6px' }}>REQUISIÇÃO {i + 1}</label>
                        </div>
                        <AttachmentTag
                            icon={<Paperclip size={18} />}
                            label={`ANEXO REQUISIÇÃO ${i + 1}`}
                            fileUrl={url.trim()}
                            disabled
                        />
                    </div>
                ))}
                {/* Anexos do formato novo (requisicoes_json) */}
                {getRequisicoes(tarefaSelecionada).map((req, i) => (
                    <div key={i} style={{ display:'grid', gridTemplateColumns:'180px 1fr auto', gap:'20px', alignItems:'center', background:'#ffffff', padding:'18px', borderBottom:'1px solid #e5e7eb', marginBottom:'4px' }}>
                        <div>
                            <label style={{ ...labelMStyle, fontSize:'14px', display:'block', marginBottom:'6px' }}>Nº REQUISIÇÃO</label>
                            <input
                                placeholder="Ex: 00123"
                                defaultValue={req.numero}
                                style={inputStyleLight}
                                onBlur={e => {
                                    const reqs = getRequisicoes(tarefaSelecionada);
                                    reqs[i] = { ...reqs[i], numero: e.target.value };
                                    handleUpdateField(tarefaSelecionada, 'requisicoes_json', JSON.stringify(reqs));
                                }}
                            />
                        </div>
                        <AttachmentTag
                            icon={<Paperclip size={18} />}
                            label={`ANEXO REQ ${req.numero || (i + 1)}`}
                            fileUrl={req.anexo_url}
                            onUpload={f => handleRequisicaoAnexo(tarefaSelecionada, i, f)}
                        />
                        <button onClick={() => handleRemoveRequisicao(tarefaSelecionada, i)} style={{ background:'transparent', border:'none', cursor:'pointer', color:'#ef4444', padding:'8px' }} title="Remover"><Trash2 size={18}/></button>
                    </div>
                ))}
            </div>
        )}

        {/* PARCELAMENTO (APENAS BOLETO FATURAMENTO) */}
        {!isBoleto30 && isParcelamento && tarefaSelecionada.gTipo === 'boleto' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'20px', background:'#f8fafc', padding:'40px', border:'1px solid #e5e7eb', marginBottom:'45px' }}>
                <div style={{ display:'flex', gap:'40px', borderBottom:'1px solid #e5e7eb', paddingBottom:'20px' }}>
                    <div>
                        <label style={labelMStyle}>QUANTIDADE</label>
                        <select
                            style={{ ...inputStyleLight, width:'120px', padding:'10px' }}
                            value={tarefaSelecionada.qtd_parcelas || 1}
                            onChange={e => handleUpdateField(tarefaSelecionada, 'qtd_parcelas', e.target.value)}
                        >
                            {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}x</option>)}
                        </select>
                    </div>
                    <div><label style={labelMStyle}>VALOR PARCELA</label><p style={{fontSize:'25px', fontWeight:'400'}}>{formatarMoeda(valorIndividual)}</p></div>
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:'15px' }}>
                    <div style={cascadeRowStyle}>
                        <span style={cascadeLabelStyle}>1ª PARCELA</span>
                        <input type="date" style={inputCascadeStyle} defaultValue={tarefaSelecionada.vencimento_boleto} onBlur={e => handleUpdateField(tarefaSelecionada, 'vencimento_boleto', e.target.value)} />
                        <span style={cascadeValueStyle}>{formatarMoeda(valorIndividual)}</span>
                        <AttachmentTag
                            label="COMPROVANTE P1"
                            fileUrl={tarefaSelecionada.comprovante_pagamento || tarefaSelecionada.comprovante_pagamento_p1}
                            onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'comprovante_pagamento_p1', f)}
                            onRemove={async () => {
                                const table = getCardTable(tarefaSelecionada);
                                const updateData = { comprovante_pagamento_p1: null };
                                if (tarefaSelecionada.comprovante_pagamento) updateData.comprovante_pagamento = null;
                                await supabase.from(table).update(updateData).eq('id', tarefaSelecionada.id);
                                setTarefaSelecionada({ ...tarefaSelecionada, comprovante_pagamento_p1: null, comprovante_pagamento: null });
                                carregarDados();
                            }}
                        />
                    </div>
                    {Array.from({ length: (tarefaSelecionada.qtd_parcelas || 1) - 1 }).map((_, i) => {
                        const pNum = i + 2;
                        const rawDates = (tarefaSelecionada.datas_parcelas || "").split(/[\s,]+/).filter(d => d.includes('-'));
                        if (rawDates.length > 0 && rawDates[0] === tarefaSelecionada.vencimento_boleto) rawDates.shift();
                        return (
                            <div key={pNum} style={cascadeRowStyle}>
                                <span style={cascadeLabelStyle}>{pNum}ª PARCELA</span>
                                <input type="date" style={inputCascadeStyle} defaultValue={rawDates[i] || ""} onBlur={e => {
                                    let arr = [...rawDates];
                                    while (arr.length < (tarefaSelecionada.qtd_parcelas || 1) - 1) arr.push('');
                                    arr[i] = e.target.value;
                                    handleUpdateField(tarefaSelecionada, 'datas_parcelas', arr.filter(d => d).join(', '));
                                }} />
                                <span style={cascadeValueStyle}>{formatarMoeda(valorIndividual)}</span>
                                <AttachmentTag
                                    label={`COMPROVANTE P${pNum}`}
                                    fileUrl={tarefaSelecionada[`comprovante_pagamento_p${pNum}`]}
                                    onUpload={f => handleUpdateFileDirect(tarefaSelecionada, `comprovante_pagamento_p${pNum}`, f)}
                                    onRemove={async () => {
                                        const table = getCardTable(tarefaSelecionada);
                                        await supabase.from(table).update({ [`comprovante_pagamento_p${pNum}`]: null }).eq('id', tarefaSelecionada.id);
                                        setTarefaSelecionada({ ...tarefaSelecionada, [`comprovante_pagamento_p${pNum}`]: null });
                                        carregarDados();
                                    }}
                                />
                            </div>
                        )
                    })}
                </div>
            </div>
        )}

        {/* CAMPOS EXCLUSIVOS DE BOLETO (NF SERVIÇO/PEÇA) — só mostra campo se tiver dado */}
        {tarefaSelecionada.gTipo === 'boleto' && (
            <div style={{ display:'grid', gridTemplateColumns: (tarefaSelecionada.num_nf_servico && tarefaSelecionada.num_nf_peca) ? 'repeat(2, 1fr)' : '1fr', gap:'20px', border:'1px solid #e5e7eb', padding:'30px', background:'#f8fafc', marginBottom:'30px', borderRadius:'12px' }}>
                {(tarefaSelecionada.num_nf_servico || !tarefaSelecionada.num_nf_peca) && (
                  <div style={fieldBoxInner}><label style={labelMStyle}>NF SERVICO</label><input style={inputStyleLight} defaultValue={tarefaSelecionada.num_nf_servico} onBlur={e => handleUpdateField(tarefaSelecionada, 'num_nf_servico', e.target.value)} /></div>
                )}
                {(tarefaSelecionada.num_nf_peca || !tarefaSelecionada.num_nf_servico) && (
                  <div style={fieldBoxInner}><label style={labelMStyle}>NF PECA</label><input style={inputStyleLight} defaultValue={tarefaSelecionada.num_nf_peca} onBlur={e => handleUpdateField(tarefaSelecionada, 'num_nf_peca', e.target.value)} /></div>
                )}
                {tarefaSelecionada.obs && (
                  <div style={{gridColumn:'1 / -1', ...fieldBoxInner}}>
                    <label style={labelMStyle}>OBSERVAÇÕES</label>
                    <textarea style={{...inputStyleLight, minHeight:'100px', resize:'vertical', lineHeight:'1.6', fontSize:'14px', padding:'14px'}} defaultValue={tarefaSelecionada.obs} onBlur={e => handleUpdateField(tarefaSelecionada, 'obs', e.target.value)} />
                  </div>
                )}
            </div>
        )}

        {/* CAMPOS RH */}
        {tarefaSelecionada.gTipo === 'rh' && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:'30px', border:'1px solid #e5e7eb', padding:'45px', background:'#f8fafc', marginBottom:'45px' }}>
                <div style={fieldBoxInner}><label style={labelMStyle}>TÍTULO</label><p style={{fontSize:'21px', fontWeight: '400'}}>{tarefaSelecionada.titulo}</p></div>
                <div style={fieldBoxInner}><label style={labelMStyle}>SETOR</label><p style={{fontSize:'21px', color:'#0ea5e9', fontWeight: '400'}}>{tarefaSelecionada.setor?.toUpperCase()}</p></div>
                <div style={{...fieldBoxInner, gridColumn:'span 2'}}><label style={labelMStyle}>DESCRIÇÃO</label><p style={{fontSize:'19px', lineHeight:'1.6'}}>{tarefaSelecionada.descricao}</p></div>
            </div>
        )}

        {/* === DOCUMENTOS - LAYOUT INTERATIVO === */}
        <div style={{marginTop:'45px'}}>

            {/* --- FATURAMENTO (BOLETO) --- */}
            {tarefaSelecionada.gTipo === 'boleto' && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'25px' }}>
                {/* COLUNA: NOTAS FISCAIS RECEBIDAS DO POS-VENDAS */}
                <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'15px', padding:'30px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
                    <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:'#dcfce7', display:'flex', alignItems:'center', justifyContent:'center' }}><FileText size={18} color="#16a34a"/></div>
                    <div>
                      <div style={{ fontSize:'13px', color:'#16a34a', fontWeight:'500', letterSpacing:'1px', textTransform:'uppercase' }}>Notas Fiscais Recebidas</div>
                      <div style={{ fontSize:'11px', color:'#6b7280' }}>Documentos enviados pelo pos-vendas</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                    {(tarefaSelecionada.anexo_nf_servico || (!tarefaSelecionada.num_nf_peca && !tarefaSelecionada.anexo_nf_peca)) && (
                      <AttachmentTag icon={<FileText size={18}/>} label="NF SERVICO" fileUrl={tarefaSelecionada.anexo_nf_servico} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'anexo_nf_servico', f)} />
                    )}
                    {(tarefaSelecionada.anexo_nf_peca || (!tarefaSelecionada.num_nf_servico && !tarefaSelecionada.anexo_nf_servico)) && (
                      <AttachmentTag icon={<Paperclip size={18}/>} label="NF PECA" fileUrl={tarefaSelecionada.anexo_nf_peca} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'anexo_nf_peca', f)} />
                    )}
                    {(isCashOrCardType || tarefaSelecionada.isTarefaPagamentoRealizado) && (
                      <AttachmentTag icon={<CheckCircle size={18}/>} label="COMPROVANTE PAGAMENTO" fileUrl={tarefaSelecionada.comprovante_pagamento} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'comprovante_pagamento', f)} onRemove={async () => {
                        const table = getCardTable(tarefaSelecionada);
                        await supabase.from(table).update({ comprovante_pagamento: null }).eq('id', tarefaSelecionada.id);
                        setTarefaSelecionada({ ...tarefaSelecionada, comprovante_pagamento: null });
                        carregarDados();
                      }} />
                    )}
                  </div>
                </div>

                {/* COLUNA: BOLETOS - AREA DO FINANCEIRO — só mostra se NÃO for Pix/Cartão à vista e NÃO for sem_boleto */}
                {!isCashOrCardType && tarefaSelecionada.status !== 'sem_boleto' && (
                <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'15px', padding:'30px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
                    <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:'#dbeafe', display:'flex', alignItems:'center', justifyContent:'center' }}><Barcode size={18} color="#3b82f6"/></div>
                    <div>
                      <div style={{ fontSize:'13px', color:'#3b82f6', fontWeight:'500', letterSpacing:'1px', textTransform:'uppercase' }}>Boletos Gerados</div>
                      <div style={{ fontSize:'11px', color:'#6b7280' }}>Anexe os boletos para devolver ao pos-vendas</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                    {(() => {
                      // Unificar boletos: campo principal + legado _2/_3
                      const urls = [];
                      if (tarefaSelecionada.anexo_boleto) {
                        tarefaSelecionada.anexo_boleto.split(',').forEach(u => { const t = u.trim(); if (t) urls.push(t); });
                      }
                      if (tarefaSelecionada.anexo_boleto_2) { const t = tarefaSelecionada.anexo_boleto_2.trim(); if (t && !urls.includes(t)) urls.push(t); }
                      if (tarefaSelecionada.anexo_boleto_3) { const t = tarefaSelecionada.anexo_boleto_3.trim(); if (t && !urls.includes(t)) urls.push(t); }
                      const MAX_BOLETOS = 10;
                      return (
                        <>
                          {urls.map((url, i) => (
                            <AttachmentTag key={`bol-${i}`} icon={<Barcode size={18}/>} label={`BOLETO ${i + 1}`} fileUrl={url} onUpload={async f => {
                              const path = `anexos/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
                              const { error: upErr } = await supabase.storage.from('anexos').upload(path, f);
                              if (upErr) { alert('Erro no upload: ' + upErr.message); return; }
                              const { data: linkData } = supabase.storage.from('anexos').getPublicUrl(path);
                              const novasUrls = [...urls]; novasUrls[i] = linkData.publicUrl;
                              const table = getCardTable(tarefaSelecionada);
                              await supabase.from(table).update({ anexo_boleto: novasUrls.join(', ') }).eq('id', tarefaSelecionada.id);
                              setTarefaSelecionada({ ...tarefaSelecionada, anexo_boleto: novasUrls.join(', ') });
                              carregarDados();
                            }} />
                          ))}
                          {urls.length < MAX_BOLETOS && (
                            <AttachmentTag icon={<Barcode size={18}/>} label={urls.length === 0 ? 'BOLETO 1' : `ADICIONAR BOLETO ${urls.length + 1}`} fileUrl={null} onUpload={async f => {
                              const path = `anexos/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
                              const { error: upErr } = await supabase.storage.from('anexos').upload(path, f);
                              if (upErr) { alert('Erro no upload: ' + upErr.message); return; }
                              const { data: linkData } = supabase.storage.from('anexos').getPublicUrl(path);
                              const novasUrls = [...urls, linkData.publicUrl];
                              const table = getCardTable(tarefaSelecionada);
                              const updateData = { anexo_boleto: novasUrls.join(', ') };
                              if (urls.length === 0 && tarefaSelecionada.status === 'gerar_boleto' && table === 'Chamado_NF') {
                                updateData.status = 'enviar_cliente';
                                updateData.tarefa = 'Enviar para o Cliente';
                                updateData.setor = 'Pós-Vendas';
                              }
                              await supabase.from(table).update(updateData).eq('id', tarefaSelecionada.id);
                              if (updateData.status === 'enviar_cliente') {
                                notificarMovimento('Chamado_NF', tarefaSelecionada, 'enviar_cliente', `${getCardLabel(tarefaSelecionada)} — Boleto anexado, enviar ao cliente`);
                                alert("Boleto anexado! Card movido para Enviar ao Cliente.");
                              }
                              setTarefaSelecionada({ ...tarefaSelecionada, anexo_boleto: novasUrls.join(', '), ...(updateData.status ? { status: updateData.status } : {}) });
                              carregarDados();
                            }} />
                          )}
                          {urls.length === 0 && (
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'25px', border:'2px dashed #bfdbfe', borderRadius:'12px', color:'#3b82f6', fontSize:'13px', letterSpacing:'1px', textTransform:'uppercase' }}>
                              Anexe o primeiro boleto acima
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
                )}
              </div>
            )}

            {/* --- REQUISICOES (PAGAR) --- */}
            {tarefaSelecionada.gTipo === 'pagar' && (
              <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'15px', padding:'30px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
                  <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:'#fee2e2', display:'flex', alignItems:'center', justifyContent:'center' }}><FileText size={18} color="#dc2626"/></div>
                  <div>
                    <div style={{ fontSize:'13px', color:'#dc2626', fontWeight:'500', letterSpacing:'1px', textTransform:'uppercase' }}>Documentos da Requisicao</div>
                    <div style={{ fontSize:'11px', color:'#6b7280' }}>Nota fiscal e anexos para conferencia</div>
                  </div>
                </div>
                <div style={{ display:'flex', gap:'15px', flexWrap:'wrap' }}>
                  <AttachmentTag icon={<FileText size={18}/>} label="Nota Fiscal" fileUrl={tarefaSelecionada.anexo_nf} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'anexo_nf', f)} />
                  {tarefaSelecionada.anexo_boleto && tarefaSelecionada.anexo_boleto.split(',').map((url, i) => url.trim() && (
                    <AttachmentTag key={`bol-${i}`} icon={<Barcode size={18}/>} label={`Boleto ${i + 1}`} fileUrl={url.trim()} onUpload={null} />
                  ))}
                  <AttachmentTag icon={<Barcode size={18}/>} label={tarefaSelecionada.anexo_boleto ? 'Adicionar Boleto' : 'Boleto'} fileUrl={null} onUpload={async f => {
                    const path = `pagar/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
                    await supabase.storage.from('anexos').upload(path, f);
                    const { data: urlData } = supabase.storage.from('anexos').getPublicUrl(path);
                    const novaUrl = urlData.publicUrl;
                    const atual = tarefaSelecionada.anexo_boleto;
                    const atualizado = atual ? `${atual}, ${novaUrl}` : novaUrl;
                    handleUpdateField(tarefaSelecionada, 'anexo_boleto', atualizado);
                  }} />
                  {tarefaSelecionada.comprovante_pagamento && <AttachmentTag icon={<CheckCircle size={18}/>} label="Comprovante" fileUrl={tarefaSelecionada.comprovante_pagamento} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'comprovante_pagamento', f)} onRemove={() => { if(confirm('Remover comprovante de pagamento?')) handleUpdateField(tarefaSelecionada, 'comprovante_pagamento', null); }} />}
                  {tarefaSelecionada.anexo_requisicao && tarefaSelecionada.anexo_requisicao.split(',').map((url, i) => url.trim() && (
                    <AttachmentTag key={`req-old-${i}`} icon={<Paperclip size={18}/>} label={`Requisicao ${i + 1}`} fileUrl={url.trim()} onUpload={null} />
                  ))}
                  {getRequisicoes(tarefaSelecionada).map((req, i) => (
                    <AttachmentTag key={i} icon={<Paperclip size={18}/>} label={`REQ ${req.numero || (i + 1)}`} fileUrl={req.anexo_url} onUpload={f => handleRequisicaoAnexo(tarefaSelecionada, i, f)} />
                  ))}
                </div>
              </div>
            )}

            {/* --- RH --- */}
            {tarefaSelecionada.gTipo === 'rh' && tarefaSelecionada.anexo && (
              <div style={{ background:'#f5f3ff', border:'1px solid #c4b5fd', borderRadius:'15px', padding:'30px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
                  <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:'#ede9fe', display:'flex', alignItems:'center', justifyContent:'center' }}><FileText size={18} color="#8b5cf6"/></div>
                  <div style={{ fontSize:'13px', color:'#8b5cf6', fontWeight:'500', letterSpacing:'1px', textTransform:'uppercase' }}>Documentos RH</div>
                </div>
                <AttachmentTag icon={<FileText size={18}/>} label="Anexo RH" fileUrl={tarefaSelecionada.anexo} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'anexo', f)} />
              </div>
            )}
        </div>

        {/* Mover para Pago — só no modal para sem_boleto */}
        {tarefaSelecionada.status === 'sem_boleto' && (
          <div style={{ marginTop:'20px', background:'#f0fdf4', padding:'20px', borderRadius:'16px', border:'1px solid #bbf7d0', display:'flex', justifyContent:'center' }}>
            <button
              onClick={() => { handleMoverParaPago(tarefaSelecionada); setTarefaSelecionada(null); }}
              style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '14px 32px', borderRadius: '12px', cursor: 'pointer', fontSize: '15px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', transition: '0.2s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#15803d'}
              onMouseLeave={e => e.currentTarget.style.background = '#16a34a'}
            ><CheckCircle size={16}/> Mover para Pago</button>
          </div>
        )}

        <div style={{marginTop:'50px', display:'flex', gap:'20px'}}>
            {isBoletoType && tarefaSelecionada.status === 'gerar_boleto' && !isCashOrCardType && (
                <div style={{ flex: 1, background: '#f0f9ff', padding: '35px', border: '1.5px dashed #0ea5e9', borderRadius: '20px' }}>
                    <label style={{ ...labelMStyle, color: '#0ea5e9', fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '20px' }}>PROCESSAMENTO DE BOLETO FINAL</label>
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'stretch' }}>
                        <input type="file" id="file_boleto_input" onChange={e => setFileBoleto(e.target.files[0])} style={{ display: 'none' }} />
                        <label htmlFor="file_boleto_input" style={{
                            flex: 1,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px',
                            background: fileBoleto ? '#f0fdf4' : '#ffffff',
                            border: fileBoleto ? '2px solid #10b981' : '2px dashed #cbd5e1',
                            padding: '28px 20px', borderRadius: '16px', cursor: 'pointer',
                            transition: 'all 0.3s ease', minHeight: '110px'
                        }}>
                            {fileBoleto ? (
                                <>
                                    <div style={{ width: '44px', height: '44px', background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <CheckCircle size={24} color="#10b981" />
                                    </div>
                                    <span style={{ fontSize: '16px', fontWeight: '400', color: '#10b981' }}>BOLETO SELECIONADO</span>
                                    <span style={{ fontSize: '14px', color: '#64748b', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileBoleto.name}</span>
                                </>
                            ) : (
                                <>
                                    <div style={{ width: '44px', height: '44px', background: '#e0f2fe', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Upload size={22} color="#0ea5e9" />
                                    </div>
                                    <span style={{ fontSize: '16px', fontWeight: '400', color: '#0ea5e9' }}>ANEXAR BOLETO</span>
                                    <span style={{ fontSize: '14px', color: '#94a3b8' }}>Clique para escolher o arquivo</span>
                                </>
                            )}
                        </label>
                        <button
                            onClick={() => handleGerarBoletoFinanceiro(tarefaSelecionada)}
                            style={{ ...btnPrimaryBeautified, flexDirection: 'column', gap: '8px', minWidth: '150px', padding: '20px' }}
                        >
                            <Send size={22} />
                            LANÇAR TAREFA
                        </button>
                    </div>
                </div>
            )}

            {(isCashOrCardType || tarefaSelecionada.status === 'validar_pix' || (tarefaSelecionada.status === 'aguardando_vencimento' && (tarefaSelecionada.isTarefaPagamentoRealizado || isBoleto30))) && (
                <button onClick={() => handleMoverParaPago(tarefaSelecionada)} style={btnSuccessBeautified}>
                    <CheckCircle size={24}/> CONCLUÍDO-MOVER PARA PAGO
                </button>
            )}

            {tarefaSelecionada.gTipo === 'boleto' && tarefaSelecionada.status === 'aguardando_vencimento' && (
                <div style={{ display: 'flex', gap: '20px', flex: 1 }}>
                    <button onClick={() => handlePedirRecobranca(tarefaSelecionada)} style={{ ...btnPrimaryBeautified, flex: 1, background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' }}>
                        <DollarSign size={20}/> PEDIR PARA POS VENDAS RECOBRAR
                    </button>
                    <button onClick={() => handleSomenteVencido(tarefaSelecionada)} style={{ ...btnPrimaryBeautified, flex: 1, background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}>
                        <AlertCircle size={20}/> MUDAR CARD PARA VENCIDO
                    </button>
                </div>
            )}

            {tarefaSelecionada.gTipo !== 'boleto' && (
                <button onClick={() => handleConcluirGeral(tarefaSelecionada)} style={btnSuccessBeautified}>
                    <CheckCheck size={24}/> CONCLUIR PROCESSO
                </button>
            )}
        </div>
      </div>

     </div>
    </div>
   )}

   </div>{/* fim padding wrapper */}
   <style jsx global>{`
    .task-card-grid { background: #ffffff; border: 0.5px solid #dcdde1; cursor: pointer; transition: 0.3s; overflow: hidden; margin-bottom: 15px; }
    .task-card-grid:hover { transform: translateY(-4px); box-shadow: 0 10px 20px rgba(0,0,0,0.04); border-color: #0ea5e9; }
    .btn-back-light { background: #ffffff; color: #64748b; border: 0.5px solid #dcdde1; padding: 10px 24px; border-radius: 0px; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: 0.3s; font-size:15px; }
    ::placeholder { color: #94a3b8; }
    ::-webkit-scrollbar { width: 8px; height: 12px; }
    ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
   `}</style>
  </div>
 )
}
