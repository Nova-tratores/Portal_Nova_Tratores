'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, ChevronUp, ChevronDown, Plus, X, Send, Loader2,
  AlertTriangle, CheckCircle2, XCircle, Clock, ArrowLeft, Camera, Factory,
  FileText, Download,
} from 'lucide-react';
import type { GarantiaResumo, OSElegivel, PecaOS } from '@/lib/garantias/types';
import { STATUS_LABEL, STATUS_COR } from '@/lib/garantias/constants';
import { tempoDecorrido, diasEntre, fmtMoeda } from '@/lib/garantias/format';

interface Props {
  tecnicoNome: string;
}

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 14,
  border: '1px solid #F1F5F9',
  padding: '12px 14px',
};

export default function MinhasGarantias({ tecnicoNome }: Props) {
  const [aberto, setAberto] = useState(true);
  const [garantias, setGarantias] = useState<GarantiaResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'lista' | 'nova'>('lista');

  // Resposta de pendência
  const [responderId, setResponderId] = useState<string | null>(null);
  const [respTexto, setRespTexto] = useState('');
  const [respImgs, setRespImgs] = useState<File[]>([]);
  const [respEnviando, setRespEnviando] = useState(false);

  const carregar = useCallback(async () => {
    if (!tecnicoNome) return;
    try {
      const res = await fetch(`/api/garantias?tecnico=${encodeURIComponent(tecnicoNome)}`);
      const data = await res.json();
      setGarantias(data.garantias || []);
    } catch {
      /* mantém */
    } finally {
      setLoading(false);
    }
  }, [tecnicoNome]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function responderPendencia(g: GarantiaResumo) {
    const pend = g.pendencias?.find((p) => p.status === 'aberta');
    if (!pend) return;
    if (!respTexto.trim() && respImgs.length === 0) {
      alert('Escreva uma resposta ou anexe ao menos uma imagem.');
      return;
    }
    setRespEnviando(true);
    try {
      const anexoIds: string[] = [];
      for (const img of respImgs) {
        const fd = new FormData();
        fd.append('file', img);
        fd.append('categoria', 'pendencia_resposta');
        fd.append('enviado_por', tecnicoNome);
        const up = await fetch(`/api/garantias/${g.id}/anexos`, { method: 'POST', body: fd });
        const upData = await up.json();
        if (up.ok && upData.anexo?.id) anexoIds.push(upData.anexo.id);
      }
      const res = await fetch(`/api/garantias/${g.id}/pendencias/${pend.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resposta_texto: respTexto, respondido_por: tecnicoNome, anexo_ids: anexoIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Falha ao enviar a resposta.');
        return;
      }
      setResponderId(null);
      setRespTexto('');
      setRespImgs([]);
      carregar();
    } finally {
      setRespEnviando(false);
    }
  }

  const totalAlerta = garantias.filter((g) => g.status === 'bo_tecnico' || g.status === 'info_pendente').length;

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Cabeçalho colapsável */}
      <button
        onClick={() => setAberto((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '14px 16px',
          borderRadius: aberto ? '14px 14px 0 0' : 14,
          border: '1px solid #F1F5F9',
          background: '#fff',
          cursor: 'pointer',
          fontSize: 15,
          fontWeight: 700,
          color: '#1E293B',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={18} color="#0EA5E9" />
          Minhas Garantias
          {totalAlerta > 0 && (
            <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: '#F59E0B', borderRadius: 10, padding: '1px 8px' }}>
              {totalAlerta}
            </span>
          )}
        </div>
        {aberto ? <ChevronUp size={18} color="#94A3B8" /> : <ChevronDown size={18} color="#94A3B8" />}
      </button>

      {aberto && (
        <div style={{ background: '#fff', borderRadius: '0 0 14px 14px', border: '1px solid #F1F5F9', borderTop: 'none', padding: 12 }}>
          {view === 'nova' ? (
            <NovaGarantia
              tecnicoNome={tecnicoNome}
              onCancel={() => setView('lista')}
              onCriada={() => {
                setView('lista');
                carregar();
              }}
            />
          ) : (
            <>
              <button
                onClick={() => setView('nova')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  width: '100%',
                  padding: '11px 0',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #0EA5E9, #0369A1)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  marginBottom: 12,
                }}
              >
                <Plus size={16} /> Solicitar Garantia
              </button>

              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 24, color: '#94A3B8' }}>
                  <Loader2 size={18} className="spin" />
                </div>
              ) : garantias.length === 0 ? (
                <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '12px 0', margin: 0 }}>
                  Você ainda não tem garantias.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {garantias.map((g) => {
                    const precisaAcao = g.status === 'bo_tecnico' || g.status === 'info_pendente';
                    const pendAberta = g.pendencias?.find((p) => p.status === 'aberta');
                    const naFabrica = g.status === 'enviada' || g.status === 'info_pendente';
                    return (
                      <div
                        key={g.id}
                        style={{
                          ...card,
                          borderLeft: `4px solid ${STATUS_COR[g.status]}`,
                          ...(precisaAcao ? { background: '#FFFBEB', borderColor: '#FDE68A' } : {}),
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#1E293B' }}>{g.numero}</span>
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              color: STATUS_COR[g.status],
                              background: STATUS_COR[g.status] + '1c',
                              padding: '3px 7px',
                              borderRadius: 6,
                            }}
                          >
                            {STATUS_LABEL[g.status]}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                          OS {g.id_ordem} · {g.cliente || 'Cliente'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                          {g.montadora && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#64748B' }}>
                              <Factory size={11} /> {g.montadora.nome}
                            </span>
                          )}
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#94A3B8' }}>
                            <Clock size={11} />
                            {naFabrica && g.enviada_fabrica_em
                              ? `${diasEntre(g.enviada_fabrica_em)}d na fábrica`
                              : `Aberta ${tempoDecorrido(g.created_at)}`}
                          </span>
                        </div>

                        {/* Arquivos da fábrica (SG enviado + retorno) */}
                        {(g.anexos || []).filter((a) => a.categoria === 'envio_fabrica' || a.categoria === 'retorno_fabrica').length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                            {(g.anexos || [])
                              .filter((a) => a.categoria === 'envio_fabrica' || a.categoria === 'retorno_fabrica')
                              .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
                              .map((a) => (
                                <a
                                  key={a.id}
                                  href={a.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '6px 10px', borderRadius: 8,
                                    background: a.categoria === 'envio_fabrica' ? '#EFF6FF' : '#F0FDF4',
                                    border: `1px solid ${a.categoria === 'envio_fabrica' ? '#BFDBFE' : '#BBF7D0'}`,
                                    fontSize: 12, fontWeight: 600,
                                    color: a.categoria === 'envio_fabrica' ? '#2563EB' : '#15803D',
                                    textDecoration: 'none',
                                  }}
                                >
                                  <FileText size={13} />
                                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {a.categoria === 'envio_fabrica' ? 'SG enviada' : 'Retorno da fábrica'}
                                    {a.nome_arquivo ? ` — ${a.nome_arquivo}` : ''}
                                  </span>
                                  <Download size={12} />
                                </a>
                              ))}
                          </div>
                        )}

                        {/* Desfecho */}
                        {g.status === 'aprovada' && (
                          <div
                            style={{
                              display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8,
                              padding: '8px 10px', borderRadius: 8, background: '#ECFDF5',
                              color: '#047857', fontSize: 12, fontWeight: 600,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <CheckCircle2 size={14} />
                              Garantia paga: {fmtMoeda(g.valor_pago_total)}
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 500, color: '#065F46' }}>
                              {g.garantista_horas || 0}h · {g.garantista_km || 0}km
                              {g.valor_pago_pecas != null && g.valor_pago_pecas > 0
                                ? ` · peças ${fmtMoeda(g.valor_pago_pecas)}`
                                : ''}
                            </div>
                          </div>
                        )}
                        {g.status === 'rejeitada' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '8px 10px', borderRadius: 8, background: '#FEF2F2', color: '#B91C1C', fontSize: 12, fontWeight: 600 }}>
                            <XCircle size={14} /> Garantia não paga
                          </div>
                        )}

                        {/* Pendência aberta — responder */}
                        {precisaAcao && pendAberta && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                              <strong style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                                <AlertTriangle size={13} />
                                {g.status === 'bo_tecnico' ? 'O garantista pediu (B.O.):' : 'A fábrica solicitou:'}
                              </strong>
                              {pendAberta.descricao}
                              {pendAberta.exige_visita && (
                                <div style={{ marginTop: 4, fontWeight: 700 }}>
                                  ⚠ É necessário ir até a propriedade do cliente.
                                </div>
                              )}
                            </div>
                            {responderId === g.id ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <textarea
                                  value={respTexto}
                                  onChange={(e) => setRespTexto(e.target.value)}
                                  placeholder="Escreva a resposta para o garantista..."
                                  rows={3}
                                  style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: 10,
                                    border: '1px solid #E2E8F0',
                                    fontSize: 13,
                                    resize: 'vertical',
                                    fontFamily: 'inherit',
                                    boxSizing: 'border-box',
                                    background: '#F8FAFC',
                                    outline: 'none',
                                  }}
                                />
                                <label
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    fontSize: 12,
                                    color: '#475569',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  <Camera size={15} /> Anexar fotos ({respImgs.length})
                                  <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    style={{ display: 'none' }}
                                    onChange={(e) => setRespImgs(Array.from(e.target.files || []))}
                                  />
                                </label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button
                                    onClick={() => responderPendencia(g)}
                                    disabled={respEnviando}
                                    style={{
                                      flex: 1,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: 6,
                                      padding: '10px 0',
                                      borderRadius: 10,
                                      border: 'none',
                                      background: '#1E3A5F',
                                      color: '#fff',
                                      fontSize: 13,
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    {respEnviando ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                                    Enviar resposta
                                  </button>
                                  <button
                                    onClick={() => {
                                      setResponderId(null);
                                      setRespTexto('');
                                      setRespImgs([]);
                                    }}
                                    style={{
                                      padding: '10px 14px',
                                      borderRadius: 10,
                                      border: 'none',
                                      background: '#F1F5F9',
                                      color: '#64748B',
                                      fontSize: 13,
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setResponderId(g.id);
                                  setRespTexto('');
                                  setRespImgs([]);
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                  width: '100%',
                                  padding: '10px 0',
                                  borderRadius: 10,
                                  border: 'none',
                                  background: '#F59E0B',
                                  color: '#fff',
                                  fontSize: 13,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                <Send size={14} /> Responder
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Fluxo de criação de garantia --------------------------------------------
function NovaGarantia({
  tecnicoNome,
  onCancel,
  onCriada,
}: {
  tecnicoNome: string;
  onCancel: () => void;
  onCriada: () => void;
}) {
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [osList, setOsList] = useState<OSElegivel[]>([]);
  const [osLoading, setOsLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [osSel, setOsSel] = useState<OSElegivel | null>(null);
  const [pecas, setPecas] = useState<PecaOS[]>([]);
  const [pecasLoading, setPecasLoading] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [horas, setHoras] = useState('');
  const [km, setKm] = useState('');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/garantias/os-elegiveis?tecnico=${encodeURIComponent(tecnicoNome)}`);
        const data = await res.json();
        setOsList(data.ordens || []);
      } catch {
        setOsList([]);
      } finally {
        setOsLoading(false);
      }
    })();
  }, [tecnicoNome]);

  async function escolherOS(os: OSElegivel) {
    setOsSel(os);
    setEtapa(2);
    setPecasLoading(true);
    try {
      const res = await fetch(`/api/garantias/os-pecas?os=${encodeURIComponent(os.id_ordem)}`);
      const data = await res.json();
      setPecas(data.pecas || []);
    } catch {
      setPecas([]);
    } finally {
      setPecasLoading(false);
    }
  }

  function toggle(i: number) {
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  }

  async function salvar() {
    if (!osSel) return;
    if (marcadas.size === 0) {
      alert('Selecione ao menos uma peça para a garantia.');
      return;
    }
    setSalvando(true);
    try {
      const pecasSel = [...marcadas].map((i) => pecas[i]);
      const res = await fetch('/api/garantias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_ordem: osSel.id_ordem,
          tecnico_nome: tecnicoNome,
          tecnico_horas: horas,
          tecnico_km: km,
          tecnico_obs: obs,
          pecas: pecasSel,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Falha ao solicitar garantia.');
        return;
      }
      onCriada();
    } finally {
      setSalvando(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #E2E8F0',
    fontSize: 13,
    boxSizing: 'border-box',
    background: '#F8FAFC',
    outline: 'none',
    fontFamily: 'inherit',
  };

  const osFiltradas = osList.filter((o) =>
    [o.id_ordem, o.cliente, o.chassis].some((v) => (v || '').toLowerCase().includes(busca.toLowerCase()))
  );

  return (
    <div>
      <button
        onClick={etapa === 1 ? onCancel : () => setEtapa(1)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: '#64748B', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 10, padding: 0 }}
      >
        <ArrowLeft size={15} /> {etapa === 1 ? 'Voltar' : 'Trocar OS'}
      </button>

      {etapa === 1 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 8 }}>
            1. Escolha a OS do serviço
          </div>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar OS, cliente ou chassi..."
            style={{ ...inputStyle, marginBottom: 10 }}
          />
          {osLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 20, color: '#94A3B8' }}>
              <Loader2 size={18} className="spin" />
            </div>
          ) : osFiltradas.length === 0 ? (
            <p style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', margin: '12px 0' }}>
              Nenhuma OS disponível para garantia.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
              {osFiltradas.map((o) => (
                <button
                  key={o.id_ordem}
                  onClick={() => escolherOS(o)}
                  style={{ ...card, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>
                    OS {o.id_ordem} — {o.cliente || 'Cliente'}
                  </span>
                  <span style={{ fontSize: 11, color: '#94A3B8' }}>
                    {o.chassis ? `Chassi ${o.chassis} · ` : ''}
                    {o.tipo_servico || o.serv_solicitado || ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {etapa === 2 && osSel && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 4 }}>
            2. Peças que precisam de garantia
          </div>
          <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 10 }}>
            OS {osSel.id_ordem} — {osSel.cliente}
          </div>

          {pecasLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 20, color: '#94A3B8' }}>
              <Loader2 size={18} className="spin" />
            </div>
          ) : pecas.length === 0 ? (
            <p style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', margin: '12px 0' }}>
              Esta OS não tem peças vinculadas (PPV ou relatório técnico).
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {pecas.map((p, i) => {
                const sel = marcadas.has(i);
                return (
                  <button
                    key={`${p.cod_produto || ''}-${i}`}
                    onClick={() => toggle(i)}
                    style={{
                      ...card,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      textAlign: 'left',
                      borderColor: sel ? '#0EA5E9' : '#F1F5F9',
                      background: sel ? '#F0F9FF' : '#fff',
                    }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        border: `2px solid ${sel ? '#0EA5E9' : '#CBD5E1'}`,
                        background: sel ? '#0EA5E9' : '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {sel && <CheckCircle2 size={14} color="#fff" />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1E293B' }}>
                        {p.cod_produto ? `${p.cod_produto} · ` : ''}
                        {p.descricao}
                      </div>
                      <div style={{ fontSize: 11, color: '#94A3B8' }}>Qtd: {p.quantidade}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input value={horas} onChange={(e) => setHoras(e.target.value)} type="number" placeholder="Horas" style={inputStyle} />
            <input value={km} onChange={(e) => setKm(e.target.value)} type="number" placeholder="KM" style={inputStyle} />
          </div>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Observações (opcional)"
            rows={2}
            style={{ ...inputStyle, marginBottom: 10, resize: 'vertical' }}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={salvar}
              disabled={salvando || marcadas.size === 0}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '11px 0',
                borderRadius: 10,
                border: 'none',
                background: marcadas.size === 0 ? '#CBD5E1' : 'linear-gradient(135deg, #0EA5E9, #0369A1)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                cursor: salvando || marcadas.size === 0 ? 'default' : 'pointer',
              }}
            >
              {salvando ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />}
              Solicitar garantia ({marcadas.size})
            </button>
            <button
              onClick={onCancel}
              style={{ padding: '11px 16px', borderRadius: 10, border: 'none', background: '#F1F5F9', color: '#64748B', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
