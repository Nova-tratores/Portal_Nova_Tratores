'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { exigeComprovantePago, temComprovantePago } from '@/lib/financeiro/constants'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useAuditLog } from '@/hooks/useAuditLog'
import { notificarAdminsClient } from '@/hooks/useNotificarAdmins'
import { marcarMinhaAcao } from '@/components/financeiro/NotificationSystem'
import { formatarDataBR, formatarMoeda, getRequisicoes } from '@/lib/financeiro/utils'
import Link from 'next/link'
import {
  X, Send, ArrowLeft, RefreshCw, MessageSquare, PlusCircle, CheckCircle,
  FileText, Download, Eye, Calendar, CreditCard, User as UserIcon, Tag, Search, DollarSign, Upload, Barcode, Trash2, Paperclip, AlertCircle, Clock, Wallet
} from 'lucide-react'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import ConfirmarFaseModal from '@/components/ConfirmarFaseModal'
import { EnviarParaOmieBox } from '@/components/financeiro/OmieContaPagar'
import PreferenciaEnvioBoleto from '@/components/financeiro/PreferenciaEnvioBoleto'
import EmailsDoCard from '@/components/financeiro/EmailsDoCard'
import PrefEnvioBadge from '@/components/financeiro/PrefEnvioBadge'
import { montarMapasPref, acharMetodo } from '@/lib/financeiro/prefEnvio'
import { authHeaders } from '@/lib/auth/client'
import { labelSetor, ehDoSetor } from '@/lib/financeiro/setor'

const FORMAS_BOLETO = ['Pix', 'Dinheiro', 'Boleto 30 dias', 'Boleto Parcelado', 'Cartão a vista', 'Cartão Parcelado', 'Cheque'];

// Pós-Vendas vê SÓ os cards de Oficina (serviço). Os de Peças ficam no painel de Peças.
const SETOR_PAINEL = 'oficina';

const setorBadgeStyle = { position: 'absolute', top: '10px', right: '10px', zIndex: 2, fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', padding: '3px 9px', borderRadius: '8px', background: '#A6FF3B', color: '#123300', border: '1px solid #8BE62A', boxShadow: '0 0 8px rgba(166,255,59,0.5)' };
const METODOS_PAGAR = ['Boleto', 'Boleto Parcelado', 'Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro', 'Transferência', 'Carnê ISS'];

function AttachmentTag({ label, fileUrl, onUpload, disabled = false }) {
    const fileInputRef = useRef(null);
    return (
        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: '16px', minWidth: '280px', overflow: 'hidden', transition: '0.2s' }}>
            <div style={{ padding: '0 18px', color: 'var(--portal-text-secondary)', background: 'var(--portal-bg-secondary)', alignSelf: 'stretch', display: 'flex', alignItems: 'center', borderRight: '1px solid var(--portal-border)' }}>
                <FileText size={18} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '12px 15px' }}>
                <span style={{ fontSize: '13px', color: 'var(--portal-text)', fontWeight: '600', letterSpacing: '0.5px' }}>{label}</span>
                <span style={{ fontSize: '11px', color: fileUrl ? '#10b981' : '#f87171', fontWeight: '600' }}>{fileUrl ? 'ARQUIVO PRONTO' : 'PENDENTE'}</span>
            </div>
            <div style={{ display: 'flex', borderLeft: '1px solid var(--portal-border)' }}>
                {fileUrl && (
                    <button title="Ver" onClick={() => window.open(fileUrl, '_blank')} style={miniActionBtn}><Eye size={18} color="var(--portal-text-secondary)" /></button>
                )}
                {!disabled && (
                    <>
                        <button title="Upload" onClick={() => fileInputRef.current.click()} style={miniActionBtn}><RefreshCw size={18} color="var(--portal-text-secondary)" /></button>
                        <input type="file" ref={fileInputRef} hidden onChange={(e) => onUpload(e.target.files[0])} />
                    </>
                )}
            </div>
        </div>
    );
}

export default function HomePosVendas() {
  return (
    <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: 'var(--portal-text-secondary)', fontFamily: 'Inter, sans-serif' }}>Carregando...</div>}>
      <HomePosVendasContent />
    </Suspense>
  )
}

