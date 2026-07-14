'use client';
// Ficha do Veículo — o coração do Frota. Tudo vem de UMA chamada local
// (/api/frota/veiculos/[placa]): os espelhos já estão no banco, então não há
// espera de API externa aqui.
import { useCallback, useEffect, useState } from 'react';
import {
  Car, X, ShieldAlert, User as UserIcon, Wrench, Fuel, DollarSign,
  Loader2, Pencil, Check, History, Gauge, Satellite, AlertTriangle,
} from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import { formatarPlaca } from '@/lib/frota/placa';
import type { Motorista, VeiculoDetalhe } from '@/lib/frota/tipos';

interface Props {
  placa: string;
  podeEditar: boolean;
  podeResponsavel: boolean;
  onClose: () => void;
  onMudou?: () => void;
}

const fmtRS = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = (s: string | null | undefined) =>
  s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR') : '—';

function Secao({ titulo, icone, children }: { titulo: string; icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {icone}{titulo}
      </div>
      {children}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5 }}>
      <span style={{ color: 'var(--portal-text-muted)' }}>{rotulo}</span>
      <span style={{ color: 'var(--portal-text)', fontWeight: 600, textAlign: 'right' }}>{valor ?? '—'}</span>
    </div>
  );
}

const STATUS_MULTA: Record<string, { label: string; cor: string; bg: string }> = {
  nova: { label: 'Nova', cor: '#b45309', bg: '#fef3c7' },
  em_analise: { label: 'Em análise', cor: '#1d4ed8', bg: '#dbeafe' },
  em_defesa: { label: 'Em defesa', cor: '#7c3aed', bg: '#ede9fe' },
  paga: { label: 'Paga', cor: '#15803d', bg: '#dcfce7' },
  descontada: { label: 'Descontada', cor: '#0f766e', bg: '#ccfbf1' },
  arquivada: { label: 'Arquivada', cor: '#64748b', bg: '#f1f5f9' },
};

