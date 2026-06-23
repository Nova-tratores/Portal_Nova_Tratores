'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useAuditLog } from '@/hooks/useAuditLog'
import { notificarAdminsClient } from '@/hooks/useNotificarAdmins'
import { autoEnviarENotificar } from '@/lib/financeiro/envioBoleto'
import { formatarDataBR, formatarMoeda, calcTempo } from '@/lib/financeiro/utils'
import { STATUS_CONFIG_NF as STATUS_CONFIG } from '@/lib/financeiro/constants'
import {
  X, PlusCircle, FileText, Download,
  CheckCircle, Upload, Send,
  Calendar, CreditCard, ArrowLeft,
  CheckCheck, Eye, ClipboardList, Search, Trash2, RefreshCw, AlertCircle, Lock, DollarSign, Barcode, Check, Clock
} from 'lucide-react'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import { marcarMinhaAcao } from '@/components/financeiro/NotificationSystem'

// --- COMPONENTE KANBAN PRINCIPAL ---
export default function KanbanFinanceiro() {
const { userProfile } = useAuth()
const { isAdmin } = usePermissoes(userProfile?.id)
const { log: auditLog } = useAuditLog()
const isFinanceiro = userProfile?.funcao === 'Financeiro' // financeiro pode marcar pago sem comprovante
const [chamados, setChamados] = useState([]);
const [tarefaSelecionada, setTarefaSelecionada] = useState(null);
const [cardLogs, setCardLogs] = useState([]);   // histórico (audit_log) do card aberto

const [filtroBusca, setFiltroBusca] = useState('');

const [fileBoleto, setFileBoleto] = useState(null);
const carregarTimeoutRef = useRef(null);
const router = useRouter();

const notificarMovimento = (t, novoStatus, descExtra) => {
  const label = `NF #${t.id} - ${t.nom_cliente || t.tarefa || ''}`;
  const statusLabels = { gerar_boleto: 'Gerar Boleto', enviar_cliente: 'Enviar ao Cliente', aguardando_vencimento: 'Aguardando Vencimento', pago: 'Pago', vencido: 'Vencido', concluido: 'Concluído' };
  marcarMinhaAcao('Chamado_NF', t.id, {
    titulo: `Card movimentado → ${statusLabels[novoStatus] || novoStatus}`,
    descricao: descExtra || label,
    link: `/financeiro/kanban-financeiro?id=${t.id}`,
    userId: userProfile?.id,
    alvo: userProfile?.funcao === 'Financeiro' ? 'posvendas' : 'financeiro',
  });
};

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
    const { data } = await supabase.from('Chamado_NF').select('*').order('id', { ascending: false });
    const hoje = new Date(); hoje.setHours(0,0,0,0);

    // --- AUTO-MOVE: gerar_boleto + boleto anexado -> enviar_cliente ---
    const formasSemBoleto = ['Pix', 'Cartão a vista', 'Cartão Parcelado'];
    const paraAutoMoverEnviar = (data || []).filter(c =>
      (c.status === 'gerar_boleto' || c.status === 'validar_pix') &&
      c.anexo_boleto &&
      !formasSemBoleto.includes(c.forma_pagamento)
    );
    if (paraAutoMoverEnviar.length > 0) {
      await Promise.all(paraAutoMoverEnviar.map(c =>
        supabase.from('Chamado_NF').update({ status: 'enviar_cliente', tarefa: 'Enviar para o Cliente', setor: 'Pós-Vendas' }).eq('id', c.id)
      ));
      paraAutoMoverEnviar.forEach(c => {
        const idx = (data || []).findIndex(d => d.id === c.id);
        if (idx !== -1) data[idx] = { ...data[idx], status: 'enviar_cliente', tarefa: 'Enviar para o Cliente', setor: 'Pós-Vendas' };
      });
    }

    // --- AUTO-MOVE: Boleto 30 dias vencido -> pago ---
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

    // --- AUTO-MOVE: boleto simples vencido sem comprovante -> vencido ---
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

    // --- AUTO-MOVE: gerar_boleto com vencimento passado -> vencido ---
    const gerarBoletoVencido = (data || []).filter(c =>
      c.status === 'gerar_boleto' &&
      c.vencimento_boleto && new Date(c.vencimento_boleto + 'T00:00:00') < hoje
    );
    if (gerarBoletoVencido.length > 0) {
      await Promise.all(gerarBoletoVencido.map(c => supabase.from('Chamado_NF').update({ status: 'vencido', tarefa: 'Cobrar Cliente (Vencido sem boleto)' }).eq('id', c.id)));
      gerarBoletoVencido.forEach(c => {
        const idx = (data || []).findIndex(d => d.id === c.id);
        if (idx !== -1) data[idx] = { ...data[idx], status: 'vencido', tarefa: 'Cobrar Cliente (Vencido sem boleto)' };
      });
    }

    // --- HELPER: calcula estado de cada parcela ---
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
        return {
          num: i + 1,
          data: dtStr,
          valor: valorUnit,
          comprovante: comp || null,
          estado,
          campo_comprovante: i === 0 ? 'comprovante_pagamento_p1' : `comprovante_pagamento_p${i + 1}`
        };
      });
    };

    const processados = (data || []).map(c => {
      const isBoletoParc = c.forma_pagamento === 'Boleto Parcelado';
      const isCartaoParc = c.forma_pagamento === 'Cartão Parcelado';

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
  } catch (err) { console.error("Erro ao carregar dados:", err); }
}

const carregarComDebounce = () => {
  if (carregarTimeoutRef.current) clearTimeout(carregarTimeoutRef.current);
  carregarTimeoutRef.current = setTimeout(carregarDados, 600);
};

useEffect(() => {
    const channel = supabase
      .channel('kanban_realtime_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Chamado_NF' }, carregarComDebounce)
      .subscribe();
    return () => { supabase.removeChannel(channel); if (carregarTimeoutRef.current) clearTimeout(carregarTimeoutRef.current); };
}, []);

useEffect(() => {
  if (userProfile) carregarDados()
}, [userProfile]);

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
      if (tarefaSelecionada?.status === 'concluido') return;
      // só age se houve MUDANÇA real (evita notificar ao só clicar/sair do campo)
      if (tarefaSelecionada && String(tarefaSelecionada.id) === String(id) && String(tarefaSelecionada[field] ?? '') === String(value ?? '')) return;
      await supabase.from('Chamado_NF').update({ [field]: value }).eq('id', id);
      notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} alterou NF #${id}`, `Campo: ${field}`, `/financeiro/kanban-financeiro`)
      await auditLog({ sistema: 'financeiro', acao: 'editar', entidade: 'Chamado_NF', entidade_id: String(id), entidade_label: `NF #${id} - ${tarefaSelecionada?.nom_cliente || ''}`, detalhes: { campo: field, valor: value } });
      carregarCardLogs(id);
      carregarDados();
};

// Envio automático do boleto conforme a preferência salva — notifica sucesso/erro
const dispararEnvioAuto = (card) => {
  autoEnviarENotificar({
    card,
    remetente: userProfile?.nome,
    userId: userProfile?.id,
    audit: ({ acao, detalhes }) => {
      auditLog({ sistema: 'financeiro', acao, entidade: 'Chamado_NF', entidade_id: String(card.id), entidade_label: `NF #${card.id} - ${card.nom_cliente || ''}`, detalhes });
      carregarCardLogs(card.id);
    },
  });
};

// Excluir card — somente admin
const excluirCard = async (t) => {
      if (!isAdmin || !t) return;
      if (!window.confirm(`Excluir definitivamente o card de ${t.nom_cliente || ('NF #' + t.id)}? Esta ação não pode ser desfeita.`)) return;
      const { error } = await supabase.from('Chamado_NF').delete().eq('id', t.id);
      if (error) { alert('Erro ao excluir: ' + error.message); return; }
      await auditLog({ sistema: 'financeiro', acao: 'excluir', entidade: 'Chamado_NF', entidade_id: String(t.id), entidade_label: `NF #${t.id} - ${t.nom_cliente || ''}` });
      notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} excluiu NF #${t.id}`, `Cliente: ${t.nom_cliente || ''}`, `/financeiro/kanban-financeiro`)
      setTarefaSelecionada(null);
      carregarDados();
};

