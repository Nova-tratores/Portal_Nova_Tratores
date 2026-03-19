'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useAuditLog } from '@/hooks/useAuditLog'
import { marcarMinhaAcao } from '@/components/financeiro/NotificationSystem'
import { formatarDataBR, formatarMoeda, getRequisicoes } from '@/lib/financeiro/utils'
import Link from 'next/link'
import {
  X, Send, ArrowLeft, RefreshCw, MessageSquare, PlusCircle, CheckCircle,
  FileText, Download, Eye, Calendar, CreditCard, User as UserIcon, Tag, Search, DollarSign, Upload, Barcode, Trash2, Paperclip, AlertCircle
} from 'lucide-react'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'

function AttachmentTag({ label, fileUrl, onUpload, disabled = false }) {
    const fileInputRef = useRef(null);
    return (
        <div style={{ display: 'flex', alignItems: 'center', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', minWidth: '280px', overflow: 'hidden', transition: '0.2s' }}>
            <div style={{ padding: '0 18px', color: '#6b7280', background: '#f9fafb', alignSelf: 'stretch', display: 'flex', alignItems: 'center', borderRight: '1px solid #e5e7eb' }}>
                <FileText size={18} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '12px 15px' }}>
                <span style={{ fontSize: '13px', color: '#1e293b', fontWeight: '600', letterSpacing: '0.5px' }}>{label}</span>
                <span style={{ fontSize: '11px', color: fileUrl ? '#10b981' : '#f87171', fontWeight: '600' }}>{fileUrl ? 'ARQUIVO PRONTO' : 'PENDENTE'}</span>
            </div>
            <div style={{ display: 'flex', borderLeft: '1px solid #e5e7eb' }}>
                {fileUrl && (
                    <button title="Ver" onClick={() => window.open(fileUrl, '_blank')} style={miniActionBtn}><Eye size={18} color="#6b7280" /></button>
                )}
                {!disabled && (
                    <>
                        <button title="Upload" onClick={() => fileInputRef.current.click()} style={miniActionBtn}><RefreshCw size={18} color="#6b7280" /></button>
                        <input type="file" ref={fileInputRef} hidden onChange={(e) => onUpload(e.target.files[0])} />
                    </>
                )}
            </div>
        </div>
    );
}

export default function HomePosVendas() {
  return (
    <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: '#6b7280', fontFamily: 'Montserrat, sans-serif' }}>Carregando...</div>}>
      <HomePosVendasContent />
    </Suspense>
  )
}

