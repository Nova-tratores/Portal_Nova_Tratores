'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { exigeComprovantePago, temComprovantePago } from '@/lib/financeiro/constants'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useAuditLog } from '@/hooks/useAuditLog'
import { notificarAdminsClient } from '@/hooks/useNotificarAdmins'
import { formatarDataBR, formatarMoeda, calcTempo } from '@/lib/financeiro/utils'
import {
  X, PlusCircle, FileText, Download,
  CheckCircle, Upload, Send,
  Calendar, CreditCard, ArrowLeft,
  Eye, Search, RefreshCw, AlertCircle, Clock, Trash2, Wallet
} from 'lucide-react'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import ConfirmarFaseModal from '@/components/ConfirmarFaseModal'
import PreferenciaEnvioBoleto from '@/components/financeiro/PreferenciaEnvioBoleto'
import PrefEnvioBadge from '@/components/financeiro/PrefEnvioBadge'
import EnvioGuiaModal from '@/components/financeiro/EnvioGuiaModal'
import ConfigEmailEnvioModal from '@/components/financeiro/ConfigEmailEnvioModal'
import { autoEnviarENotificar } from '@/lib/financeiro/envioBoleto'
import { montarMapasPref, acharMetodo } from '@/lib/financeiro/prefEnvio'
import { authHeaders } from '@/lib/auth/client'
import { labelSetor, ehDoSetor, temNotaServico } from '@/lib/financeiro/setor'