const handleUpdateFileDirect = async (id, field, file) => {
      if(!file) return;
      try {
        const path = `anexos/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const { error: uploadError } = await supabase.storage.from('anexos').upload(path, file);
        if (uploadError) throw uploadError;
        const { data: linkData } = supabase.storage.from('anexos').getPublicUrl(path);

        let updateData = { [field]: linkData.publicUrl };

        if ((field === 'comprovante_pagamento' || field.startsWith('comprovante_pagamento_p')) && tarefaSelecionada?.status === 'aguardando_vencimento') {
          updateData.tarefa = 'Pagamento concluído';
        }

        // Auto-move: ao anexar boleto em card "gerar_boleto" → mover para "enviar_cliente"
        if (field.startsWith('anexo_boleto') && tarefaSelecionada?.status === 'gerar_boleto') {
          updateData.status = 'enviar_cliente';
          updateData.tarefa = 'Enviar para o Cliente';
          updateData.setor = 'Pós-Vendas';
        }

        await supabase.from('Chamado_NF').update(updateData).eq('id', id);

        // Notificar se mudou de fase
        if (updateData.status === 'enviar_cliente' && tarefaSelecionada) {
          notificarMovimento(tarefaSelecionada, 'enviar_cliente', `NF #${id} - ${tarefaSelecionada.nom_cliente || ''} — Boleto anexado, enviar ao cliente`);
          notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} anexou boleto NF #${id}`, `Cliente: ${tarefaSelecionada.nom_cliente || ''}`, `/financeiro/kanban-financeiro`)
          dispararEnvioAuto({ ...tarefaSelecionada, ...updateData });
        } else {
          notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} atualizou arquivo NF #${id}`, `Campo: ${field}`, `/financeiro/kanban-financeiro`)
        }

        if (tarefaSelecionada) {
            setTarefaSelecionada(prev => ({ ...prev, ...updateData }));
        }

        alert(updateData.status === 'enviar_cliente' ? "Boleto anexado! Card movido para Enviar ao Cliente." : "Arquivo atualizado!");
        carregarDados();
      } catch (err) { alert("Erro: " + err.message); }
};

const handleActionMoveStatus = async (t, newStatus) => {
      notificarMovimento(t, newStatus);
      const now = new Date().toISOString();
      const { error } = await supabase.from('Chamado_NF').update({ status: newStatus }).eq('id', t.id);
      if (!error) {
          supabase.from('Chamado_NF').update({ status_changed_at: now }).eq('id', t.id).catch(() => {});
          notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} moveu NF #${t.id} → ${newStatus}`, `Cliente: ${t.nom_cliente || ''}`, `/financeiro/kanban-financeiro`)
          await auditLog({ sistema: 'financeiro', acao: 'mover_status', entidade: 'Chamado_NF', entidade_id: String(t.id), entidade_label: `NF #${t.id} - ${t.nom_cliente || ''}`, detalhes: { de: t.status, para: newStatus } });
          carregarCardLogs(t.id);
          alert(newStatus === 'concluido' ? "Card Concluido!" : "Card movido!");
          carregarDados();
      }
};

const handleActionCobrarCliente = async (t) => {
      const newVal = (t.recombrancas_qtd || 0) + 1;
      notificarMovimento(t, t.status, `NF #${t.id} - ${t.nom_cliente || ''} — Recobrança #${newVal}`);
      const now = new Date().toISOString();
      const { error } = await supabase.from('Chamado_NF').update({
          tarefa: 'Cobrar Cliente (Recobrança)',
          recombrancas_qtd: newVal,
          setor: 'Pós-Vendas'
      }).eq('id', t.id);
      if (!error) {
          supabase.from('Chamado_NF').update({ status_changed_at: now }).eq('id', t.id).catch(() => {});
          notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} solicitou recobrança #${newVal}`, `NF #${t.id} — ${t.nom_cliente || ''}`, `/financeiro/kanban-financeiro`)
          alert("Recobrança enviada ao Pós-Vendas!");
          setTarefaSelecionada(null);
          carregarDados();
      }
};

const handleActionPedirRecobranca = async (t, moverParaVencido = true) => {
    if (!window.confirm("Deseja solicitar recobrança ao Pós-Vendas?")) return;
    const newVal = (t.recombrancas_qtd || 0) + 1;
    notificarMovimento(t, moverParaVencido ? 'vencido' : t.status, `NF #${t.id} - ${t.nom_cliente || ''} — Recobrança #${newVal}`);
    const now = new Date().toISOString();

    let updateData = {
        tarefa: 'Cobrar Cliente (Recobrança)',
        recombrancas_qtd: newVal,
        setor: 'Pós-Vendas'
    };

    if (moverParaVencido) updateData.status = 'vencido';

    const { error } = await supabase.from('Chamado_NF').update(updateData).eq('id', t.id);
    if (!error) {
        if (moverParaVencido) supabase.from('Chamado_NF').update({ status_changed_at: now }).eq('id', t.id).catch(() => {});
        notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} solicitou recobrança #${newVal}`, `NF #${t.id} — ${t.nom_cliente || ''}`, `/financeiro/kanban-financeiro`)
        alert("Recobrança enviada ao Pós-Vendas!");
        carregarDados();
    }
};

const handleActionSomenteVencido = async (t) => {
    notificarMovimento(t, 'vencido');
    const now = new Date().toISOString();
    const { error } = await supabase.from('Chamado_NF').update({ status: 'vencido' }).eq('id', t.id);
    if (!error) {
        supabase.from('Chamado_NF').update({ status_changed_at: now }).eq('id', t.id).catch(() => {});
        notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} moveu NF #${t.id} para Vencido`, `Cliente: ${t.nom_cliente || ''}`, `/financeiro/kanban-financeiro`)
        alert("Card movido para Vencido!");
        carregarDados();
    }
};

const handleGerarBoletoFaturamentoFinal = async (id, fileArg) => {
    const arquivo = fileArg || fileBoleto;
    if (!arquivo) return alert("Anexe o arquivo.");
    const path = `boletos/${Date.now()}-${arquivo.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    await supabase.storage.from('anexos').upload(path, arquivo);
    const { data } = supabase.storage.from('anexos').getPublicUrl(path);

    const updateData = {
        status: 'enviar_cliente',
        anexo_boleto: data.publicUrl,
        tarefa: 'Enviar para o Cliente',
        setor: 'Pós-Vendas'
    };

    const t = chamados.find(c => c.id === id) || { id, nom_cliente: '' };
    notificarMovimento(t, 'enviar_cliente', `NF #${id} - ${t.nom_cliente || ''} — Boleto gerado`);
    await supabase.from('Chamado_NF').update(updateData).eq('id', id);
    supabase.from('Chamado_NF').update({ status_changed_at: new Date().toISOString() }).eq('id', id).catch(() => {});
    notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} gerou boleto NF #${id}`, `Cliente: ${t.nom_cliente || ''}`, `/financeiro/kanban-financeiro`)
    dispararEnvioAuto({ ...t, ...updateData });
    setTarefaSelecionada(null); carregarDados();
};

