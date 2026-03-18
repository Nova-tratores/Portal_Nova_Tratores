'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { formatarDataBR, formatarMoeda, calcTempo } from '@/lib/financeiro/utils'
import { STATUS_CONFIG_NF as STATUS_CONFIG } from '@/lib/financeiro/constants'
import {
  X, PlusCircle, FileText, Download,
  CheckCircle, Upload, Send,
  Calendar, CreditCard, Hash, ArrowLeft,
  CheckCheck, Eye, ClipboardList, Search, Trash2, RefreshCw, AlertCircle, Lock, DollarSign, Barcode, Check, Clock
} from 'lucide-react'

// --- SUB-NAVEGAÇÃO FINANCEIRO ---
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
    <nav style={{ display: 'flex', gap: '0', borderBottom: '1px solid #e5e7eb', background: '#ffffff', padding: '0 40px' }}>
      {links.map(link => {
        const isActive = pathname === link.href
        return (
          <Link key={link.href} href={link.href} style={{
            padding: '20px 32px', fontSize: '20px', fontFamily: 'Montserrat, sans-serif',
            fontWeight: isActive ? '700' : '400',
            color: isActive ? '#dc2626' : '#6b7280',
            textDecoration: 'none',
            borderBottom: isActive ? '3px solid #dc2626' : '3px solid transparent',
            transition: '0.2s', letterSpacing: '0.5px',
          }}>
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}

// --- COMPONENTE KANBAN PRINCIPAL ---
export default function KanbanFinanceiro() {
const { userProfile } = useAuth()
const [chamados, setChamados] = useState([]);
const [tarefaSelecionada, setTarefaSelecionada] = useState(null);

const [filtroCliente, setFiltroCliente] = useState('');
const [filtroNF, setFiltroNF] = useState('');
const [filtroData, setFiltroData] = useState('');

const [fileBoleto, setFileBoleto] = useState(null);
const carregarTimeoutRef = useRef(null);
const router = useRouter();

const colunas = [
  { id: 'gerar_boleto', titulo: 'GERAR BOLETO' },
  { id: 'enviar_cliente', titulo: 'ENVIAR PARA CLIENTE' },
  { id: 'aguardando_vencimento', titulo: 'AGUARDANDO VENCIMENTO' },
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

    // --- HELPER: calcula estado de cada parcela ---
    const calcParcelas = (c) => {
      const qtd = parseInt(c.qtd_parcelas || 1);
      const valorUnit = (c.valor_servico || 0) / qtd;
      const datas = [c.vencimento_boleto, ...(c.datas_parcelas || '').split(/[\s,]+/).filter(d => d.includes('-'))];
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

const handleUpdateField = async (id, field, value) => {
      if (tarefaSelecionada?.status === 'concluido') return;
      await supabase.from('Chamado_NF').update({ [field]: value }).eq('id', id);
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

        await supabase.from('Chamado_NF').update(updateData).eq('id', id);

        if (tarefaSelecionada) {
            setTarefaSelecionada(prev => ({ ...prev, ...updateData }));
        }

        alert("Arquivo atualizado!");
        carregarDados();
      } catch (err) { alert("Erro: " + err.message); }
};

const handleActionMoveStatus = async (t, newStatus) => {
      const now = new Date().toISOString();
      const { error } = await supabase.from('Chamado_NF').update({ status: newStatus }).eq('id', t.id);
      if (!error) {
          supabase.from('Chamado_NF').update({ status_changed_at: now }).eq('id', t.id).catch(() => {});
          alert(newStatus === 'concluido' ? "Card Concluido!" : "Card movido!");
          carregarDados();
      }
};

const handleActionCobrarCliente = async (t) => {
      const newVal = (t.recombrancas_qtd || 0) + 1;
      const now = new Date().toISOString();
      const { error } = await supabase.from('Chamado_NF').update({
          tarefa: 'Cobrar Cliente (Recobrança)',
          recombrancas_qtd: newVal,
          setor: 'Pós-Vendas'
      }).eq('id', t.id);
      if (!error) {
          supabase.from('Chamado_NF').update({ status_changed_at: now }).eq('id', t.id).catch(() => {});
          alert("Recobrança enviada ao Pós-Vendas!");
          setTarefaSelecionada(null);
          carregarDados();
      }
};

const handleActionPedirRecobranca = async (t, moverParaVencido = true) => {
    if (!window.confirm("Deseja solicitar recobrança ao Pós-Vendas?")) return;
    const newVal = (t.recombrancas_qtd || 0) + 1;
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
        alert("Recobrança enviada ao Pós-Vendas!");
        carregarDados();
    }
};

const handleActionSomenteVencido = async (t) => {
    const now = new Date().toISOString();
    const { error } = await supabase.from('Chamado_NF').update({ status: 'vencido' }).eq('id', t.id);
    if (!error) {
        supabase.from('Chamado_NF').update({ status_changed_at: now }).eq('id', t.id).catch(() => {});
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

    await supabase.from('Chamado_NF').update(updateData).eq('id', id);
    supabase.from('Chamado_NF').update({ status_changed_at: new Date().toISOString() }).eq('id', id).catch(() => {});
    setTarefaSelecionada(null); carregarDados();
};

const chamadosFiltrados = chamados.filter(c => {
      const matchCliente = c.nom_cliente?.toLowerCase().includes(filtroCliente.toLowerCase());
      const matchNF = !filtroNF || (String(c.num_nf_servico).includes(filtroNF) || String(c.num_nf_peca).includes(filtroNF));
      const matchData = filtroData ? c.vencimento_boleto === filtroData : true;
      return matchCliente && matchNF && matchData;
});

// --- LOGICAS CONDICIONAIS ---
const isPixOuCartaoVista = tarefaSelecionada && ['Pix', 'Cartão a vista'].includes(tarefaSelecionada.forma_pagamento);
const isBoleto30 = tarefaSelecionada && tarefaSelecionada.forma_pagamento === 'Boleto 30 dias';
const isBoletoParcelado = tarefaSelecionada?.forma_pagamento === 'Boleto Parcelado';
const isCartaoParcelado = tarefaSelecionada?.forma_pagamento === 'Cartão Parcelado';

return (
    <div style={{ minHeight: 'calc(100vh - 64px)', fontFamily: 'Montserrat, sans-serif', background: '#f8fafc' }}>
    <FinanceiroSubNav />

    <main style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px - 49px)', overflow: 'hidden' }}>
      <header style={{ padding: '60px 50px 30px 50px' }}>
      <div style={{ display:'flex', gap:'20px', alignItems:'center', justifyContent: 'flex-start', marginBottom: '35px' }}>
          <div style={{ position: 'relative', width: '450px' }}>
              <Search size={22} style={iconFilterStyle} title="Pesquisar por nome do cliente" />
              <input type="text" placeholder="Filtrar por Cliente..." value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} style={{...inputFilterStyle, fontSize:'20px', padding:'20px 20px 20px 56px'}} />
          </div>
          <div style={{ position: 'relative', width: '250px' }}>
              <Hash size={22} style={iconFilterStyle} title="Filtrar por número da nota" />
              <input type="text" placeholder="Nº Nota..." value={filtroNF} onChange={e => setFiltroNF(e.target.value)} style={{...inputFilterStyle, fontSize:'20px', padding:'20px 20px 20px 56px'}} />
          </div>
          <div style={{ position: 'relative', width: '280px' }}>
              <Calendar size={22} style={iconFilterStyle} title="Filtrar por data de vencimento" />
              <input type="date" value={filtroData} onChange={e => setFiltroData(e.target.value)} style={{...inputFilterStyle, fontSize:'20px', padding:'20px 20px 20px 56px'}} />
              {filtroData && <X size={18} onClick={() => setFiltroData('')} style={{position:'absolute', right: '12px', top: '50%', transform:'translateY(-50%)', cursor:'pointer', color:'#718093'}} title="Limpar filtro de data" />}
          </div>
      </div>
      <h1 style={{ fontWeight: '300', fontSize:'80px', color:'#2f3640', letterSpacing:'-4px', margin: 0 }}>Fluxo Financeiro</h1>
      <div style={{ width: '120px', height: '2px', background: '#718093', marginTop: '15px' }}></div>
      </header>

      <div style={{ flex: 1, display: 'flex', gap: '30px', overflowX: 'auto', overflowY: 'hidden', padding: '0 50px 40px 50px', boxSizing: 'border-box' }}>
      {colunas.map(col => (
        <div key={col.id} style={{ minWidth: '420px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <h3 style={colTitleStyle}>{col.titulo}</h3>

        <div style={colWrapperStyle}>
          {chamadosFiltrados.filter(c => {
              if (col.id === 'pago') return (c.status === 'pago' || c.status === 'concluido');
              if (col.id === 'gerar_boleto') return (c.status === 'gerar_boleto' || c.status === 'validar_pix');
              return c.status === col.id;
          }).map((t, idx) => (
          <div key={`${t.id}-${idx}`} className="kanban-card" style={{ opacity: t.status === 'concluido' ? 0.6 : 1 }}>
            <div onClick={() => setTarefaSelecionada(t)} style={{
              background: t.status === 'vencido' ? 'rgba(239, 68, 68, 0.05)' : (t.status === 'pago' || t.status === 'concluido' ? 'rgba(34, 197, 94, 0.05)' : '#ffffff'),
              padding: '25px', borderBottom: '1px solid #dcdde1', cursor: 'pointer'
            }}>
              <h4 style={{ margin: 0, fontSize: '22px', fontWeight: '400', color: t.status === 'vencido' ? '#c0392b' : (t.status === 'pago' || t.status === 'concluido' ? '#27ae60' : '#2f3640') }}>
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
                    <span style={{ fontSize: '11px', color: '#718093', marginLeft: '4px' }}>
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
            <div onClick={() => setTarefaSelecionada(t)} style={{ padding: '25px', background:'transparent', cursor: 'pointer' }}>
              <div style={cardInfoStyle}><CreditCard size={16}/> <span>FORMA:</span> {t.forma_pagamento?.toUpperCase()}</div>
              <div style={cardInfoStyle}><Calendar size={16}/> <span>VENC:</span> {formatarDataBR(t.vencimento_boleto)}</div>
              <div style={{fontSize:'32px', fontWeight:'300', margin:'15px 0', color:'#2f3640'}}>{formatarMoeda(t.valor_exibicao)}</div>
              <div style={highlightIdStyle}>ID: #{t.id}</div>
              {(t.created_at || t.status_changed_at) && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                  {t.created_at && (
                    <span style={{ fontSize: '10px', color: '#718093', display: 'flex', alignItems: 'center', gap: '3px', border: '1px solid #dcdde1', padding: '3px 8px' }}>
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
    </main>

    {/* --- MODAL DETALHES --- */}
    {tarefaSelecionada && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(245, 246, 250, 0.4)', backdropFilter: 'blur(15px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#ffffff', width: '1100px', maxWidth: '98%', maxHeight: '95vh', borderRadius: '0px', overflow:'hidden', boxShadow: '0 40px 100px rgba(47, 54, 64, 0.1)', border: '1px solid #dcdde1' }}>

        <div style={{ padding: '60px', overflowY: 'auto', maxHeight: '95vh' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <button onClick={() => setTarefaSelecionada(null)} className="btn-back" title="Voltar para a visualização do quadro"><ArrowLeft size={18}/> VOLTAR AO PAINEL</button>
            <button onClick={() => setTarefaSelecionada(null)} style={{ background:'transparent', border:'none', cursor:'pointer', padding:'10px' }} title="Fechar"><X size={28} color="#dc2626"/></button>
          </div>

          <h2 style={{fontSize:'32px', fontWeight:'400', margin:'30px 0 16px', letterSpacing:'-1px', color:'#2f3640', lineHeight: '1.1'}}>{tarefaSelecionada.nom_cliente?.toUpperCase()}</h2>

          {/* BADGE DE FASE ATUAL + TIMERS */}
          {(() => {
            const cfg = STATUS_CONFIG[tarefaSelecionada.status] || { label: tarefaSelecionada.status, bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' };
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '36px', flexWrap: 'wrap' }}>
                <div style={{ padding: '8px 20px', background: cfg.bg, color: cfg.color, border: `1.5px solid ${cfg.border}`, fontSize: '11px', fontWeight: '800', letterSpacing: '3px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                  FASE: {cfg.label}
                </div>
                {tarefaSelecionada.created_at && (
                  <span style={{ fontSize: '12px', color: '#718093', display: 'flex', alignItems: 'center', gap: '5px', border: '1px solid #dcdde1', padding: '6px 14px' }}>
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
                <option value="Boleto 30 dias">Boleto 30 dias</option>
                <option value="Boleto Parcelado">Boleto Parcelado</option>
                <option value="Cartão a vista">Cartão a vista</option>
                <option value="Cartão Parcelado">Cartão Parcelado</option>
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
                    style={{...inputStyleModal, border: 'none', background: 'transparent', padding: '0', fontSize: '32px', fontWeight: '400', color: tarefaSelecionada.status === 'vencido' ? '#c0392b' : '#2f3640'}}
                    defaultValue={tarefaSelecionada.vencimento_boleto}
                    onBlur={e => handleUpdateField(tarefaSelecionada.id, 'vencimento_boleto', e.target.value)}
                />
              </div>
            )}
          </div>

          {/* --- SEÇÃO BOLETO PARCELADO --- */}
          {isBoletoParcelado && (
            <div style={{ display:'flex', flexDirection:'column', gap:'16px', marginBottom:'50px', background:'rgba(245,246,250,0.5)', padding:'40px', border:'1px solid #dcdde1' }}>
              <div style={{ display:'flex', gap:'30px', borderBottom:'1px solid #dcdde1', paddingBottom:'20px' }}>
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
                  <div style={{ ...inputStyleModal, background:'#f8fafc', color:'#718093', borderStyle:'dashed', fontSize:'24px' }}>
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
                    futuro:  { fundo: '#ffffff', borda: '#e2e8f0', label: '#718093', texto: 'A VENCER' },
                  };
                  const c = cores[p.estado];
                  return (
                    <div key={i} style={{ display:'grid', gridTemplateColumns:'130px 190px 160px 1fr', gap:'16px', alignItems:'center', background: c.fundo, padding:'18px', border:`1.5px solid ${c.borda}`, borderRadius:'8px' }}>
                      <div>
                        <div style={{ fontSize:'11px', color:'#718093', fontWeight:'700', letterSpacing:'1px', marginBottom:'4px' }}>{p.num}ª PARCELA</div>
                        <div style={{ fontSize:'13px', fontWeight:'800', color: c.label }}>{c.texto}</div>
                      </div>
                      <input
                        type="date"
                        style={{ ...inputStyleModal, fontSize:'15px', padding:'10px', background:'#ffffff' }}
                        defaultValue={p.data || ''}
                        disabled={tarefaSelecionada.status === 'concluido'}
                        onBlur={e => {
                          if (i === 0) {
                            handleUpdateField(tarefaSelecionada.id, 'vencimento_boleto', e.target.value);
                          } else {
                            const arr = (tarefaSelecionada.datas_parcelas || '').split(/[\s,]+/).filter(d => d.includes('-'));
                            while (arr.length < 4) arr.push('');
                            arr[i - 1] = e.target.value;
                            handleUpdateField(tarefaSelecionada.id, 'datas_parcelas', arr.filter(d => d).join(', '));
                          }
                        }}
                      />
                      <div style={{ fontSize:'18px', color:'#2f3640', fontWeight:'600' }}>{formatarMoeda(p.valor)}</div>
                      <AttachmentTag
                        icon={<CheckCircle size={16} />}
                        label={p.estado === 'pago' ? `COMPROVANTE P${p.num}` : `ANEXAR P${p.num}`}
                        fileUrl={p.comprovante}
                        onUpload={(file) => handleUpdateFileDirect(tarefaSelecionada.id, p.campo_comprovante, file)}
                        disabled={tarefaSelecionada.status === 'concluido'}
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
                    <div style={{ color:'#718093', fontSize:'14px' }}>Anexe o comprovante na parcela em atraso ou solicite recobrança ao Pós-Vendas usando o botão abaixo.</div>
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
            <div style={{ display:'flex', gap:'30px', marginBottom:'50px', background:'rgba(245,246,250,0.5)', padding:'40px', border:'1px solid #dcdde1' }}>
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
                <div style={{ ...inputStyleModal, background:'#f8fafc', color:'#7c3aed', borderStyle:'dashed', fontSize:'24px', fontWeight:'700' }}>
                  {formatarMoeda((tarefaSelecionada.valor_servico || 0) / (tarefaSelecionada.qtd_parcelas || 1))}
                </div>
              </div>
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'30px', background:'rgba(245, 246, 250, 0.5)', padding:'50px', borderRadius:'0px', border:'1px solid #dcdde1' }}>
            <div style={fieldBoxInner}>
              <label style={labelModalStyle}>Nota de Serviço</label>
              <input style={inputStyleModal} disabled={tarefaSelecionada.status === 'concluido'} defaultValue={tarefaSelecionada.num_nf_servico} placeholder="N/A" onBlur={e => handleUpdateField(tarefaSelecionada.id, 'num_nf_servico', e.target.value)} />
            </div>
            <div style={fieldBoxInner}>
              <label style={labelModalStyle}>Nota de Peça</label>
              <input style={inputStyleModal} disabled={tarefaSelecionada.status === 'concluido'} defaultValue={tarefaSelecionada.num_nf_peca} placeholder="N/A" onBlur={e => handleUpdateField(tarefaSelecionada.id, 'num_nf_peca', e.target.value)} />
            </div>
            <div style={{gridColumn:'span 2', ...fieldBoxInner}}>
              <label style={labelModalStyle}>Observações Financeiras</label>
              <textarea style={{...inputStyleModal, height:'120px', resize: 'none'}} disabled={tarefaSelecionada.status === 'concluido'} defaultValue={tarefaSelecionada.obs} onBlur={e => handleUpdateField(tarefaSelecionada.id, 'obs', e.target.value)} />
            </div>
          </div>

          {/* === DOCUMENTOS - LAYOUT INTELIGENTE === */}
          <div style={{marginTop:'50px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'25px'}}>
              {/* COLUNA: NOTAS FISCAIS */}
              <div style={{ background:'rgba(245, 246, 250, 0.5)', border:'1px solid #dcdde1', padding:'30px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
                  <FileText size={20} color="#718093"/>
                  <label style={{...labelModalStyle, margin:0, fontSize:'13px'}}>NOTAS FISCAIS RECEBIDAS</label>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                  <AttachmentTag icon={<FileText size={18} />} label="NF SERVICO" fileUrl={tarefaSelecionada.anexo_nf_servico} onUpload={(file) => handleUpdateFileDirect(tarefaSelecionada.id, 'anexo_nf_servico', file)} disabled={tarefaSelecionada.status === 'concluido'} />
                  <AttachmentTag icon={<ClipboardList size={18} />} label="NF PECA" fileUrl={tarefaSelecionada.anexo_nf_peca} onUpload={(file) => handleUpdateFileDirect(tarefaSelecionada.id, 'anexo_nf_peca', file)} disabled={tarefaSelecionada.status === 'concluido'} />
                  {(isPixOuCartaoVista || tarefaSelecionada.status === 'aguardando_vencimento' || tarefaSelecionada.comprovante_pagamento) && (
                    <AttachmentTag icon={<CheckCircle size={18} />} label="COMPROVANTE PAGAMENTO" fileUrl={tarefaSelecionada.comprovante_pagamento} onUpload={(file) => handleUpdateFileDirect(tarefaSelecionada.id, 'comprovante_pagamento', file)} disabled={tarefaSelecionada.status === 'concluido'} />
                  )}
                </div>
              </div>

              {/* COLUNA: BOLETOS - SISTEMA INTELIGENTE */}
              <div style={{ background:'rgba(14, 165, 233, 0.03)', border:'1px solid #bfdbfe', padding:'30px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                    <Barcode size={20} color="#3b82f6"/>
                    <label style={{...labelModalStyle, margin:0, fontSize:'13px', color:'#3b82f6'}}>BOLETOS GERADOS</label>
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                  <AttachmentTag icon={<Barcode size={18} />} label="BOLETO 1" fileUrl={tarefaSelecionada.anexo_boleto} onUpload={(file) => handleUpdateFileDirect(tarefaSelecionada.id, 'anexo_boleto', file)} disabled={tarefaSelecionada.status === 'concluido'} />
                  {(tarefaSelecionada.anexo_boleto || tarefaSelecionada.anexo_boleto_2) && (
                    <AttachmentTag icon={<Barcode size={18} />} label="BOLETO 2" fileUrl={tarefaSelecionada.anexo_boleto_2} onUpload={(file) => handleUpdateFileDirect(tarefaSelecionada.id, 'anexo_boleto_2', file)} disabled={tarefaSelecionada.status === 'concluido'} />
                  )}
                  {(tarefaSelecionada.anexo_boleto_2 || tarefaSelecionada.anexo_boleto_3) && (
                    <AttachmentTag icon={<Barcode size={18} />} label="BOLETO 3" fileUrl={tarefaSelecionada.anexo_boleto_3} onUpload={(file) => handleUpdateFileDirect(tarefaSelecionada.id, 'anexo_boleto_3', file)} disabled={tarefaSelecionada.status === 'concluido'} />
                  )}
                  {!tarefaSelecionada.anexo_boleto && tarefaSelecionada.status !== 'concluido' && (
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'25px', border:'2px dashed #bfdbfe', color:'#3b82f6', fontSize:'13px', letterSpacing:'1px', textTransform:'uppercase' }}>
                      Anexe o primeiro boleto acima
                    </div>
                  )}
                </div>
              </div>
          </div>

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
                              display:'flex', alignItems:'center', gap:'10px', background:'#ffffff', border:'1px solid #dcdde1', padding:'15px 20px', borderRadius:'12px', cursor:'pointer', color:'#718093', fontSize:'14px'
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
      .kanban-card { background: #ffffff; border: 1px solid #dcdde1; border-radius: 0px; transition: 0.4s ease; overflow: hidden; margin-bottom: 20px; flex-shrink: 0; }
      .kanban-card:hover { transform: scale(1.02); box-shadow: 0 15px 30px rgba(47, 54, 64, 0.05); border-color: #718093; }
      .btn-back { background: transparent; color: #718093; border: 1px solid #dcdde1; padding: 12px 28px; border-radius: 0px; cursor: pointer; display: flex; align-items: center; gap: 10px; font-size:12px; transition: 0.2s; text-transform: uppercase; letter-spacing: 1px; }
      .btn-back:hover { background: #2f3640; color: #f5f6fa; }

      ::-webkit-scrollbar { width: 6px; height: 10px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #dcdde1; border-radius: 10px; }
      ::-webkit-scrollbar-thumb:hover { background: #718093; }
    `}</style>
    </div>
)
}

function AttachmentTag({ icon, label, fileUrl, onUpload, disabled = false }) {
      const fileInputRef = useRef(null);
      return (
          <div style={{ display: 'flex', alignItems: 'center', background: '#f5f6fa', border: '1px solid #dcdde1', borderRadius: '0px', overflow: 'hidden', minWidth:'280px', marginBottom: '5px' }}>
              <div style={{ padding: '0 15px', color: '#000' }}>{icon}</div>
              <span style={{ padding: '12px 20px', fontSize: '13px', color: fileUrl ? '#27ae60' : '#718093', borderRight: '1px solid #dcdde1', flex: 1, textTransform:'uppercase', letterSpacing:'1px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
              <div style={{ display: 'flex', background: '#ffffff' }}>
                  {fileUrl && (
                      <button title="Visualizar" onClick={() => window.open(fileUrl, '_blank')} style={miniActionBtn}><Eye size={18} color="#4f46e5" /></button>
                  )}
                  {!disabled && (
                      <>
                          <button title="Substituir" onClick={() => fileInputRef.current.click()} style={miniActionBtn}><RefreshCw size={18} color="#718093" /></button>
                          <input type="file" hidden ref={fileInputRef} onChange={(e) => onUpload(e.target.files[0])} />
                      </>
                  )}
              </div>
          </div>
      );
}

// --- ESTILOS AUXILIARES ---
const colWrapperStyle = { flex: 1, display: 'flex', flexDirection: 'column', gap: '0px', overflowY: 'auto', padding: '25px', background: 'rgba(255, 255, 255, 0.1)', border: '1px solid #dcdde1', borderRadius: '0px' };
const colTitleStyle = { textAlign: 'center', fontSize: '30px', color:'#718093', fontWeight:'300 !important', marginBottom:'30px', textTransform:'uppercase', letterSpacing:'5px', padding: '15px', borderBottom: '1px solid #dcdde1' };
const btnActionRed = { flex: 1, background: 'transparent', color: '#c0392b', border: '1px solid #c0392b', padding: '22px', borderRadius: '0px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' , gap: '15px', fontSize: '15px', textTransform:'uppercase', letterSpacing:'2px' };
const btnActionGreen = { flex: 1, background: 'transparent', color: '#27ae60', border: '1px solid #27ae60', padding: '22px', borderRadius: '0px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', fontSize: '15px', textTransform:'uppercase', letterSpacing:'2px' };
const btnActionBlue = { flex: 1, background: 'transparent', color: '#2980b9', border: '1px solid #2980b9', padding: '22px', borderRadius: '0px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', fontSize: '15px', textTransform:'uppercase', letterSpacing:'2px' };
const inputFilterStyle = { padding: '15px 15px 15px 50px', width: '100%', borderRadius: '0px', border: '1px solid #dcdde1', outline: 'none', background:'#ffffff', color:'#2f3640', fontSize: '15px', boxSizing: 'border-box' };
const iconFilterStyle = { position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', color: '#718093', zIndex: 10 };
const highlightIdStyle = { fontSize: '15px', color: '#718093', border: '1px solid #dcdde1', padding: '5px 15px', borderRadius: '0px', display: 'inline-block', marginTop: '10px', letterSpacing:'1px' };
const cardInfoStyle = { display:'flex', alignItems:'center', gap:'12px', color:'#718093', fontSize:'15px', marginBottom:'10px', letterSpacing: '0.5px' };
const inputStyleModal = { width: '100%', padding: '22px', border: '1px solid #dcdde1', borderRadius: '0px', outline: 'none', background:'#ffffff', color:'#2f3640', fontSize: '20px', boxSizing: 'border-box' };
const labelModalStyle = { fontSize:'15px', color:'#718093', letterSpacing:'3px', textTransform:'uppercase', marginBottom:'15px', display:'block' };
const fieldBoxModal = { border: '1px solid #dcdde1', padding: '30px', borderRadius: '0px', background: 'rgba(245, 246, 250, 0.5)', flex: 1 };
const fieldBoxInner = { padding: '10px', background: 'transparent' };
const miniActionBtn = { background: 'transparent', border: 'none', padding: '10px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', hover: { background: '#f1f5f9' } };
