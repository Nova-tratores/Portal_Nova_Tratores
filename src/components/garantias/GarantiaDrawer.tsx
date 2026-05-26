'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  X, Loader2, ExternalLink, Package, ShieldCheck, Factory, Send,
  AlertTriangle, CheckCircle2, XCircle, Save, History, FileWarning, MapPin,
} from 'lucide-react';
import type { GarantiaDetalhe, Montadora, ChecklistField } from '@/lib/garantias/types';
import { STATUS_LABEL, STATUS_COR } from '@/lib/garantias/constants';
import { camposObrigatoriosFaltando } from '@/lib/garantias/checklist';
import { fmtDataHora, fmtMoeda, diasEntre } from '@/lib/garantias/format';
import ChecklistRenderer from './ChecklistRenderer';
import MontadoraPicker from './MontadoraPicker';
import GarantiaFotosOS from './GarantiaFotosOS';
import GarantiaAnexos from './GarantiaAnexos';
import ValoresComparativo from './ValoresComparativo';
import GarantiaTimeline from './GarantiaTimeline';

interface Props {
  garantiaId: string;
  userName: string;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}

function Secao({ titulo, icone, children }: { titulo: string; icone?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--portal-bg-card)',
        border: '1px solid var(--portal-border)',
        borderRadius: 12,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {icone}
        {titulo}
      </div>
      {children}
    </div>
  );
}

const btn = (bg: string, disabled?: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '9px 14px',
  borderRadius: 9,
  border: 'none',
  background: bg,
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.55 : 1,
});

const taStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--portal-border)',
  background: 'var(--portal-bg-input)',
  color: 'var(--portal-text)',
  fontSize: 13,
  fontFamily: 'inherit',
  resize: 'vertical',
  outline: 'none',
};