const STATUS_CONFIG = {
 gerar_boleto:          { label: 'GERAR BOLETO',          bg: '#eff6ff', color: '#3b82f6', border: '#bfdbfe' },
 enviar_cliente:        { label: 'ENVIAR PARA CLIENTE',   bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
 aguardando_vencimento: { label: 'AGUARDANDO VENCIMENTO', bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
 pago:                  { label: 'PAGO',                  bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
 vencido:               { label: 'VENCIDO',               bg: '#fff5f5', color: '#dc2626', border: '#fecaca' },
 concluido:             { label: 'CONCLUIDO',             bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
};

const FORMAS_BOLETO = ['Pix', 'Dinheiro', 'Boleto 30 dias', 'Boleto Parcelado', 'Cartão a vista', 'Cartão Parcelado', 'Cheque'];

// Setor deste kanban: 'pecas' (Peças Balcão).
const SETOR_KANBAN = 'pecas';
const setorBadgeStyle = { display: 'inline-flex', alignItems: 'center', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', padding: '3px 9px', borderRadius: '8px', background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' };

// FinanceiroSubNav removido — agora usa componente compartilhado FinanceiroNav

// --- COMPONENTE KANBAN PRINCIPAL ---
export default function Kanban() {
 const { userProfile } = useAuth()
 const { isAdmin } = usePermissoes(userProfile?.id)
 const { log: auditLog } = useAuditLog()
 const podeEditar = isAdmin // só admin do Pós-Vendas edita nome/condição/valor/data
 const [chamados, setChamados] = useState([])
 const [tarefaSelecionada, setTarefaSelecionada] = useState(null)
 const [confirmSemBoleto, setConfirmSemBoleto] = useState(null)
 const [prefsEnvio, setPrefsEnvio] = useState({})
 const [enviandoId, setEnviandoId] = useState(null)      // card com envio rápido em andamento
 const [envioGuia, setEnvioGuia] = useState(null)        // { motivo, card, erro } → modal de orientação
 const [cfgEmailCard, setCfgEmailCard] = useState(null)  // card aguardando o usuário configurar o e-mail
 const [cardLogs, setCardLogs] = useState([])   // histórico (audit_log) do card aberto
 const [loading, setLoading] = useState(true)

 const [filtroBusca, setFiltroBusca] = useState('')

 const [fileBoleto, setFileBoleto] = useState(null)
 const carregarTimeoutRef = useRef(null)
 const router = useRouter()

 const colunas = [
  { id: 'gerar_boleto', titulo: 'GERAR BOLETO' },
  { id: 'enviar_cliente', titulo: 'ENVIAR PARA CLIENTE' },
  { id: 'aguardando_vencimento', titulo: 'AGUARDANDO VENCIMENTO' },
  { id: 'sem_boleto', titulo: 'CLIENTE SEM BOLETO' },
  { id: 'pago', titulo: 'PAGO' },
  { id: 'vencido', titulo: 'VENCIDO' }
 ];

 const carregarDados = async () => {
  try {
    const { data } = await supabase.from('Chamado_NF').select('*').neq('status', 'concluido').order('id', { ascending: false });
    try {
      const rp = await fetch('/api/financeiro/prefs-envio', { headers: { ...(await authHeaders()) } });
      const jp = await rp.json();
      setPrefsEnvio(montarMapasPref(jp.prefs || []));
    } catch {}
    const hoje = new Date(); hoje.setHours(0,0,0,0);

    // ─── AUTO-MOVE: Boleto 30 dias vencido → pago (salva no banco) ────────────
    const paraAutoPago = (data || []).filter(c =>
      c.status === 'aguardando_vencimento' &&
      c.forma_pagamento === 'Boleto 30 dias' &&
      c.vencimento_boleto && new Date(c.vencimento_boleto + 'T00:00:00') < hoje
    );
    if (paraAutoPago.length > 0) {
      await Promise.all(paraAutoPago.map(c => supabase.from('Chamado_NF').update({ status: 'pago' }).eq('id', c.id)));
      paraAutoPago.forEach(c => {
        const idx = (data || []).findIndex(d => d.id === c.id);
        if (idx !== -1) data[idx] = { ...data[idx], status: 'pago' };
      });
    }

    // ─── AUTO-MOVE: boleto simples vencido sem comprovante → vencido (salva no banco) ─
    const paraAutoVencido = (data || []).filter(c =>
      c.status === 'aguardando_vencimento' &&
      c.forma_pagamento !== 'Boleto 30 dias' &&
      c.forma_pagamento !== 'Boleto Parcelado' &&
      c.forma_pagamento !== 'Cartão Parcelado' &&
      !c.comprovante_pagamento && !c.comprovante_pagamento_p1 &&
      c.vencimento_boleto && new Date(c.vencimento_boleto + 'T00:00:00') < hoje
    );
    if (paraAutoVencido.length > 0) {
      await Promise.all(paraAutoVencido.map(c => supabase.from('Chamado_NF').update({ status: 'vencido' }).eq('id', c.id)));
      paraAutoVencido.forEach(c => {
        const idx = (data || []).findIndex(d => d.id === c.id);
        if (idx !== -1) data[idx] = { ...data[idx], status: 'vencido' };
      });
    }

    // ─── HELPER: calcula estado de cada parcela ────────────────────────────────
    const calcParcelas = (c) => {
      const qtd = parseInt(c.qtd_parcelas || 1);
      const valorUnit = (c.valor_servico || 0) / qtd;
      const rawDatas = (c.datas_parcelas || '').split(/[\s,]+/).filter(d => d.includes('-'));
      // Corrige registros antigos que salvaram a parcela 1 dentro de datas_parcelas
      if (rawDatas.length > 0 && rawDatas[0] === c.vencimento_boleto) rawDatas.shift();
      const datas = [c.vencimento_boleto, ...rawDatas];
      const hoje3 = new Date(hoje); hoje3.setDate(hoje3.getDate() + 3);
      return Array.from({ length: qtd }, (_, i) => {
        const comp = i === 0 ? (c.comprovante_pagamento_p1 || c.comprovante_pagamento) : c[`comprovante_pagamento_p${i + 1}`];
        const dtStr = datas[i] || null;
        const dt = dtStr ? new Date(dtStr + 'T00:00:00') : null;
        let estado;
        if (comp) estado = 'pago';
        else if (dt && dt < hoje) estado = 'vencido';
        else if (dt && dt <= hoje3) estado = 'proximo';
        else estado = 'futuro';
        return { num: i + 1, data: dtStr, valor: valorUnit, comprovante: comp || null, estado, campo_comprovante: i === 0 ? 'comprovante_pagamento_p1' : `comprovante_pagamento_p${i + 1}` };
      });
    };

    const processados = (data || []).map(c => {
      const isBoletoParc = c.forma_pagamento === 'Boleto Parcelado';
      const parcelas_info = isBoletoParc ? calcParcelas(c) : null;

      let isPagamentoRealizado = false;
      if (isBoletoParc && parcelas_info) {
        isPagamentoRealizado = parcelas_info.every(p => p.estado === 'pago');
      } else {
        isPagamentoRealizado = !!(c.comprovante_pagamento || c.comprovante_pagamento_p1);
      }

      const parcelaVencida = isBoletoParc && parcelas_info ? parcelas_info.some(p => p.estado === 'vencido') : false;
      const parcelaProxima = isBoletoParc && parcelas_info ? parcelas_info.some(p => p.estado === 'proximo') : false;

      return {
        ...c,
        valor_exibicao: c.valor_servico,
        isPagamentoRealizado,
        parcelaVencida,
        parcelaProxima,
        parcelas_info
      };
    });
    setChamados(processados);
    if (tarefaSelecionada) {
      const itemAtualizado = processados.find(x => x.id === tarefaSelecionada.id);
      if (itemAtualizado) setTarefaSelecionada(itemAtualizado);
    }
  } catch (err) { console.error(err); }
 }

 useEffect(() => {
  const init = async () => {
   try {
    await carregarDados();
   } catch (e) { console.error(e); }
   finally { setLoading(false); }
  }; init();
 }, []);

 const carregarComDebounce = () => {
  if (carregarTimeoutRef.current) clearTimeout(carregarTimeoutRef.current);
  carregarTimeoutRef.current = setTimeout(carregarDados, 600);
 };

 useEffect(() => {
  const channel = supabase
   .channel('kanban_pecas_realtime')
   .on('postgres_changes', { event: '*', schema: 'public', table: 'Chamado_NF' }, carregarComDebounce)
   .subscribe();
  return () => { supabase.removeChannel(channel); if (carregarTimeoutRef.current) clearTimeout(carregarTimeoutRef.current); };
 }, []);

 // Histórico (audit_log) do card aberto — o que cada usuário fez NELE
 const carregarCardLogs = async (id) => {
    if (!id) { setCardLogs([]); return; }
    const { data: logs } = await supabase.from('audit_log')
      .select('created_at, acao, user_id, user_nome, detalhes')
      .eq('entidade', 'Chamado_NF').eq('entidade_id', String(id))
      .order('created_at', { ascending: false }).limit(40);
    const ids = [...new Set((logs || []).map(l => l.user_id).filter(Boolean))];
    let nomes = {};
    if (ids.length) {
      const { data: us } = await supabase.from('financeiro_usu').select('id, nome').in('id', ids);
      nomes = Object.fromEntries((us || []).map(u => [u.id, u.nome]));
    }
    setCardLogs((logs || []).map(l => ({ ...l, nome: l.user_nome || nomes[l.user_id] || 'Usuário' })));
 };
 useEffect(() => { carregarCardLogs(tarefaSelecionada?.id); }, [tarefaSelecionada?.id]);

 const handleUpdateField = async (id, field, value) => {
    // só age se houve MUDANÇA real (evita registrar/notificar ao só clicar e sair do campo)
    if (tarefaSelecionada && String(tarefaSelecionada.id) === String(id) && String(tarefaSelecionada[field] ?? '') === String(value ?? '')) return;
    await supabase.from('Chamado_NF').update({ [field]: value }).eq('id', id);
    notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} alterou NF #${id}`, `Campo: ${field}`, `/financeiro/kanban-pecas`)
    await auditLog({ sistema: 'financeiro', acao: 'editar', entidade: 'Chamado_NF', entidade_id: String(id), entidade_label: `NF #${id} - ${tarefaSelecionada?.nom_cliente || ''}`, detalhes: { campo: field, valor: value } });
    carregarCardLogs(id);
    carregarDados();
    if(tarefaSelecionada) setTarefaSelecionada(prev => ({ ...prev, [field]: value }));
 };

 const handleUpdateFileDirect = async (id, field, file) => {
    if(!file) return;
    try {
      const path = `anexos/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { error: uploadError } = await supabase.storage.from('anexos').upload(path, file);
      if (uploadError) throw uploadError;
      const { data: linkData } = supabase.storage.from('anexos').getPublicUrl(path);

      await supabase.from('Chamado_NF').update({ [field]: linkData.publicUrl }).eq('id', id);
      alert("Arquivo atualizado!");
      carregarDados();
      if(tarefaSelecionada) setTarefaSelecionada(prev => ({ ...prev, [field]: linkData.publicUrl }));
    } catch (err) { alert("Erro: " + err.message); }
 };

 const handleAnexarComprovantePV = async (t, file) => {
    if (!file) return;
    try {
      const path = `anexos/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { error: uploadError } = await supabase.storage.from('anexos').upload(path, file);
      if (uploadError) throw uploadError;
      const { data: linkData } = supabase.storage.from('anexos').getPublicUrl(path);

      await supabase.from('Chamado_NF').update({
        comprovante_pagamento: linkData.publicUrl,
        tarefa: 'Pagamento Realizado'
      }).eq('id', t.id);

      notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} anexou comprovante NF #${t.id}`, `Cliente: ${t.nom_cliente || ''}`, `/financeiro/kanban-pecas`)
      alert("Comprovante anexado! Tarefa enviada ao Financeiro.");
      carregarDados();
      if (tarefaSelecionada) setTarefaSelecionada(prev => ({ ...prev, comprovante_pagamento: linkData.publicUrl, tarefa: 'Pagamento Realizado' }));
    } catch (err) { alert("Erro: " + err.message); }
 };

 const handleConfirmarEnvioPV = async (t) => {
    await supabase.from('Chamado_NF').update({ status: 'aguardando_vencimento', tarefa: 'Aguardando Vencimento' }).eq('id', t.id);
    notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} enviou boleto ao cliente`, `NF #${t.id} — ${t.nom_cliente || ''}`, `/financeiro/kanban-pecas`)
    alert("Card movido para Aguardando Vencimento!");
    setTarefaSelecionada(null);
    carregarDados();
 };

 // ENVIO RÁPIDO direto do card (coluna Enviar para Cliente): manda o boleto por
 // e-mail conforme a preferência do cliente e já move pra Aguardando Vencimento.
 // Se faltar algo (preferência, e-mail configurado, anexo, ou cliente prefere
 // WhatsApp), abre o modal de orientação com o passo a passo.
 const handleEnviarRapido = async (t) => {
    if (enviandoId) return;
    setEnviandoId(t.id);
    try {
      const r = await autoEnviarENotificar({
        card: t,
        remetente: userProfile?.nome || '',
        audit: (a) => auditLog({ sistema: 'financeiro', entidade: 'Chamado_NF', entidade_id: String(t.id), entidade_label: `NF #${t.id} - ${t.nom_cliente || ''}`, ...a }),
      });
      if (r.status === 'enviado') {
        alert(`Boleto enviado por e-mail para: ${r.destinatarios.join(', ')}.\nCard movido para Aguardando Vencimento!`);
        carregarDados();
      } else if (r.status === 'erro' && r.semConfig) {
        setEnvioGuia({ motivo: 'sem_config', card: t });
      } else if (r.status === 'erro') {
        setEnvioGuia({ motivo: 'erro', card: t, erro: r.erro });
      } else if (r.status === 'whatsapp_manual') {
        setEnvioGuia({ motivo: 'whatsapp', card: t });
      } else if (r.status === 'sem_arquivo') {
        setEnvioGuia({ motivo: 'sem_arquivo', card: t });
      } else {
        setEnvioGuia({ motivo: 'sem_preferencia', card: t });
      }
    } finally { setEnviandoId(null); }
 };

 const handleMoverSemBoleto = async (t) => {
    await supabase.from('Chamado_NF').update({ status: 'sem_boleto', tarefa: 'Cliente Sem Boleto' }).eq('id', t.id);
    notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} moveu NF #${t.id} para Sem Boleto`, `Cliente: ${t.nom_cliente || ''}`, `/financeiro/kanban-pecas`)
    carregarDados();
 };

 // Excluir card — somente admin
 const excluirCard = async (t) => {
    if (!isAdmin || !t) return;
    if (!window.confirm(`Excluir definitivamente o card de ${t.nom_cliente || ('NF #' + t.id)}? Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from('Chamado_NF').delete().eq('id', t.id);
    if (error) { alert('Erro ao excluir: ' + error.message); return; }
    await auditLog({ sistema: 'financeiro', acao: 'excluir', entidade: 'Chamado_NF', entidade_id: String(t.id), entidade_label: `NF #${t.id} - ${t.nom_cliente || ''}` });
    notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} excluiu NF #${t.id}`, `Cliente: ${t.nom_cliente || ''}`, `/financeiro/kanban-pecas`)
    setTarefaSelecionada(null);
    carregarDados();
 };

 const handleVoltarFluxo = async (t) => {
    await supabase.from('Chamado_NF').update({ status: 'gerar_boleto', tarefa: 'Gerar Boleto' }).eq('id', t.id);
    notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} devolveu NF #${t.id} ao fluxo`, `Cliente: ${t.nom_cliente || ''}`, `/financeiro/kanban-pecas`)
    carregarDados();
 };

 const handleMoverParaPago = async (t) => {
    if (exigeComprovantePago(t.forma_pagamento) && !temComprovantePago(t)) {
      alert('Este método de pagamento exige o comprovante anexado para mover para Pago.');
      return;
    }
    await supabase.from('Chamado_NF').update({ status: 'pago', tarefa: 'Pagamento Confirmado' }).eq('id', t.id);
    notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} confirmou pagamento NF #${t.id}`, `Cliente: ${t.nom_cliente || ''}`, `/financeiro/kanban-pecas`)
    carregarDados();
 };

 const chamadosFiltrados = chamados.filter(c => ehDoSetor(c, SETOR_KANBAN)).filter(c => !temNotaServico(c)).filter(c => {
    const q = filtroBusca.trim().toLowerCase();
    if (!q) return true;
    const campos = [
      c.nom_cliente,
      c.num_nf_servico,
      c.num_nf_peca,
      c.vencimento_boleto,
      formatarDataBR(c.vencimento_boleto),
      c.forma_pagamento,
      `#${c.id}`,
      c.id,
    ];
    return campos.some(v => v != null && String(v).toLowerCase().includes(q));
 });

 if (loading) return (
   <div style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
     <p style={{ color: 'var(--portal-text-secondary)', fontSize: '18px', letterSpacing: '2px' }}>Carregando Kanban...</p>
   </div>
 )

 // LÓGICAS CONDICIONAIS PARA INTERFACE
 const isBoleto30 = tarefaSelecionada?.forma_pagamento === 'Boleto 30 dias';
 const isParcelamentoOuBoleto30 = tarefaSelecionada && ['Boleto 30 dias', 'Boleto Parcelado', 'Cartão Parcelado'].includes(tarefaSelecionada.forma_pagamento);
 const isPixOuCartaoVista = tarefaSelecionada && ['Pix', 'Cartão a vista'].includes(tarefaSelecionada.forma_pagamento);
 const isBoletoParcelado = tarefaSelecionada?.forma_pagamento === 'Boleto Parcelado';
 const valorIndividual = tarefaSelecionada ? (tarefaSelecionada.valor_servico / (tarefaSelecionada.qtd_parcelas || 1)) : 0;

 return (
  <div style={{ minHeight: 'calc(100vh - 64px)', fontFamily: 'Inter, sans-serif' }}>
   <FinanceiroNav />

   <main style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px - 56px)', overflow: 'hidden' }}>
    <header style={{ padding: '20px 32px 16px' }}>

     <div style={{ display:'flex', gap:'20px', flexWrap:'wrap', justifyContent: 'flex-start' }}>
        <div style={{ position: 'relative', flex: '1 1 450px', maxWidth: '700px' }}>
            <Search size={22} style={iconFilterStyle} />
            <input type="text" placeholder="Buscar por cliente, nº da nota, vencimento, condição ou ID..." value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)} style={{...inputFilterStyle, fontSize:'20px', padding:'20px 56px 20px 56px'}} />
            {filtroBusca && <X size={18} onClick={() => setFiltroBusca('')} style={{position:'absolute', right: '18px', top: '50%', transform:'translateY(-50%)', cursor:'pointer', color:'#dc2626'}}/>}
        </div>
     </div>
    </header>

    {/* Uma rolagem só: o board inteiro desce junto (as colunas não rolam individualmente) */}
    <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', gap: '0', overflowX: 'auto', overflowY: 'auto', padding: '0 clamp(10px, 4vw, 50px) 40px', boxSizing: 'border-box' }}>
     {colunas.map(col => {
      const cardsCol = chamadosFiltrados.filter(c => {
        if (col.id === 'gerar_boleto') return c.status === 'gerar_boleto' || c.status === 'validar_pix';
        return c.status === col.id;
      });
      return (
      <div key={col.id} style={{ width: '400px', flex: '0 0 400px', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--portal-border)', padding: '0 16px' }}>
       <h3 className="fin-col-title" style={{ background: col.id === 'vencido' ? '#fecaca' : col.id === 'sem_boleto' ? '#fde68a' : '#c5e29f', color: '#111111', padding: '16px', borderRadius: '12px', marginBottom: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontWeight:'700', fontSize:'15px', letterSpacing:'1px', border: 'none', flexShrink: 0 }}>{col.titulo}<span style={{ background: 'rgba(255,255,255,.75)', borderRadius: '999px', padding: '2px 10px', fontSize: '13px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{cardsCol.length}</span></h3>

       <div style={{ display: 'flex', flexDirection: 'column', gap: '0', paddingRight: '5px' }}>
        {cardsCol.map(t => (
         <div key={t.id} className="kanban-card" style={{ borderRadius: '12px', border: '1px solid rgba(0,0,0,0.5)', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderBottom: '1px dashed var(--portal-border)' }}>
           <span style={{ width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0, background: fichaCorStatus(t.status) }} />
           <span style={{ flex: 1, fontSize: '10px', fontWeight: '500', letterSpacing: '0.9px', textTransform: 'uppercase', color: t.status === 'vencido' ? '#dc2626' : t.status === 'sem_boleto' ? '#b45309' : 'var(--portal-text-secondary)' }}>{fichaLabelStatus(t.status)}</span>
           <span style={{ fontSize: '10.5px', color: '#9ca3af', fontWeight: '500', fontVariantNumeric: 'tabular-nums' }}>#{t.id}</span>
          </div>
          <div onClick={() => setTarefaSelecionada(t)} style={{ padding: '11px 14px 13px', cursor: 'pointer' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
             <div style={{ flex: 1, minWidth: 0 }}>
               <span style={setorBadgeStyle}>{labelSetor(t)}</span>
               <h4 style={{ margin: '7px 0 0', fontSize: '16px', fontWeight: '500', lineHeight: 1.3, color: t.status === 'vencido' ? '#dc2626' : 'var(--portal-text)' }}>{t.nom_cliente?.toUpperCase()}</h4>
             </div>
             <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
               {t.status === 'enviar_cliente' && (
                 <button
                   title="Enviar boleto ao cliente (conforme a preferência) e mover para Aguardando Vencimento"
                   disabled={enviandoId === t.id}
                   onClick={(e) => { e.stopPropagation(); handleEnviarRapido(t); }}
                   style={{ background: '#8bc53f', border: '1px solid #7ab332', borderRadius: '8px', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: enviandoId === t.id ? 'wait' : 'pointer', color: '#fff', transition: '0.2s', flexShrink: 0, opacity: enviandoId === t.id ? 0.6 : 1 }}
                 >{enviandoId === t.id ? <RefreshCw size={18} className="spin-envio" /> : <Send size={18} />}</button>
               )}
               {t.status === 'sem_boleto' && (
                 <button
                   title="Voltar para Gerar Boleto"
                   onClick={(e) => { e.stopPropagation(); handleVoltarFluxo(t); }}
                   style={{ background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: '8px', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--portal-text-secondary)', fontSize: '14px', fontWeight: '700', transition: '0.2s', flexShrink: 0 }}
                   onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.color = '#2563eb'; e.currentTarget.style.borderColor = '#93c5fd'; }}
                   onMouseLeave={e => { e.currentTarget.style.background = 'var(--portal-bg-secondary)'; e.currentTarget.style.color = 'var(--portal-text-secondary)'; e.currentTarget.style.borderColor = 'var(--portal-border)'; }}
                 >↩</button>
               )}
               {t.status !== 'sem_boleto' && t.status !== 'pago' && (
                 <button
                   title="Mover para Cliente sem boleto"
                   onClick={(e) => { e.stopPropagation(); setConfirmSemBoleto(t); }}
                   style={{ background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: '8px', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--portal-text-secondary)', fontSize: '14px', fontWeight: '700', transition: '0.2s', flexShrink: 0 }}
                   onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fca5a5'; }}
                   onMouseLeave={e => { e.currentTarget.style.background = 'var(--portal-bg-secondary)'; e.currentTarget.style.color = 'var(--portal-text-secondary)'; e.currentTarget.style.borderColor = 'var(--portal-border)'; }}
                 ><Wallet size={20} /></button>
               )}
             </div>
           </div>
           <table style={{ width: '100%', borderCollapse: 'collapse', margin: '10px 0 2px' }}>
             <tbody>
               <tr><td style={fichaTdLab}>Envio</td><td style={fichaTdVal}><PrefEnvioBadge metodo={acharMetodo(t, prefsEnvio)} /></td></tr>
               <tr><td style={fichaTdLab}>Forma</td><td style={fichaTdVal}>{t.forma_pagamento?.toUpperCase() || '—'}</td></tr>
               <tr><td style={fichaTdLab}>Venc</td><td style={t.status === 'vencido' ? { ...fichaTdVal, color: '#dc2626', fontWeight: '800' } : fichaTdVal}>{formatarDataBR(t.vencimento_boleto)}</td></tr>
               {(t.num_nf_servico || t.num_nf_peca) && (
                 <tr><td style={fichaTdLab}>NF</td><td style={fichaTdVal}>{[t.num_nf_servico && `S ${t.num_nf_servico}`, t.num_nf_peca && `P ${t.num_nf_peca}`].filter(Boolean).join(' / ')}</td></tr>
               )}
             </tbody>
           </table>
           {t.isPagamentoRealizado && (
             <div style={{ marginTop: '10px', display:'flex', alignItems:'center', gap:'6px', color:'#16a34a', fontSize:'11px', fontWeight:'600', letterSpacing:'1px' }}>
               <CheckCircle size={14}/> PAGAMENTO REALIZADO
             </div>
           )}
           {/* ── INDICADORES BOLETO PARCELADO ── */}
           {t.forma_pagamento === 'Boleto Parcelado' && t.parcelas_info && (
             <div style={{ marginTop: '10px' }}>
               <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                 {t.parcelas_info.map((p, i) => (
                   <div key={i}
                     title={`${p.num}ª parcela — ${p.estado === 'pago' ? 'Paga' : p.estado === 'vencido' ? 'EM ATRASO' : p.estado === 'proximo' ? 'Vence em breve' : 'A vencer'} — ${p.data ? formatarDataBR(p.data) : 'Sem data'}`}
                     style={{ width: '14px', height: '14px', borderRadius: '50%', flexShrink: 0, cursor: 'default',
                       background: p.estado === 'pago' ? '#27ae60' : p.estado === 'vencido' ? '#e74c3c' : p.estado === 'proximo' ? '#f39c12' : '#bdc3c7',
                       border: p.estado === 'vencido' ? '2px solid #c0392b' : '2px solid transparent'
                     }}
                   />
                 ))}
                 <span style={{ fontSize: '11px', color: 'var(--portal-text-secondary)', marginLeft: '4px' }}>
                   {t.parcelas_info.filter(p => p.estado === 'pago').length}/{t.parcelas_info.length} pagas
                 </span>
               </div>
               {t.parcelaVencida && !t.isPagamentoRealizado && (
                 <div style={{ display:'flex', alignItems:'center', gap:'6px', background:'#fef2f2', padding:'6px 10px', borderRadius:'6px' }}>
                   <AlertCircle size={13} color="#dc2626" />
                   <span style={{ color:'#dc2626', fontSize:'11px', fontWeight:'800' }}>
                     {t.parcelas_info.filter(p => p.estado === 'vencido').length === 1 ? 'UMA PARCELA EM ATRASO' : `${t.parcelas_info.filter(p => p.estado === 'vencido').length} PARCELAS EM ATRASO`}
                   </span>
                 </div>
               )}
             </div>
           )}
           <div style={{ marginTop: '10px', fontSize: '26px', fontWeight: '500', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums', color: t.status === 'vencido' ? '#dc2626' : '#16a34a' }}>{formatarMoeda(t.valor_exibicao)}</div>
          </div>
         </div>
        ))}
       </div>
      </div>
      );
     })}
    </div>
   </main>

   {/* --- MODAL DETALHES --- */}
   {tarefaSelecionada && (
    <div onClick={(e) => { if (e.target === e.currentTarget) setTarefaSelecionada(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(10px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
     <div style={{ background: 'var(--portal-bg-card)', width: '1100px', maxWidth: '98%', maxHeight: '95vh', borderRadius: '30px', overflow:'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.15)', border: '1px solid var(--portal-border)', display: 'flex', flexDirection: 'column' }}>

      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--portal-bg-card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--portal-border)', flexShrink: 0 }}>
        <button onClick={() => setTarefaSelecionada(null)} className="btn-back"><ArrowLeft size={18}/> VOLTAR AO PAINEL</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isAdmin && (
            <button onClick={() => excluirCard(tarefaSelecionada)} style={{ background: '#dc2626', border: '1px solid #dc2626', borderRadius: '10px', cursor:'pointer', padding:'8px 12px', display: 'flex', alignItems: 'center', gap: '6px', color: '#fff', fontSize: '13px', fontWeight: '600', transition: '0.2s' }} title="Excluir card (somente admin)"><Trash2 size={16}/> Excluir</button>
          )}
          <button onClick={() => setTarefaSelecionada(null)} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', cursor:'pointer', padding:'8px 12px', display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', fontSize: '13px', fontWeight: '600', transition: '0.2s' }} title="Fechar"><X size={18}/> Fechar</button>
        </div>
      </div>
      <div style={{ flex: 1, padding: '30px 50px 50px', overflowY: 'auto' }}>
        {podeEditar ? (
          <input
            style={{fontSize:'32px', fontWeight:'500', margin:'25px 0', letterSpacing:'-1px', color:'var(--portal-text)', lineHeight:'1', border:'none', borderBottom:'2px dashed var(--portal-border)', background:'transparent', width:'100%', outline:'none', padding:'2px 0'}}
            defaultValue={tarefaSelecionada.nom_cliente || ''}
            placeholder="Nome do cliente"
            onBlur={e => handleUpdateField(tarefaSelecionada.id, 'nom_cliente', e.target.value)}
            title="Editar nome (somente admin)"
          />
        ) : (
          <h2 style={{fontSize:'32px', fontWeight:'500', margin:'25px 0', letterSpacing:'-1px', color:'var(--portal-text)', lineHeight: '1'}}>{tarefaSelecionada.nom_cliente?.toUpperCase()}</h2>
        )}

        <div style={{display:'flex', gap:'30px', marginBottom:'45px'}}>
          <div style={fieldBoxModal}>
            <label style={labelModalStyle}>Condição</label>
            {podeEditar ? (
              <select
                style={{ ...pModalStyle, border:'none', borderBottom:'2px dashed var(--portal-border)', background:'transparent', outline:'none', cursor:'pointer', width:'100%' }}
                value={tarefaSelecionada.forma_pagamento || ''}
                onChange={e => handleUpdateField(tarefaSelecionada.id, 'forma_pagamento', e.target.value)}
                title="Editar condição (somente admin)"
              >
                <option value="">Selecione...</option>
                {FORMAS_BOLETO.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
            ) : (
              <p style={{ ...pModalStyle, fontSize: '22px', fontWeight: '700' }}>{tarefaSelecionada.forma_pagamento?.toUpperCase() || '—'}</p>
            )}
          </div>

          <div style={fieldBoxModal}>
            <label style={labelModalStyle}>Valor Total</label>
            {podeEditar ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '18px', fontWeight: '800', color: '#16a34a' }}>R$</span>
                <input
                  type="number"
                  style={{ ...inputStyleModal, border: 'none', background: 'transparent', padding: '0', fontSize: '26px', fontWeight: '700', color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}
                  defaultValue={tarefaSelecionada.valor_servico}
                  onBlur={e => handleUpdateField(tarefaSelecionada.id, 'valor_servico', e.target.value)}
                />
              </div>
            ) : (
              <p style={{ ...pModalStyle, fontSize: '26px', fontWeight: '800', color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>{formatarMoeda(tarefaSelecionada.valor_servico)}</p>
            )}
            {podeEditar && <div style={{ fontSize: '13px', color: 'var(--portal-text-secondary)', marginTop: '4px' }}>{formatarMoeda(tarefaSelecionada.valor_servico)}</div>}
          </div>

          {isBoleto30 && (
            <div style={fieldBoxModal}>
              <label style={labelModalStyle}>Vencimento</label>
              {podeEditar ? (
                <input
                  type="date"
                  style={{ ...inputStyleModal, border: 'none', background: 'transparent', padding: '0', fontSize: '24px', fontWeight: '700', fontVariantNumeric: 'tabular-nums', color: tarefaSelecionada.status === 'vencido' ? '#dc2626' : 'var(--portal-text)' }}
                  defaultValue={tarefaSelecionada.vencimento_boleto}
                  onBlur={e => handleUpdateField(tarefaSelecionada.id, 'vencimento_boleto', e.target.value)}
                />
              ) : (
                <p style={{ ...pModalStyle, fontSize: '24px', fontWeight: '700', fontVariantNumeric: 'tabular-nums', color: tarefaSelecionada.status === 'vencido' ? '#dc2626' : 'var(--portal-text)' }}>{formatarDataBR(tarefaSelecionada.vencimento_boleto) || '—'}</p>
              )}
            </div>
          )}
        </div>

        {/* PARCELAMENTO EM CASCATA (ESCONDIDO PARA BOLETO 30 DIAS) */}
        {!isBoleto30 && isParcelamentoOuBoleto30 && (
          <div style={{ display:'flex', flexDirection:'column', gap:'20px', background:'#fef2f2', padding:'40px', borderRadius:'24px', border:'1px solid var(--portal-border)', marginBottom: '45px' }}>
             <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid var(--portal-border)', paddingBottom:'20px', marginBottom:'10px' }}>
                <div style={{ display:'flex', gap:'40px' }}>
                  <div>
                    <label style={labelModalStyle}>Quantidade</label>
                    <select
                      style={{ ...inputStyleModal, width: '180px', padding: '10px' }}
                      value={tarefaSelecionada.qtd_parcelas || 1}
                      onChange={e => handleUpdateField(tarefaSelecionada.id, 'qtd_parcelas', e.target.value)}
                    >
                      {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}x</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelModalStyle}>Cálculo Unitário</label>
                    <p style={{ ...pModalStyle, fontSize: '24px', opacity: 0.7 }}>{formatarMoeda(valorIndividual)}</p>
                  </div>
                </div>
             </div>

             <div style={{ display:'flex', flexDirection:'column', gap: '15px' }}>
                <div style={cascadeRowStyle}>
                  <span style={cascadeLabelStyle}>1ª PARCELA</span>
                  <input type="date" disabled={!podeEditar} style={{ ...inputCascadeStyle, cursor: podeEditar ? 'text' : 'not-allowed' }} defaultValue={tarefaSelecionada.vencimento_boleto} onBlur={e => handleUpdateField(tarefaSelecionada.id, 'vencimento_boleto', e.target.value)} />
                  <span style={cascadeValueStyle}>{formatarMoeda(valorIndividual)}</span>
                  <AttachmentTag label="COMPROVANTE P1" fileUrl={tarefaSelecionada.comprovante_pagamento} onUpload={f => handleUpdateFileDirect(tarefaSelecionada.id, 'comprovante_pagamento', f)} />
                </div>

                {Array.from({ length: (tarefaSelecionada.qtd_parcelas || 1) - 1 }).map((_, i) => {
                  const pNum = i + 2;
                  const rawDates = (tarefaSelecionada.datas_parcelas || "").split(/[\s,]+/).filter(d => d.includes('-'));
                  // Remove duplicata da parcela 1 se presente (registros antigos)
                  if (rawDates.length > 0 && rawDates[0] === tarefaSelecionada.vencimento_boleto) rawDates.shift();
                  return (
                    <div key={pNum} style={cascadeRowStyle}>
                      <span style={cascadeLabelStyle}>{pNum}ª PARCELA</span>
                      <input
                        type="date"
                        disabled={!podeEditar}
                        style={{ ...inputCascadeStyle, cursor: podeEditar ? 'text' : 'not-allowed' }}
                        defaultValue={rawDates[i] || ""}
                        onBlur={e => {
                          let arr = [...rawDates];
                          while (arr.length < (tarefaSelecionada.qtd_parcelas || 1) - 1) arr.push('');
                          arr[i] = e.target.value;
                          handleUpdateField(tarefaSelecionada.id, 'datas_parcelas', arr.filter(d => d).join(', '));
                        }}
                      />
                      <span style={cascadeValueStyle}>{formatarMoeda(valorIndividual)}</span>
                      <AttachmentTag label={`COMPROVANTE P${pNum}`} fileUrl={tarefaSelecionada[`comprovante_pagamento_p${pNum}`]} onUpload={f => handleUpdateFileDirect(tarefaSelecionada.id, `comprovante_pagamento_p${pNum}`, f)} />
                    </div>
                  )
                })}
             </div>
          </div>
        )}

        {/* === INFORMAÇÕES + DOCUMENTOS EM GRID COMPACTO === */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px' }}>

          {/* NF + ANEXOS */}
          <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'22px', padding:'24px', display:'flex', flexDirection:'column', gap:'14px' }}>
            <label style={{...labelModalStyle, margin:0, display:'flex', alignItems:'center', gap:'8px'}}><FileText size={16} color="#16a34a"/> NOTAS FISCAIS</label>
            {(tarefaSelecionada.num_nf_servico || !tarefaSelecionada.num_nf_peca) && (
              <div>
                <label style={{...labelModalStyle, fontSize:'11px', marginBottom:'4px'}}>NF Servico</label>
                <input style={{...inputStyleModal, padding:'12px'}} defaultValue={tarefaSelecionada.num_nf_servico} onBlur={e => handleUpdateField(tarefaSelecionada.id, 'num_nf_servico', e.target.value)} />
              </div>
            )}
            {(tarefaSelecionada.num_nf_peca || !tarefaSelecionada.num_nf_servico) && (
              <div>
                <label style={{...labelModalStyle, fontSize:'11px', marginBottom:'4px'}}>NF Peca</label>
                <input style={{...inputStyleModal, padding:'12px'}} defaultValue={tarefaSelecionada.num_nf_peca} onBlur={e => handleUpdateField(tarefaSelecionada.id, 'num_nf_peca', e.target.value)} />
              </div>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {(tarefaSelecionada.anexo_nf_servico || (!tarefaSelecionada.num_nf_peca && !tarefaSelecionada.anexo_nf_peca)) && (
                <AttachmentTag label="NF SERVICO" fileUrl={tarefaSelecionada.anexo_nf_servico} onUpload={(file) => handleUpdateFileDirect(tarefaSelecionada.id, 'anexo_nf_servico', file)} />
              )}
              {(tarefaSelecionada.anexo_nf_peca || (!tarefaSelecionada.num_nf_servico && !tarefaSelecionada.anexo_nf_servico)) && (
                <AttachmentTag label="NF PECA" fileUrl={tarefaSelecionada.anexo_nf_peca} onUpload={(file) => handleUpdateFileDirect(tarefaSelecionada.id, 'anexo_nf_peca', file)} />
              )}
              {tarefaSelecionada.comprovante_pagamento && (
                <AttachmentTag label="COMPROVANTE" fileUrl={tarefaSelecionada.comprovante_pagamento} onUpload={(file) => handleUpdateFileDirect(tarefaSelecionada.id, 'comprovante_pagamento', file)} />
              )}
            </div>
          </div>

          {/* BOLETO DO FINANCEIRO — esconde para sem_boleto e para Pix/Cheque/Cartões (não geram boleto) */}
          {!exigeComprovantePago(tarefaSelecionada.forma_pagamento) && tarefaSelecionada.status !== 'sem_boleto' && (
          <div style={{ background: tarefaSelecionada.anexo_boleto ? '#eff6ff' : '#fef2f2', border: `1px solid ${tarefaSelecionada.anexo_boleto ? '#bfdbfe' : '#fecaca'}`, borderRadius:'22px', padding:'24px', display:'flex', flexDirection:'column', gap:'12px' }}>
            <label style={{...labelModalStyle, margin:0, color: tarefaSelecionada.anexo_boleto ? '#3b82f6' : '#dc2626', display:'flex', alignItems:'center', gap:'8px'}}>
              {tarefaSelecionada.anexo_boleto ? <CheckCircle size={16} color="#3b82f6"/> : <Calendar size={16} color="#dc2626"/>}
              {tarefaSelecionada.anexo_boleto ? 'BOLETO RECEBIDO' : 'AGUARDANDO BOLETO'}
            </label>
            {tarefaSelecionada.anexo_boleto ? (
              <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                {(() => {
                  const urls = [];
                  if (tarefaSelecionada.anexo_boleto) tarefaSelecionada.anexo_boleto.split(',').forEach(u => { const t = u.trim(); if (t) urls.push(t); });
                  if (tarefaSelecionada.anexo_boleto_2) { const t = tarefaSelecionada.anexo_boleto_2.trim(); if (t && !urls.includes(t)) urls.push(t); }
                  if (tarefaSelecionada.anexo_boleto_3) { const t = tarefaSelecionada.anexo_boleto_3.trim(); if (t && !urls.includes(t)) urls.push(t); }
                  return urls.map((url, i) => ({ label: `Boleto ${i + 1}`, url }));
                })().map((boleto, i) => (
                  <div key={i}
                    onClick={() => window.open(boleto.url, '_blank')}
                    style={{ display:'flex', alignItems:'center', gap:'12px', background:'var(--portal-bg-card)', border:'1px solid #bfdbfe', borderRadius:'12px', padding:'14px', cursor:'pointer', transition:'0.2s' }}
                  >
                    <div style={{ width:'36px', height:'36px', borderRadius:'8px', background:'#dbeafe', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <Eye size={16} color="#3b82f6"/>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:'14px', color:'var(--portal-text)', fontWeight:'600' }}>{boleto.label}</div>
                    </div>
                    <Download size={16} color="#3b82f6"/>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'24px', background:'var(--portal-bg-card)', borderRadius:'12px', border:'2px dashed #fecaca' }}>
                <div style={{ textAlign:'center' }}>
                  <Calendar size={28} color="#fca5a5" style={{ marginBottom:'8px' }}/>
                  <div style={{ fontSize:'13px', color:'#dc2626', fontWeight:'600' }}>Aguardando</div>
                  <div style={{ fontSize:'11px', color:'#9ca3af', marginTop:'2px' }}>O financeiro ainda nao gerou o boleto</div>
                </div>
              </div>
            )}
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

        {/* PREFERÊNCIA DE ENVIO + AÇÃO DE ENVIO — antes das observações */}
        <div style={{ marginTop:'20px', display:'flex', flexDirection:'column', gap:'20px' }}>
          <PreferenciaEnvioBoleto card={tarefaSelecionada} />
          {tarefaSelecionada.status === 'enviar_cliente' && (
            <div style={{background:'#f0fdf4', padding:'30px 35px', borderRadius:'20px', border:'1px solid #bbf7d0'}}>
              <label style={{...labelModalStyle, color:'#16a34a', fontSize: '16px'}}>AÇÃO REQUERIDA</label>
              <p style={{color: 'var(--portal-text-secondary)', marginBottom: '20px', fontSize: '14px'}}>Confirme após enviar os documentos ao cliente.</p>
              <button onClick={() => handleConfirmarEnvioPV(tarefaSelecionada)} style={{background:'#22c55e', color:'#fff', padding:'16px 35px', border:'none', borderRadius:'14px', cursor:'pointer', fontSize: '16px', fontWeight:'700', display:'flex', alignItems:'center', gap:'12px', transition:'0.3s'}}>
                  <Send size={20}/> MARCAR COMO ENVIADO AO CLIENTE
              </button>
            </div>
          )}
        </div>

        {/* OBSERVAÇÕES — só mostra se tiver conteúdo */}
        {tarefaSelecionada.obs && (
          <div style={{ marginTop:'20px', background:'var(--portal-bg-card)', padding:'20px', borderRadius:'16px', border:'1px solid var(--portal-border)' }}>
            <label style={{...labelModalStyle, marginBottom:'8px'}}>Observacoes</label>
            <textarea style={{...inputStyleModal, height:'80px', resize: 'none', padding:'12px'}} defaultValue={tarefaSelecionada.obs} onBlur={e => handleUpdateField(tarefaSelecionada.id, 'obs', e.target.value)} />
          </div>
        )}

        {/* HISTÓRICO DESTE CARD — o que foi alterado, quem alterou, data e hora */}
        <div style={{ marginTop:'30px', background:'var(--portal-bg-secondary)', border:'1px solid var(--portal-border)', borderRadius:'16px', padding:'24px' }}>
          <label style={{...labelModalStyle, marginBottom:'14px', display:'flex', alignItems:'center', gap:'8px'}}><Clock size={15}/> Histórico deste card</label>
          {cardLogs.length === 0 ? (
            <p style={{ fontSize:'13px', color:'var(--portal-text-secondary)', margin:0 }}>Nenhuma alteração registrada ainda.</p>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {cardLogs.map((l, i) => {
                const det = l.detalhes && typeof l.detalhes === 'object'
                  ? Object.entries(l.detalhes).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')
                  : '';
                return (
                  <div key={i} style={{ display:'flex', gap:'12px', alignItems:'flex-start', padding:'12px 14px', background:'var(--portal-bg-card)', borderRadius:'10px', border:'1px solid var(--portal-border)' }}>
                    <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#dc2626', marginTop:'6px', flexShrink:0 }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'13.5px', fontWeight:'600', color:'var(--portal-text)' }}>{l.nome} <span style={{ fontWeight:'400', color:'var(--portal-text-secondary)' }}>— {l.acao}</span></div>
                      {det && <div style={{ fontSize:'12px', color:'var(--portal-text-secondary)', marginTop:'2px', wordBreak:'break-word' }}>{det}</div>}
                    </div>
                    <div style={{ fontSize:'11.5px', color:'#94a3b8', whiteSpace:'nowrap' }}>{new Date(l.created_at).toLocaleString('pt-BR')}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{marginTop:'30px', display:'flex', flexDirection:'column', gap:'20px'}}>

          {(tarefaSelecionada.status === 'aguardando_vencimento' || (exigeComprovantePago(tarefaSelecionada.forma_pagamento) && tarefaSelecionada.status !== 'pago' && tarefaSelecionada.status !== 'concluido')) && (
            <div style={{background:'#eff6ff', padding:'40px', borderRadius:'24px', border:'1px solid #bfdbfe'}}>
                <label style={{...labelModalStyle, color:'#3b82f6', fontSize: '16px'}}>COMPROVANTE DE PAGAMENTO</label>
                <p style={{color: 'var(--portal-text-secondary)', marginBottom: '25px', fontSize: '14px'}}>
                  Anexe o comprovante quando o cliente efetuar o pagamento. Uma tarefa será criada automaticamente para o Financeiro confirmar.
                </p>
                {tarefaSelecionada.comprovante_pagamento && (
                  <div style={{marginBottom:'20px', display:'flex', alignItems:'center', gap:'10px', color:'#16a34a', fontSize:'13px', fontWeight:'700', background:'#f0fdf4', padding:'12px 20px', borderRadius:'12px', border:'1px solid #bbf7d0'}}>
                    <CheckCircle size={16}/> COMPROVANTE JÁ ANEXADO — tarefa enviada ao Financeiro
                    <button onClick={() => window.open(tarefaSelecionada.comprovante_pagamento, '_blank')} style={{marginLeft:'auto', background:'var(--portal-bg-secondary)', color:'var(--portal-text)', border:'1px solid var(--portal-border)', padding:'6px 16px', borderRadius:'8px', cursor:'pointer', fontSize:'12px'}}>VER</button>
                  </div>
                )}
                <label style={{display:'flex', alignItems:'center', gap:'15px', background:'var(--portal-bg-card)', border:'2px dashed #bfdbfe', borderRadius:'16px', padding:'25px', cursor:'pointer', transition:'0.3s'}}>
                  <Upload size={24} color="#3b82f6" />
                  <div>
                    <div style={{color:'#3b82f6', fontWeight:'700', fontSize:'14px'}}>{tarefaSelecionada.comprovante_pagamento ? 'SUBSTITUIR COMPROVANTE' : 'ANEXAR COMPROVANTE'}</div>
                    <div style={{color:'var(--portal-text-secondary)', fontSize:'12px', marginTop:'4px'}}>Clique para escolher o arquivo</div>
                  </div>
                  <input type="file" hidden onChange={e => handleAnexarComprovantePV(tarefaSelecionada, e.target.files[0])} />
                </label>
            </div>
          )}
        </div>
      </div>

     </div>
    </div>
   )}

   {/* Orientação do envio rápido + configuração do e-mail de envio na hora */}
   <EnvioGuiaModal
     info={envioGuia}
     onClose={() => setEnvioGuia(null)}
     onAbrirCard={() => { setTarefaSelecionada(envioGuia.card); setEnvioGuia(null); }}
     onConfigEmail={() => { setCfgEmailCard(envioGuia.card); setEnvioGuia(null); }}
     onMarcarEnviado={() => { const c = envioGuia.card; setEnvioGuia(null); handleConfirmarEnvioPV(c); }}
   />
   <ConfigEmailEnvioModal
     open={!!cfgEmailCard}
     onClose={() => setCfgEmailCard(null)}
     onSaved={() => { const c = cfgEmailCard; setCfgEmailCard(null); if (c) handleEnviarRapido(c); }}
   />

   <style jsx global>{`
    .kanban-card { background: var(--portal-bg-card); border: 1px solid var(--portal-border); border-radius: 20px; cursor: pointer; transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1); overflow: hidden; margin-bottom: 5px; flex-shrink: 0; }
    .kanban-card:hover { transform: translateY(-6px); box-shadow: 0 12px 30px rgba(0,0,0,0.08); border-color: var(--portal-border); }
    .spin-envio { animation: spin-envio 1s linear infinite; }
    @keyframes spin-envio { to { transform: rotate(360deg); } }
    .btn-back { background: transparent; color: var(--portal-text-secondary); border: 1px solid var(--portal-border); padding: 12px 28px; border-radius: 14px; cursor: pointer; display: flex; align-items: center; gap: 10px; font-size:14px; transition: 0.2s; font-family: Inter, sans-serif; }
    .btn-back:hover { background: var(--portal-bg-secondary); color: var(--portal-text); }
    ::-webkit-scrollbar { width: 8px; height: 12px; }
    ::-webkit-scrollbar-track { background: var(--portal-bg-secondary); }
    ::-webkit-scrollbar-thumb { background: var(--portal-border); border-radius: 10px; border: 2px solid var(--portal-bg-secondary); }
   `}</style>

   <ConfirmarFaseModal
     open={!!confirmSemBoleto}
     mensagem="Deseja mudar para a fase: Cliente sem boleto?"
     onConfirm={() => { const t = confirmSemBoleto; setConfirmSemBoleto(null); handleMoverSemBoleto(t); }}
     onCancel={() => setConfirmSemBoleto(null)}
   />
  </div>
 )
}

function AttachmentTag({ label, fileUrl, onUpload, disabled = false }) {
    const fileInputRef = useRef(null);
    return (
        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: '12px', overflow: 'hidden', minWidth:'260px' }}>
            <span style={{ padding: '12px 18px', fontSize: '12px', color: fileUrl ? '#16a34a' : 'var(--portal-text-secondary)', borderRight: '1px solid var(--portal-border)', flex: 1, whiteSpace: 'nowrap' }}>{label}</span>
            <div style={{ display: 'flex' }}>
                {fileUrl && (
                    <button title="Ver" onClick={() => window.open(fileUrl, '_blank')} style={miniActionBtn}><Eye size={18} /></button>
                )}
                {!disabled && (
                    <>
                        <button title="Upload" onClick={() => fileInputRef.current.click()} style={miniActionBtn}><RefreshCw size={18} /></button>
                        <input type="file" ref={fileInputRef} hidden onChange={(e) => onUpload(e.target.files[0])} />
                    </>
                )}
            </div>
        </div>
    );
}

const cascadeRowStyle = { display: 'grid', gridTemplateColumns: '150px 220px 180px 320px', gap: '20px', alignItems: 'center', background: 'var(--portal-bg-card)', padding: '15px', borderRadius: '14px', border: '1px solid var(--portal-border)' };
const cascadeLabelStyle = { fontSize: '12px', color: 'var(--portal-text-secondary)', fontWeight: '600', letterSpacing: '1px' };
const inputCascadeStyle = { background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: '8px', color: 'var(--portal-text)', padding: '8px 12px', fontSize: '14px', outline: 'none' };
const cascadeValueStyle = { fontSize: '18px', color: 'var(--portal-text)', fontWeight: '500' };

const inputFilterStyle = { padding: '16px 20px 16px 52px', width: '100%', borderRadius: '14px', border: '1px solid var(--portal-border)', outline: 'none', background:'var(--portal-bg-card)', color:'var(--portal-text)', fontSize: '18px', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' };
const iconFilterStyle = { position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text-secondary)', zIndex: 10 };
// ── Ficha compacta (estilo dos cards) ──
const fichaCorStatus = (s) => s === 'vencido' ? '#dc2626' : s === 'sem_boleto' ? '#f59e0b' : (s === 'pago' || s === 'concluido') ? '#16a34a' : '#8bc53f';
const fichaLabelStatus = (s) => STATUS_CONFIG[s]?.label || (s === 'sem_boleto' ? 'CLIENTE SEM BOLETO' : s === 'validar_pix' ? 'VALIDAR PIX' : String(s || '').replace(/_/g, ' ').toUpperCase());
const fichaTdLab = { padding:'4px 10px 4px 0', fontSize:'10.5px', fontWeight:'500', letterSpacing:'0.6px', textTransform:'uppercase', color:'#8a9479', width:'34%', borderBottom:'1px solid var(--portal-border)', whiteSpace:'nowrap' };
const fichaTdVal = { padding:'4px 0', fontSize:'13px', color:'var(--portal-text)', fontWeight:'400', borderBottom:'1px solid var(--portal-border)', fontVariantNumeric:'tabular-nums' };
const miniTagStyle = { background:'var(--portal-bg-secondary)', padding:'10px 15px', borderRadius:'12px', fontSize:'12px', color:'var(--portal-text-secondary)', display:'inline-flex', alignItems:'center', gap:'8px', border:'1px solid var(--portal-border)' };
const inputStyleModal = { width: '100%', padding: '20px', border: '1px solid var(--portal-border)', borderRadius: '15px', outline: 'none', background:'var(--portal-bg-card)', color:'var(--portal-text)', fontSize: '18px', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' };
const labelModalStyle = { fontSize:'14px', color:'var(--portal-text-secondary)', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'10px', display:'block' };
const pModalStyle = { fontSize:'32px', color:'var(--portal-text)', margin:'0' };
const fieldBoxModal = { border: '1px solid var(--portal-border)', padding: '20px 24px', borderRadius: '16px', background: 'var(--portal-bg-card)', boxShadow: '0 1px 3px rgba(16,24,40,.05)', flex: 1 };
const fieldBoxInner = { padding: '10px' };
const miniActionBtn = { background: 'transparent', border: 'none', padding: '12px 15px', color: '#374151', cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' };