function HomePosVendasContent() {
  const { userProfile } = useAuth()
  const { isAdmin } = usePermissoes(userProfile?.id)
  const podeEditar = isAdmin // só admin do Pós-Vendas edita nome/condição/valor/data
  const { log: auditLog } = useAuditLog()
  const [tarefaSelecionada, setTarefaSelecionada] = useState(null);
  const [confirmSemBoleto, setConfirmSemBoleto] = useState(null); // card aguardando confirmação p/ "Cliente sem boleto"
  const [prefsEnvio, setPrefsEnvio] = useState({}); // mapa cnpj(dígitos) → método de envio do cliente
  const [cardLogs, setCardLogs] = useState([]);   // histórico (audit_log) do card aberto
  const [listaBoletos, setListaBoletos] = useState([]);
  const [listaSemBoleto, setListaSemBoleto] = useState([]);
  const [listaPagar, setListaPagar] = useState([]);
  const [listaRH, setListaRH] = useState([]);
  const [showNovoMenu, setShowNovoMenu] = useState(false);
  const [sincOS, setSincOS] = useState(false);
  const sincronizarOS = async () => {
    if (sincOS) return;
    setSincOS(true);
    try {
      const r = await fetch('/api/financeiro/sync-os', { method: 'POST' });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(out.error || 'Falha na sincronização');
      const det = Object.entries(out.por_empresa || {})
        .map(([emp, v]) => `${emp}:\n  faturadas ${v.faturadas ?? '-'} | no período ${v.no_periodo ?? '-'}\n  com NFS-e ${v.com_nfse ?? '-'} | aguardando NFS-e ${v.aguardando_nfse ?? '-'}\n  candidatas ${v.candidatas ?? '-'} | aguardando peça ${v.aguardandoPV ?? '-'}`)
        .join('\n');
      alert(`Sincronização de OS (Omie):\n\nNovos cards criados: ${out.criados}\nJá existiam: ${out.jaExistiam}\nOS candidatas: ${out.candidatas}\n\nPor empresa:\n${det}`);
      carregarDados();
    } catch (e) { alert('Erro ao sincronizar: ' + e.message); }
    finally { setSincOS(false); }
  };
  const router = useRouter();
  const searchParams = useSearchParams();

  // --- CARREGAMENTO UNIFICADO: FIM DOS CARDS FILHOS E FILTRO DE PIX ---
  const carregarDados = async () => {
    try {
      const { data: bolds } = await supabase.from('Chamado_NF').select('*').neq('status', 'concluido').order('id', {ascending: false});

      // Preferência de envio do cliente (via servidor — a EnvioBoleto tem RLS no navegador)
      try {
        const rp = await fetch('/api/financeiro/prefs-envio', { headers: { ...(await authHeaders()) } });
        const jp = await rp.json();
        setPrefsEnvio(montarMapasPref(jp.prefs || []));
      } catch {}

      // FILTRO: Remove PIX e foca em "Enviar para cliente" ou "Cobranca"
      const tarefasFaturamento = (bolds || [])
        .filter(t => ehDoSetor(t, SETOR_PAINEL))
        .filter(t => !t.forma_pagamento?.toLowerCase().includes('pix'))
        .filter(t => t.status === 'enviar_cliente' || (t.status === 'vencido' && t.tarefa?.includes('Cobrar')))
        .map(t => {
          const temComprovante = t.comprovante_pagamento || t.comprovante_pagamento_p1 || t.comprovante_pagamento_p2 || t.comprovante_pagamento_p3 || t.comprovante_pagamento_p4 || t.comprovante_pagamento_p5;
          return {
            ...t,
            valor_exibicao: t.valor_servico,
            isPagamentoRealizado: !!temComprovante,
            gTipo: 'boleto'
          };
        });

      setListaBoletos(tarefasFaturamento);

      // Clientes sem boleto (status = 'sem_boleto')
      const semBoleto = (bolds || [])
        .filter(t => ehDoSetor(t, SETOR_PAINEL))
        .filter(t => t.status === 'sem_boleto')
        .map(t => ({
          ...t,
          valor_exibicao: t.valor_servico,
          gTipo: 'boleto'
        }));
      setListaSemBoleto(semBoleto);

      // Inclui também 'aguardando_omie' — fase intermediária entre 'financeiro'
      // e 'concluido' criada pra evitar que conta a pagar seja dada como
      // concluída sem ter sido efetivamente lançada no Omie. Pós-Vendas é
      // quem precisa enviar pro Omie depois que o financeiro encerra o ciclo.
      const { data: pag } = await supabase
        .from('finan_pagar')
        .select('*')
        .in('status', ['financeiro', 'aguardando_omie'])
        .order('id', { ascending: false });
      const { data: rh } = await supabase.from('finan_rh').select('*').neq('status', 'concluido');

      setListaPagar((pag || []).map(p => ({ ...p, gTipo: 'pagar' })));
      setListaRH((rh || []).map(rhItem => ({ ...rhItem, gTipo: 'rh' })));

    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    const channel = supabase
      .channel('home_pv_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Chamado_NF' }, () => carregarDados())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finan_pagar' }, () => carregarDados())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finan_rh' }, () => carregarDados())
      .subscribe();
    return () => { supabase.removeChannel(channel) };
  }, []);

  useEffect(() => {
    carregarDados();
  }, []);

  const getCardLabel = (t) => {
    if (t.gTipo === 'pagar') return `Pagar #${t.id} - ${t.fornecedor || ''}`;
    if (t.gTipo === 'receber') return `Receber #${t.id} - ${t.cliente || ''}`;
    if (t.gTipo === 'rh') return `RH #${t.id} - ${t.funcionario || ''}`;
    return `NF #${t.id} - ${t.nom_cliente || t.tarefa || ''}`;
  };

  const notificarMovimento = (tabela, t, novoStatus, descExtra) => {
    const label = getCardLabel(t);
    const statusLabels = { gerar_boleto: 'Gerar Boleto', enviar_cliente: 'Enviar ao Cliente', aguardando_vencimento: 'Aguardando Cliente', pago: 'Pago', vencido: 'Vencido', concluido: 'Concluído', financeiro: 'Financeiro' };
    const titulo = `Card movimentado → ${statusLabels[novoStatus] || novoStatus}`;
    const descricao = descExtra || label;
    const tipo = t.gTipo || 'boleto';
    marcarMinhaAcao(tabela, t.id, {
      titulo, descricao,
      link: `/financeiro/home-financeiro?id=${t.id}&tipo=${tipo}`,
      userId: userProfile?.id,
      alvo: 'financeiro',
    });
  };
  const getCardTable = (t) => t.gTipo === 'pagar' ? 'finan_pagar' : t.gTipo === 'receber' ? 'finan_receber' : t.gTipo === 'rh' ? 'finan_rh' : 'Chamado_NF';

  // Excluir card — somente admin
  const excluirCard = async (t) => {
    if (!isAdmin || !t) return;
    if (!window.confirm(`Excluir definitivamente "${getCardLabel(t)}"? Esta ação não pode ser desfeita.`)) return;
    const table = getCardTable(t);
    const { error } = await supabase.from(table).delete().eq('id', t.id);
    if (error) { alert('Erro ao excluir: ' + error.message); return; }
    auditLog({ sistema: 'financeiro', acao: 'excluir', entidade: table, entidade_id: String(t.id), entidade_label: getCardLabel(t) });
    notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} excluiu ${getCardLabel(t)}`, null, `/financeiro/home-posvendas`)
    setTarefaSelecionada(null);
    carregarDados();
  };

  // Histórico (audit_log) do card aberto — o que cada usuário fez NELE
  const carregarCardLogs = async (t) => {
    if (!t) { setCardLogs([]); return; }
    const { data: logs } = await supabase.from('audit_log')
      .select('created_at, acao, user_id, user_nome, detalhes')
      .eq('entidade', getCardTable(t)).eq('entidade_id', String(t.id))
      .order('created_at', { ascending: false }).limit(40);
    const ids = [...new Set((logs || []).map(l => l.user_id).filter(Boolean))];
    let nomes = {};
    if (ids.length) {
      const { data: us } = await supabase.from('financeiro_usu').select('id, nome').in('id', ids);
      nomes = Object.fromEntries((us || []).map(u => [u.id, u.nome]));
    }
    setCardLogs((logs || []).map(l => ({ ...l, nome: l.user_nome || nomes[l.user_id] || 'Usuário' })));
  };
  useEffect(() => { carregarCardLogs(tarefaSelecionada); }, [tarefaSelecionada?.id]);

  const handleUpdateField = async (t, field, value) => {
    // só age se houve MUDANÇA real (evita registrar/notificar ao só clicar e sair do campo)
    if (String(t[field] ?? '') === String(value ?? '')) return;
    const table = getCardTable(t);
    await supabase.from(table).update({ [field]: value }).eq('id', t.id);
    await auditLog({ sistema: 'financeiro', acao: 'editar', entidade: table, entidade_id: String(t.id), entidade_label: getCardLabel(t), detalhes: { campo: field, valor: value } });
    carregarCardLogs(t);
    notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} alterou ${getCardLabel(t)}`, `Campo: ${field}`, `/financeiro/home-posvendas`)
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

      await supabase.from(table).update({ [field]: linkData.publicUrl }).eq('id', t.id);
      auditLog({ sistema: 'financeiro', acao: 'upload', entidade: table, entidade_id: String(t.id), entidade_label: getCardLabel(t), detalhes: { campo: field, arquivo: file.name } });
      notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} enviou arquivo em ${getCardLabel(t)}`, `Campo: ${field}`, `/financeiro/home-posvendas`)
      alert("Arquivo atualizado!");
      carregarDados();
      if(tarefaSelecionada) setTarefaSelecionada(prev => ({ ...prev, [field]: linkData.publicUrl }));
    } catch (err) { alert("Erro ao enviar: " + err.message); }
  };

  const handleConcluirRecobranca = async (t) => {
    notificarMovimento('Chamado_NF', t, 'vencido', `${getCardLabel(t)} — Recobrança concluída`);
    await supabase.from('Chamado_NF').update({ status: 'vencido', tarefa: 'Cliente Recobrado (Aguardando Financeiro)' }).eq('id', t.id);
    auditLog({ sistema: 'financeiro', acao: 'mover_status', entidade: 'Chamado_NF', entidade_id: String(t.id), entidade_label: getCardLabel(t), detalhes: { de: t.status, para: 'vencido', acao_desc: 'Recobrança concluída - aguardando Financeiro' } });
    notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} concluiu recobrança — ${getCardLabel(t)}`, null, `/financeiro/home-posvendas`)
    alert(`Cobranca registrada!`); setTarefaSelecionada(null); carregarDados();
  };

  const handleConfirmarEnvioBoleto = async (t) => {
    notificarMovimento('Chamado_NF', t, 'aguardando_vencimento', `${getCardLabel(t)} — Boleto enviado ao cliente`);
    await supabase.from('Chamado_NF').update({ status: 'aguardando_vencimento', tarefa: 'Aguardando Cliente' }).eq('id', t.id);
    auditLog({ sistema: 'financeiro', acao: 'mover_status', entidade: 'Chamado_NF', entidade_id: String(t.id), entidade_label: getCardLabel(t), detalhes: { de: t.status, para: 'aguardando_vencimento', acao_desc: 'Boleto enviado ao cliente' } });
    notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} enviou boleto ao cliente — ${getCardLabel(t)}`, null, `/financeiro/home-posvendas`)
    alert("Boleto enviado!"); setTarefaSelecionada(null); carregarDados();
  };

  const handleMoverSemBoleto = async (t) => {
    notificarMovimento('Chamado_NF', t, 'sem_boleto', `${getCardLabel(t)} — Movido para Cliente Sem Boleto`);
    await supabase.from('Chamado_NF').update({ status: 'sem_boleto', tarefa: 'Cliente Sem Boleto' }).eq('id', t.id);
    auditLog({ sistema: 'financeiro', acao: 'mover_status', entidade: 'Chamado_NF', entidade_id: String(t.id), entidade_label: getCardLabel(t), detalhes: { de: t.status, para: 'sem_boleto', acao_desc: 'Movido para Cliente Sem Boleto' } });
    notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} moveu ${getCardLabel(t)} para Sem Boleto`, null, `/financeiro/home-posvendas`)
    carregarDados();
  };

  const handleMoverParaPago = async (t) => {
    if (exigeComprovantePago(t.forma_pagamento) && !temComprovantePago(t)) {
      alert('Este método de pagamento exige o comprovante anexado para mover para Pago.');
      return;
    }
    notificarMovimento('Chamado_NF', t, 'pago', `${getCardLabel(t)} — Pagamento confirmado`);
    await supabase.from('Chamado_NF').update({ status: 'pago', tarefa: 'Pagamento Confirmado' }).eq('id', t.id);
    auditLog({ sistema: 'financeiro', acao: 'mover_status', entidade: 'Chamado_NF', entidade_id: String(t.id), entidade_label: getCardLabel(t), detalhes: { de: t.status, para: 'pago', acao_desc: 'Pagamento confirmado' } });
    notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} confirmou pagamento — ${getCardLabel(t)}`, null, `/financeiro/home-posvendas`)
    alert("Confirmado!"); setTarefaSelecionada(null); carregarDados();
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

  useEffect(() => {
    const id = searchParams.get('id');
    const tipo = searchParams.get('tipo');
    if (!id || !tipo) return;
    const listas = { boleto: listaBoletos, pagar: listaPagar, rh: listaRH };
    const card = (listas[tipo] || []).find(t => String(t.id) === id);
    if (card) setTarefaSelecionada(card);
  }, [searchParams, listaBoletos, listaPagar, listaRH]);

  // --- LOGICAS CONDICIONAIS DE INTERFACE DO MODAL ---
  const isBoleto30 = tarefaSelecionada?.forma_pagamento === 'Boleto 30 dias';
  const isParcelamento = tarefaSelecionada?.forma_pagamento?.toLowerCase().includes('parcelado');
  const isPixOuCartaoVista = tarefaSelecionada && ['Pix', 'Cartão a vista'].includes(tarefaSelecionada.forma_pagamento);
  const valorIndividual = tarefaSelecionada ? (tarefaSelecionada.valor_servico / (tarefaSelecionada.qtd_parcelas || 1)) : 0;

  return (
    <div style={{ fontFamily: 'Inter, sans-serif' }}>
      <FinanceiroNav>
        <button onClick={sincronizarOS} disabled={sincOS} title="Buscar ordens de serviço faturadas (com NF) no Omie e gerar os chamados" style={{
          background: '#A6FF3B', color: '#123300', boxShadow: '0 0 12px rgba(166,255,59,0.55)',
          border: '1px solid #8BE62A', padding: '8px 14px', borderRadius: '8px', fontWeight: '700',
          cursor: sincOS ? 'default' : 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', marginRight: '8px', transition: '0.2s',
        }}>
          <RefreshCw size={14} /> {sincOS ? 'SINCRONIZANDO…' : 'SINCRONIZAR OMIE'}
        </button>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowNovoMenu(s => !s)} style={{
            background: '#A6FF3B', color:'#123300',
            border:'none', padding:'8px 16px', borderRadius:'8px', fontWeight:'700',
            cursor:'pointer', fontSize:'12px', display: 'flex', alignItems: 'center', gap: '6px',
            boxShadow: '0 0 12px rgba(166,255,59,0.55)', transition: '0.2s',
          }}>
            <PlusCircle size={15}/> NOVO
          </button>
          {showNovoMenu && (
            <>
              <div onClick={() => setShowNovoMenu(false)} style={{ position:'fixed', inset:0, zIndex:1999 }} />
              <div style={{
                position:'absolute', top:'calc(100% + 6px)', right: 0, background:'var(--portal-bg-card)', zIndex:2000,
                width:'220px', borderRadius: '12px', border:'1px solid var(--portal-border)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
              }}>
                {[
                  { label: 'Chamado NF', desc: 'Nota fiscal', href: '/financeiro/novo-chamado-nf' },
                  { label: 'Chamado Pagar', desc: 'Conta a pagar', href: '/financeiro/novo-pagar-receber?tipo=pagar' },
                  { label: 'Chamado RH', desc: 'Solicitacao RH', href: '/financeiro/novo-chamado-rh' },
                ].map((item, i, arr) => (
                  <div key={item.href} style={{
                    padding:'10px 16px', cursor:'pointer', borderBottom: i < arr.length - 1 ? '1px solid var(--portal-border)' : 'none',
                    transition: '0.15s',
                  }}
                    onClick={() => { setShowNovoMenu(false); router.push(item.href) }}
                    onMouseEnter={e => e.currentTarget.style.background='#fef2f2'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                    <div style={{ fontSize:'13px', color:'var(--portal-text)', fontWeight:'600' }}>{item.label}</div>
                    <div style={{ fontSize:'11px', color:'var(--portal-text-muted)' }}>{item.desc}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </FinanceiroNav>

      <div style={{ padding: 'clamp(12px, 4vw, 24px) clamp(12px, 4vw, 32px)' }}>

      {/* Alerta global: contas em 'aguardando_omie' há mais de 30 dias */}
      {(() => {
        const HOJE = Date.now()
        const vencidos = listaPagar.filter(t => {
          if (t.status !== 'aguardando_omie') return false
          const ref = t.aguardando_omie_desde || t.criado_em
          if (!ref) return false
          const dias = (HOJE - new Date(ref).getTime()) / 86400000
          return dias >= 30
        })
        if (vencidos.length === 0) return null
        return (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5', color: '#7f1d1d',
            borderLeft: '4px solid #dc2626', borderRadius: '12px',
            padding: '14px 18px', marginBottom: '20px',
            display: 'flex', alignItems: 'flex-start', gap: '10px',
          }}>
            <AlertCircle size={18} style={{ marginTop: 2, flexShrink: 0, color: '#dc2626' }} />
            <div style={{ fontSize: '13px', lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                {vencidos.length} conta(s) aguardando envio pro Omie há mais de 30 dias.
              </div>
              <div style={{ fontSize: '12px', color: '#991b1b' }}>
                Verifique se existe um boleto pra enviar pro financeiro sobre {vencidos.length === 1 ? 'esse fornecedor' : 'esses fornecedores'}:{' '}
                <strong>{vencidos.map(v => v.fornecedor?.trim() || `Pagar #${v.id}`).join(', ')}</strong>.
              </div>
            </div>
          </div>
        )
      })()}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px' }}>
          {/* COLUNA FATURAMENTO (FILTRADA: SEM PIX, APENAS ENVIAR OU COBRAR) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0', borderRight: '1px solid var(--portal-border)', paddingRight: '20px' }}>
              <div style={{ ...colHeaderStyle, background: '#c5e29f', color: '#111111', border: 'none', marginBottom: '14px' }}>TAREFA FATURAMENTO<span style={{ marginLeft: '10px', background: 'rgba(255,255,255,.75)', borderRadius: '999px', padding: '2px 10px', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>{listaBoletos.length}</span></div>
              {listaBoletos.map(t => (
                <div key={`boleto-${t.id}`} className="task-card" style={{ borderRadius: '12px', border: '1px solid rgba(0,0,0,0.5)', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderBottom: '1px dashed var(--portal-border)' }}>
                    <span style={{ width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0, background: t.tarefa?.includes('Cobrar') ? '#dc2626' : '#8bc53f' }} />
                    <span style={{ flex: 1, fontSize: '10px', fontWeight: '500', letterSpacing: '0.9px', textTransform: 'uppercase', color: t.tarefa?.includes('Cobrar') ? '#dc2626' : 'var(--portal-text-secondary)' }}>{t.tarefa}</span>
                    <span style={{ ...setorBadgeStyle, position: 'static' }}>{labelSetor(t)}</span>
                    <span style={{ fontSize: '10.5px', color: '#9ca3af', fontWeight: '500', fontVariantNumeric: 'tabular-nums' }}>#{t.id}</span>
                  </div>
                  <div onClick={() => setTarefaSelecionada(t)} style={{ padding: '11px 14px 13px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <h4 style={{ margin: 0, flex: 1, fontSize: '16px', fontWeight: '500', lineHeight: 1.3, color: 'var(--portal-text)' }}>{t.nom_cliente?.toUpperCase()}</h4>
                      <button
                        title="Mover para Cliente sem boleto"
                        onClick={(e) => { e.stopPropagation(); setConfirmSemBoleto(t); }}
                        style={{ background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: '8px', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--portal-text-secondary)', fontSize: '14px', fontWeight: '700', transition: '0.2s', flexShrink: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fca5a5'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--portal-bg-secondary)'; e.currentTarget.style.color = 'var(--portal-text-secondary)'; e.currentTarget.style.borderColor = 'var(--portal-border)'; }}
                      ><Wallet size={20} /></button>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', margin: '10px 0 2px' }}>
                      <tbody>
                        <tr><td style={fichaTdLab}>Envio</td><td style={fichaTdVal}><PrefEnvioBadge metodo={acharMetodo(t, prefsEnvio)} /></td></tr>
                        <tr><td style={fichaTdLab}>Forma</td><td style={fichaTdVal}>{t.forma_pagamento?.toUpperCase() || '—'}</td></tr>
                        <tr><td style={fichaTdLab}>Venc</td><td style={fichaTdVal}>{formatarDataBR(t.vencimento_boleto)}</td></tr>
                        {(t.num_nf_servico || t.num_nf_peca) && (
                          <tr><td style={fichaTdLab}>NF</td><td style={fichaTdVal}>{[t.num_nf_servico && `S ${t.num_nf_servico}`, t.num_nf_peca && `P ${t.num_nf_peca}`].filter(Boolean).join(' / ')}</td></tr>
                        )}
                      </tbody>
                    </table>
                    {t.isPagamentoRealizado && <div style={{marginTop: '10px', color: '#10b981', fontSize: '11px', fontWeight: '600'}}>&#10003; PAGAMENTO REALIZADO</div>}
                    <div style={{ marginTop: '10px', fontSize: '24px', fontWeight: '500', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums', color: t.tarefa?.includes('Cobrar') ? '#dc2626' : '#16a34a' }}>{formatarMoeda(t.valor_exibicao)}</div>
                  </div>
                </div>
              ))}
          </div>

          {/* COLUNA REQUISICOES / A PAGAR */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0', borderRight: '1px solid var(--portal-border)', paddingRight: '20px' }}>
              <div style={{ ...colHeaderStyle, background: '#c5e29f', color: '#111111', border: 'none', marginBottom: '14px' }}>REQUISICOES<span style={{ marginLeft: '10px', background: 'rgba(255,255,255,.75)', borderRadius: '999px', padding: '2px 10px', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>{listaPagar.length}</span></div>
              {listaPagar.map((t) => {
                const aguardando = t.status === 'aguardando_omie'
                const refData = t.aguardando_omie_desde || t.criado_em
                const diasParado = aguardando && refData
                  ? Math.floor((Date.now() - new Date(refData).getTime()) / 86400000)
                  : 0
                const vencido = aguardando && diasParado >= 30
                return (
                <div
                  key={`pag-${t.id}`}
                  onClick={() => setTarefaSelecionada(t)}
                  className="task-card"
                  style={aguardando ? { border: `2px solid ${vencido ? '#dc2626' : '#f59e0b'}`, borderRadius: '12px', marginBottom: '10px' } : { borderRadius: '12px', border: '1px solid rgba(0,0,0,0.5)', marginBottom: '8px' }}
                >
                  {aguardando && (
                    <div style={{
                      background: vencido ? '#fef2f2' : '#fef3c7',
                      color: vencido ? '#111111' : '#92400e',
                      borderBottom: `1px solid ${vencido ? '#fca5a5' : '#fcd34d'}`,
                      padding: '6px 12px', fontSize: '11px', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px',
                      letterSpacing: '0.4px', textTransform: 'uppercase',
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        {vencido ? <AlertCircle size={12} /> : <Send size={12} />}
                        Aguardando envio Omie
                      </span>
                      <span>{diasParado}d parado</span>
                    </div>
                  )}
                  <div style={{ background: 'var(--portal-bg-card)', padding: '16px 14px', borderBottom: '1px dashed var(--portal-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{fontSize: '10px', color: 'var(--portal-text-secondary)', letterSpacing:'1px', marginBottom: '8px', textTransform:'uppercase'}}>{t.metodo || 'Despesa'}</div>
                      <span style={{fontSize:'18px', color:'var(--portal-text)', display:'block', lineHeight: '1.2'}}>{t.fornecedor?.toUpperCase()}</span>
                      {(getRequisicoes(t).filter(r => r.numero).length > 0 || t.anexo_requisicao) && (
                        <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          {t.anexo_requisicao && t.anexo_requisicao.split(',').filter(u => u.trim()).map((_, i) => (
                            <span key={`old-${i}`} style={{ background: '#fef3c7', color: '#92400e', fontSize: '10px', fontWeight: '600', padding: '4px 8px', border: '1px solid #fcd34d', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><Paperclip size={10}/> Req {i + 1}</span>
                          ))}
                          {getRequisicoes(t).filter(r => r.numero).map((req, i) => (
                            <span key={i} style={{ background: '#fef2f2', color: '#dc2626', fontSize: '10px', fontWeight: '600', padding: '4px 8px', border: '1px solid #fca5a5', borderRadius: '4px' }}>#{req.numero}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div
                      title={t.omie_cod_lancamento ? `Lançado no Omie nº ${t.omie_cod_lancamento}` : 'Clique no card para validar e enviar ao Omie'}
                      style={{
                        flexShrink: 0,
                        display: 'flex', alignItems: 'center', gap: '5px',
                        background: t.omie_cod_lancamento ? '#dcfce7' : '#eff6ff',
                        border: `1px solid ${t.omie_cod_lancamento ? '#86efac' : '#bfdbfe'}`,
                        color: t.omie_cod_lancamento ? '#15803d' : '#2563eb',
                        fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px',
                        padding: '6px 10px', borderRadius: '8px', whiteSpace: 'nowrap',
                      }}
                    >
                      {t.omie_cod_lancamento ? <CheckCircle size={11} /> : <Send size={11} />}
                      OMIE
                    </div>
                  </div>
                  <div style={{ padding: '25px', background: 'var(--portal-bg-secondary)' }}>
                    <div style={{display:'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom:'15px'}}>
                      <div style={cardMetaStyle}><CreditCard size={13}/> {t.metodo?.toUpperCase() || 'DESPESA'}</div>
                      <div style={cardMetaStyle}><Calendar size={13}/> {formatarDataBR(t.data_vencimento)}</div>
                    </div>
                    {t.metodo === 'Carnê ISS' && (
                      <div style={{ marginBottom: '10px', display: 'inline-block', background: '#fef3c7', color: '#92400e', fontSize: '11px', fontWeight: '700', padding: '4px 10px', borderRadius: '6px', border: '1px solid #fcd34d', letterSpacing: '0.5px' }}>CARNÊ ISS</div>
                    )}
                    <div style={{fontSize:'26px', color: 'var(--portal-text)'}}>{formatarMoeda(t.valor)}</div>
                  </div>
                </div>
                )
              })}
          </div>

          {/* COLUNA CLIENTE SEM BOLETO */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0', borderRight: '1px solid var(--portal-border)', paddingRight: '20px' }}>
              <div style={{ ...colHeaderStyle, background: '#fde68a', color: '#111111', border: 'none', marginBottom: '14px' }}>CLIENTE SEM BOLETO<span style={{ marginLeft: '10px', background: 'rgba(255,255,255,.75)', borderRadius: '999px', padding: '2px 10px', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>{listaSemBoleto.length}</span></div>
              {listaSemBoleto.map(t => (
                <div key={`sb-${t.id}`} onClick={() => setTarefaSelecionada(t)} className="task-card" style={{ cursor: 'pointer', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.5)', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderBottom: '1px dashed var(--portal-border)' }}>
                    <span style={{ width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0, background: '#f59e0b' }} />
                    <span style={{ flex: 1, fontSize: '10px', fontWeight: '500', letterSpacing: '0.9px', textTransform: 'uppercase', color: '#b45309' }}>Cliente sem boleto</span>
                    <span style={{ ...setorBadgeStyle, position: 'static' }}>{labelSetor(t)}</span>
                    <span style={{ fontSize: '10.5px', color: '#9ca3af', fontWeight: '500', fontVariantNumeric: 'tabular-nums' }}>#{t.id}</span>
                  </div>
                  <div style={{ padding: '11px 14px 13px' }}>
                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '500', lineHeight: 1.3, color: 'var(--portal-text)' }}>{t.nom_cliente?.toUpperCase()}</h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse', margin: '10px 0 2px' }}>
                      <tbody>
                        <tr><td style={fichaTdLab}>Forma</td><td style={fichaTdVal}>{t.forma_pagamento?.toUpperCase() || 'SEM BOLETO'}</td></tr>
                        <tr><td style={fichaTdLab}>Venc</td><td style={fichaTdVal}>{formatarDataBR(t.vencimento_boleto)}</td></tr>
                        {(t.num_nf_servico || t.num_nf_peca) && (
                          <tr><td style={fichaTdLab}>NF</td><td style={fichaTdVal}>{[t.num_nf_servico && `S ${t.num_nf_servico}`, t.num_nf_peca && `P ${t.num_nf_peca}`].filter(Boolean).join(' / ')}</td></tr>
                        )}
                      </tbody>
                    </table>
                    <div style={{ marginTop: '10px', fontSize: '22px', fontWeight: '500', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums', color: '#16a34a' }}>{formatarMoeda(t.valor_exibicao)}</div>
                  </div>
                </div>
              ))}
              {listaSemBoleto.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af', fontSize: '13px' }}>
                  Nenhum cliente sem boleto
                </div>
              )}
          </div>
      </div>

      {/* --- MODAL DETALHES --- */}
      {tarefaSelecionada && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setTarefaSelecionada(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(10px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--portal-bg-card)', width: '1100px', maxWidth: '95%', maxHeight: '95vh', borderRadius: '30px', display: 'flex', flexDirection: 'column', overflow:'hidden', boxShadow:'0 25px 60px rgba(0,0,0,0.15)', border: '1px solid var(--portal-border)', position: 'relative' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--portal-bg-card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--portal-border)' }}>
              <button onClick={() => setTarefaSelecionada(null)} style={btnBackStyle}><ArrowLeft size={18}/> VOLTAR AO PAINEL</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isAdmin && (
                  <button onClick={() => excluirCard(tarefaSelecionada)} style={{ background: '#dc2626', border: '1px solid #dc2626', borderRadius: '10px', cursor:'pointer', padding:'8px 12px', display: 'flex', alignItems: 'center', gap: '6px', color: '#fff', fontSize: '13px', fontWeight: '600', transition: '0.2s' }} title="Excluir card (somente admin)"><Trash2 size={16}/> Excluir</button>
                )}
                <button onClick={() => setTarefaSelecionada(null)} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', cursor:'pointer', padding:'8px 12px', display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', fontSize: '13px', fontWeight: '600', transition: '0.2s' }} title="Fechar"><X size={18}/> Fechar</button>
              </div>
            </div>
            <div style={{ flex: 1, padding: '30px 50px 50px', overflowY:'auto', color: 'var(--portal-text-secondary)', background: 'var(--portal-bg-card)' }}>

              <div style={{marginTop: '35px'}}>
                  {(() => {
                    const nomeField = tarefaSelecionada.gTipo === 'pagar' ? 'fornecedor' : 'nom_cliente';
                    const nomeAtual = tarefaSelecionada.nom_cliente || tarefaSelecionada.fornecedor || tarefaSelecionada.funcionario || tarefaSelecionada.cliente;
                    if (podeEditar && tarefaSelecionada.gTipo !== 'rh') {
                      return (
                        <input
                          style={{fontSize:'32px', fontWeight:'400', margin:0, letterSpacing:'-1px', color:'var(--portal-text)', lineHeight:'1.1', border:'none', borderBottom:'2px dashed var(--portal-border)', background:'transparent', width:'100%', outline:'none', padding:'2px 0'}}
                          defaultValue={nomeAtual || ''}
                          placeholder="Nome"
                          onBlur={e => handleUpdateField(tarefaSelecionada, nomeField, e.target.value)}
                          title="Editar nome (somente admin)"
                        />
                      );
                    }
                    return <h2 style={{fontSize:'32px', fontWeight:'400', margin:0, letterSpacing: '-1px', color:'var(--portal-text)', lineHeight: '1.1'}}>{nomeAtual}</h2>;
                  })()}

                  {/* INTEGRACAO OMIE — posicionada logo após o título pra ficar imediatamente visível */}
                  {tarefaSelecionada.gTipo === 'pagar' && (
                    <EnviarParaOmieBox
                      finanPagar={tarefaSelecionada}
                      onSynced={async (patch, data) => {
                        // Envio bem-sucedido: move automaticamente pra 'concluido'.
                        // (Antes ficava em 'aguardando_omie' até alguém arrastar.)
                        if (data?.ok && patch?.omie_cod_lancamento) {
                          await supabase
                            .from('finan_pagar')
                            .update({ status: 'concluido', aguardando_omie_desde: null })
                            .eq('id', tarefaSelecionada.id);
                          auditLog({
                            sistema: 'financeiro',
                            acao: 'mover_status',
                            entidade: 'finan_pagar',
                            entidade_id: String(tarefaSelecionada.id),
                            entidade_label: `Pagar #${tarefaSelecionada.id} - ${tarefaSelecionada.fornecedor || ''}`,
                            detalhes: { de: tarefaSelecionada.status, para: 'concluido', acao_desc: 'Conta enviada pro Omie e concluída automaticamente' },
                          });
                          setTarefaSelecionada(null);
                          alert('Conta enviada pro Omie e concluída!');
                        } else {
                          setTarefaSelecionada(prev => ({ ...prev, ...patch }));
                        }
                        carregarDados();
                      }}
                    />
                  )}

                  <div style={{display:'flex', gap:'30px', marginTop:'40px', marginBottom:'45px'}}>
                      <div style={fieldBoxModal}>
                        <label style={labelMStyle}>{tarefaSelecionada.gTipo === 'rh' ? 'MOTIVO' : 'CONDICAO/METODO'}</label>
                        {podeEditar && tarefaSelecionada.gTipo !== 'rh' ? (
                          <select
                            style={{ ...pModalStyle, border:'none', borderBottom:'2px dashed var(--portal-border)', background:'transparent', outline:'none', cursor:'pointer', width:'100%' }}
                            value={tarefaSelecionada.gTipo === 'pagar' ? (tarefaSelecionada.metodo || '') : (tarefaSelecionada.forma_pagamento || tarefaSelecionada.metodo || '')}
                            onChange={e => handleUpdateField(tarefaSelecionada, tarefaSelecionada.gTipo === 'pagar' ? 'metodo' : 'forma_pagamento', e.target.value)}
                            title="Editar condição/método (somente admin)"
                          >
                            <option value="">Selecione...</option>
                            {(tarefaSelecionada.gTipo === 'pagar' ? METODOS_PAGAR : FORMAS_BOLETO).map(op => <option key={op} value={op}>{op}</option>)}
                          </select>
                        ) : (
                          <p style={pModalStyle}>{tarefaSelecionada.gTipo === 'pagar' ? (tarefaSelecionada.metodo?.toUpperCase() || 'N/A') : (tarefaSelecionada.forma_pagamento?.toUpperCase() || tarefaSelecionada.metodo?.toUpperCase() || 'N/A')}</p>
                        )}
                      </div>
                      {tarefaSelecionada.gTipo !== 'rh' && (
                        <>
                          <div style={fieldBoxModal}>
                            <label style={labelMStyle}>VALOR DO REGISTRO</label>
                            <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                              <span style={{fontSize:'22px', color:'var(--portal-text-secondary)'}}>R$</span>
                              <input type="number" disabled={!podeEditar} style={{ ...inputStyleLight, border:'none', padding:0, fontSize:'34px', background:'transparent', cursor: podeEditar ? 'text' : 'not-allowed' }} defaultValue={tarefaSelecionada.valor_exibicao || tarefaSelecionada.valor} onBlur={e => handleUpdateField(tarefaSelecionada, tarefaSelecionada.gTipo === 'boleto' ? 'valor_servico' : 'valor', e.target.value)} />
                            </div>
                          </div>
                          <div style={fieldBoxModal}>
                            <label style={labelMStyle}>DATA DE VENCIMENTO</label>
                            <input type="date" disabled={!podeEditar} style={{ ...inputStyleLight, border:'none', padding:0, fontSize:'30px', background:'transparent', color:'#ef4444', cursor: podeEditar ? 'text' : 'not-allowed' }} defaultValue={tarefaSelecionada.vencimento_boleto || tarefaSelecionada.data_vencimento} onBlur={e => handleUpdateField(tarefaSelecionada, tarefaSelecionada.gTipo === 'boleto' ? 'vencimento_boleto' : 'data_vencimento', e.target.value)} />
                          </div>
                        </>
                      )}
                  </div>

                  {/* CAMPOS ESPECIFICOS PAGAR */}
                  {tarefaSelecionada.gTipo === 'pagar' && (
                    <div style={{ display:'flex', flexDirection:'column', gap:'24px', padding:'40px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'16px', marginBottom:'45px' }}>
                      {tarefaSelecionada.metodo !== 'Carnê ISS' && (
                      <div style={fieldBoxInner}>
                        <label style={labelMStyle}>NUMERO DA NOTA FISCAL</label>
                        <input style={inputStyleLight} placeholder="Ex: 000.000.000" defaultValue={tarefaSelecionada.numero_NF || ''} onBlur={e => handleUpdateField(tarefaSelecionada, 'numero_NF', e.target.value)} />
                      </div>
                      )}
                      <div style={fieldBoxInner}>
                        <label style={{...labelMStyle, display:'flex', alignItems:'center', gap:'8px', marginBottom:'14px'}}>DESCRIÇÃO / OBSERVAÇÕES</label>
                        <textarea style={{...inputStyleLight, minHeight:'60px', resize:'vertical', lineHeight:'1.7', fontSize:'15px', padding:'18px 20px', fontFamily:'Inter, sans-serif', overflow:'hidden', height:'auto'}} defaultValue={tarefaSelecionada.motivo} onBlur={e => handleUpdateField(tarefaSelecionada, 'motivo', e.target.value)} placeholder="Detalhes do pagamento, observações relevantes..." ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} />
                      </div>
                    </div>
                  )}

                  {/* REQUISICOES */}
                  {tarefaSelecionada.gTipo === 'pagar' && (
                    <div style={{ border:'1px solid var(--portal-border)', padding:'35px', background:'#fef2f2', marginBottom:'45px', borderRadius:'22px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
                        <label style={labelMStyle}>REQUISICOES</label>
                        <button onClick={() => handleAddRequisicao(tarefaSelecionada)} style={{ background:'var(--portal-bg-card)', color:'var(--portal-text-secondary)', border:'1px solid var(--portal-border)', padding:'8px 18px', borderRadius:'12px', cursor:'pointer', fontSize:'12px', fontWeight:'600', letterSpacing:'1px' }}>+ ADICIONAR</button>
                      </div>
                      {/* Anexos do formato antigo (anexo_requisicao) — criados pelo formulário */}
                      {tarefaSelecionada.anexo_requisicao && tarefaSelecionada.anexo_requisicao.split(',').filter(u => u.trim()).map((url, i) => (
                        <div key={`old-${i}`} style={{ display:'grid', gridTemplateColumns:'180px 1fr', gap:'20px', alignItems:'center', background:'var(--portal-bg-card)', padding:'18px', borderBottom:'1px solid var(--portal-border)', marginBottom:'4px', borderRadius:'14px' }}>
                          <div>
                            <label style={{ ...labelMStyle, fontSize:'11px', display:'block', marginBottom:'6px' }}>REQUISIÇÃO {i + 1}</label>
                          </div>
                          <AttachmentTag label={`ANEXO REQUISIÇÃO ${i + 1}`} fileUrl={url.trim()} disabled />
                        </div>
                      ))}
                      {/* Anexos do formato novo (requisicoes_json) */}
                      {getRequisicoes(tarefaSelecionada).map((req, i) => (
                        <div key={i} style={{ display:'grid', gridTemplateColumns:'180px 1fr auto', gap:'20px', alignItems:'center', background:'var(--portal-bg-card)', padding:'18px', borderBottom:'1px solid var(--portal-border)', marginBottom:'4px', borderRadius:'14px' }}>
                          <div>
                            <label style={{ ...labelMStyle, fontSize:'11px', display:'block', marginBottom:'6px' }}>N. REQUISICAO</label>
                            <input placeholder="Ex: 00123" defaultValue={req.numero} style={inputStyleLight} onBlur={e => {
                              const reqs = getRequisicoes(tarefaSelecionada);
                              reqs[i] = { ...reqs[i], numero: e.target.value };
                              handleUpdateField(tarefaSelecionada, 'requisicoes_json', JSON.stringify(reqs));
                            }} />
                          </div>
                          <AttachmentTag icon={<Paperclip size={18} />} label={`ANEXO REQ ${req.numero || (i + 1)}`} fileUrl={req.anexo_url} onUpload={f => handleRequisicaoAnexo(tarefaSelecionada, i, f)} />
                          <button onClick={() => handleRemoveRequisicao(tarefaSelecionada, i)} style={{ background:'transparent', border:'none', cursor:'pointer', color:'#dc2626', padding:'8px' }} title="Remover"><Trash2 size={18}/></button>
                        </div>
                      ))}
                      {!tarefaSelecionada.anexo_requisicao && getRequisicoes(tarefaSelecionada).length === 0 && (
                        <div style={{ color:'#9ca3af', fontSize:'13px', textAlign:'center', padding:'20px' }}>Nenhuma requisicao adicionada.</div>
                      )}
                    </div>
                  )}

                  {!isBoleto30 && isParcelamento && (
                      <div style={{ display:'flex', flexDirection:'column', gap:'20px', background:'#fef2f2', padding:'40px', border:'1px solid var(--portal-border)', marginBottom:'45px', borderRadius:'22px' }}>
                          <div style={{ display:'flex', gap:'40px', borderBottom:'1px solid var(--portal-border)', paddingBottom:'20px' }}>
                              <div><label style={labelMStyle}>QUANTIDADE</label><select style={{ ...inputStyleLight, width:'120px', padding:'10px' }} value={tarefaSelecionada.qtd_parcelas || 1} onChange={e => handleUpdateField(tarefaSelecionada, 'qtd_parcelas', e.target.value)}>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}x</option>)}</select></div>
                              <div><label style={labelMStyle}>VALOR PARCELA</label><p style={{fontSize:'22px', color:'var(--portal-text)'}}>{formatarMoeda(valorIndividual)}</p></div>
                          </div>
                          <div style={{ display:'flex', flexDirection:'column', gap:'15px' }}>
                              <div style={cascadeRowStyle}>
                                  <span style={cascadeLabelStyle}>1a PARCELA</span>
                                  <input type="date" disabled={!podeEditar} style={{ ...inputCascadeStyle, cursor: podeEditar ? 'text' : 'not-allowed' }} defaultValue={tarefaSelecionada.vencimento_boleto} onBlur={e => handleUpdateField(tarefaSelecionada, 'vencimento_boleto', e.target.value)} />
                                  <span style={cascadeValueStyle}>{formatarMoeda(valorIndividual)}</span>
                                  <AttachmentTag label="COMPROVANTE P1" fileUrl={tarefaSelecionada.comprovante_pagamento || tarefaSelecionada.comprovante_pagamento_p1} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'comprovante_pagamento_p1', f)} />
                              </div>
                              {Array.from({ length: (tarefaSelecionada.qtd_parcelas || 1) - 1 }).map((_, i) => {
                                  const pNum = i + 2;
                                  const rawDates = (tarefaSelecionada.datas_parcelas || "").split(/[\s,]+/).filter(d => d.includes('-'));
                                  if (rawDates.length > 0 && rawDates[0] === tarefaSelecionada.vencimento_boleto) rawDates.shift();
                                  return (
                                      <div key={pNum} style={cascadeRowStyle}>
                                          <span style={cascadeLabelStyle}>{pNum}a PARCELA</span>
                                          <input type="date" disabled={!podeEditar} style={{ ...inputCascadeStyle, cursor: podeEditar ? 'text' : 'not-allowed' }} defaultValue={rawDates[i] || ""} onBlur={e => { let arr = [...rawDates]; while (arr.length < (tarefaSelecionada.qtd_parcelas || 1) - 1) arr.push(''); arr[i] = e.target.value; handleUpdateField(tarefaSelecionada, 'datas_parcelas', arr.filter(d => d).join(', ')); }} />
                                          <span style={cascadeValueStyle}>{formatarMoeda(valorIndividual)}</span>
                                          <AttachmentTag label={`COMPROVANTE P${pNum}`} fileUrl={tarefaSelecionada[`comprovante_pagamento_p${pNum}`]} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, `comprovante_pagamento_p${pNum}`, f)} />
                                      </div>
                                  )
                              })}
                          </div>
                      </div>
                  )}

                  {tarefaSelecionada.gTipo === 'rh' && (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:'30px', border:'1px solid var(--portal-border)', padding:'45px', background:'#fef2f2', borderRadius:'22px' }}>
                        <div style={fieldBoxInner}><label style={labelMStyle}>TITULO</label><input style={inputStyleLight} defaultValue={tarefaSelecionada.titulo} onBlur={e => handleUpdateField(tarefaSelecionada, 'titulo', e.target.value)} /></div>
                        <div style={fieldBoxInner}><label style={labelMStyle}>SETOR</label><input style={{...inputStyleLight, color:'#0ea5e9'}} defaultValue={tarefaSelecionada.setor} onBlur={e => handleUpdateField(tarefaSelecionada, 'setor', e.target.value)} /></div>
                        <div style={{...fieldBoxInner, gridColumn:'span 2'}}><label style={labelMStyle}>DESCRICAO</label><textarea style={{...inputStyleLight, height:'100px', resize:'none'}} defaultValue={tarefaSelecionada.descricao} onBlur={e => handleUpdateField(tarefaSelecionada, 'descricao', e.target.value)} /></div>
                  </div>
                  )}

                  {tarefaSelecionada.gTipo === 'boleto' && (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:'30px', border:'1px solid var(--portal-border)', padding:'45px', background:'#fef2f2', borderRadius:'22px' }}>
                        {(tarefaSelecionada.num_nf_servico || !tarefaSelecionada.num_nf_peca) && (
                          <div style={fieldBoxInner}><label style={labelMStyle}>NF SERVICO</label><input style={inputStyleLight} defaultValue={tarefaSelecionada.num_nf_servico} onBlur={e => handleUpdateField(tarefaSelecionada, 'num_nf_servico', e.target.value)} /></div>
                        )}
                        {(tarefaSelecionada.num_nf_peca || !tarefaSelecionada.num_nf_servico) && (
                          <div style={fieldBoxInner}><label style={labelMStyle}>NF PECA</label><input style={inputStyleLight} defaultValue={tarefaSelecionada.num_nf_peca} onBlur={e => handleUpdateField(tarefaSelecionada, 'num_nf_peca', e.target.value)} /></div>
                        )}
                        {tarefaSelecionada.obs && (
                          <div style={{gridColumn:'span 2', ...fieldBoxInner}}>
                            <label style={labelMStyle}>OBSERVAÇÕES</label>
                            <textarea style={{...inputStyleLight, minHeight:'100px', resize:'vertical', lineHeight:'1.6', fontSize:'14px', padding:'14px'}} defaultValue={tarefaSelecionada.obs} onBlur={e => handleUpdateField(tarefaSelecionada, 'obs', e.target.value)} />
                          </div>
                        )}
                  </div>
                  )}

                  {/* === DOCUMENTOS - LAYOUT INTERATIVO === */}
                  <div style={{marginTop:'45px'}}>

                      {/* --- FATURAMENTO (BOLETO) --- */}
                      {tarefaSelecionada.gTipo === 'boleto' && (
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'25px' }}>
                          {/* COLUNA: NOTAS FISCAIS ENVIADAS */}
                          <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'22px', padding:'30px' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
                              <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:'#dcfce7', display:'flex', alignItems:'center', justifyContent:'center' }}><FileText size={18} color="#16a34a"/></div>
                              <div>
                                <div style={{ fontSize:'14px', color:'#16a34a', fontWeight:'600', letterSpacing:'1px', textTransform:'uppercase' }}>Notas Fiscais Enviadas</div>
                                <div style={{ fontSize:'11px', color:'var(--portal-text-secondary)' }}>Documentos que voce enviou</div>
                              </div>
                            </div>
                            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                              {(tarefaSelecionada.anexo_nf_servico || tarefaSelecionada.num_nf_servico || (!tarefaSelecionada.num_nf_peca && !tarefaSelecionada.anexo_nf_peca)) && (
                                <AttachmentTag label="NF SERVICO" fileUrl={tarefaSelecionada.anexo_nf_servico} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'anexo_nf_servico', f)} />
                              )}
                              {(tarefaSelecionada.anexo_nf_peca || (!tarefaSelecionada.num_nf_servico && !tarefaSelecionada.anexo_nf_servico)) && (
                                <AttachmentTag label="NF PECA" fileUrl={tarefaSelecionada.anexo_nf_peca} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'anexo_nf_peca', f)} />
                              )}
                              {((exigeComprovantePago(tarefaSelecionada.forma_pagamento) && !isParcelamento) || tarefaSelecionada.comprovante_pagamento) && (
                                <AttachmentTag label="COMPROVANTE PAGAMENTO" fileUrl={tarefaSelecionada.comprovante_pagamento} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'comprovante_pagamento', f)} />
                              )}
                            </div>
                          </div>

                          {/* COLUNA: BOLETO DEVOLVIDO PELO FINANCEIRO — não mostra para Pix/Cheque/Cartões (não geram boleto) nem sem_boleto */}
                          {!exigeComprovantePago(tarefaSelecionada.forma_pagamento) && tarefaSelecionada.status !== 'sem_boleto' && (
                          <div style={{ background: tarefaSelecionada.anexo_boleto ? '#eff6ff' : '#fef2f2', border: `1px solid ${tarefaSelecionada.anexo_boleto ? '#bfdbfe' : '#fecaca'}`, borderRadius:'22px', padding:'30px' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
                              <div style={{ width:'36px', height:'36px', borderRadius:'50%', background: tarefaSelecionada.anexo_boleto ? '#dbeafe' : '#fee2e2', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                {tarefaSelecionada.anexo_boleto ? <CheckCircle size={18} color="#3b82f6"/> : <Calendar size={18} color="#dc2626"/>}
                              </div>
                              <div>
                                <div style={{ fontSize:'14px', color: tarefaSelecionada.anexo_boleto ? '#3b82f6' : '#dc2626', fontWeight:'600', letterSpacing:'1px', textTransform:'uppercase' }}>Boleto do Financeiro</div>
                                <div style={{ fontSize:'11px', color:'var(--portal-text-secondary)' }}>{tarefaSelecionada.anexo_boleto ? 'Boleto recebido - pronto para enviar' : 'Aguardando financeiro gerar o boleto'}</div>
                              </div>
                            </div>
                            {tarefaSelecionada.anexo_boleto ? (
                              <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                                {(() => {
                                  const urls = [];
                                  if (tarefaSelecionada.anexo_boleto) tarefaSelecionada.anexo_boleto.split(',').forEach(u => { const t = u.trim(); if (t) urls.push(t); });
                                  if (tarefaSelecionada.anexo_boleto_2) { const t = tarefaSelecionada.anexo_boleto_2.trim(); if (t && !urls.includes(t)) urls.push(t); }
                                  if (tarefaSelecionada.anexo_boleto_3) { const t = tarefaSelecionada.anexo_boleto_3.trim(); if (t && !urls.includes(t)) urls.push(t); }
                                  return urls.map((url, i) => ({ label: `Boleto ${i + 1}`, url }));
                                })().map((boleto, i) => (
                                  <div key={i}
                                    onClick={() => window.open(boleto.url, '_blank')}
                                    style={{ display:'flex', alignItems:'center', gap:'15px', background:'var(--portal-bg-card)', border:'1px solid #bfdbfe', borderRadius:'16px', padding:'18px', cursor:'pointer', transition:'0.2s' }}
                                  >
                                    <div style={{ width:'44px', height:'44px', borderRadius:'12px', background:'#dbeafe', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                      <Eye size={20} color="#3b82f6"/>
                                    </div>
                                    <div style={{ flex:1 }}>
                                      <div style={{ fontSize:'15px', color:'var(--portal-text)', fontWeight:'600' }}>{boleto.label}</div>
                                      <div style={{ fontSize:'11px', color:'var(--portal-text-secondary)' }}>Clique para abrir</div>
                                    </div>
                                    <Download size={18} color="#3b82f6"/>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'30px', background:'var(--portal-bg-card)', borderRadius:'16px', border:'2px dashed #fecaca' }}>
                                <div style={{ textAlign:'center' }}>
                                  <Calendar size={32} color="#fca5a5" style={{ marginBottom:'10px' }}/>
                                  <div style={{ fontSize:'14px', color:'#dc2626', fontWeight:'600' }}>Aguardando</div>
                                  <div style={{ fontSize:'12px', color:'#9ca3af', marginTop:'4px' }}>O financeiro ainda nao gerou o boleto</div>
                                </div>
                              </div>
                            )}
                          </div>
                          )}
                        </div>
                      )}

                      {/* --- REQUISICOES (PAGAR) --- */}
                      {tarefaSelecionada.gTipo === 'pagar' && (
                        <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'22px', padding:'30px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
                            <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:'#fee2e2', display:'flex', alignItems:'center', justifyContent:'center' }}><FileText size={18} color="#dc2626"/></div>
                            <div>
                              <div style={{ fontSize:'14px', color:'#dc2626', fontWeight:'600', letterSpacing:'1px', textTransform:'uppercase' }}>Documentos da Requisicao</div>
                              <div style={{ fontSize:'11px', color:'var(--portal-text-secondary)' }}>Nota fiscal e anexos para conferencia</div>
                            </div>
                          </div>
                          <div style={{ display:'flex', gap:'15px', flexWrap:'wrap' }}>
                            <AttachmentTag label="Nota Fiscal" fileUrl={tarefaSelecionada.anexo_nf} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'anexo_nf', f)} />
                            <AttachmentTag icon={<Barcode size={18}/>} label="Boleto" fileUrl={tarefaSelecionada.anexo_boleto} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'anexo_boleto', f)} />
                          </div>
                        </div>
                      )}

                      {/* --- RH --- */}
                      {tarefaSelecionada.gTipo === 'rh' && tarefaSelecionada.anexo && (
                        <div style={{ background:'#f5f3ff', border:'1px solid #c4b5fd', borderRadius:'22px', padding:'30px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
                            <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:'#ede9fe', display:'flex', alignItems:'center', justifyContent:'center' }}><FileText size={18} color="#8b5cf6"/></div>
                            <div style={{ fontSize:'14px', color:'#8b5cf6', fontWeight:'600', letterSpacing:'1px', textTransform:'uppercase' }}>Documentos RH</div>
                          </div>
                          <AttachmentTag label="Anexo RH" fileUrl={tarefaSelecionada.anexo} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'anexo', f)} />
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

                  {/* Preferência de envio do boleto — sempre visível (todas as fases), ligada ao cliente */}
                  {tarefaSelecionada.gTipo !== 'pagar' && tarefaSelecionada.gTipo !== 'rh' && (
                    <div style={{ marginTop:'45px' }}>
                      <PreferenciaEnvioBoleto card={tarefaSelecionada} />
          <EmailsDoCard chamadoId={tarefaSelecionada?.id} />
                    </div>
                  )}

                  <div style={{display:'flex', gap:'20px', marginTop:'45px'}}>
                    {tarefaSelecionada.status === 'enviar_cliente' && (
                        <button onClick={() => handleConfirmarEnvioBoleto(tarefaSelecionada)} style={btnActionGreen}>
                          <Send size={22}/> MARCAR COMO ENVIADO AO CLIENTE
                        </button>
                    )}
                    {tarefaSelecionada.tarefa?.includes('Cobrar') && (
                        <button onClick={() => handleConcluirRecobranca(tarefaSelecionada)} style={btnActionBlue}>
                          <DollarSign size={22}/> CLIENTE RECOBRADO
                        </button>
                    )}
                  </div>

                  {/* HISTÓRICO DESTE CARD — o que foi alterado, quem alterou, data e hora */}
                  <div style={{ marginTop:'45px', background:'var(--portal-bg-secondary)', border:'1px solid var(--portal-border)', borderRadius:'16px', padding:'24px' }}>
                    <label style={{...labelMStyle, marginBottom:'14px', display:'flex', alignItems:'center', gap:'8px'}}><Clock size={15}/> HISTÓRICO DESTE CARD</label>
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
              </div>
            </div>
          </div>
        </div>
      )}

      </div>{/* fim padding wrapper */}
      <style jsx global>{`
        .task-card { transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; border-radius: 20px; overflow: hidden; border: 1px solid var(--portal-border); margin-bottom: 5px; background: var(--portal-bg-card); }
        .task-card:hover { transform: translateY(-6px); box-shadow: 0 12px 30px rgba(0,0,0,0.08); border-color: #d1d5db; }
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

const colHeaderStyle = { padding: '18px', textAlign: 'center', fontSize: '16px', background: 'var(--portal-bg-card)', borderRadius: '16px', border: '1px solid var(--portal-border)', color: 'var(--portal-text-secondary)', letterSpacing:'1.5px', fontWeight:'600' };
const cardMetaStyle = { display:'flex', alignItems:'center', gap:'8px', color:'#4d7c0f', fontSize:'13px', background:'#c5e29f', padding:'6px 10px', borderRadius:'10px', border: '1px solid #a8d36f' };
const cardMetaAmbarStyle = { ...cardMetaStyle, color:'#b45309', background:'#fef3c7', border:'1px solid #fcd34d' }; // card "Cliente sem boleto" = âmbar de atenção
// ── Ficha compacta (estilo dos cards) ──
const fichaTdLab = { padding:'4px 10px 4px 0', fontSize:'10.5px', fontWeight:'500', letterSpacing:'0.6px', textTransform:'uppercase', color:'#8a9479', width:'34%', borderBottom:'1px solid var(--portal-border)', whiteSpace:'nowrap' };
const fichaTdVal = { padding:'4px 0', fontSize:'13px', color:'var(--portal-text)', fontWeight:'400', borderBottom:'1px solid var(--portal-border)', fontVariantNumeric:'tabular-nums' };
const btnNovoStyle = { background:'#dc2626', color:'#fff', border:'none', padding:'12px 28px', borderRadius:'14px', cursor:'pointer', display:'flex', alignItems:'center', gap:'12px', fontSize: '15px' };
const dropdownStyle = { position:'absolute', top:'65px', right: 0, background:'var(--portal-bg-card)', borderRadius:'22px', boxShadow: '0 20px 50px rgba(0,0,0,0.12)', zIndex:2000, width:'300px', border:'1px solid var(--portal-border)', overflow:'hidden' };
const dropdownItemStyle = { padding:'18px 25px', cursor:'pointer', borderBottom:'1px solid var(--portal-border)', fontSize:'15px', color: 'var(--portal-text-secondary)', transition:'0.2s' };
const btnBackStyle = { background: 'transparent', color: 'var(--portal-text-secondary)', border: '1px solid var(--portal-border)', padding: '12px 28px', borderRadius: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', marginBottom: '10px', fontFamily: 'Inter, sans-serif' };
const fieldBoxModal = { border: '1px solid var(--portal-border)', padding: '25px', background: '#fef2f2', flex: 1, borderRadius: '22px' };
const fieldBoxInner = { padding: '10px' };
const labelMStyle = { fontSize:'14px', color:'var(--portal-text-secondary)', textTransform:'uppercase', letterSpacing:'1px', fontWeight: '400', marginBottom: '10px', display: 'block' };
const pModalStyle = { fontSize:'32px', color:'var(--portal-text)', margin: 0 };
const inputStyleLight = { width: '100%', padding: '20px', border: '1px solid var(--portal-border)', outline: 'none', background:'var(--portal-bg-card)', color:'var(--portal-text)', fontSize: '18px', borderRadius: '15px', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' };
const miniActionBtn = { background: 'transparent', border: 'none', padding: '12px 15px', color: '#374151', cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const btnActionGreen = { flex:1, color:'#fff', background:'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', border:'none', padding:'22px', borderRadius:'18px', cursor:'pointer', display:'flex', alignItems:'center', gap:'15px', fontSize:'16px', justifyContent:'center', fontWeight: '600', boxShadow: '0 10px 25px rgba(22, 163, 74, 0.3)', transition: '0.3s' };
const btnActionBlue = { flex:1, color:'#fff', background:'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', border:'none', padding:'22px', borderRadius:'18px', cursor:'pointer', display:'flex', alignItems:'center', gap:'15px', fontSize:'16px', justifyContent:'center', fontWeight: '600', boxShadow: '0 10px 25px rgba(37, 99, 235, 0.3)', transition: '0.3s' };
const cascadeRowStyle = { display: 'grid', gridTemplateColumns: '150px 220px 180px 320px', gap: '20px', alignItems: 'center', background: 'var(--portal-bg-card)', padding: '15px', borderRadius: '14px', border: '1px solid var(--portal-border)' };
const cascadeLabelStyle = { fontSize: '12px', color: 'var(--portal-text-secondary)', fontWeight: '600', letterSpacing: '1px' };
const inputCascadeStyle = { background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: '8px', color: 'var(--portal-text)', padding: '8px 12px', fontSize: '14px', outline: 'none' };
const cascadeValueStyle = { fontSize: '18px', color: 'var(--portal-text)', fontWeight: '500' };
