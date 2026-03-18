'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { marcarMinhaAcao } from '@/components/financeiro/NotificationSystem'
import { formatarDataBR, formatarMoeda, getRequisicoes } from '@/lib/financeiro/utils'
import {
 X, PlusCircle, FileText, Download,
 CheckCircle, User, Upload, Send,
 Calendar, CreditCard, Hash, ArrowLeft, Paperclip,
 CheckCheck, Eye, Search, Trash2, RefreshCw, AlertCircle, DollarSign, Lock, Barcode, ZoomIn, ZoomOut
} from 'lucide-react'

const formatarData = formatarDataBR;

function FinanceiroSubNav() {
  const pathname = usePathname()
  const links = [
    { label: 'Painel', href: '/financeiro/home-financeiro' },
    { label: 'Kanban', href: '/financeiro/kanban-financeiro' },
    { label: 'Dashboard', href: '/financeiro/dashboard' },
    { label: 'Hist. Pagar', href: '/financeiro/historico-pagar' },
    { label: 'Hist. Receber', href: '/financeiro/historico-receber' },
    { label: 'Hist. RH', href: '/financeiro/historico-rh' },
  ]
  return (
    <nav style={{ display: 'flex', gap: '0', borderBottom: '1px solid #e5e7eb', marginBottom: '40px', background: '#ffffff', overflow: 'hidden' }}>
      {links.map(link => {
        const isActive = pathname === link.href
        return (
          <Link key={link.href} href={link.href} style={{
            padding: '20px 32px', fontSize: '20px', fontWeight: isActive ? '700' : '400', letterSpacing: '0.5px',
            color: isActive ? '#dc2626' : '#6b7280',
            borderBottom: isActive ? '3px solid #dc2626' : '3px solid transparent',
            textDecoration: 'none', transition: '0.2s', fontFamily: 'Montserrat, sans-serif',
          }}>
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}

// --- COMPONENTE TAG DE ANEXO ---
function AttachmentTag({ icon, label, fileUrl, onUpload, disabled }) {
    const fileInputRef = useRef(null);
    return (
        <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', minWidth:'320px', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
            <div style={{ padding: '0 18px', color: '#64748b', background: '#f1f5f9' }}>{icon || <Paperclip size={18}/>}</div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '12px 15px' }}>
                <span style={{ fontSize: '13px', color: '#1e293b', fontWeight: '700', letterSpacing: '0.5px' }}>{label}</span>
                <span style={{ fontSize: '11px', color: fileUrl ? '#10b981' : '#f43f5e', fontWeight: '700' }}>{fileUrl ? 'ARQUIVO PRONTO' : 'PENDENTE'}</span>
            </div>
            <div style={{ display: 'flex', borderLeft: '1px solid #e2e8f0' }}>
                {fileUrl && <button onClick={() => window.open(fileUrl, '_blank')} style={miniActionBtn} title="Visualizar"><Eye size={18} color="#1e293b" /></button>}
                {!disabled && (
                    <button onClick={() => fileInputRef.current.click()} style={miniActionBtn} title="Substituir ou Anexar">
                        <RefreshCw size={18} color="#1e293b" />
                        <input type="file" ref={fileInputRef} hidden onChange={e => onUpload(e.target.files[0])} />
                    </button>
                )}
            </div>
        </div>
    );
}

// ESTILOS GERAIS
const cascadeRowStyle = { display: 'grid', gridTemplateColumns: '140px 180px 150px 320px', gap: '25px', alignItems: 'center', background: '#ffffff', padding: '15px', borderBottom: '1px solid #f1f5f9' };
const cascadeLabelStyle = { fontSize: '11px', color: '#94a3b8', fontWeight: '800', letterSpacing: '1px', textTransform: 'uppercase' };
const inputCascadeStyle = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', padding: '10px', fontSize: '14px', outline: 'none', transition: '0.2s' };
const cascadeValueStyle = { fontSize: '18px', color: '#0f172a', fontWeight: '700' };
const dropItemStyle_Container = { position:'absolute', top:'60px', right: 0, background:'#ffffff', zIndex:2000, width:'250px', border:'0.5px solid #dcdde1', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' };
const dropItemStyle = { padding:'15px 20px', cursor:'pointer', color:'#1e293b', borderBottom:'0.5px solid #dcdde1', fontSize:'14px', fontWeight: '600' };
const colWrapperStyle = { padding: '20px', background: 'rgba(255, 255, 255, 0.4)', border: '0.5px solid #dcdde1' };
const colTitleStyle = { textAlign: 'center', fontSize: '22px', color:'#0f172a', fontWeight:'700', marginBottom:'30px', textTransform:'uppercase' };
const miniTagStyle = { background: '#f1f5f9', padding: '4px 10px', color: '#64748b', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px', border: '0.5px solid #dcdde1', fontWeight: '600' };
const labelMStyle = { fontSize:'14px', color:'#64748b', textTransform:'uppercase', fontWeight: '700', marginBottom: '8px', display: 'block' };
const pModalStyle = { fontSize:'24px', color:'#0f172a', margin: 0, fontWeight: '400' };
const fieldBoxModal = { border: '1px solid #e5e7eb', padding: '30px', background: '#ffffff', flex: 1, borderRadius: '15px' };
const fieldBoxInner = { padding: '15px 10px', borderBottom: '1px solid #f0f0f0' };
const inputStyleLight = { width: '100%', padding: '15px', border: '1px solid #dcdde1', outline: 'none', background:'#fff', color:'#000', fontSize: '18px', fontFamily: 'Montserrat, sans-serif' };
const miniActionBtn = { background: 'transparent', border: 'none', padding: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: '0.2s', borderRadius: '8px' };
const btnPrimaryBeautified = { background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)', color:'#ffffff', border:'none', padding:'18px 40px', borderRadius:'15px', cursor:'pointer', fontSize: '14px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 10px 20px rgba(14, 165, 233, 0.2)', transition: '0.3s' };
const btnSuccessBeautified = { flex: 1, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color:'#ffffff', border:'none', padding:'25px', borderRadius:'15px', cursor:'pointer', fontSize: '18px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', boxShadow: '0 10px 20px rgba(16, 185, 129, 0.2)', transition: '0.3s' };
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
 const [showNovoMenu, setShowNovoMenu] = useState(false);
 const [tarefaSelecionada, setTarefaSelecionada] = useState(null);
 const [listaBoletos, setListaBoletos] = useState([]); const [listaPagar, setListaPagar] = useState([]); const [listaRH, setListaRH] = useState([]);
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
        const datas = [c.vencimento_boleto, ...(c.datas_parcelas || '').split(/[\s,]+/).filter(d => d.includes('-'))];
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

    setListaBoletos(faturamentoFormatado);

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

 const handleUpdateField = async (t, field, value) => {
    const table = t.gTipo === 'pagar' ? 'finan_pagar' : t.gTipo === 'receber' ? 'finan_receber' : t.gTipo === 'rh' ? 'finan_rh' : 'Chamado_NF';
    await supabase.from(table).update({ [field]: value }).eq('id', t.id);
    carregarDados();
    if(tarefaSelecionada) setTarefaSelecionada(prev => ({ ...prev, [field]: value }));
 };

 const handleUpdateFileDirect = async (t, field, file) => {
    if(!file) return;
    try {
      const table = t.gTipo === 'pagar' ? 'finan_pagar' : t.gTipo === 'receber' ? 'finan_receber' : t.gTipo === 'rh' ? 'finan_rh' : 'Chamado_NF';
      const path = `anexos/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { error: uploadError } = await supabase.storage.from('anexos').upload(path, file);
      if (uploadError) throw uploadError;
      const { data: linkData } = supabase.storage.from('anexos').getPublicUrl(path);

      await supabase.from(table).update({ [field]: linkData.publicUrl }).eq('id', t.id);
      alert("Arquivo atualizado!");
      carregarDados();
      if(tarefaSelecionada) setTarefaSelecionada(prev => ({ ...prev, [field]: linkData.publicUrl }));
    } catch (err) { alert("Erro: " + err.message); }
 };

 const handleGerarBoletoFinanceiro = async (t) => {
  if (!fileBoleto) return alert("Anexe o arquivo.");
  try {
    const path = `boletos/${Date.now()}-${fileBoleto.name}`;
    await supabase.storage.from('anexos').upload(path, fileBoleto);
    const { data } = supabase.storage.from('anexos').getPublicUrl(path);

    marcarMinhaAcao('Chamado_NF', t.id);
    await supabase.from('Chamado_NF').update({
        status: 'enviar_cliente',
        tarefa: 'Enviar Boleto para o Cliente',
        setor: 'Pós-Vendas',
        anexo_boleto: data.publicUrl
    }).eq('id', t.id);

    alert("Tarefa enviada ao Pós-Vendas!"); setTarefaSelecionada(null); carregarDados();
  } catch (err) { alert("Erro: " + err.message); }
 };

 const handleMoverParaPago = async (t) => {
    marcarMinhaAcao('Chamado_NF', t.id);
    await supabase.from('Chamado_NF').update({ status: 'pago', tarefa: 'Pagamento Confirmado' }).eq('id', t.id);
    alert("Pagamento confirmado e processo finalizado!"); setTarefaSelecionada(null); carregarDados();
 };

 const handleConcluirGeral = async (t) => {
    const table = t.gTipo === 'pagar' ? 'finan_pagar' : t.gTipo === 'receber' ? 'finan_receber' : t.gTipo === 'rh' ? 'finan_rh' : 'Chamado_NF';
    marcarMinhaAcao(table, t.id);
    await supabase.from(table).update({ status: 'concluido' }).eq('id', t.id);
    alert("Processo concluído!"); setTarefaSelecionada(null); carregarDados();
 };

 const handlePedirRecobranca = async (t) => {
    if (!window.confirm("Deseja solicitar recobrança ao Pós-Vendas?")) return;
    const newVal = (t.recombrancas_qtd || 0) + 1;
    marcarMinhaAcao('Chamado_NF', t.id);
    await supabase.from('Chamado_NF').update({
        status: 'vencido',
        tarefa: 'Cobrar Cliente (Recobrança)',
        setor: 'Pós-Vendas',
        recombrancas_qtd: newVal
    }).eq('id', t.id);
    alert("Recobrança solicitada ao Pós-Vendas!"); setTarefaSelecionada(null); carregarDados();
 };

 const handleSomenteVencido = async (t) => {
    marcarMinhaAcao('Chamado_NF', t.id);
    await supabase.from('Chamado_NF').update({ status: 'vencido' }).eq('id', t.id);
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
  <div style={{ padding: '40px', fontFamily: 'Montserrat, sans-serif' }}>
   <FinanceiroSubNav />

   <header style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'50px' }}>
      <div><h1 style={{ fontWeight: '300', color: '#0f172a', margin: 0, fontSize:'80px', letterSpacing:'-4px' }}>Painel Financeiro</h1><div style={{ width: '80px', height: '4px', background: '#0ea5e9', marginTop: '12px' }}></div></div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
       <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #dcdde1', borderRadius: '0px', padding: '5px 15px', gap: '10px' }}>
          <button onClick={() => setZoom(prev => Math.max(0.5, prev - 0.1))} style={zoomBtnStyle} title="Diminuir zoom"><ZoomOut size={18} /></button>
          <span style={{ fontSize: '15px', fontWeight: '700', color: '#000', minWidth: '45px', textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(prev => Math.min(1.5, prev + 0.1))} style={zoomBtnStyle} title="Aumentar zoom"><ZoomIn size={18} /></button>
       </div>
       <div style={{ position: 'relative' }}>
        <button title="Novo Chamado" onClick={() => setShowNovoMenu(!showNovoMenu)} style={{ background:'#ffffff', color:'#1e293b', border:'1.5px solid #dcdde1', padding:'12px 24px', borderRadius:'0px', fontWeight:'500', cursor:'pointer', fontSize:'15px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>NOVO LANÇAMENTO</button>
        {showNovoMenu && (
         <div onMouseLeave={() => setShowNovoMenu(false)} style={dropItemStyle_Container}>
          <div onClick={() => router.push('/financeiro/novo-chamado-nf')} style={dropItemStyle}>Boleto</div>
          <div onClick={() => router.push('/financeiro/novo-pagar-receber')} style={dropItemStyle}>Pagar/Receber</div>
          <div onClick={() => router.push('/financeiro/novo-chamado-rh')} style={{ ...dropItemStyle, borderBottom:'none', color:'#0ea5e9' }}>RH</div>
         </div>
        )}
       </div>
      </div>
    </header>

    <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '30px',
        transform: `scale(${zoom})`,
        transformOrigin: 'top left',
        width: `${100 / zoom}%`
    }}>
      <div style={colWrapperStyle}>
       <div style={colTitleStyle}>Faturamento</div>
       <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', borderTop: '0.5px solid #dcdde1' }}>
        {listaBoletos.filter(c => c.status === 'gerar_boleto' || c.status === 'validar_pix' || (c.status === 'aguardando_vencimento' && (c.isVencidoDisplay || c.isTarefaPagamentoRealizado || c.parcelaVencida))).map((t, idx) => (
         <div key={`bol-${t.id}-${idx}`} onClick={() => setTarefaSelecionada(t)} className="task-card-grid">
          <div style={{ background: '#f1f5f9', padding: '24px', borderBottom: '0.5px solid #dcdde1' }}>
            <h4 style={{ margin: 0, fontSize: '18px', fontWeight:'700', color: '#1e293b' }}>{t.nom_cliente?.toUpperCase()}</h4>
            {t.isTarefaPagamentoRealizado && (
                <div style={{ marginTop: '12px', background: 'linear-gradient(90deg, #3b82f6, #2563eb)', color: '#fff', fontSize: '10px', fontWeight: '900', padding: '6px 12px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 10px rgba(37, 99, 235, 0.2)' }}>
                    <CheckCircle size={14}/> PAGAMENTO REALIZADO - CONFERIR
                </div>
            )}
          </div>
          <div style={{ padding: '24px', background: '#ffffff' }}>
            <div style={miniTagStyle}><CreditCard size={14}/> {t.forma_pagamento?.toUpperCase()}</div>
            <div style={{fontSize:'26px', color:'#0f172a', margin: '15px 0 5px 0', fontWeight: '600'}}>{formatarMoeda(t.valor_exibicao)}</div>
            <div style={{fontSize:'14px', color: '#64748b', textTransform:'uppercase', letterSpacing:'1px'}}>{t.status === 'validar_pix' ? 'VALIDAÇÃO PIX' : `Venc: ${formatarData(t.vencimento_boleto)}`}</div>
            {t.anexo_boleto && (t.status === 'gerar_boleto' || t.status === 'validar_pix') && (
                <div style={{marginTop: '12px', display:'flex', alignItems:'center', gap:'8px', color: '#4f46e5', fontSize: '12px', fontWeight: '800'}} title="Boleto já foi anexado">
                  <FileText size={16} /> BOLETO ANEXADO
                </div>
            )}
            {t.isVencidoDisplay && !t.isTarefaPagamentoRealizado && !t.parcelaVencida && (
             <div style={{marginTop: '20px', background: '#fee2e2', border: '1px solid #ef4444', padding: '15px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <span style={{color: '#ef4444', fontWeight: '800', fontSize: '14px'}}>VENCIDO</span>
                <button onClick={(e) => {e.stopPropagation(); alert('Vencimento conferido.')}} style={{background: '#ef4444', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: '700'}}>CONFERIDO</button>
             </div>
            )}
            {t.parcelaVencida && !t.isTarefaPagamentoRealizado && (
             <div style={{marginTop: '20px', background: '#fff7ed', border: '1px solid #f97316', padding: '12px 15px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                <AlertCircle size={16} color="#f97316" />
                <span style={{color: '#f97316', fontWeight: '800', fontSize: '13px'}}>PARCELA VENCIDA SEM COMPROVANTE</span>
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
          <div style={{padding:'24px', background: '#fef2f2', borderLeft: '6px solid #ef4444', borderBottom: '0.5px solid #dcdde1'}}>
            <h4 style={{fontSize:'12px', color:'#ef4444', fontWeight:'800', letterSpacing:'1px', marginBottom:'8px'}}>FORNECEDOR</h4>
            <div style={{fontSize:'20px', color:'#1e293b', fontWeight: '700'}}>{t.fornecedor?.toUpperCase()}</div>
            <div style={{fontSize:'24px', color:'#0f172a', marginTop:'15px', fontWeight: '700'}}>{formatarMoeda(t.valor)}</div>
            <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {getRequisicoes(t).filter(r => r.numero).map((req, i) => (
                <span key={i} style={{ background: '#fef2f2', color: '#ef4444', fontSize: '10px', fontWeight: '800', padding: '4px 8px', border: '1px solid #fca5a5', borderRadius: '4px' }}>#{req.numero}</span>
              ))}
            </div>
          </div>
          <div style={{padding:'18px 24px', background:'#ffffff', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <span style={{color: '#64748b', fontSize:'13px', fontWeight:'600'}}>{t.metodo || 'Despesa'}</span>
            <span style={{color: '#ef4444', fontSize:'13px', fontWeight:'800'}}>VENC: {formatarData(t.data_vencimento)}</span>
          </div>
         </div>
        ))}
       </div>
      </div>

      <div style={colWrapperStyle}>
       <div style={colTitleStyle}>RH</div>
       <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', borderTop: '0.5px solid #dcdde1' }}>
        {listaRH.map((t, idx) => (
         <div key={`rh-${t.id}-${idx}`} onClick={() => setTarefaSelecionada(t)} className="task-card-grid">
          <div style={{padding:'24px', background: '#f1f5f9', borderLeft: '6px solid #8b5cf6', borderBottom: '0.5px solid #dcdde1'}}>
            <h4 style={{fontSize:'18px', color:'#1e293b', fontWeight:'700'}}>{t.funcionario?.toUpperCase()}</h4>
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(10px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
     <div style={{ background: '#ffffff', width: '1100px', maxWidth: '98%', maxHeight: '95vh', borderRadius: '0px', overflow:'hidden', boxShadow:'0 50px 100px rgba(0,0,0,0.1)', border: '1px solid #dcdde1' }}>

      <div style={{ padding: '60px', overflowY: 'auto', maxHeight: '95vh', color: '#1e293b' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <button onClick={() => setTarefaSelecionada(null)} className="btn-back-light"><ArrowLeft size={16}/> VOLTAR AO PAINEL</button>
          <button onClick={() => setTarefaSelecionada(null)} style={{ background:'transparent', border:'none', cursor:'pointer', padding:'10px' }} title="Fechar"><X size={28} color="#dc2626"/></button>
        </div>

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
                    <span style={{fontSize:'22px', fontWeight:'700', color:'#64748b'}}>R$</span>
                    <input
                      type="number"
                      style={{ ...inputStyleLight, border:'none', padding:0, fontSize:'34px', fontWeight:'800', background:'transparent' }}
                      defaultValue={tarefaSelecionada.valor_exibicao || tarefaSelecionada.valor}
                      onBlur={e => handleUpdateField(tarefaSelecionada, tarefaSelecionada.gTipo === 'boleto' ? 'valor_servico' : 'valor', e.target.value)}
                    />
                </div>
              </div>

              <div style={fieldBoxModal}>
                <label style={labelMStyle}>DATA DE VENCIMENTO</label>
                <input
                  type="date"
                  style={{ ...inputStyleLight, border:'none', padding:0, fontSize:'30px', fontWeight:'800', background:'transparent', color:'#ef4444' }}
                  defaultValue={tarefaSelecionada.vencimento_boleto || tarefaSelecionada.data_vencimento}
                  onBlur={e => handleUpdateField(tarefaSelecionada, (tarefaSelecionada.gTipo === 'boleto' ? 'vencimento_boleto' : 'data_vencimento'), e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        {/* DISTRIBUIÇÃO ESPECÍFICA PARA PAGAR/RECEBER */}
        {tarefaSelecionada.gTipo === 'pagar' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'30px', padding:'45px', background:'#f8fafc', border:'1px solid #e5e7eb', marginBottom:'45px' }}>
                <div style={fieldBoxInner}>
                    <label style={labelMStyle}>NÚMERO DA NOTA FISCAL</label>
                    <input
                        style={inputStyleLight}
                        placeholder="Ex: 000.000.000"
                        defaultValue={tarefaSelecionada.numero_NF || ''}
                        onBlur={e => handleUpdateField(tarefaSelecionada, 'numero_NF', e.target.value)}
                    />
                </div>
                <div style={{gridColumn:'span 2', ...fieldBoxInner}}>
                    <label style={labelMStyle}>DESCRIÇÃO DETALHADA / OBSERVAÇÕES</label>
                    <textarea
                        style={{...inputStyleLight, height:'120px', resize: 'none'}}
                        defaultValue={tarefaSelecionada.motivo}
                        onBlur={e => handleUpdateField(tarefaSelecionada, 'motivo', e.target.value)}
                    />
                </div>
            </div>
        )}

        {/* REQUISIÇÕES */}
        {tarefaSelecionada.gTipo === 'pagar' && (
            <div style={{ border:'1px solid #e5e7eb', padding:'35px', background:'#f8fafc', marginBottom:'45px' }}>
                <div style={{ marginBottom:'20px' }}>
                    <label style={labelMStyle}>REQUISIÇÕES</label>
                </div>
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
                        />
                    </div>
                    {Array.from({ length: (tarefaSelecionada.qtd_parcelas || 1) - 1 }).map((_, i) => {
                        const pNum = i + 2;
                        const currentDates = (tarefaSelecionada.datas_parcelas || "").split(/[\s,]+/);
                        return (
                            <div key={pNum} style={cascadeRowStyle}>
                                <span style={cascadeLabelStyle}>{pNum}ª PARCELA</span>
                                <input type="date" style={inputCascadeStyle} defaultValue={currentDates[i] || ""} onBlur={e => {
                                    let arr = [...currentDates]; arr[i] = e.target.value;
                                    handleUpdateField(tarefaSelecionada, 'datas_parcelas', arr.join(', '));
                                }} />
                                <span style={cascadeValueStyle}>{formatarMoeda(valorIndividual)}</span>
                                <AttachmentTag
                                    label={`COMPROVANTE P${pNum}`}
                                    fileUrl={tarefaSelecionada[`comprovante_pagamento_p${pNum}`]}
                                    onUpload={f => handleUpdateFileDirect(tarefaSelecionada, `comprovante_pagamento_p${pNum}`, f)}
                                />
                            </div>
                        )
                    })}
                </div>
            </div>
        )}

        {/* CAMPOS EXCLUSIVOS DE BOLETO (NF SERVIÇO/PEÇA) */}
        {tarefaSelecionada.gTipo === 'boleto' && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:'30px', border:'1px solid #e5e7eb', padding:'45px', background:'#f8fafc', marginBottom:'45px' }}>
                <div style={fieldBoxInner}><label style={labelMStyle}>NF SERVIÇO</label><input style={inputStyleLight} defaultValue={tarefaSelecionada.num_nf_servico} onBlur={e => handleUpdateField(tarefaSelecionada, 'num_nf_servico', e.target.value)} /></div>
                <div style={fieldBoxInner}><label style={labelMStyle}>NF PEÇA</label><input style={inputStyleLight} defaultValue={tarefaSelecionada.num_nf_peca} onBlur={e => handleUpdateField(tarefaSelecionada, 'num_nf_peca', e.target.value)} /></div>
                <div style={{gridColumn:'span 2', ...fieldBoxInner}}>
                    <label style={labelMStyle}>OBSERVAÇÕES DO BOLETO</label>
                    <textarea style={{...inputStyleLight, height:'80px', resize: 'none'}} defaultValue={tarefaSelecionada.obs} onBlur={e => handleUpdateField(tarefaSelecionada, 'obs', e.target.value)} />
                </div>
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
                      <div style={{ fontSize:'13px', color:'#16a34a', fontWeight:'700', letterSpacing:'1px', textTransform:'uppercase' }}>Notas Fiscais Recebidas</div>
                      <div style={{ fontSize:'11px', color:'#6b7280' }}>Documentos enviados pelo pos-vendas</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                    <AttachmentTag icon={<FileText size={18}/>} label="NF SERVICO" fileUrl={tarefaSelecionada.anexo_nf_servico} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'anexo_nf_servico', f)} />
                    <AttachmentTag icon={<Paperclip size={18}/>} label="NF PECA" fileUrl={tarefaSelecionada.anexo_nf_peca} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'anexo_nf_peca', f)} />
                    {(isCashOrCardType || tarefaSelecionada.isTarefaPagamentoRealizado) && (
                      <AttachmentTag icon={<CheckCircle size={18}/>} label="COMPROVANTE PAGAMENTO" fileUrl={tarefaSelecionada.comprovante_pagamento} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'comprovante_pagamento', f)} />
                    )}
                  </div>
                </div>

                {/* COLUNA: BOLETOS - AREA DO FINANCEIRO */}
                <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'15px', padding:'30px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
                    <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:'#dbeafe', display:'flex', alignItems:'center', justifyContent:'center' }}><Barcode size={18} color="#3b82f6"/></div>
                    <div>
                      <div style={{ fontSize:'13px', color:'#3b82f6', fontWeight:'700', letterSpacing:'1px', textTransform:'uppercase' }}>Boletos Gerados</div>
                      <div style={{ fontSize:'11px', color:'#6b7280' }}>Anexe os boletos para devolver ao pos-vendas</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                    <AttachmentTag icon={<Barcode size={18}/>} label="BOLETO 1" fileUrl={tarefaSelecionada.anexo_boleto} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'anexo_boleto', f)} />
                    {(tarefaSelecionada.anexo_boleto || tarefaSelecionada.anexo_boleto_2) && (
                      <AttachmentTag icon={<Barcode size={18}/>} label="BOLETO 2" fileUrl={tarefaSelecionada.anexo_boleto_2} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'anexo_boleto_2', f)} />
                    )}
                    {(tarefaSelecionada.anexo_boleto_2 || tarefaSelecionada.anexo_boleto_3) && (
                      <AttachmentTag icon={<Barcode size={18}/>} label="BOLETO 3" fileUrl={tarefaSelecionada.anexo_boleto_3} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'anexo_boleto_3', f)} />
                    )}
                    {!tarefaSelecionada.anexo_boleto && (
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'25px', border:'2px dashed #bfdbfe', borderRadius:'12px', color:'#3b82f6', fontSize:'13px', letterSpacing:'1px', textTransform:'uppercase' }}>
                        Anexe o primeiro boleto acima
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* --- REQUISICOES (PAGAR) --- */}
            {tarefaSelecionada.gTipo === 'pagar' && (
              <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'15px', padding:'30px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
                  <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:'#fee2e2', display:'flex', alignItems:'center', justifyContent:'center' }}><FileText size={18} color="#dc2626"/></div>
                  <div>
                    <div style={{ fontSize:'13px', color:'#dc2626', fontWeight:'700', letterSpacing:'1px', textTransform:'uppercase' }}>Documentos da Requisicao</div>
                    <div style={{ fontSize:'11px', color:'#6b7280' }}>Nota fiscal e anexos para conferencia</div>
                  </div>
                </div>
                <div style={{ display:'flex', gap:'15px', flexWrap:'wrap' }}>
                  <AttachmentTag icon={<FileText size={18}/>} label="Nota Fiscal" fileUrl={tarefaSelecionada.anexo_nf} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'anexo_nf', f)} />
                  {tarefaSelecionada.comprovante_pagamento && <AttachmentTag icon={<CheckCircle size={18}/>} label="Comprovante" fileUrl={tarefaSelecionada.comprovante_pagamento} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'comprovante_pagamento', f)} />}
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
                  <div style={{ fontSize:'13px', color:'#8b5cf6', fontWeight:'700', letterSpacing:'1px', textTransform:'uppercase' }}>Documentos RH</div>
                </div>
                <AttachmentTag icon={<FileText size={18}/>} label="Anexo RH" fileUrl={tarefaSelecionada.anexo} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'anexo', f)} />
              </div>
            )}
        </div>

        <div style={{marginTop:'50px', display:'flex', gap:'20px'}}>
            {isBoletoType && tarefaSelecionada.status === 'gerar_boleto' && !isCashOrCardType && (
                <div style={{ flex: 1, background: '#f0f9ff', padding: '35px', border: '1.5px dashed #0ea5e9', borderRadius: '20px' }}>
                    <label style={{ ...labelMStyle, color: '#0ea5e9', fontSize: '12px', fontWeight: '800', display: 'block', marginBottom: '20px' }}>PROCESSAMENTO DE BOLETO FINAL</label>
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