export default function GarantiaDrawer({ garantiaId, userName, userId, onClose, onSaved }: Props) {
  const [g, setG] = useState<GarantiaDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [erro, setErro] = useState('');
  const [verTimeline, setVerTimeline] = useState(false);

  // Estado editável (análise)
  const [respostas, setRespostas] = useState<Record<string, unknown>>({});
  const [gHoras, setGHoras] = useState<string>('');
  const [gKm, setGKm] = useState<string>('');
  const [gObs, setGObs] = useState('');

  // Devolução ao técnico
  const [boTexto, setBoTexto] = useState('');
  const [boVisita, setBoVisita] = useState(false);

  // Finalização
  const [motivoRecusa, setMotivoRecusa] = useState('');
  const [pecasAprovadas, setPecasAprovadas] = useState<Set<string>>(new Set());

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/garantias/${garantiaId}`);
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error || 'Falha ao carregar garantia.');
        return;
      }
      const det: GarantiaDetalhe = data.garantia;
      setG(det);
      setRespostas((det.checklist_respostas as Record<string, unknown>) || {});
      setGHoras(det.garantista_horas != null ? String(det.garantista_horas) : '');
      setGKm(det.garantista_km != null ? String(det.garantista_km) : '');
      setGObs(det.garantista_obs || '');
      // Default: todas as peças marcadas como aprovadas. Após finalizar, respeita o resultado salvo.
      const aprovadasIds = det.pecas
        .filter((p) => (det.status === 'aprovada' || det.status === 'rejeitada') ? p.resultado === 'aprovada' : true)
        .map((p) => p.id);
      setPecasAprovadas(new Set(aprovadasIds));
    } catch {
      setErro('Erro de conexão.');
    } finally {
      setLoading(false);
    }
  }, [garantiaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function uploadChecklistFile(file: File): Promise<string> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('categoria', 'garantista');
    fd.append('enviado_por', userName);
    const res = await fetch(`/api/garantias/${garantiaId}/anexos`, { method: 'POST', body: fd });
    const data = await res.json();
    return data.anexo?.url || '';
  }

  async function chamar(acao: string, url: string, opts: RequestInit) {
    setBusy(acao);
    setErro('');
    try {
      const res = await fetch(url, opts);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data.error || 'Falha na operação.');
        return false;
      }
      await carregar();
      onSaved();
      return true;
    } catch {
      setErro('Erro de conexão.');
      return false;
    } finally {
      setBusy('');
    }
  }

  const assumir = () =>
    chamar('assumir', `/api/garantias/${garantiaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'assumir', garantista_nome: userName, garantista_user_id: userId }),
    });

  const selecionarMontadora = (m: Montadora | null) =>
    chamar('montadora', `/api/garantias/${garantiaId}/checklist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ montadora_id: m?.id || null, garantista_nome: userName }),
    });

  const salvarAnalise = () =>
    chamar('analise', `/api/garantias/${garantiaId}/checklist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checklist_respostas: respostas,
        garantista_horas: gHoras,
        garantista_km: gKm,
        garantista_obs: gObs,
        garantista_nome: userName,
      }),
    });

  const enviarFabrica = async () => {
    await salvarAnalise();
    await chamar('enviar', `/api/garantias/${garantiaId}/enviar-fabrica`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garantista_nome: userName }),
    });
  };

  const abrirPendencia = (tipo: 'bo' | 'info_fabrica') =>
    chamar('pendencia', `/api/garantias/${garantiaId}/pendencias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, descricao: boTexto, exige_visita: boVisita, criado_por: userName }),
    }).then((ok) => {
      if (ok) {
        setBoTexto('');
        setBoVisita(false);
      }
    });

  const finalizar = (resultado: 'aprovada' | 'rejeitada') =>
    chamar('finalizar', `/api/garantias/${garantiaId}/finalizar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resultado,
        motivo_recusa: motivoRecusa,
        garantista_horas: gHoras,
        garantista_km: gKm,
        garantista_obs: gObs,
        garantista_nome: userName,
        pecas_aprovadas: resultado === 'aprovada' ? [...pecasAprovadas] : [],
      }),
    });

  // ---- Render ----
  const campos: ChecklistField[] = g?.checklist_snapshot || g?.montadora?.checklist_def || [];
  const faltando = camposObrigatoriosFaltando(campos, respostas);
  const emAnalise = g?.status === 'em_analise';
  const naFabrica = g?.status === 'enviada';
  const finalizada = g?.status === 'aprovada' || g?.status === 'rejeitada';
  const aguardandoTec = g?.status === 'bo_tecnico' || g?.status === 'info_pendente';
  const pendenciaAberta = g?.pendencias?.find((p) => p.status === 'aberta') || null;
  const temRetornoFabrica = !!g?.retorno_fabrica_url;

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 900, display: 'flex', justifyContent: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)',
          height: '100%',
          background: 'var(--portal-bg)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-10px 0 40px rgba(0,0,0,0.3)',
        }}
      >
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text-muted)' }}>
            <Loader2 size={22} className="spin" />
          </div>
        ) : !g ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text-muted)', flexDirection: 'column', gap: 10 }}>
            {erro || 'Garantia não encontrada.'}
            <button onClick={onClose} style={btn('#64748b')}>Fechar</button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                borderBottom: '1px solid var(--portal-border)',
                background: 'var(--portal-bg-card)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--portal-text)' }}>{g.numero}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: STATUS_COR[g.status],
                    background: STATUS_COR[g.status] + '1c',
                    padding: '3px 8px',
                    borderRadius: 6,
                  }}
                >
                  {STATUS_LABEL[g.status]}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setVerTimeline((v) => !v)}
                  title="Histórico"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: verTimeline ? '#0ea5e9' : 'var(--portal-text-muted)' }}
                >
                  <History size={19} />
                </button>
                <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)' }}>
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {erro && (
                <div style={{ fontSize: 12, color: '#dc2626', background: '#dc262615', padding: '8px 10px', borderRadius: 8 }}>
                  {erro}
                </div>
              )}

              {verTimeline && (
                <Secao titulo="Histórico" icone={<History size={14} />}>
                  <GarantiaTimeline eventos={g.eventos} />
                </Secao>
              )}

              {/* Dados da OS / máquina */}
              <Secao titulo="Ordem de serviço" icone={<ShieldCheck size={14} />}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 13 }}>
                  <Campo label="Cliente" valor={g.cliente} />
                  <Campo label="OS" valor={g.id_ordem} />
                  <Campo label="Chassi" valor={g.chassis} />
                  <Campo label="Modelo" valor={g.modelo} />
                  <Campo label="Técnico" valor={g.tecnico_nome} />
                  <Campo label="Garantista" valor={g.garantista_nome} />
                </div>
                <a
                  href={`/pos?id=${g.id_ordem}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#0ea5e9', fontWeight: 600 }}
                >
                  <ExternalLink size={13} /> Abrir OS no Pós-Vendas
                </a>
              </Secao>

              {/* Peças selecionadas pelo técnico */}
              <Secao titulo={`Peças solicitadas (${g.pecas.length})`} icone={<Package size={14} />}>
                {g.pecas.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>Nenhuma peça vinculada.</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {g.pecas.map((p) => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--portal-text)', padding: '4px 0', borderBottom: '1px solid var(--portal-border)' }}>
                        <span>
                          {p.cod_produto ? `${p.cod_produto} · ` : ''}
                          {p.descricao}
                        </span>
                        <span style={{ color: 'var(--portal-text-muted)', whiteSpace: 'nowrap' }}>x{p.quantidade}</span>
                      </div>
                    ))}
                  </div>
                )}
                {g.tecnico_obs && (
                  <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', background: 'var(--portal-bg-secondary)', padding: '6px 8px', borderRadius: 6 }}>
                    <strong>Obs. do técnico:</strong> {g.tecnico_obs}
                  </div>
                )}
              </Secao>

              {/* Fotos da OS */}
              <Secao titulo="Fotos da OS (para enviar à fábrica)" icone={<Package size={14} />}>
                <GarantiaFotosOS osId={g.id_ordem} />
              </Secao>

              {/* Pendência aberta (aguardando técnico) */}
              {pendenciaAberta && (
                <div style={{ background: '#f59e0b15', border: '1px solid #f59e0b55', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#b45309', textTransform: 'uppercase' }}>
                    <AlertTriangle size={14} />
                    {pendenciaAberta.tipo === 'bo' ? 'B.O. — aguardando o técnico' : 'Pendência da fábrica — aguardando o técnico'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--portal-text)' }}>{pendenciaAberta.descricao}</div>
                  {pendenciaAberta.exige_visita && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#b45309' }}>
                      <MapPin size={12} /> Solicitada visita à propriedade do cliente
                    </span>
                  )}
                </div>
              )}

              {/* Assumir */}
              {g.status === 'aberta' && (
                <button onClick={assumir} disabled={!!busy} style={btn('linear-gradient(135deg,#dc2626,#7f1d1d)', !!busy)}>
                  {busy === 'assumir' ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />}
                  Assumir análise da garantia
                </button>
              )}

              {/* Montadora + Checklist */}
              {(emAnalise || naFabrica || finalizada || aguardandoTec) && g.status !== 'aberta' && (
                <Secao titulo="Montadora e checklist" icone={<Factory size={14} />}>
                  <MontadoraPicker
                    montadoraId={g.montadora_id}
                    onSelect={selecionarMontadora}
                    disabled={!emAnalise || !!busy}
                  />
                  {g.montadora_id && (
                    <ChecklistRenderer
                      campos={campos}
                      valores={respostas}
                      readOnly={!emAnalise}
                      onChange={emAnalise ? (id, v) => setRespostas((r) => ({ ...r, [id]: v })) : undefined}
                      onUpload={uploadChecklistFile}
                    />
                  )}
                </Secao>
              )}

              {/* Valores técnico x garantista */}
              {g.status !== 'aberta' && (
                <Secao titulo="Horas e KM — técnico x garantista" icone={<ShieldCheck size={14} />}>
                  <ValoresComparativo
                    tecnicoHoras={g.tecnico_horas}
                    tecnicoKm={g.tecnico_km}
                    garantistaHoras={gHoras}
                    garantistaKm={gKm}
                    onChange={emAnalise || naFabrica ? (campo, v) => (campo === 'horas' ? setGHoras(v) : setGKm(v)) : undefined}
                  />
                  {(emAnalise || naFabrica) && (
                    <textarea
                      placeholder="Observações do garantista (ajustes de valor, justificativas...)"
                      value={gObs}
                      onChange={(e) => setGObs(e.target.value)}
                      rows={2}
                      style={taStyle}
                    />
                  )}
                </Secao>
              )}

              {/* Ações em análise */}
              {emAnalise && (
                <>
                  <button onClick={salvarAnalise} disabled={!!busy} style={btn('#475569', !!busy)}>
                    {busy === 'analise' ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
                    Salvar análise
                  </button>

                  <Secao titulo="Devolver ao técnico (B.O.)" icone={<FileWarning size={14} />}>
                    <textarea
                      placeholder="Descreva o que está faltando para o técnico..."
                      value={boTexto}
                      onChange={(e) => setBoTexto(e.target.value)}
                      rows={3}
                      style={taStyle}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--portal-text-secondary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={boVisita} onChange={(e) => setBoVisita(e.target.checked)} />
                      Solicitar visita à propriedade do cliente
                    </label>
                    <button
                      onClick={() => abrirPendencia('bo')}
                      disabled={!!busy || !boTexto.trim()}
                      style={btn('#f59e0b', !!busy || !boTexto.trim())}
                    >
                      <AlertTriangle size={15} /> Marcar como B.O.
                    </button>
                  </Secao>

                  <button
                    onClick={enviarFabrica}
                    disabled={!!busy || !g.montadora_id || faltando.length > 0}
                    style={btn('linear-gradient(135deg,#8b5cf6,#6d28d9)', !!busy || !g.montadora_id || faltando.length > 0)}
                  >
                    {busy === 'enviar' ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
                    Enviar à fábrica
                  </button>
                  {(!g.montadora_id || faltando.length > 0) && (
                    <span style={{ fontSize: 11, color: 'var(--portal-text-muted)', textAlign: 'center' }}>
                      {!g.montadora_id
                        ? 'Defina a montadora para enviar à fábrica.'
                        : `Preencha os campos obrigatórios: ${faltando.join(', ')}`}
                    </span>
                  )}
                </>
              )}

              {/* Solicitação de Garantia (SG) — disponível em qualquer fase após assumir */}
              {g.status !== 'aberta' && g.montadora && (
                <Secao titulo="Solicitação de Garantia (SG)" icone={<Send size={14} />}>
                  {(() => {
                    const eMahindra = g.montadora?.tipo_template === 'mahindra';
                    const sgAnexos = g.anexos
                      .filter((a) => a.categoria === 'envio_fabrica')
                      .sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
                    const maisRecente = sgAnexos[0];
                    const temEmails = (g.montadora?.email_destinatarios?.length || 0) > 0;

                    // Caso: montadora ainda sem template configurado
                    if (!eMahindra) {
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <span style={{ fontSize: 12, color: '#dc2626' }}>
                            A montadora <strong>{g.montadora.nome}</strong> ainda não tem template SG configurado.
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                            Vá em <strong>/garantias → aba Montadoras → editar {g.montadora.nome}</strong> e defina
                            o campo <strong>&quot;Formato do arquivo&quot; = Mahindra (SG xlsx)</strong>. Depois cadastre os
                            e-mails da fábrica.
                          </span>
                        </div>
                      );
                    }

                    const tipoGarantiaAtual = (respostas['tipo_garantia_sg'] as string) || 'produto_garantia';

                    const trocarTipoGarantia = async (novo: string) => {
                      const novasRespostas = { ...respostas, tipo_garantia_sg: novo };
                      setRespostas(novasRespostas);
                      await chamar('tipo_garantia', `/api/garantias/${garantiaId}/checklist`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          checklist_respostas: novasRespostas,
                          garantista_nome: userName,
                        }),
                      });
                    };

                    return (
                      <>
                        <p style={{ fontSize: 12, color: 'var(--portal-text-secondary)', margin: 0 }}>
                          Baixe a SG abaixo, revise/edite no Excel se precisar e anexe a versão revisada.
                          Ao enviar por e-mail, a versão mais recente é que vai pra fábrica.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                            Tipo de Garantia
                          </label>
                          <select
                            value={tipoGarantiaAtual}
                            onChange={(e) => trocarTipoGarantia(e.target.value)}
                            disabled={!!busy}
                            style={{
                              padding: '8px 10px',
                              borderRadius: 8,
                              border: '1px solid var(--portal-border)',
                              background: 'var(--portal-bg-input)',
                              color: 'var(--portal-text)',
                              fontSize: 13,
                              outline: 'none',
                            }}
                          >
                            <option value="produto_garantia">Produto em Garantia</option>
                            <option value="pre_venda">Solicitação de Pré-venda</option>
                            <option value="garantia_especial">Garantia Especial (Cortesia)</option>
                            <option value="garantia_pecas">Garantia de Peças</option>
                          </select>
                          <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                            Define qual quadradinho será marcado na SG. Alterar aqui regera o arquivo na próxima geração.
                          </span>
                        </div>

                        <GarantiaAnexos
                          garantiaId={g.id}
                          anexos={sgAnexos}
                          uploadCategoria="envio_fabrica"
                          enviadoPor={userName}
                          onChange={carregar}
                          vazioTexto="Nenhuma SG gerada ainda."
                        />

                        {!maisRecente && (
                          <button
                            onClick={() =>
                              chamar('gerar_sg', `/api/garantias/${garantiaId}/enviar-sg`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ ator: userName, apenasGerar: true }),
                              })
                            }
                            disabled={!!busy}
                            style={btn('#475569', !!busy)}
                          >
                            {busy === 'gerar_sg' ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
                            Gerar SG (xlsx)
                          </button>
                        )}

                        {naFabrica && temEmails && (
                          <>
                            <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                              Destinatários: {g.montadora.email_destinatarios.join(', ')}
                            </span>
                            <button
                              onClick={() =>
                                chamar('enviar_sg', `/api/garantias/${garantiaId}/enviar-sg`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ ator: userName }),
                                })
                              }
                              disabled={!!busy || !maisRecente}
                              style={btn('linear-gradient(135deg,#dc2626,#7f1d1d)', !!busy || !maisRecente)}
                            >
                              {busy === 'enviar_sg' ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
                              Enviar SG por e-mail à fábrica
                            </button>
                          </>
                        )}
                        {naFabrica && !temEmails && (
                          <span style={{ fontSize: 11, color: '#dc2626' }}>
                            Cadastre os e-mails da fábrica em Montadoras → {g.montadora.nome} para liberar o envio.
                          </span>
                        )}
                        {!naFabrica && (
                          <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                            O envio por e-mail fica disponível quando a garantia for enviada à fábrica.
                          </span>
                        )}
                      </>
                    );
                  })()}
                </Secao>
              )}

              {/* Em análise da fábrica */}
              {naFabrica && (
                <>
                  <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', textAlign: 'center' }}>
                    Enviada à fábrica em {fmtDataHora(g.enviada_fabrica_em)} · {diasEntre(g.enviada_fabrica_em)} dia(s) em análise
                  </div>

                  <Secao titulo="Informação pendente para a fábrica" icone={<FileWarning size={14} />}>
                    <textarea
                      placeholder="O que a fábrica solicitou? O técnico será notificado..."
                      value={boTexto}
                      onChange={(e) => setBoTexto(e.target.value)}
                      rows={3}
                      style={taStyle}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--portal-text-secondary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={boVisita} onChange={(e) => setBoVisita(e.target.checked)} />
                      Solicitar visita à propriedade do cliente
                    </label>
                    <button
                      onClick={() => abrirPendencia('info_fabrica')}
                      disabled={!!busy || !boTexto.trim()}
                      style={btn('#f97316', !!busy || !boTexto.trim())}
                    >
                      <AlertTriangle size={15} /> Devolver ao técnico
                    </button>
                  </Secao>

                  <Secao titulo="Retorno da fábrica (obrigatório)" icone={<FileWarning size={14} />}>
                    <GarantiaAnexos
                      garantiaId={g.id}
                      anexos={g.anexos.filter((a) => a.categoria === 'retorno_fabrica')}
                      uploadCategoria="retorno_fabrica"
                      enviadoPor={userName}
                      onChange={carregar}
                      vazioTexto="Anexe o documento/print que a fábrica retornou."
                    />
                  </Secao>

                  <Secao titulo="Finalizar garantia" icone={<CheckCircle2 size={14} />}>
                    {!temRetornoFabrica && (
                      <span style={{ fontSize: 11, color: '#dc2626' }}>
                        Anexe o retorno da fábrica para liberar a finalização.
                      </span>
                    )}

                    {/* Peças pagas pela fábrica (marca o que foi aprovado) */}
                    {g.pecas.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-secondary)' }}>
                            Peças pagas pela fábrica
                          </div>
                          {g.pecas.some((p) => !Number(p.preco_unitario)) && (
                            <button
                              type="button"
                              onClick={() =>
                                chamar('atualizar_precos', `/api/garantias/${garantiaId}/atualizar-precos`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ ator: userName }),
                                })
                              }
                              disabled={!!busy}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '4px 10px', borderRadius: 6,
                                border: '1px solid var(--portal-border)',
                                background: 'var(--portal-bg-input)',
                                color: 'var(--portal-text-secondary)',
                                fontSize: 11, fontWeight: 600,
                                cursor: busy ? 'default' : 'pointer',
                              }}
                            >
                              {busy === 'atualizar_precos' ? <Loader2 size={11} className="spin" /> : <Save size={11} />}
                              Atualizar preços do PPV
                            </button>
                          )}
                        </div>
                        {g.pecas.map((p) => {
                          const sel = pecasAprovadas.has(p.id);
                          const valor = (Number(p.preco_unitario) || 0) * (Number(p.quantidade) || 0);
                          return (
                            <label
                              key={p.id}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '6px 8px', borderRadius: 8,
                                background: sel ? '#ECFDF5' : 'var(--portal-bg-secondary)',
                                border: `1px solid ${sel ? '#A7F3D0' : 'var(--portal-border)'}`,
                                cursor: 'pointer', fontSize: 12,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={sel}
                                onChange={() => {
                                  setPecasAprovadas((prev) => {
                                    const n = new Set(prev);
                                    if (n.has(p.id)) n.delete(p.id); else n.add(p.id);
                                    return n;
                                  });
                                }}
                              />
                              <span style={{ flex: 1, color: 'var(--portal-text)' }}>
                                {p.cod_produto ? `${p.cod_produto} · ` : ''}{p.descricao}
                                <span style={{ color: 'var(--portal-text-muted)' }}> x{p.quantidade}</span>
                              </span>
                              <span style={{ fontWeight: 700, color: sel ? '#16a34a' : 'var(--portal-text-muted)' }}>
                                {fmtMoeda(valor)}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {/* Preview do valor total a ser pago */}
                    {(() => {
                      const vh = (Number(gHoras) || 0) * 193;
                      const vk = (Number(gKm) || 0) * 2.8;
                      const vp = g.pecas
                        .filter((p) => pecasAprovadas.has(p.id))
                        .reduce((s, p) => s + (Number(p.preco_unitario) || 0) * (Number(p.quantidade) || 0), 0);
                      const total = vh + vk + vp;
                      return (
                        <div
                          style={{
                            padding: '8px 10px', borderRadius: 8,
                            background: 'var(--portal-bg-secondary)',
                            border: '1px solid var(--portal-border)',
                            fontSize: 12, color: 'var(--portal-text-secondary)',
                            display: 'flex', flexDirection: 'column', gap: 2,
                          }}
                        >
                          <span>Horas: <strong>{fmtMoeda(vh)}</strong></span>
                          <span>KM: <strong>{fmtMoeda(vk)}</strong></span>
                          <span>Peças aprovadas: <strong>{fmtMoeda(vp)}</strong></span>
                          <span style={{ marginTop: 4, paddingTop: 4, borderTop: '1px dashed var(--portal-border)', color: 'var(--portal-text)' }}>
                            Total a pagar: <strong style={{ color: '#16a34a' }}>{fmtMoeda(total)}</strong>
                          </span>
                        </div>
                      );
                    })()}

                    <textarea
                      placeholder="Motivo da recusa (obrigatório se recusar)"
                      value={motivoRecusa}
                      onChange={(e) => setMotivoRecusa(e.target.value)}
                      rows={2}
                      style={taStyle}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => finalizar('aprovada')}
                        disabled={!!busy || !temRetornoFabrica}
                        style={{ ...btn('#16a34a', !!busy || !temRetornoFabrica), flex: 1 }}
                      >
                        <CheckCircle2 size={15} /> Aprovar
                      </button>
                      <button
                        onClick={() => finalizar('rejeitada')}
                        disabled={!!busy || !temRetornoFabrica}
                        style={{ ...btn('#dc2626', !!busy || !temRetornoFabrica), flex: 1 }}
                      >
                        <XCircle size={15} /> Recusar
                      </button>
                    </div>
                  </Secao>
                </>
              )}

              {/* Finalizada */}
              {finalizada && (
                <Secao
                  titulo={g.status === 'aprovada' ? 'Garantia aprovada' : 'Garantia recusada'}
                  icone={g.status === 'aprovada' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                >
                  {g.status === 'aprovada' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--portal-text)' }}>
                      <div>
                        Pago em garantia: <strong style={{ color: '#16a34a' }}>{fmtMoeda(g.valor_pago_total)}</strong>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>
                        Horas: {fmtMoeda(g.valor_pago_horas)} · KM: {fmtMoeda(g.valor_pago_km)}
                        {g.valor_pago_pecas != null && g.valor_pago_pecas > 0 ? ` · Peças: ${fmtMoeda(g.valor_pago_pecas)}` : ''}
                      </div>
                      {g.pecas.filter((p) => p.resultado === 'rejeitada').length > 0 && (
                        <div style={{ fontSize: 11, color: '#dc2626' }}>
                          {g.pecas.filter((p) => p.resultado === 'rejeitada').length} peça(s) não foram pagas pela fábrica.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: 'var(--portal-text)' }}>
                      <strong>Motivo:</strong> {g.motivo_recusa || '—'}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                    Finalizada em {fmtDataHora(g.finalizada_em)}
                  </div>
                </Secao>
              )}

              {/* Anexos gerais + retorno da fábrica (visível também em finalizada) */}
              {(finalizada || aguardandoTec) && (
                <Secao titulo="Anexos" icone={<FileWarning size={14} />}>
                  <GarantiaAnexos garantiaId={g.id} anexos={g.anexos} onChange={carregar} />
                </Secao>
              )}

              {/* Pendências resolvidas */}
              {g.pendencias.filter((p) => p.status === 'respondida').length > 0 && (
                <Secao titulo="Devoluções respondidas" icone={<History size={14} />}>
                  {g.pendencias
                    .filter((p) => p.status === 'respondida')
                    .map((p) => (
                      <div key={p.id} style={{ fontSize: 12, borderLeft: '3px solid var(--portal-border)', paddingLeft: 8 }}>
                        <div style={{ color: 'var(--portal-text-muted)' }}>
                          {p.tipo === 'bo' ? 'B.O.' : 'Fábrica'}: {p.descricao}
                        </div>
                        <div style={{ color: 'var(--portal-text)', marginTop: 2 }}>
                          <strong>Resposta:</strong> {p.resposta_texto || '(somente anexos)'}
                        </div>
                      </div>
                    ))}
                </Secao>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Campo({ label, valor }: { label: string; valor: string | null | undefined }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--portal-text-faint)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--portal-text)', fontWeight: 600 }}>{valor || '—'}</div>
    </div>
  );
}