export default function VeiculoDrawer({ placa, podeEditar, podeResponsavel, onClose, onMudou }: Props) {
  const [det, setDet] = useState<VeiculoDetalhe | null>(null);
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState('');

  // edição de campo da ficha
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  // troca de responsável
  const [trocando, setTrocando] = useState(false);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [novoResp, setNovoResp] = useState('');
  const [novoRespId, setNovoRespId] = useState('');

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const r = await fetch(`/api/frota/veiculos/${encodeURIComponent(placa)}`, { headers: await authHeaders() });
      const d = await r.json();
      if (!r.ok) { setErro(d.error || 'Falha ao carregar.'); return; }
      setDet(d);
    } catch (e) { setErro(String(e)); }
  }, [placa]);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirEdicao = () => {
    if (!det) return;
    const v = det.veiculo;
    setForm({
      marca: v.marca || '', modelo: v.modelo || '', descricao: v.descricao || '',
      ano: v.ano != null ? String(v.ano) : '', cor: v.cor || '',
      chassi: v.chassi || '', renavam: v.renavam || '', combustivel: v.combustivel || '',
      categoria: v.categoria || 'outros', status: v.status || 'ativo',
      seguradora: v.seguradora || '', numero_apolice: v.numero_apolice || '',
      observacoes: v.observacoes || '',
    });
    setEditando(true);
  };

  const salvarEdicao = async () => {
    setBusy('editar');
    try {
      const payload: Record<string, unknown> = { ...form };
      if (form.ano !== undefined) payload.ano = form.ano === '' ? null : Number(form.ano);
      const r = await fetch(`/api/frota/veiculos/${encodeURIComponent(placa)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Falha ao salvar.'); return; }
      setEditando(false);
      await carregar();
      onMudou?.();
    } finally { setBusy(''); }
  };

  const abrirTroca = async () => {
    setTrocando(true);
    setNovoResp(''); setNovoRespId('');
    try {
      const r = await fetch('/api/frota/motoristas', { headers: await authHeaders() });
      const d = await r.json();
      setMotoristas(d.motoristas || []);
    } catch { /* seletor fica vazio; dá pra digitar o nome */ }
  };

  const salvarResponsavel = async () => {
    setBusy('responsavel');
    try {
      const r = await fetch(`/api/frota/veiculos/${encodeURIComponent(placa)}/responsavel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ nome: novoResp, motorista_id: novoRespId || null }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Falha ao trocar o responsável.'); return; }
      setTrocando(false);
      await carregar();
      onMudou?.();
    } finally { setBusy(''); }
  };

  const v = det?.veiculo;
  const respAtual = det?.responsaveis.find((r) => r.fim === null) || null;
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 12.5,
    border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)',
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 900, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(640px, 100%)', height: '100%', background: 'var(--portal-bg)', display: 'flex', flexDirection: 'column', boxShadow: '-10px 0 40px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--portal-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          {det?.imagem_url ? (
            <img src={det.imagem_url} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', background: 'var(--portal-bg-secondary)' }} />
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: 10, background: 'linear-gradient(135deg,#0D9488,#0F766E)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Car size={26} color="#fff" />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 20, fontWeight: 800, color: 'var(--portal-text)' }}>{formatarPlaca(placa)}</strong>
              {v?.tem_rastreador && (
                <span title="Tem rastreador (Rota Exata)" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: '#0f766e', background: '#ccfbf1', borderRadius: 999, padding: '2px 8px' }}>
                  <Satellite size={11} /> RASTREADO
                </span>
              )}
              {v && !v.ativo && (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#b91c1c', background: '#fee2e2', borderRadius: 999, padding: '2px 8px' }}>INATIVO</span>
              )}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>
              {[v?.marca, v?.modelo || v?.descricao, v?.ano].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)' }}><X size={20} /></button>
        </div>

        {/* Corpo */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {erro && <div style={{ color: '#b91c1c', fontSize: 13 }}>{erro}</div>}
          {!det && !erro && <div style={{ color: 'var(--portal-text-muted)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={14} className="spin" /> Carregando…</div>}

          {det && v && (
            <>
              {/* Identificação */}
              <Secao titulo="Identificação" icone={<Car size={14} />}>
                {!editando ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px' }}>
                      <Linha rotulo="Marca / Modelo" valor={[v.marca, v.modelo].filter(Boolean).join(' ') || v.descricao} />
                      <Linha rotulo="Ano" valor={v.ano} />
                      <Linha rotulo="Cor" valor={v.cor} />
                      <Linha rotulo="Combustível" valor={v.combustivel} />
                      <Linha rotulo="Chassi" valor={v.chassi} />
                      <Linha rotulo="RENAVAM" valor={v.renavam} />
                      <Linha rotulo="Categoria" valor={v.categoria} />
                      <Linha rotulo="Status" valor={v.status} />
                      <Linha rotulo="Hodômetro (rastreador)" valor={det.km_odometro != null ? `${det.km_odometro.toLocaleString('pt-BR')} km` : '—'} />
                      <Linha rotulo="Tanque" valor={v.capacidade_tanque != null ? `${v.capacidade_tanque} L` : '—'} />
                      <Linha rotulo="Seguradora" valor={v.seguradora} />
                      <Linha rotulo="Apólice" valor={v.numero_apolice} />
                    </div>
                    {v.observacoes && <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)' }}>{v.observacoes}</div>}
                    {podeEditar && (
                      <button onClick={abrirEdicao} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text-secondary)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                        <Pencil size={11} /> Editar ficha
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {([
                        ['marca', 'Marca'], ['modelo', 'Modelo'], ['ano', 'Ano'], ['cor', 'Cor'],
                        ['chassi', 'Chassi'], ['renavam', 'RENAVAM'], ['combustivel', 'Combustível'],
                        ['seguradora', 'Seguradora'], ['numero_apolice', 'Apólice'],
                      ] as [string, string][]).map(([campo, rotulo]) => (
                        <label key={campo} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10.5, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase' }}>
                          {rotulo}
                          <input value={form[campo] || ''} onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))} style={inputStyle} />
                        </label>
                      ))}
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10.5, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase' }}>
                        Categoria
                        <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} style={inputStyle}>
                          {['comercial', 'oficina', 'diretoria', 'apoio', 'outros'].map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10.5, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase' }}>
                        Status
                        <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={inputStyle}>
                          {['ativo', 'manutencao', 'parado', 'vendido', 'locado'].map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </label>
                    </div>
                    <textarea value={form.observacoes || ''} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} placeholder="Observações" rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                    <div style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                      Campo que você editar fica <strong>travado contra o sync</strong> da Rota Exata (o valor manual vence).
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={salvarEdicao} disabled={busy === 'editar'} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, border: 'none', background: '#0d9488', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        {busy === 'editar' ? <Loader2 size={12} className="spin" /> : <Check size={12} />} Salvar
                      </button>
                      <button onClick={() => setEditando(false)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text-secondary)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                    </div>
                  </>
                )}
              </Secao>

              {/* Responsável */}
              <Secao titulo="Responsável" icone={<UserIcon size={14} />}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text)' }}>
                      {respAtual?.motorista_nome || 'Sem responsável'}
                    </div>
                    {respAtual && (
                      <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>
                        desde {fmtData(respAtual.inicio)} · origem: {respAtual.origem}
                      </div>
                    )}
                  </div>
                  {podeResponsavel && !trocando && (
                    <button onClick={abrirTroca} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text-secondary)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                      Trocar responsável
                    </button>
                  )}
                </div>

                {trocando && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)' }}>
                    <select
                      value={novoRespId}
                      onChange={(e) => {
                        setNovoRespId(e.target.value);
                        const m = motoristas.find((x) => x.id === e.target.value);
                        if (m) setNovoResp(m.nome);
                      }}
                      style={inputStyle}
                    >
                      <option value="">— escolher da lista (Rota Exata) —</option>
                      {motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.cargo ? ` · ${m.cargo}` : ''}</option>)}
                    </select>
                    <input value={novoResp} onChange={(e) => { setNovoResp(e.target.value); setNovoRespId(''); }} placeholder="…ou digite o nome (vazio = sem responsável)" style={inputStyle} />
                    <div style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                      A troca aqui <strong>propaga para o resto do portal</strong> (rotas, supervisor de vendas). O período anterior fica no histórico.
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={salvarResponsavel} disabled={busy === 'responsavel'} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, border: 'none', background: '#0d9488', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        {busy === 'responsavel' ? <Loader2 size={12} className="spin" /> : <Check size={12} />} Confirmar troca
                      </button>
                      <button onClick={() => setTrocando(false)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text-secondary)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                    </div>
                  </div>
                )}

                {det.responsaveis.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)' }}>
                      <History size={11} /> HISTÓRICO
                    </div>
                    {det.responsaveis.slice(0, 6).map((r) => (
                      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--portal-text-secondary)' }}>
                        <span>{r.motorista_nome || '—'}</span>
                        <span>{fmtData(r.inicio)} → {r.fim ? fmtData(r.fim) : 'atual'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Secao>

              {/* Custos 12m */}
              <Secao titulo="Custos (últimos 12 meses)" icone={<DollarSign size={14} />}>
                {det.custos_12m.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>Sem custos registrados.</span>
                ) : (
                  <>
                    {det.custos_12m.map((c) => <Linha key={c.tipo} rotulo={c.tipo} valor={fmtRS(c.total)} />)}
                    <div style={{ borderTop: '1px dashed var(--portal-border)', paddingTop: 6 }}>
                      <Linha rotulo="Total 12m" valor={<strong style={{ color: '#0d9488' }}>{fmtRS(det.custos_12m.reduce((s, c) => s + c.total, 0))}</strong>} />
                    </div>
                  </>
                )}
              </Secao>

              {/* Multas */}
              <Secao titulo={`Multas (${det.multas.length})`} icone={<ShieldAlert size={14} />}>
                {det.multas.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>Nenhuma multa registrada. 🎉</span>
                ) : det.multas.map((m) => {
                  const st = STATUS_MULTA[m.status_interno] || STATUS_MULTA.nova;
                  return (
                    <div key={m.id} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <strong style={{ fontSize: 12.5, color: 'var(--portal-text)' }}>{fmtData(m.dt_multa)} · {fmtRS(m.valor)} · {m.pontos ?? 0} pts</strong>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: st.cor, background: st.bg, borderRadius: 999, padding: '2px 8px' }}>{st.label}</span>
                      </div>
                      <span style={{ fontSize: 11.5, color: 'var(--portal-text-secondary)' }}>
                        {m.motorista_nome ? `Motorista: ${m.motorista_nome}` : 'Motorista não identificado'}
                        {m.motorista_divergente && (
                          <span title="O motorista carimbado pela Rota Exata difere do responsável vigente na data" style={{ color: '#b45309', marginLeft: 6 }}>
                            <AlertTriangle size={11} style={{ verticalAlign: '-2px' }} /> divergente
                          </span>
                        )}
                      </span>
                      {m.local_endereco && <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>{m.local_endereco}</span>}
                    </div>
                  );
                })}
              </Secao>

              {/* Manutenções */}
              <Secao titulo={`Manutenções (${det.manutencoes.length})`} icone={<Wrench size={14} />}>
                {det.manutencoes.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>Nenhuma manutenção registrada.</span>
                ) : det.manutencoes.slice(0, 8).map((m) => (
                  <div key={`${m.origem}-${m.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--portal-text-secondary)' }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fmtData(m.data)} ·{' '}
                      {m.origem === 'requisicao' ? (
                        <a href={`/requisicoes?req=${m.id}`} title="Abrir a requisição" style={{ color: '#0d9488', textDecoration: 'none', fontWeight: 600 }}>
                          {m.descricao || m.tipo || '—'}
                        </a>
                      ) : (
                        m.descricao || m.tipo || '—'
                      )}
                      <span style={{ color: 'var(--portal-text-muted)' }}> ({m.origem === 'requisicao' ? 'requisição' : m.origem})</span>
                    </span>
                    <strong style={{ color: 'var(--portal-text)' }}>{fmtRS(m.valor_total)}</strong>
                  </div>
                ))}
              </Secao>

              {/* Abastecimentos recentes */}
              <Secao titulo="Abastecimentos recentes" icone={<Fuel size={14} />}>
                {det.abastecimentos.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>Nenhum abastecimento.</span>
                ) : det.abastecimentos.map((a, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--portal-text-secondary)' }}>
                    <span>{fmtData(a.data_transacao)} · {Number(a.litros).toFixed(1)} L{a.posto_nome ? ` · ${a.posto_nome}` : ''}</span>
                    <strong style={{ color: 'var(--portal-text)' }}>{fmtRS(Number(a.valor_total))}</strong>
                  </div>
                ))}
                <a href={`/frota/abastecimento?placa=${encodeURIComponent(placa)}`} style={{ fontSize: 11.5, color: '#0d9488', fontWeight: 600, textDecoration: 'none' }}>
                  Ver tudo no Abastecimento →
                </a>
              </Secao>

              {/* Rodapé técnico */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--portal-text-faint)' }}>
                <Gauge size={11} />
                {v.tem_rastreador
                  ? `Sincronizado com a Rota Exata${v.visto_em ? ` · visto em ${new Date(v.visto_em).toLocaleString('pt-BR')}` : ''}`
                  : 'Sem rastreador — ignição/trajetos indisponíveis para este veículo.'}
                {(v.campos_manuais || []).length > 0 && ` · campos travados: ${v.campos_manuais.join(', ')}`}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