function HomePosVendasContent() {
  const { userProfile } = useAuth()
  const { log: auditLog } = useAuditLog()
  const [tarefaSelecionada, setTarefaSelecionada] = useState(null);
  const [listaBoletos, setListaBoletos] = useState([]);
  const [listaPagar, setListaPagar] = useState([]);
  const [listaRH, setListaRH] = useState([]);
  const [showNovoMenu, setShowNovoMenu] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // --- CARREGAMENTO UNIFICADO: FIM DOS CARDS FILHOS E FILTRO DE PIX ---
  const carregarDados = async () => {
    try {
      const { data: bolds } = await supabase.from('Chamado_NF').select('*').neq('status', 'concluido').order('id', {ascending: false});

      // FILTRO: Remove PIX e foca em "Enviar para cliente" ou "Cobranca"
      const tarefasFaturamento = (bolds || [])
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

      const { data: pag } = await supabase.from('finan_pagar').select('*').eq('status', 'financeiro').order('id', { ascending: false });
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
  const getCardTable = (t) => t.gTipo === 'pagar' ? 'finan_pagar' : t.gTipo === 'receber' ? 'finan_receber' : t.gTipo === 'rh' ? 'finan_rh' : 'Chamado_NF';

  const handleUpdateField = async (t, field, value) => {
    const table = getCardTable(t);
    await supabase.from(table).update({ [field]: value }).eq('id', t.id);
    auditLog({ sistema: 'financeiro', acao: 'editar', entidade: table, entidade_id: String(t.id), entidade_label: getCardLabel(t), detalhes: { campo: field, valor: value } });
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
      alert("Arquivo atualizado!");
      carregarDados();
      if(tarefaSelecionada) setTarefaSelecionada(prev => ({ ...prev, [field]: linkData.publicUrl }));
    } catch (err) { alert("Erro ao enviar: " + err.message); }
  };

  const handleConcluirRecobranca = async (t) => {
    await supabase.from('Chamado_NF').update({ status: 'vencido', tarefa: 'Cliente Recobrado (Aguardando Financeiro)' }).eq('id', t.id);
    auditLog({ sistema: 'financeiro', acao: 'mover_status', entidade: 'Chamado_NF', entidade_id: String(t.id), entidade_label: getCardLabel(t), detalhes: { de: t.status, para: 'vencido', acao_desc: 'Recobrança concluída - aguardando Financeiro' } });
    alert(`Cobranca registrada!`); setTarefaSelecionada(null); carregarDados();
  };

  const handleConfirmarEnvioBoleto = async (t) => {
    await supabase.from('Chamado_NF').update({ status: 'aguardando_vencimento', tarefa: 'Aguardando Vencimento' }).eq('id', t.id);
    auditLog({ sistema: 'financeiro', acao: 'mover_status', entidade: 'Chamado_NF', entidade_id: String(t.id), entidade_label: getCardLabel(t), detalhes: { de: t.status, para: 'aguardando_vencimento', acao_desc: 'Boleto enviado ao cliente' } });
    alert("Boleto enviado!"); setTarefaSelecionada(null); carregarDados();
  };

  const handleMoverParaPago = async (t) => {
    await supabase.from('Chamado_NF').update({ status: 'pago', tarefa: 'Pagamento Confirmado' }).eq('id', t.id);
    auditLog({ sistema: 'financeiro', acao: 'mover_status', entidade: 'Chamado_NF', entidade_id: String(t.id), entidade_label: getCardLabel(t), detalhes: { de: t.status, para: 'pago', acao_desc: 'Pagamento confirmado' } });
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
  const valorIndividual = tarefaSelecionada ? (tarefaSelecionada.valor_servico / (tarefaSelecionada.qtd_parcelas || 1)) : 0;

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      <FinanceiroNav>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowNovoMenu(s => !s)} style={{
            background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color:'#fff',
            border:'none', padding:'8px 16px', borderRadius:'8px', fontWeight:'700',
            cursor:'pointer', fontSize:'12px', display: 'flex', alignItems: 'center', gap: '6px',
            boxShadow: '0 2px 6px rgba(220,38,38,0.25)', transition: '0.2s',
          }}>
            <PlusCircle size={15}/> NOVO
          </button>
          {showNovoMenu && (
            <>
              <div onClick={() => setShowNovoMenu(false)} style={{ position:'fixed', inset:0, zIndex:1999 }} />
              <div style={{
                position:'absolute', top:'calc(100% + 6px)', right: 0, background:'#fff', zIndex:2000,
                width:'220px', borderRadius: '12px', border:'1px solid #f0f0f0',
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
              }}>
                {[
                  { label: 'Chamado NF', desc: 'Nota fiscal', href: '/financeiro/novo-chamado-nf' },
                  { label: 'Chamado Pagar', desc: 'Conta a pagar', href: '/financeiro/novo-pagar-receber?tipo=pagar' },
                  { label: 'Chamado Receber', desc: 'Conta a receber', href: '/financeiro/novo-pagar-receber?tipo=receber' },
                  { label: 'Chamado RH', desc: 'Solicitacao RH', href: '/financeiro/novo-chamado-rh' },
                ].map((item, i, arr) => (
                  <div key={item.href} style={{
                    padding:'10px 16px', cursor:'pointer', borderBottom: i < arr.length - 1 ? '1px solid #f5f5f5' : 'none',
                    transition: '0.15s',
                  }}
                    onClick={() => { setShowNovoMenu(false); router.push(item.href) }}
                    onMouseEnter={e => e.currentTarget.style.background='#fef2f2'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                    <div style={{ fontSize:'13px', color:'#1a1a1a', fontWeight:'600' }}>{item.label}</div>
                    <div style={{ fontSize:'11px', color:'#a3a3a3' }}>{item.desc}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </FinanceiroNav>

      <div style={{ padding: '24px 32px' }}>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '30px' }}>
          {/* COLUNA FATURAMENTO (FILTRADA: SEM PIX, APENAS ENVIAR OU COBRAR) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={colHeaderStyle}>TAREFA FATURAMENTO</div>
              {listaBoletos.map(t => (
                <div key={`boleto-${t.id}`} onClick={() => setTarefaSelecionada(t)} className="task-card">
                  <div style={{ background: t.tarefa?.includes('Cobrar') ? '#fef2f2' : '#ffffff', padding: '25px', borderBottom: '1px solid #e5e7eb' }}>
                    <div style={{fontSize: '10px', color: t.tarefa?.includes('Cobrar') ? '#dc2626' : '#6b7280', letterSpacing:'1px', marginBottom: '8px', textTransform:'uppercase'}}>{t.tarefa}</div>
                    <span style={{fontSize:'18px', color:'#1e293b', display:'block', lineHeight: '1.2'}}>{t.nom_cliente?.toUpperCase()}</span>
                    {t.isPagamentoRealizado && <div style={{marginTop: '10px', color: '#10b981', fontSize: '11px', fontWeight: '600'}}>&#10003; PAGAMENTO REALIZADO</div>}
                  </div>
                  <div style={{ padding: '25px', background: '#f9fafb' }}>
                    <div style={{display:'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom:'15px'}}>
                      <div style={cardMetaStyle}><CreditCard size={13}/> {t.forma_pagamento?.toUpperCase()}</div>
                      <div style={cardMetaStyle}><Calendar size={13}/> {formatarDataBR(t.vencimento_boleto)}</div>
                    </div>
                    <div style={{fontSize:'26px', color: '#1e293b'}}>{formatarMoeda(t.valor_exibicao)}</div>
                  </div>
                </div>
              ))}
          </div>

          {/* COLUNA REQUISICOES / A PAGAR */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={colHeaderStyle}>REQUISICOES</div>
              {listaPagar.map((t) => (
                <div key={`pag-${t.id}`} onClick={() => setTarefaSelecionada(t)} className="task-card">
                  <div style={{ padding: '24px', background: '#fef2f2', borderLeft: '6px solid #ef4444' }}>
                      <small style={{ color: '#dc2626', letterSpacing: '1px', textTransform: 'uppercase', fontSize: '11px', fontWeight: '600' }}>FORNECEDOR</small>
                      <div style={{ marginTop: '10px', fontSize: '20px', color: '#1e293b' }}>{t.fornecedor?.toUpperCase()}</div>
                      <div style={{ fontSize: '24px', marginTop: '12px', color: '#1e293b' }}>{formatarMoeda(t.valor)}</div>
                      <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {getRequisicoes(t).filter(r => r.numero).map((req, i) => (
                          <span key={i} style={{ background: '#fef2f2', color: '#dc2626', fontSize: '10px', fontWeight: '600', padding: '4px 8px', border: '1px solid #fca5a5', borderRadius: '4px' }}>#{req.numero}</span>
                        ))}
                      </div>
                  </div>
                  <div style={{ padding: '14px 24px', background: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#6b7280', fontSize: '13px' }}>{t.metodo || 'Despesa'}</span>
                    <span style={{ color: '#dc2626', fontSize: '13px', fontWeight: '600' }}>VENC: {formatarDataBR(t.data_vencimento)}</span>
                  </div>
                </div>
              ))}
          </div>

          {/* COLUNA RH */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={colHeaderStyle}>CHAMADO RH</div>
              {listaRH.map(t => (
                <div key={`rh-${t.id}`} onClick={() => setTarefaSelecionada(t)} className="task-card">
                  <div style={{ background: '#ffffff', padding: '24px', color: '#1e293b' }}>
                    <div style={{fontSize: '11px', color: '#93c5fd', letterSpacing: '1px', textTransform:'uppercase'}}>SOLICITACAO INTERNA</div>
                    <span style={{fontSize:'20px', display:'block', marginTop:'10px'}}>{t.funcionario?.toUpperCase()}</span>
                  </div>
                  <div style={{ padding: '25px', background: '#f9fafb' }}>
                    <div style={{display:'flex', alignItems:'center', gap:'10px', color: '#6b7280', fontSize:'15px'}}><Tag size={16}/> {t.titulo}</div>
                  </div>
                </div>
              ))}
          </div>
      </div>

      {/* --- MODAL DETALHES --- */}
      {tarefaSelecionada && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(10px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#ffffff', width: '1100px', maxWidth: '95%', maxHeight: '95vh', borderRadius: '30px', display: 'flex', overflow:'hidden', boxShadow:'0 25px 60px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb' }}>
            <div style={{ flex: 1, padding: '50px', display:'flex', flexDirection:'column', overflowY:'auto', color: '#374151', background: '#ffffff' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <button onClick={() => setTarefaSelecionada(null)} style={btnBackStyle}><ArrowLeft size={18}/> VOLTAR AO PAINEL</button>
                <button onClick={() => setTarefaSelecionada(null)} style={{ background:'transparent', border:'none', cursor:'pointer', padding:'10px' }} title="Fechar"><X size={28} color="#dc2626"/></button>
              </div>

              <div style={{marginTop: '35px'}}>
                  <h2 style={{fontSize:'32px', fontWeight:'400', margin:0, letterSpacing: '-1px', color:'#1e293b', lineHeight: '1.1'}}>{tarefaSelecionada.nom_cliente || tarefaSelecionada.fornecedor || tarefaSelecionada.funcionario || tarefaSelecionada.cliente}</h2>

                  <div style={{display:'flex', gap:'30px', marginTop:'40px', marginBottom:'45px'}}>
                      <div style={fieldBoxModal}>
                        <label style={labelMStyle}>{tarefaSelecionada.gTipo === 'rh' ? 'MOTIVO' : 'CONDICAO/METODO'}</label>
                        <p style={pModalStyle}>{tarefaSelecionada.gTipo === 'pagar' ? (tarefaSelecionada.metodo?.toUpperCase() || 'N/A') : (tarefaSelecionada.forma_pagamento?.toUpperCase() || tarefaSelecionada.metodo?.toUpperCase() || 'N/A')}</p>
                      </div>
                      {tarefaSelecionada.gTipo !== 'rh' && (
                        <>
                          <div style={fieldBoxModal}>
                            <label style={labelMStyle}>VALOR DO REGISTRO</label>
                            <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                              <span style={{fontSize:'22px', color:'#6b7280'}}>R$</span>
                              <input type="number" style={{ ...inputStyleLight, border:'none', padding:0, fontSize:'34px', background:'transparent' }} defaultValue={tarefaSelecionada.valor_exibicao || tarefaSelecionada.valor} onBlur={e => handleUpdateField(tarefaSelecionada, tarefaSelecionada.gTipo === 'boleto' ? 'valor_servico' : 'valor', e.target.value)} />
                            </div>
                          </div>
                          <div style={fieldBoxModal}>
                            <label style={labelMStyle}>DATA DE VENCIMENTO</label>
                            <input type="date" style={{ ...inputStyleLight, border:'none', padding:0, fontSize:'30px', background:'transparent', color:'#ef4444' }} defaultValue={tarefaSelecionada.vencimento_boleto || tarefaSelecionada.data_vencimento} onBlur={e => handleUpdateField(tarefaSelecionada, tarefaSelecionada.gTipo === 'boleto' ? 'vencimento_boleto' : 'data_vencimento', e.target.value)} />
                          </div>
                        </>
                      )}
                  </div>

                  {/* CAMPOS ESPECIFICOS PAGAR */}
                  {tarefaSelecionada.gTipo === 'pagar' && (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'30px', padding:'45px', background:'#fef2f2', border:'1px solid #e5e7eb', marginBottom:'45px', borderRadius:'22px' }}>
                      <div style={fieldBoxInner}>
                        <label style={labelMStyle}>NUMERO DA NOTA FISCAL</label>
                        <input style={inputStyleLight} placeholder="Ex: 000.000.000" defaultValue={tarefaSelecionada.numero_NF || ''} onBlur={e => handleUpdateField(tarefaSelecionada, 'numero_NF', e.target.value)} />
                      </div>
                      <div style={{gridColumn:'span 2', ...fieldBoxInner}}>
                        <label style={labelMStyle}>DESCRICAO / OBSERVACOES</label>
                        <textarea style={{...inputStyleLight, height:'120px', resize:'none'}} defaultValue={tarefaSelecionada.motivo} onBlur={e => handleUpdateField(tarefaSelecionada, 'motivo', e.target.value)} />
                      </div>
                    </div>
                  )}

                  {/* REQUISICOES */}
                  {tarefaSelecionada.gTipo === 'pagar' && (
                    <div style={{ border:'1px solid #e5e7eb', padding:'35px', background:'#fef2f2', marginBottom:'45px', borderRadius:'22px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
                        <label style={labelMStyle}>REQUISICOES</label>
                        <button onClick={() => handleAddRequisicao(tarefaSelecionada)} style={{ background:'#ffffff', color:'#6b7280', border:'1px solid #e5e7eb', padding:'8px 18px', borderRadius:'12px', cursor:'pointer', fontSize:'12px', fontWeight:'600', letterSpacing:'1px' }}>+ ADICIONAR</button>
                      </div>
                      {getRequisicoes(tarefaSelecionada).map((req, i) => (
                        <div key={i} style={{ display:'grid', gridTemplateColumns:'180px 1fr auto', gap:'20px', alignItems:'center', background:'#ffffff', padding:'18px', borderBottom:'1px solid #e5e7eb', marginBottom:'4px', borderRadius:'14px' }}>
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
                      {getRequisicoes(tarefaSelecionada).length === 0 && (
                        <div style={{ color:'#9ca3af', fontSize:'13px', textAlign:'center', padding:'20px' }}>Nenhuma requisicao adicionada.</div>
                      )}
                    </div>
                  )}

                  {!isBoleto30 && isParcelamento && (
                      <div style={{ display:'flex', flexDirection:'column', gap:'20px', background:'#fef2f2', padding:'40px', border:'1px solid #e5e7eb', marginBottom:'45px', borderRadius:'22px' }}>
                          <div style={{ display:'flex', gap:'40px', borderBottom:'1px solid #e5e7eb', paddingBottom:'20px' }}>
                              <div><label style={labelMStyle}>QUANTIDADE</label><select style={{ ...inputStyleLight, width:'120px', padding:'10px' }} value={tarefaSelecionada.qtd_parcelas || 1} onChange={e => handleUpdateField(tarefaSelecionada, 'qtd_parcelas', e.target.value)}>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}x</option>)}</select></div>
                              <div><label style={labelMStyle}>VALOR PARCELA</label><p style={{fontSize:'22px', color:'#1e293b'}}>{formatarMoeda(valorIndividual)}</p></div>
                          </div>
                          <div style={{ display:'flex', flexDirection:'column', gap:'15px' }}>
                              <div style={cascadeRowStyle}>
                                  <span style={cascadeLabelStyle}>1a PARCELA</span>
                                  <input type="date" style={inputCascadeStyle} defaultValue={tarefaSelecionada.vencimento_boleto} onBlur={e => handleUpdateField(tarefaSelecionada, 'vencimento_boleto', e.target.value)} />
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
                                          <input type="date" style={inputCascadeStyle} defaultValue={rawDates[i] || ""} onBlur={e => { let arr = [...rawDates]; while (arr.length < (tarefaSelecionada.qtd_parcelas || 1) - 1) arr.push(''); arr[i] = e.target.value; handleUpdateField(tarefaSelecionada, 'datas_parcelas', arr.filter(d => d).join(', ')); }} />
                                          <span style={cascadeValueStyle}>{formatarMoeda(valorIndividual)}</span>
                                          <AttachmentTag label={`COMPROVANTE P${pNum}`} fileUrl={tarefaSelecionada[`comprovante_pagamento_p${pNum}`]} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, `comprovante_pagamento_p${pNum}`, f)} />
                                      </div>
                                  )
                              })}
                          </div>
                      </div>
                  )}

                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:'30px', border:'1px solid #e5e7eb', padding:'45px', background:'#fef2f2', borderRadius:'22px' }}>
                    {tarefaSelecionada.gTipo === 'rh' ? (
                      <>
                        <div style={fieldBoxInner}><label style={labelMStyle}>TITULO</label><input style={inputStyleLight} defaultValue={tarefaSelecionada.titulo} onBlur={e => handleUpdateField(tarefaSelecionada, 'titulo', e.target.value)} /></div>
                        <div style={fieldBoxInner}><label style={labelMStyle}>SETOR</label><input style={{...inputStyleLight, color:'#0ea5e9'}} defaultValue={tarefaSelecionada.setor} onBlur={e => handleUpdateField(tarefaSelecionada, 'setor', e.target.value)} /></div>
                        <div style={{...fieldBoxInner, gridColumn:'span 2'}}><label style={labelMStyle}>DESCRICAO</label><textarea style={{...inputStyleLight, height:'100px', resize:'none'}} defaultValue={tarefaSelecionada.descricao} onBlur={e => handleUpdateField(tarefaSelecionada, 'descricao', e.target.value)} /></div>
                      </>
                    ) : (
                      <>
                        <div style={fieldBoxInner}><label style={labelMStyle}>METODO</label><p style={{fontSize:'15px', fontWeight: '600', color:'#1e293b'}}>{tarefaSelecionada.forma_pagamento || 'N/A'}</p></div>
                        {tarefaSelecionada.gTipo === 'boleto' && (
                          <>
                              {(tarefaSelecionada.num_nf_servico || !tarefaSelecionada.num_nf_peca) && (
                                <div style={fieldBoxInner}><label style={labelMStyle}>NF SERVICO</label><input style={inputStyleLight} defaultValue={tarefaSelecionada.num_nf_servico} onBlur={e => handleUpdateField(tarefaSelecionada, 'num_nf_servico', e.target.value)} /></div>
                              )}
                              {(tarefaSelecionada.num_nf_peca || !tarefaSelecionada.num_nf_servico) && (
                                <div style={fieldBoxInner}><label style={labelMStyle}>NF PECA</label><input style={inputStyleLight} defaultValue={tarefaSelecionada.num_nf_peca} onBlur={e => handleUpdateField(tarefaSelecionada, 'num_nf_peca', e.target.value)} /></div>
                              )}
                          </>
                        )}
                        {(tarefaSelecionada.obs || tarefaSelecionada.motivo) && (
                          <div style={{gridColumn:'span 2', ...fieldBoxInner}}>
                            <label style={labelMStyle}>OBSERVACOES</label>
                            <textarea style={{...inputStyleLight, height:'60px', resize: 'none'}} defaultValue={tarefaSelecionada.obs || tarefaSelecionada.motivo} onBlur={e => handleUpdateField(tarefaSelecionada, tarefaSelecionada.gTipo === 'boleto' ? 'obs' : 'motivo', e.target.value)} />
                          </div>
                        )}
                      </>
                    )}
                  </div>

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
                                <div style={{ fontSize:'11px', color:'#6b7280' }}>Documentos que voce enviou</div>
                              </div>
                            </div>
                            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                              {(tarefaSelecionada.anexo_nf_servico || (!tarefaSelecionada.num_nf_peca && !tarefaSelecionada.anexo_nf_peca)) && (
                                <AttachmentTag label="NF SERVICO" fileUrl={tarefaSelecionada.anexo_nf_servico} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'anexo_nf_servico', f)} />
                              )}
                              {(tarefaSelecionada.anexo_nf_peca || (!tarefaSelecionada.num_nf_servico && !tarefaSelecionada.anexo_nf_servico)) && (
                                <AttachmentTag label="NF PECA" fileUrl={tarefaSelecionada.anexo_nf_peca} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'anexo_nf_peca', f)} />
                              )}
                              {tarefaSelecionada.comprovante_pagamento && (
                                <AttachmentTag label="COMPROVANTE PAGAMENTO" fileUrl={tarefaSelecionada.comprovante_pagamento} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'comprovante_pagamento', f)} />
                              )}
                            </div>
                          </div>

                          {/* COLUNA: BOLETO DEVOLVIDO PELO FINANCEIRO */}
                          <div style={{ background: tarefaSelecionada.anexo_boleto ? '#eff6ff' : '#fef2f2', border: `1px solid ${tarefaSelecionada.anexo_boleto ? '#bfdbfe' : '#fecaca'}`, borderRadius:'22px', padding:'30px' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
                              <div style={{ width:'36px', height:'36px', borderRadius:'50%', background: tarefaSelecionada.anexo_boleto ? '#dbeafe' : '#fee2e2', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                {tarefaSelecionada.anexo_boleto ? <CheckCircle size={18} color="#3b82f6"/> : <Calendar size={18} color="#dc2626"/>}
                              </div>
                              <div>
                                <div style={{ fontSize:'14px', color: tarefaSelecionada.anexo_boleto ? '#3b82f6' : '#dc2626', fontWeight:'600', letterSpacing:'1px', textTransform:'uppercase' }}>Boleto do Financeiro</div>
                                <div style={{ fontSize:'11px', color:'#6b7280' }}>{tarefaSelecionada.anexo_boleto ? 'Boleto recebido - pronto para enviar' : 'Aguardando financeiro gerar o boleto'}</div>
                              </div>
                            </div>
                            {tarefaSelecionada.anexo_boleto ? (
                              <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                                {[
                                  { label: 'Boleto 1', url: tarefaSelecionada.anexo_boleto },
                                  { label: 'Boleto 2', url: tarefaSelecionada.anexo_boleto_2 },
                                  { label: 'Boleto 3', url: tarefaSelecionada.anexo_boleto_3 },
                                ].filter(b => b.url).map((boleto, i) => (
                                  <div key={i}
                                    onClick={() => window.open(boleto.url, '_blank')}
                                    style={{ display:'flex', alignItems:'center', gap:'15px', background:'#ffffff', border:'1px solid #bfdbfe', borderRadius:'16px', padding:'18px', cursor:'pointer', transition:'0.2s' }}
                                  >
                                    <div style={{ width:'44px', height:'44px', borderRadius:'12px', background:'#dbeafe', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                      <Eye size={20} color="#3b82f6"/>
                                    </div>
                                    <div style={{ flex:1 }}>
                                      <div style={{ fontSize:'15px', color:'#1e293b', fontWeight:'600' }}>{boleto.label}</div>
                                      <div style={{ fontSize:'11px', color:'#6b7280' }}>Clique para abrir</div>
                                    </div>
                                    <Download size={18} color="#3b82f6"/>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'30px', background:'#ffffff', borderRadius:'16px', border:'2px dashed #fecaca' }}>
                                <div style={{ textAlign:'center' }}>
                                  <Calendar size={32} color="#fca5a5" style={{ marginBottom:'10px' }}/>
                                  <div style={{ fontSize:'14px', color:'#dc2626', fontWeight:'600' }}>Aguardando</div>
                                  <div style={{ fontSize:'12px', color:'#9ca3af', marginTop:'4px' }}>O financeiro ainda nao gerou o boleto</div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* --- REQUISICOES (PAGAR) --- */}
                      {tarefaSelecionada.gTipo === 'pagar' && (
                        <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'22px', padding:'30px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
                            <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:'#fee2e2', display:'flex', alignItems:'center', justifyContent:'center' }}><FileText size={18} color="#dc2626"/></div>
                            <div>
                              <div style={{ fontSize:'14px', color:'#dc2626', fontWeight:'600', letterSpacing:'1px', textTransform:'uppercase' }}>Documentos da Requisicao</div>
                              <div style={{ fontSize:'11px', color:'#6b7280' }}>Nota fiscal e anexos para conferencia</div>
                            </div>
                          </div>
                          <div style={{ display:'flex', gap:'15px', flexWrap:'wrap' }}>
                            <AttachmentTag label="Nota Fiscal" fileUrl={tarefaSelecionada.anexo_nf} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'anexo_nf', f)} />
                            {tarefaSelecionada.anexo_requisicao && <AttachmentTag label="Requisicao" fileUrl={tarefaSelecionada.anexo_requisicao} onUpload={f => handleUpdateFileDirect(tarefaSelecionada, 'anexo_requisicao', f)} />}
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
              </div>
            </div>
          </div>
        </div>
      )}

      </div>{/* fim padding wrapper */}
      <style jsx global>{`
        .task-card { transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; border-radius: 20px; overflow: hidden; border: 1px solid #e5e7eb; margin-bottom: 5px; background: #ffffff; }
        .task-card:hover { transform: translateY(-6px); box-shadow: 0 12px 30px rgba(0,0,0,0.08); border-color: #d1d5db; }
      `}</style>
    </div>
  )
}

const colHeaderStyle = { padding: '18px', textAlign: 'center', fontSize: '16px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e5e7eb', color: '#6b7280', letterSpacing:'1.5px', fontWeight:'600' };
const cardMetaStyle = { display:'flex', alignItems:'center', gap:'8px', color:'#6b7280', fontSize:'13px', background:'#ffffff', padding:'6px 10px', borderRadius:'10px', border: '1px solid #e5e7eb' };
const btnNovoStyle = { background:'#dc2626', color:'#fff', border:'none', padding:'12px 28px', borderRadius:'14px', cursor:'pointer', display:'flex', alignItems:'center', gap:'12px', fontSize: '15px' };
const dropdownStyle = { position:'absolute', top:'65px', right: 0, background:'#ffffff', borderRadius:'22px', boxShadow: '0 20px 50px rgba(0,0,0,0.12)', zIndex:2000, width:'300px', border:'1px solid #e5e7eb', overflow:'hidden' };
const dropdownItemStyle = { padding:'18px 25px', cursor:'pointer', borderBottom:'1px solid #e5e7eb', fontSize:'15px', color: '#374151', transition:'0.2s' };
const btnBackStyle = { background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb', padding: '12px 28px', borderRadius: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', marginBottom: '10px', fontFamily: 'Montserrat, sans-serif' };
const fieldBoxModal = { border: '1px solid #e5e7eb', padding: '25px', background: '#fef2f2', flex: 1, borderRadius: '22px' };
const fieldBoxInner = { padding: '10px' };
const labelMStyle = { fontSize:'14px', color:'#6b7280', textTransform:'uppercase', letterSpacing:'1px', fontWeight: '400', marginBottom: '10px', display: 'block' };
const pModalStyle = { fontSize:'32px', color:'#1e293b', margin: 0 };
const inputStyleLight = { width: '100%', padding: '20px', border: '1px solid #e5e7eb', outline: 'none', background:'#ffffff', color:'#1e293b', fontSize: '18px', borderRadius: '15px', boxSizing: 'border-box', fontFamily: 'Montserrat, sans-serif' };
const miniActionBtn = { background: 'transparent', border: 'none', padding: '12px 15px', color: '#374151', cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const btnActionGreen = { flex:1, color:'#fff', background:'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', border:'none', padding:'22px', borderRadius:'18px', cursor:'pointer', display:'flex', alignItems:'center', gap:'15px', fontSize:'16px', justifyContent:'center', fontWeight: '600', boxShadow: '0 10px 25px rgba(22, 163, 74, 0.3)', transition: '0.3s' };
const btnActionBlue = { flex:1, color:'#fff', background:'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', border:'none', padding:'22px', borderRadius:'18px', cursor:'pointer', display:'flex', alignItems:'center', gap:'15px', fontSize:'16px', justifyContent:'center', fontWeight: '600', boxShadow: '0 10px 25px rgba(37, 99, 235, 0.3)', transition: '0.3s' };
const cascadeRowStyle = { display: 'grid', gridTemplateColumns: '150px 220px 180px 320px', gap: '20px', alignItems: 'center', background: '#ffffff', padding: '15px', borderRadius: '14px', border: '1px solid #e5e7eb' };
const cascadeLabelStyle = { fontSize: '12px', color: '#6b7280', fontWeight: '600', letterSpacing: '1px' };
const inputCascadeStyle = { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px', color: '#1e293b', padding: '8px 12px', fontSize: '14px', outline: 'none' };
const cascadeValueStyle = { fontSize: '18px', color: '#1e293b', fontWeight: '500' };