const chamadosFiltrados = chamados.filter(c => {
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

// --- LOGICAS CONDICIONAIS ---
const isPixOuCartaoVista = tarefaSelecionada && ['Pix', 'Cartão a vista'].includes(tarefaSelecionada.forma_pagamento);
const isBoleto30 = tarefaSelecionada && tarefaSelecionada.forma_pagamento === 'Boleto 30 dias';
const isBoletoParcelado = tarefaSelecionada?.forma_pagamento === 'Boleto Parcelado';
const isCartaoParcelado = tarefaSelecionada?.forma_pagamento === 'Cartão Parcelado';

return (
    <div style={{ minHeight: 'calc(100vh - 64px)', fontFamily: 'Inter, sans-serif', background: 'var(--portal-bg-secondary)' }}>
    <FinanceiroNav />

    <main style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px - 56px)', overflow: 'hidden' }}>
      <header style={{ padding: '20px 32px 16px' }}>
      <div style={{ display:'flex', gap:'12px', alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 420px', maxWidth: '560px' }}>
              <Search size={16} style={{ ...iconFilterStyle, left: '12px' }} title="Buscar" />
              <input type="text" placeholder="Buscar por cliente, nº da nota, vencimento, condição ou ID..." value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)} style={{...inputFilterStyle, fontSize:'13px', padding:'10px 36px 10px 36px'}} />
              {filtroBusca && <X size={14} onClick={() => setFiltroBusca('')} style={{position:'absolute', right: '10px', top: '50%', transform:'translateY(-50%)', cursor:'pointer', color:'var(--portal-text-muted)'}} title="Limpar busca" />}
          </div>
      </div>
      </header>

      {filtroBusca.trim() ? (
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px 24px' }}>
        <div style={{ fontSize: '13px', color: 'var(--portal-text-muted)', marginBottom: '12px' }}>{chamadosFiltrados.length} resultado{chamadosFiltrados.length !== 1 ? 's' : ''}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
          {chamadosFiltrados.map((t, idx) => {
            const statusLabel = { gerar_boleto: 'GERAR BOLETO', validar_pix: 'VALIDAR PIX', enviar_cliente: 'ENVIAR CLIENTE', aguardando_vencimento: 'AGUARDANDO', sem_boleto: 'SEM BOLETO', pago: 'PAGO', vencido: 'VENCIDO', concluido: 'CONCLUÍDO' }[t.status] || t.status
            const statusColor = t.status === 'vencido' ? '#ef4444' : t.status === 'pago' || t.status === 'concluido' ? '#22c55e' : t.status === 'gerar_boleto' ? '#3b82f6' : '#d97706'
            return (
              <div key={`${t.id}-${idx}`} className="kanban-card" onClick={() => setTarefaSelecionada(t)} style={{
                background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: '12px',
                borderLeft: `4px solid ${statusColor}`, cursor: 'pointer', overflow: 'hidden',
              }}>
                <div style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '500', color: 'var(--portal-text)', flex: 1 }}>{t.nom_cliente?.toUpperCase()}</h4>
                    <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px', background: `${statusColor}15`, color: statusColor, whiteSpace: 'nowrap' }}>{statusLabel}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--portal-text-secondary)', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><CreditCard size={12} />{t.forma_pagamento}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={12} />{formatarDataBR(t.vencimento_boleto)}</span>
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: '500', color: 'var(--portal-text)', marginTop: '8px' }}>{formatarMoeda(t.valor_exibicao)}</div>
                  <div style={{ fontSize: '11px', color: 'var(--portal-text-muted)', marginTop: '4px' }}>ID #{t.id}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      ) : (
      <div style={{ flex: 1, display: 'flex', gap: '16px', overflowX: 'auto', overflowY: 'hidden', padding: '0 24px 24px 24px', boxSizing: 'border-box' }}>
      {colunas.map(col => (
        <div key={col.id} style={{ width: '300px', flex: '0 0 300px', display: 'flex', flexDirection: 'column' }}>
        <h3 style={colTitleStyle}>{col.titulo}</h3>

        <div style={colWrapperStyle}>
          {chamadosFiltrados.filter(c => {
              if (col.id === 'pago') return (c.status === 'pago' || c.status === 'concluido');
              if (col.id === 'gerar_boleto') return (c.status === 'gerar_boleto' || c.status === 'validar_pix');
              return c.status === col.id;
          }).map((t, idx) => (
          <div key={`${t.id}-${idx}`} className="kanban-card" style={{ opacity: t.status === 'concluido' ? 0.6 : 1 }}>
            <div onClick={() => setTarefaSelecionada(t)} style={{
              background: t.status === 'vencido' ? 'rgba(239, 68, 68, 0.05)' : (t.status === 'pago' || t.status === 'concluido' ? 'rgba(34, 197, 94, 0.05)' : 'var(--portal-bg-card)'),
              padding: '16px', borderBottom: '1px solid var(--portal-border)', cursor: 'pointer'
            }}>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '500', color: t.status === 'vencido' ? '#c0392b' : (t.status === 'pago' || t.status === 'concluido' ? '#27ae60' : 'var(--portal-text)') }}>
              {t.nom_cliente?.toUpperCase()} {t.status === 'concluido' && "\u2713"}
              </h4>
              {t.isPagamentoRealizado && (
                  <div style={{marginTop: '10px', display:'flex', alignItems:'center', gap:'8px', color: '#27ae60', fontSize: '15px', fontWeight: '600'}}>
                      <CheckCircle size={16} /> PAGAMENTO REALIZADO
                  </div>
              )}
              {t.anexo_boleto && (t.status === 'gerar_boleto' || t.status === 'validar_pix') && (
                  <div style={{marginTop: '10px', display:'flex', alignItems:'center', gap:'8px', color: '#4f46e5', fontSize: '15px', fontWeight: '600'}}>
                    <FileText size={16} /> BOLETO ANEXADO
                  </div>
              )}

              {/* -- INDICADORES BOLETO PARCELADO -- */}
              {t.forma_pagamento === 'Boleto Parcelado' && t.parcelas_info && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                    {t.parcelas_info.map((p, i) => (
                      <div key={i}
                        title={`${p.num}ª parcela — ${p.estado === 'pago' ? 'Paga' : p.estado === 'vencido' ? 'EM ATRASO — sem comprovante' : p.estado === 'proximo' ? 'Vence em breve' : 'A vencer'} — ${p.data ? formatarDataBR(p.data) : 'Sem data definida'}`}
                        style={{ width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0, cursor: 'default',
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
                    <div style={{ display:'flex', alignItems:'center', gap:'6px', background:'#fee2e2', padding:'8px 12px', borderRadius:'6px' }}>
                      <AlertCircle size={13} color="#e74c3c" />
                      <span style={{ color:'#e74c3c', fontSize:'12px', fontWeight:'800' }}>
                        {t.parcelas_info.filter(p => p.estado === 'vencido').length === 1 ? 'UMA PARCELA EM ATRASO' : `${t.parcelas_info.filter(p => p.estado === 'vencido').length} PARCELAS EM ATRASO`}
                      </span>
                    </div>
                  )}
                  {t.parcelaProxima && !t.parcelaVencida && (
                    <div style={{ display:'flex', alignItems:'center', gap:'6px', background:'#fffbeb', padding:'8px 12px', borderRadius:'6px' }}>
                      <AlertCircle size={13} color="#f39c12" />
                      <span style={{ color:'#d97706', fontSize:'12px', fontWeight:'800' }}>PARCELA VENCE EM BREVE</span>
                    </div>
                  )}
                </div>
              )}

              {/* -- INDICADOR CARTÃO PARCELADO -- */}
              {t.forma_pagamento === 'Cartão Parcelado' && t.qtd_parcelas && (
                <div style={{ marginTop: '10px' }}>
                  <span style={{ background: 'rgba(139,92,246,0.12)', color: '#7c3aed', fontSize: '12px', fontWeight: '800', padding: '5px 14px', borderRadius: '20px', border: '1px solid rgba(139,92,246,0.25)' }}>
                    {t.qtd_parcelas}x de {formatarMoeda((t.valor_servico || 0) / t.qtd_parcelas)}
                  </span>
                </div>
              )}
            </div>
            <div onClick={() => setTarefaSelecionada(t)} style={{ padding: '16px', background:'transparent', cursor: 'pointer' }}>
              <div style={cardInfoStyle}><CreditCard size={14}/> <span>FORMA:</span> {t.forma_pagamento?.toUpperCase()}</div>
              <div style={cardInfoStyle}><Calendar size={14}/> <span>VENC:</span> {formatarDataBR(t.vencimento_boleto)}</div>
              {(t.num_nf_servico || t.num_nf_peca) && (
                <div style={cardInfoStyle}><FileText size={14}/> <span>NF:</span> {[t.num_nf_servico && `S ${t.num_nf_servico}`, t.num_nf_peca && `P ${t.num_nf_peca}`].filter(Boolean).join(' / ')}</div>
              )}
              <div style={{fontSize:'22px', fontWeight:'400', margin:'10px 0', color:'var(--portal-text)'}}>{formatarMoeda(t.valor_exibicao)}</div>
              <div style={highlightIdStyle}>ID: #{t.id}</div>
              {(t.created_at || t.status_changed_at) && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                  {t.created_at && (
                    <span style={{ fontSize: '10px', color: 'var(--portal-text-secondary)', display: 'flex', alignItems: 'center', gap: '3px', border: '1px solid var(--portal-border)', padding: '3px 8px' }}>
                      <Clock size={10} /> {calcTempo(t.created_at)}
                    </span>
                  )}
                  {t.status_changed_at && (
                    <span style={{ fontSize: '10px', color: '#4f46e5', display: 'flex', alignItems: 'center', gap: '3px', border: '1px solid #c7d2fe', padding: '3px 8px', background: '#eff6ff' }}>
                      <Clock size={10} /> fase: {calcTempo(t.status_changed_at)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          ))}
        </div>
        </div>
      ))}
      </div>
      )}
    </main>

    {/* --- MODAL DETALHES --- */}
    {tarefaSelecionada && (
      <div onClick={(e) => { if (e.target === e.currentTarget) setTarefaSelecionada(null); }} style={{ position: 'fixed', inset: 0, background: 'var(--portal-bg-card)', backdropFilter: 'blur(15px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--portal-bg-card)', width: '1100px', maxWidth: '98%', maxHeight: '95vh', borderRadius: '16px', overflow:'hidden', boxShadow: '0 40px 100px rgba(47, 54, 64, 0.1)', border: '1px solid var(--portal-border)', display: 'flex', flexDirection: 'column' }}>

        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--portal-bg-card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--portal-border)', flexShrink: 0 }}>
          <button onClick={() => setTarefaSelecionada(null)} className="btn-back" title="Voltar para a visualização do quadro"><ArrowLeft size={18}/> VOLTAR AO PAINEL</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isAdmin && (
              <button onClick={() => excluirCard(tarefaSelecionada)} style={{ background: '#dc2626', border: '1px solid #dc2626', borderRadius: '10px', cursor:'pointer', padding:'8px 12px', display: 'flex', alignItems: 'center', gap: '6px', color: '#fff', fontSize: '13px', fontWeight: '600', transition: '0.2s' }} title="Excluir card (somente admin)"><Trash2 size={16}/> Excluir</button>
            )}
            <button onClick={() => setTarefaSelecionada(null)} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', cursor:'pointer', padding:'8px 12px', display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', fontSize: '13px', fontWeight: '600', transition: '0.2s' }} title="Fechar"><X size={18}/> Fechar</button>
          </div>
        </div>
        <div style={{ flex: 1, padding: '30px 60px 60px', overflowY: 'auto' }}>

          <h2 style={{fontSize:'32px', fontWeight:'400', margin:'30px 0 16px', letterSpacing:'-1px', color:'var(--portal-text)', lineHeight: '1.1'}}>{tarefaSelecionada.nom_cliente?.toUpperCase()}</h2>

          {/* BADGE DE FASE ATUAL + TIMERS */}
          {(() => {
            const cfg = STATUS_CONFIG[tarefaSelecionada.status] || { label: tarefaSelecionada.status, bg: 'var(--portal-bg-secondary)', color: 'var(--portal-text-secondary)', border: 'var(--portal-border)' };
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '36px', flexWrap: 'wrap' }}>
                <div style={{ padding: '8px 20px', background: cfg.bg, color: cfg.color, border: `1.5px solid ${cfg.border}`, fontSize: '11px', fontWeight: '800', letterSpacing: '3px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                  FASE: {cfg.label}
                </div>
                {tarefaSelecionada.created_at && (
                  <span style={{ fontSize: '12px', color: 'var(--portal-text-secondary)', display: 'flex', alignItems: 'center', gap: '5px', border: '1px solid var(--portal-border)', padding: '6px 14px' }}>
                    <Clock size={12} /> Criado ha {calcTempo(tarefaSelecionada.created_at)}
                  </span>
                )}
                {tarefaSelecionada.status_changed_at && (
                  <span style={{ fontSize: '12px', color: '#4f46e5', display: 'flex', alignItems: 'center', gap: '5px', border: '1px solid #c7d2fe', padding: '6px 14px', background: '#eff6ff', fontWeight: '600' }}>
                    <Clock size={12} /> Nesta fase ha {calcTempo(tarefaSelecionada.status_changed_at)}
                  </span>
                )}
              </div>
            );
          })()}

          <div style={{display:'flex', gap:'30px', marginBottom:'50px'}}>
            <div style={fieldBoxModal}>
              <label style={labelModalStyle}>Condição</label>
              <select
                style={{...inputStyleModal, border: 'none', background: 'transparent', padding: '0', fontSize: '24px'}}
                value={tarefaSelecionada.forma_pagamento}
                disabled={tarefaSelecionada.status === 'concluido'}
                onChange={e => {
                    const val = e.target.value;
                    handleUpdateField(tarefaSelecionada.id, 'forma_pagamento', val);
                    if (val === 'Boleto 30 dias') handleUpdateField(tarefaSelecionada.id, 'qtd_parcelas', 1);
                }}
              >
                <option value="Pix">Pix</option>
                <option value="Dinheiro">Dinheiro</option>
                <option value="Boleto 30 dias">Boleto 30 dias</option>
                <option value="Boleto Parcelado">Boleto Parcelado</option>
                <option value="Cartão a vista">Cartão a vista</option>
                <option value="Cartão Parcelado">Cartão Parcelado</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
            <div style={fieldBoxModal}>
              <label style={labelModalStyle}>Valor Total</label>
              <input
                  type="number"
                  style={{...inputStyleModal, border: 'none', background: 'transparent', padding: '0', fontSize: '32px', fontWeight: '400'}}
                  defaultValue={tarefaSelecionada.valor_servico}
                  onBlur={e => handleUpdateField(tarefaSelecionada.id, 'valor_servico', e.target.value)}
              />
            </div>

            {tarefaSelecionada.forma_pagamento !== 'Boleto Parcelado' && (
              <div style={fieldBoxModal}>
                <label style={labelModalStyle}>Data de Vencimento</label>
                <input
                    type="date"
                    style={{...inputStyleModal, border: 'none', background: 'transparent', padding: '0', fontSize: '32px', fontWeight: '400', color: tarefaSelecionada.status === 'vencido' ? '#c0392b' : 'var(--portal-text)'}}
                    defaultValue={tarefaSelecionada.vencimento_boleto}
                    onBlur={e => handleUpdateField(tarefaSelecionada.id, 'vencimento_boleto', e.target.value)}
                />
              </div>
            )}
          </div>

          {/* --- SEÇÃO BOLETO PARCELADO --- */}
          {isBoletoParcelado && (
            <div style={{ display:'flex', flexDirection:'column', gap:'16px', marginBottom:'50px', background:'var(--portal-bg-secondary)', padding:'40px', border:'1px solid var(--portal-border)' }}>
              <div style={{ display:'flex', gap:'30px', borderBottom:'1px solid var(--portal-border)', paddingBottom:'20px' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelModalStyle}>Qtd. Parcelas</label>
                  <select
                    style={{ ...inputStyleModal, fontSize:'24px' }}
                    value={tarefaSelecionada.qtd_parcelas || 1}
                    disabled={tarefaSelecionada.status === 'concluido'}
                    onChange={e => handleUpdateField(tarefaSelecionada.id, 'qtd_parcelas', parseInt(e.target.value))}
                  >
                    {[1,2,3,4,5].map(v => <option key={v} value={v}>{v} {v === 1 ? 'Parcela' : 'Parcelas'}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelModalStyle}>Valor por Parcela</label>
                  <div style={{ ...inputStyleModal, background:'var(--portal-bg-secondary)', color:'var(--portal-text-secondary)', borderStyle:'dashed', fontSize:'24px' }}>
                    {formatarMoeda((tarefaSelecionada.valor_servico || 0) / (tarefaSelecionada.qtd_parcelas || 1))}
                  </div>
                </div>
              </div>

              {/* Linhas por parcela com cor por estado */}
              <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                {(tarefaSelecionada.parcelas_info || []).map((p, i) => {
                  const cores = {
                    pago:    { fundo: '#f0fdf4', borda: '#86efac', label: '#27ae60', texto: 'PAGO' },
                    vencido: { fundo: '#fff5f5', borda: '#fca5a5', label: '#e74c3c', texto: 'EM ATRASO!' },
                    proximo: { fundo: '#fffbeb', borda: '#fcd34d', label: '#d97706', texto: 'VENCE EM BREVE' },
                    futuro:  { fundo: 'var(--portal-bg-card)', borda: 'var(--portal-border)', label: 'var(--portal-text-secondary)', texto: 'A VENCER' },
                  };
                  const c = cores[p.estado];
                  return (
                    <div key={i} style={{ display:'grid', gridTemplateColumns:'130px 190px 160px 1fr', gap:'16px', alignItems:'center', background: c.fundo, padding:'18px', border:`1.5px solid ${c.borda}`, borderRadius:'8px' }}>
                      <div>
                        <div style={{ fontSize:'11px', color:'var(--portal-text-secondary)', fontWeight:'700', letterSpacing:'1px', marginBottom:'4px' }}>{p.num}ª PARCELA</div>
                        <div style={{ fontSize:'13px', fontWeight:'800', color: c.label }}>{c.texto}</div>
                      </div>
                      <input
                        type="date"
                        style={{ ...inputStyleModal, fontSize:'15px', padding:'10px', background:'var(--portal-bg-card)' }}
                        defaultValue={p.data || ''}
                        disabled={tarefaSelecionada.status === 'concluido'}
                        onBlur={e => {
                          if (i === 0) {
                            handleUpdateField(tarefaSelecionada.id, 'vencimento_boleto', e.target.value);
                          } else {
                            const arr = (tarefaSelecionada.datas_parcelas || '').split(/[\s,]+/).filter(d => d.includes('-'));
                            // Remove duplicata da parcela 1 se presente (registros antigos)
                            if (arr.length > 0 && arr[0] === tarefaSelecionada.vencimento_boleto) arr.shift();
                            while (arr.length < (tarefaSelecionada.qtd_parcelas || 1) - 1) arr.push('');
                            arr[i - 1] = e.target.value;
                            handleUpdateField(tarefaSelecionada.id, 'datas_parcelas', arr.filter(d => d).join(', '));
                          }
                        }}
                      />
                      <div style={{ fontSize:'18px', color:'var(--portal-text)', fontWeight:'600' }}>{formatarMoeda(p.valor)}</div>
                      <AttachmentTag
                        icon={<CheckCircle size={16} />}
                        label={p.estado === 'pago' ? `COMPROVANTE P${p.num}` : `ANEXAR P${p.num}`}
                        fileUrl={p.comprovante}
                        onUpload={(file) => handleUpdateFileDirect(tarefaSelecionada.id, p.campo_comprovante, file)}
                        disabled={tarefaSelecionada.status === 'concluido'}
                        onRemove={() => { if(confirm(`Remover comprovante da parcela ${p.num}?`)) handleUpdateField(tarefaSelecionada.id, p.campo_comprovante, null); }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Aviso de atraso */}
              {tarefaSelecionada.parcelas_info?.some(p => p.estado === 'vencido') && (
                <div style={{ background:'#fff5f5', border:'1.5px solid #fca5a5', borderRadius:'8px', padding:'20px', display:'flex', alignItems:'flex-start', gap:'15px' }}>
                  <AlertCircle size={24} color="#e74c3c" style={{ flexShrink: 0, marginTop:'2px' }} />
                  <div>
                    <div style={{ fontWeight:'800', color:'#e74c3c', fontSize:'15px', marginBottom:'6px' }}>
                      {tarefaSelecionada.parcelas_info.filter(p => p.estado === 'vencido').length === 1
                        ? 'Atenção: uma parcela está em atraso!'
                        : `Atenção: ${tarefaSelecionada.parcelas_info.filter(p => p.estado === 'vencido').length} parcelas estão em atraso!`}
                    </div>
                    <div style={{ color:'var(--portal-text-secondary)', fontSize:'14px' }}>Anexe o comprovante na parcela em atraso ou solicite recobrança ao Pós-Vendas usando o botão abaixo.</div>
                  </div>
                </div>
              )}
              {tarefaSelecionada.parcelas_info?.some(p => p.estado === 'proximo') && !tarefaSelecionada.parcelas_info?.some(p => p.estado === 'vencido') && (
                <div style={{ background:'#fffbeb', border:'1.5px solid #fcd34d', borderRadius:'8px', padding:'16px', display:'flex', alignItems:'center', gap:'12px' }}>
                  <AlertCircle size={20} color="#d97706" />
                  <span style={{ color:'#d97706', fontSize:'14px', fontWeight:'700' }}>Uma parcela vence nos próximos 3 dias. Fique atento!</span>
                </div>
              )}
            </div>
          )}

          {/* --- SEÇÃO CARTÃO PARCELADO --- */}
          {isCartaoParcelado && (
            <div style={{ display:'flex', gap:'30px', marginBottom:'50px', background:'var(--portal-bg-secondary)', padding:'40px', border:'1px solid var(--portal-border)' }}>
              <div style={{ flex: 1 }}>
                <label style={labelModalStyle}>Qtd. Parcelas no Cartão</label>
                <select
                  style={{ ...inputStyleModal, fontSize:'24px' }}
                  value={tarefaSelecionada.qtd_parcelas || 1}
                  disabled={tarefaSelecionada.status === 'concluido'}
                  onChange={e => handleUpdateField(tarefaSelecionada.id, 'qtd_parcelas', parseInt(e.target.value))}
                >
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(v => <option key={v} value={v}>{v}x</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelModalStyle}>Valor por Parcela</label>
                <div style={{ ...inputStyleModal, background:'var(--portal-bg-secondary)', color:'#7c3aed', borderStyle:'dashed', fontSize:'24px', fontWeight:'700' }}>
                  {formatarMoeda((tarefaSelecionada.valor_servico || 0) / (tarefaSelecionada.qtd_parcelas || 1))}
                </div>
              </div>
            </div>
          )}

          {/* === INFORMAÇÕES + DOCUMENTOS EM GRID COMPACTO === */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px' }}>

            {/* NF + OBS */}
            <div style={{ background:'var(--portal-bg-secondary)', border:'1px solid var(--portal-border)', padding:'24px', display:'flex', flexDirection:'column', gap:'16px' }}>
              <label style={{...labelModalStyle, margin:0, fontSize:'13px', display:'flex', alignItems:'center', gap:'8px'}}><FileText size={16} color="var(--portal-text-secondary)"/> NOTAS FISCAIS</label>
              {(tarefaSelecionada.num_nf_servico || !tarefaSelecionada.num_nf_peca) && (
                <div>
                  <label style={{...labelModalStyle, fontSize:'11px', marginBottom:'6px'}}>NF Servico</label>
                  <input style={{...inputStyleModal, padding:'14px'}} disabled={tarefaSelecionada.status === 'concluido'} defaultValue={tarefaSelecionada.num_nf_servico} placeholder="N/A" onBlur={e => handleUpdateField(tarefaSelecionada.id, 'num_nf_servico', e.target.value)} />
                </div>
              )}
              {(tarefaSelecionada.num_nf_peca || !tarefaSelecionada.num_nf_servico) && (
                <div>
                  <label style={{...labelModalStyle, fontSize:'11px', marginBottom:'6px'}}>NF Peca</label>
                  <input style={{...inputStyleModal, padding:'14px'}} disabled={tarefaSelecionada.status === 'concluido'} defaultValue={tarefaSelecionada.num_nf_peca} placeholder="N/A" onBlur={e => handleUpdateField(tarefaSelecionada.id, 'num_nf_peca', e.target.value)} />
                </div>
              )}
              <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                {(tarefaSelecionada.anexo_nf_servico || tarefaSelecionada.num_nf_servico || (!tarefaSelecionada.num_nf_peca && !tarefaSelecionada.anexo_nf_peca)) && (
                  <AttachmentTag icon={<FileText size={18} />} label="NF SERVICO" fileUrl={tarefaSelecionada.anexo_nf_servico} onUpload={(file) => handleUpdateFileDirect(tarefaSelecionada.id, 'anexo_nf_servico', file)} disabled={tarefaSelecionada.status === 'concluido'} />
                )}
                {(tarefaSelecionada.anexo_nf_peca || (!tarefaSelecionada.num_nf_servico && !tarefaSelecionada.anexo_nf_servico)) && (
                  <AttachmentTag icon={<ClipboardList size={18} />} label="NF PECA" fileUrl={tarefaSelecionada.anexo_nf_peca} onUpload={(file) => handleUpdateFileDirect(tarefaSelecionada.id, 'anexo_nf_peca', file)} disabled={tarefaSelecionada.status === 'concluido'} />
                )}
                {(isPixOuCartaoVista || tarefaSelecionada.status === 'aguardando_vencimento' || tarefaSelecionada.comprovante_pagamento) && (
                  <AttachmentTag icon={<CheckCircle size={18} />} label="COMPROVANTE" fileUrl={tarefaSelecionada.comprovante_pagamento} onUpload={(file) => handleUpdateFileDirect(tarefaSelecionada.id, 'comprovante_pagamento', file)} disabled={tarefaSelecionada.status === 'concluido'} onRemove={() => { if(confirm('Remover comprovante de pagamento?')) handleUpdateField(tarefaSelecionada.id, 'comprovante_pagamento', null); }} />
                )}
              </div>
            </div>

            {/* BOLETOS — só mostra se NÃO for Pix/Cartão à vista e NÃO for sem_boleto */}
            {!isPixOuCartaoVista && tarefaSelecionada.status !== 'sem_boleto' && (
            <div style={{ background:'rgba(14, 165, 233, 0.03)', border:'1px solid #bfdbfe', padding:'24px', display:'flex', flexDirection:'column', gap:'12px' }}>
              <label style={{...labelModalStyle, margin:0, fontSize:'13px', color:'#3b82f6', display:'flex', alignItems:'center', gap:'8px'}}><Barcode size={16}/> BOLETOS GERADOS</label>
              {(() => {
                const urls = [];
                if (tarefaSelecionada.anexo_boleto) tarefaSelecionada.anexo_boleto.split(',').forEach(u => { const t = u.trim(); if (t) urls.push(t); });
                if (tarefaSelecionada.anexo_boleto_2) { const t = tarefaSelecionada.anexo_boleto_2.trim(); if (t && !urls.includes(t)) urls.push(t); }
                if (tarefaSelecionada.anexo_boleto_3) { const t = tarefaSelecionada.anexo_boleto_3.trim(); if (t && !urls.includes(t)) urls.push(t); }
                const isDisabled = tarefaSelecionada.status === 'concluido';
                const MAX_BOLETOS = 10;
                return (
                  <>
                    {urls.map((url, i) => (
                      <AttachmentTag key={`bol-${i}`} icon={<Barcode size={18}/>} label={`BOLETO ${i + 1}`} fileUrl={url} disabled={isDisabled} onUpload={async f => {
                        const path = `anexos/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
                        await supabase.storage.from('anexos').upload(path, f);
                        const { data: linkData } = supabase.storage.from('anexos').getPublicUrl(path);
                        const novasUrls = [...urls]; novasUrls[i] = linkData.publicUrl;
                        await supabase.from('Chamado_NF').update({ anexo_boleto: novasUrls.join(', ') }).eq('id', tarefaSelecionada.id);
                        setTarefaSelecionada({ ...tarefaSelecionada, anexo_boleto: novasUrls.join(', ') });
                        carregarDados();
                      }} />
                    ))}
                    {urls.length < MAX_BOLETOS && !isDisabled && (
                      <AttachmentTag icon={<Barcode size={18}/>} label={urls.length === 0 ? 'BOLETO 1' : `ADICIONAR BOLETO ${urls.length + 1}`} fileUrl={null} onUpload={async f => {
                        const path = `anexos/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
                        await supabase.storage.from('anexos').upload(path, f);
                        const { data: linkData } = supabase.storage.from('anexos').getPublicUrl(path);
                        const novasUrls = [...urls, linkData.publicUrl];
                        const updateData = { anexo_boleto: novasUrls.join(', ') };
                        if (urls.length === 0 && tarefaSelecionada.status === 'gerar_boleto') {
                          updateData.status = 'enviar_cliente';
                          updateData.tarefa = 'Enviar para o Cliente';
                          updateData.setor = 'Pós-Vendas';
                        }
                        await supabase.from('Chamado_NF').update(updateData).eq('id', tarefaSelecionada.id);
                        if (updateData.status === 'enviar_cliente') {
                          notificarMovimento(tarefaSelecionada, 'enviar_cliente', `NF #${tarefaSelecionada.id} - ${tarefaSelecionada.nom_cliente || ''} — Boleto anexado, enviar ao cliente`);
                          dispararEnvioAuto({ ...tarefaSelecionada, ...updateData });
                        }
                        setTarefaSelecionada({ ...tarefaSelecionada, anexo_boleto: novasUrls.join(', '), ...(updateData.status ? { status: updateData.status } : {}) });
                        carregarDados();
                      }} />
                    )}
                    {urls.length === 0 && !isDisabled && (
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', border:'2px dashed #bfdbfe', color:'#3b82f6', fontSize:'12px', letterSpacing:'1px', textTransform:'uppercase' }}>
                        Anexe o primeiro boleto acima
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            )}
          </div>

          {/* OBSERVAÇÕES */}
          {(tarefaSelecionada.obs || tarefaSelecionada.status !== 'concluido') && (
            <div style={{ marginTop:'20px', background:'var(--portal-bg-secondary)', border:'1px solid var(--portal-border)', borderRadius:'16px', padding:'24px' }}>
              <label style={{...labelModalStyle, marginBottom:'12px', fontSize:'13px', color:'var(--portal-text-secondary)', display:'flex', alignItems:'center', gap:'8px'}}>
                <FileText size={15}/> Observações
              </label>
              <textarea
                style={{
                  width:'100%', minHeight:'120px', padding:'16px 18px',
                  border:'1px solid var(--portal-border)', borderRadius:'12px', outline:'none',
                  background: tarefaSelecionada.status === 'concluido' ? 'var(--portal-bg-secondary)' : 'var(--portal-bg-card)',
                  color:'var(--portal-text)', fontSize:'15px', lineHeight:'1.6',
                  fontFamily:'Inter, sans-serif', resize:'vertical', boxSizing:'border-box',
                  transition:'border-color 0.2s',
                }}
                onFocus={e => { if (tarefaSelecionada.status !== 'concluido') e.target.style.borderColor = 'var(--portal-text-muted)' }}
                onBlur={e => { e.target.style.borderColor = 'var(--portal-border)'; handleUpdateField(tarefaSelecionada.id, 'obs', e.target.value) }}
                disabled={tarefaSelecionada.status === 'concluido'}
                defaultValue={tarefaSelecionada.obs}
                placeholder={tarefaSelecionada.status === 'concluido' ? '' : 'Adicionar observações...'}
              />
            </div>
          )}

          {/* HISTÓRICO DESTE CARD — o que foi alterado, quem alterou, data e hora */}
          <div style={{ marginTop:'40px', background:'var(--portal-bg-secondary)', border:'1px solid var(--portal-border)', borderRadius:'16px', padding:'24px' }}>
            <label style={{ ...labelModalStyle, marginBottom:'14px', fontSize:'13px', color:'var(--portal-text-secondary)', display:'flex', alignItems:'center', gap:'8px' }}>
              <Clock size={15}/> Histórico deste card
            </label>
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

          {/* Mover para Pago ou Voltar ao fluxo — só no modal para sem_boleto */}
          {tarefaSelecionada.status === 'sem_boleto' && (
            <div style={{ marginTop:'20px', background:'#f0fdf4', padding:'20px', borderRadius:'16px', border:'1px solid #bbf7d0', display:'flex', justifyContent:'center', gap:'12px' }}>
              <button
                onClick={() => { handleActionMoveStatus(tarefaSelecionada, 'gerar_boleto'); setTarefaSelecionada(null); }}
                style={{ background: 'var(--portal-bg-card)', color: '#2563eb', border: '1px solid #93c5fd', padding: '14px 32px', borderRadius: '12px', cursor: 'pointer', fontSize: '15px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', transition: '0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--portal-bg-card)'; }}
              >↩ Voltar ao Fluxo</button>
              <button
                onClick={() => { handleActionMoveStatus(tarefaSelecionada, 'pago'); setTarefaSelecionada(null); }}
                style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '14px 32px', borderRadius: '12px', cursor: 'pointer', fontSize: '15px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', transition: '0.2s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#15803d'}
                onMouseLeave={e => e.currentTarget.style.background = '#16a34a'}
              ><CheckCircle size={16}/> Mover para Pago</button>
            </div>
          )}

          <div style={{marginTop:'60px', display:'flex', gap:'20px'}}>
              {/* BLOCO DE PROCESSAMENTO */}
              {(tarefaSelecionada.status === 'gerar_boleto' || tarefaSelecionada.status === 'validar_pix') && !isPixOuCartaoVista && (
                <div style={{flex: 1, background:'rgba(79, 70, 229, 0.03)', padding:'40px', borderRadius:'24px', border:'2px dashed #4f46e5'}}>
                    <label style={{...labelModalStyle, color:'#4f46e5', fontSize: '15px', fontWeight:'700'}}>ANEXAR BOLETO FINAL E PROCESSAR</label>
                    <div style={{display:'flex', gap:'30px', marginTop:'25px', alignItems: 'center'}}>
                      <div style={{flex: 1, position: 'relative'}}>
                          <input
                            type="file"
                            id="file_boleto_input"
                            onChange={e => {
                              const file = e.target.files[0];
                              if (!file) return;
                              setFileBoleto(file);
                              handleGerarBoletoFaturamentoFinal(tarefaSelecionada.id, file);
                            }}
                            style={{display:'none'}}
                          />
                          <label htmlFor="file_boleto_input" style={{
                              display:'flex', alignItems:'center', gap:'10px', background:'var(--portal-bg-card)', border:'1px solid var(--portal-border)', padding:'15px 20px', borderRadius:'12px', cursor:'pointer', color:'var(--portal-text-secondary)', fontSize:'14px'
                          }}>
                             <Upload size={18} /> {fileBoleto ? fileBoleto.name : "Selecionar boleto — tarefa gerada automaticamente"}
                          </label>
                      </div>
                      {fileBoleto && (
                        <button
                          onClick={() => handleGerarBoletoFaturamentoFinal(tarefaSelecionada.id)}
                          style={{
                            background:'#4f46e5',
                            color:'#ffffff',
                            padding:'18px 40px',
                            border:'none',
                            borderRadius:'50px',
                            cursor:'pointer',
                            fontSize: '14px',
                            textTransform:'uppercase',
                            letterSpacing:'2px',
                            fontWeight:'700',
                            boxShadow: '0 10px 20px rgba(79, 70, 229, 0.2)',
                            transition:'0.3s'
                          }}
                        >
                          GERAR TAREFA
                        </button>
                      )}
                    </div>
                </div>
              )}

              {/* PIX / Cartão à Vista em gerar_boleto: mostrar ação de mover para pago */}
              {(tarefaSelecionada.status === 'gerar_boleto' || tarefaSelecionada.status === 'validar_pix') && isPixOuCartaoVista && (
                <div style={{flex: 1, background:'rgba(34, 197, 94, 0.04)', padding:'30px', borderRadius:'16px', border:'2px dashed #22c55e', textAlign:'center'}}>
                  <div style={{fontSize:'14px', color:'#6B7280', marginBottom:'16px'}}>
                    <strong>{tarefaSelecionada.forma_pagamento}</strong> — não precisa de boleto.
                    {tarefaSelecionada.comprovante_pagamento ? ' Comprovante anexado ✓' : ' Anexe o comprovante de pagamento acima.'}
                  </div>
                  {tarefaSelecionada.comprovante_pagamento && (
                    <button onClick={() => handleActionMoveStatus(tarefaSelecionada, 'pago')} style={btnActionGreen}>
                      <CheckCheck size={20}/> CONFIRMAR PAGAMENTO — MOVER PARA PAGO
                    </button>
                  )}
                </div>
              )}

              {/* BOLETO PARCELADO: ações quando há parcela em atraso */}
              {tarefaSelecionada.status === 'aguardando_vencimento' && isBoletoParcelado && tarefaSelecionada.parcelaVencida && !tarefaSelecionada.isPagamentoRealizado && (
                <>
                  <button onClick={() => handleActionPedirRecobranca(tarefaSelecionada, false)} style={btnActionBlue}>
                    <DollarSign size={20}/> PEDIR PÓS-VENDAS RECOBRAR PARCELA
                  </button>
                  <button onClick={() => handleUpdateField(tarefaSelecionada.id, 'tarefa', 'Conferido/Visto')} style={btnActionGreen}>
                    <CheckCheck size={20}/> MARCAR COMO VISTO
                  </button>
                </>
              )}

              {/* BOLETO PARCELADO: todas pagas -> mover para pago */}
              {tarefaSelecionada.status === 'aguardando_vencimento' && isBoletoParcelado && tarefaSelecionada.isPagamentoRealizado && (
                <button onClick={() => handleActionMoveStatus(tarefaSelecionada, 'pago')} style={btnActionGreen}>
                  <CheckCheck size={20}/> TODAS AS PARCELAS PAGAS — MOVER PARA PAGO
                </button>
              )}

              {/* CARTÃO PARCELADO: comprovante anexado -> mover para pago */}
              {tarefaSelecionada.status === 'aguardando_vencimento' && isCartaoParcelado && tarefaSelecionada.isPagamentoRealizado && (
                <button onClick={() => handleActionMoveStatus(tarefaSelecionada, 'pago')} style={btnActionGreen}>
                  <CheckCheck size={20}/> PAGAMENTO CONFIRMADO — MOVER PARA PAGO
                </button>
              )}

              {/* OUTROS (PIX, Cartão à Vista, Boleto simples): recobrança e vencido */}
              {tarefaSelecionada.status === 'aguardando_vencimento' && !isBoletoParcelado && !isCartaoParcelado && !isBoleto30 && (
                <>
                  <button onClick={() => handleActionPedirRecobranca(tarefaSelecionada, true)} style={btnActionBlue}>
                    <DollarSign size={20}/> PEDIR PARA PÓS-VENDAS RECOBRAR
                  </button>
                  <button onClick={() => handleActionSomenteVencido(tarefaSelecionada)} style={btnActionRed}>
                    <AlertCircle size={20}/> MUDAR CARD PARA VENCIDO
                  </button>
                </>
              )}

              {/* PIX / Cartão à Vista com comprovante -> pago */}
              {tarefaSelecionada.status === 'aguardando_vencimento' && isPixOuCartaoVista && tarefaSelecionada.comprovante_pagamento && (
                <button onClick={() => handleActionMoveStatus(tarefaSelecionada, 'pago')} style={btnActionGreen}>
                  <CheckCheck size={20}/> PAGAMENTO CONFIRMADO — MOVER PARA PAGO
                </button>
              )}

              {/* FINANCEIRO: pode marcar como pago sem comprovante anexado */}
              {tarefaSelecionada.status === 'aguardando_vencimento' && isFinanceiro && !tarefaSelecionada.comprovante_pagamento && !tarefaSelecionada.isPagamentoRealizado && (
                <button onClick={() => { if (window.confirm('Marcar como PAGO mesmo sem comprovante anexado?')) handleActionMoveStatus(tarefaSelecionada, 'pago') }} style={btnActionGreen}>
                  <CheckCheck size={20}/> MARCAR COMO PAGO (SEM COMPROVANTE)
                </button>
              )}

              {tarefaSelecionada.status === 'pago' && (
                <>
                    <button onClick={() => { if(window.confirm("Mover para VENCIDO?")) handleActionMoveStatus(tarefaSelecionada, 'vencido') }} style={btnActionRed}>
                        <AlertCircle size={20}/> MOVER PARA VENCIDO
                    </button>
                    <button onClick={() => { if(window.confirm("Deseja concluir este card?")) handleActionMoveStatus(tarefaSelecionada, 'concluido') }} style={btnActionGreen}>
                        <CheckCheck size={20}/> CONCLUIR PROCESSO
                    </button>
                </>
              )}

              {tarefaSelecionada.status === 'vencido' && (
                <>
                    <button onClick={() => handleActionCobrarCliente(tarefaSelecionada)} style={btnActionBlue}>
                        <DollarSign size={20}/> NOTIFICAR PÓS-VENDAS
                    </button>
                    <button onClick={() => { if(window.confirm("Confirmar Pagamento?")) handleActionMoveStatus(tarefaSelecionada, 'concluido') }} style={btnActionGreen}>
                        <CheckCircle size={20}/> CONFIRMAR PAGAMENTO
                    </button>
                </>
              )}

              {tarefaSelecionada.status === 'concluido' && (
                <div style={{flex: 1, background:'rgba(39, 174, 96, 0.05)', padding:'30px', borderRadius:'0px', border:'1px solid #27ae60', textAlign:'center'}}>
                    <span style={{color:'#27ae60', fontSize:'15px', display:'flex', alignItems:'center', justifyContent:'center', gap:'12px', textTransform:'uppercase', letterSpacing:'3px'}}><Lock size={18}/> Processo Finalizado</span>
                </div>
              )}
            </div>
        </div>

      </div>
      </div>
    )}

    <style jsx global>{`
      .kanban-card { background: var(--portal-bg-card); border: 1px solid var(--portal-border); border-radius: 8px; transition: 0.3s ease; overflow: hidden; margin-bottom: 12px; flex-shrink: 0; }
      .kanban-card:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(47, 54, 64, 0.06); border-color: var(--portal-text-secondary); }
      .btn-back { background: transparent; color: var(--portal-text-secondary); border: 1px solid var(--portal-border); padding: 12px 28px; border-radius: 0px; cursor: pointer; display: flex; align-items: center; gap: 10px; font-size:12px; transition: 0.2s; text-transform: uppercase; letter-spacing: 1px; }
      .btn-back:hover { background: var(--portal-text); color: var(--portal-bg-secondary); }

      ::-webkit-scrollbar { width: 6px; height: 10px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: var(--portal-border); border-radius: 10px; }
      ::-webkit-scrollbar-thumb:hover { background: var(--portal-text-secondary); }
    `}</style>
    </div>
)
}

function AttachmentTag({ icon, label, fileUrl, onUpload, disabled = false, onRemove }) {
      const fileInputRef = useRef(null);
      return (
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: '0px', overflow: 'hidden', minWidth:'280px', marginBottom: '5px' }}>
              <div style={{ padding: '0 15px', color: 'var(--portal-text)' }}>{icon}</div>
              <span style={{ padding: '12px 20px', fontSize: '13px', color: fileUrl ? '#27ae60' : 'var(--portal-text-secondary)', borderRight: '1px solid var(--portal-border)', flex: 1, textTransform:'uppercase', letterSpacing:'1px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
              <div style={{ display: 'flex', background: 'var(--portal-bg-card)' }}>
                  {fileUrl && (
                      <button title="Visualizar" onClick={() => window.open(fileUrl, '_blank')} style={miniActionBtn}><Eye size={18} color="#4f46e5" /></button>
                  )}
                  {!disabled && (
                      <>
                          <button title="Substituir" onClick={() => fileInputRef.current.click()} style={miniActionBtn}><RefreshCw size={18} color="var(--portal-text-secondary)" /></button>
                          <input type="file" hidden ref={fileInputRef} onChange={(e) => onUpload(e.target.files[0])} />
                      </>
                  )}
                  {fileUrl && onRemove && !disabled && (
                      <button title="Remover" onClick={onRemove} style={miniActionBtn}><Trash2 size={18} color="#dc2626" /></button>
                  )}
              </div>
          </div>
      );
}

// --- ESTILOS AUXILIARES ---
const colWrapperStyle = { flex: 1, display: 'flex', flexDirection: 'column', gap: '0px', overflowY: 'auto', padding: '12px', background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: '14px', boxShadow: '0 1px 3px rgba(16,24,40,0.05)' };
const colTitleStyle = { textAlign: 'center', fontSize: '13px', color:'var(--portal-text-secondary)', fontWeight:'600', marginBottom:'16px', textTransform:'uppercase', letterSpacing:'1.5px', padding: '12px 8px', borderBottom: '1px solid var(--portal-border)' };
const btnActionRed = { flex: 1, background: 'transparent', color: '#c0392b', border: '1px solid #c0392b', padding: '22px', borderRadius: '0px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' , gap: '15px', fontSize: '15px', textTransform:'uppercase', letterSpacing:'2px' };
const btnActionGreen = { flex: 1, background: 'transparent', color: '#27ae60', border: '1px solid #27ae60', padding: '22px', borderRadius: '0px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', fontSize: '15px', textTransform:'uppercase', letterSpacing:'2px' };
const btnActionBlue = { flex: 1, background: 'transparent', color: '#2980b9', border: '1px solid #2980b9', padding: '22px', borderRadius: '0px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', fontSize: '15px', textTransform:'uppercase', letterSpacing:'2px' };
const inputFilterStyle = { padding: '15px 15px 15px 50px', width: '100%', borderRadius: '0px', border: '1px solid var(--portal-border)', outline: 'none', background:'var(--portal-bg-card)', color:'var(--portal-text)', fontSize: '15px', boxSizing: 'border-box' };
const iconFilterStyle = { position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text-secondary)', zIndex: 10 };
const highlightIdStyle = { fontSize: '11px', color: 'var(--portal-text-secondary)', border: '1px solid var(--portal-border)', padding: '3px 10px', borderRadius: '4px', display: 'inline-block', marginTop: '6px', letterSpacing:'0.5px' };
const cardInfoStyle = { display:'flex', alignItems:'center', gap:'8px', color:'var(--portal-text-secondary)', fontSize:'13px', marginBottom:'6px', letterSpacing: '0.3px' };
const inputStyleModal = { width: '100%', padding: '22px', border: '1px solid var(--portal-border)', borderRadius: '0px', outline: 'none', background:'var(--portal-bg-card)', color:'var(--portal-text)', fontSize: '20px', boxSizing: 'border-box' };
const labelModalStyle = { fontSize:'15px', color:'var(--portal-text-secondary)', letterSpacing:'3px', textTransform:'uppercase', marginBottom:'15px', display:'block' };
const fieldBoxModal = { border: '1px solid var(--portal-border)', padding: '30px', borderRadius: '0px', background: 'var(--portal-bg-secondary)', flex: 1 };
const fieldBoxInner = { padding: '10px', background: 'transparent' };
const miniActionBtn = { background: 'transparent', border: 'none', padding: '10px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', hover: { background: 'var(--portal-bg-secondary)' } };
