'use client';
// Ficha do MOTORISTA (drawer lateral, casca do VeiculoDrawer):
//   Pendências → Identificação (RH, só leitura — o cadastro é editado LÁ) →
//   Habilitação (CNH + flag motorista, EDITÁVEL aqui) → Frota (veículos e
//   multas) → Documentos do RH (links assinados, expiram em 1h).
// Salário nunca chega aqui — o servidor nem seleciona a coluna.
import { useCallback, useEffect, useState } from 'react';
import {
  X, User as UserIcon, IdCard, Car, FileText, AlertTriangle, Pencil, Loader2, ShieldAlert,
} from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import { formatarPlaca } from '@/lib/frota/placa';
import { validarCnh } from '@/lib/frota/motoristas';
import type { MotoristaDetalhe } from '@/lib/frota/tipos';
import OcorrenciaFormModal from '@/components/ocorrencias/OcorrenciaFormModal';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';

interface Props {
  rhId: string | null;
  portalId: string | null;
  nome: string;
  podeEditar: boolean;
  onClose: () => void;
  onMudou?: () => void;
}

const fmtRS = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = (s: string | null | undefined) => {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

function tempoDeCasa(admissao: string | null, demissao: string | null): string | null {
  if (!admissao) return null;
  const ini = new Date(`${String(admissao).slice(0, 10)}T00:00:00`);
  const fim = demissao ? new Date(`${String(demissao).slice(0, 10)}T00:00:00`) : new Date();
  if (isNaN(ini.getTime()) || fim < ini) return null;
  let meses = (fim.getFullYear() - ini.getFullYear()) * 12 + (fim.getMonth() - ini.getMonth());
  if (fim.getDate() < ini.getDate()) meses -= 1;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  if (anos <= 0 && resto <= 0) return 'menos de 1 mês';
  const partes = [];
  if (anos > 0) partes.push(`${anos} ano${anos > 1 ? 's' : ''}`);
  if (resto > 0) partes.push(`${resto} mês${resto > 1 ? 'es' : ''}`);
  return partes.join(' e ');
}

const STATUS_MULTA: Record<string, { label: string; cor: string; bg: string }> = {
  nova: { label: 'Nova', cor: '#b45309', bg: '#fef3c7' },
  em_analise: { label: 'Em análise', cor: '#1d4ed8', bg: '#dbeafe' },
  em_defesa: { label: 'Em defesa', cor: '#7c3aed', bg: '#ede9fe' },
  paga: { label: 'Paga', cor: '#15803d', bg: '#dcfce7' },
  descontada: { label: 'Descontada', cor: '#1e3a8a', bg: '#dbeafe' },
  arquivada: { label: 'Arquivada', cor: '#64748b', bg: '#f1f5f9' },
};

const STATUS_RH_LABEL: Record<string, string> = {
  ativo: 'Ativo', ferias: 'Férias', afastado: 'Afastado', inativo: 'Inativo', demitido: 'Demitido',
};

const CATEGORIAS_CNH = ['', 'A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE'];

function Secao({ titulo, icone, children }: { titulo: string; icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 0, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {icone}{titulo}
      </div>
      {children}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13.5 }}>
      <span style={{ color: 'var(--portal-text)' }}>{rotulo}</span>
      <span style={{ color: 'var(--portal-text)', fontWeight: 600, textAlign: 'right' }}>{valor ?? '—'}</span>
    </div>
  );
}

export default function MotoristaDrawer({ rhId, portalId, nome, podeEditar, onClose, onMudou }: Props) {
  // Ocorrência rápida de FROTA pro motorista (carro sujo, checklist, pilotagem…)
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeOcorrencia = pode('painel-mecanicos', 'criar_ocorrencia');
  const [showOcorrencia, setShowOcorrencia] = useState(false);
  const [det, setDet] = useState<MotoristaDetalhe | null>(null);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ cnh: '', cnh_categoria: '', cnh_validade: '', e_motorista: false });

  const carregar = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (rhId) qs.set('rh_id', rhId);
      if (portalId) qs.set('portal_id', portalId);
      const r = await fetch(`/api/frota/motoristas/detalhe?${qs}`, { headers: await authHeaders() });
      const d = await r.json();
      if (!r.ok) { setErro(d.error || 'Falha ao carregar.'); return; }
      setDet(d as MotoristaDetalhe);
      setForm({
        cnh: d.motorista?.cnh || '',
        cnh_categoria: d.motorista?.cnh_categoria || '',
        cnh_validade: d.motorista?.cnh_validade ? String(d.motorista.cnh_validade).slice(0, 10) : '',
        e_motorista: !!d.motorista?.e_motorista,
      });
    } catch (e) { setErro(String(e)); }
  }, [rhId, portalId]);
  useEffect(() => { carregar(); }, [carregar]);

  const patch = async (body: Record<string, unknown>): Promise<boolean> => {
    const alvo = det?.motorista.id || portalId || rhId;
    if (!alvo) return false;
    setSalvando(true);
    try {
      const r = await fetch(`/api/frota/motoristas/${alvo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Falha ao salvar.'); return false; }
      await carregar();
      onMudou?.();
      return true;
    } catch (e) { alert(String(e)); return false; } finally { setSalvando(false); }
  };

  const salvar = async () => {
    const ok = await patch({
      cnh: form.cnh,
      cnh_categoria: form.cnh_categoria,
      cnh_validade: form.cnh_validade,
      e_motorista: form.e_motorista,
    });
    if (ok) setEditando(false);
  };

  // FORA DO RH: a Rota Exata ainda marca como ativo gente que já saiu — aqui o
  // portal desliga por conta própria (campo travado contra o sync).
  const alternarAtivo = async () => {
    const desligar = det?.motorista.ativo_portal !== false;
    if (desligar && !confirm(`Marcar ${det?.motorista.nome || nome} como DESLIGADO?\nEle sai dos ativos e não é mais cobrado por CNH.`)) return;
    await patch({ ativo: !desligar });
  };

  const m = det?.motorista;
  const veiculoAtual = det?.veiculos.filter((v) => v.fim === null) || [];
  const historico = det?.veiculos.filter((v) => v.fim !== null) || [];

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 900, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(640px, 100%)', height: '100%', background: 'var(--portal-bg)', display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 40px rgba(0,0,0,0.3)' }}>
        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--portal-border)' }}>
          {m?.foto_url ? (
            <img src={m.foto_url} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', background: 'var(--portal-bg-secondary)' }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--portal-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserIcon size={20} color="var(--portal-text-muted)" />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ fontSize: 16, fontWeight: 800, color: 'var(--portal-text)' }}>{m?.nome || nome}</strong>
            <div style={{ fontSize: 13, color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[m?.cargo, m?.departamento, m?.empresa].filter(Boolean).join(' · ') || 'Motorista'}
            </div>
          </div>
          {podeOcorrencia && (
            <button
              onClick={() => setShowOcorrencia(true)}
              title="Registrar ocorrência de Frota pra este motorista (carro sujo, checklist, pilotagem…)"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#DC2626', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 0, padding: '6px 12px', cursor: 'pointer' }}
            >
              ⚠ Ocorrência
            </button>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text)' }}><X size={20} /></button>
        </div>

        {/* Modal de ocorrência rápida (categoria Frota, motorista pré-selecionado) */}
        <OcorrenciaFormModal
          aberto={showOcorrencia}
          onFechar={() => setShowOcorrencia(false)}
          tecnicos={[m?.nome || nome].filter(Boolean)}
          categoriaInicial="frota"
          tecnicoInicial={m?.nome || nome}
          criadoPor={userProfile?.nome || undefined}
        />

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {erro && <div style={{ color: '#b91c1c', fontSize: 13 }}>{erro}</div>}
          {!det && !erro && <div style={{ color: 'var(--portal-text)', fontSize: 13 }}>Carregando…</div>}

          {/* Pendências */}
          {m && m.pendencias.length > 0 && (
            <div style={{ background: '#fee2e2', border: '1px solid #ef4444', borderRadius: 0, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 800, color: '#b91c1c', marginBottom: 6 }}>
                <AlertTriangle size={14} /> {m.pendencias.length} PENDÊNCIA{m.pendencias.length > 1 ? 'S' : ''}
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: '#7f1d1d' }}>
                {m.pendencias.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}

          {/* Identificação (RH — só leitura) */}
          {m && (
            <Secao titulo="Identificação" icone={<UserIcon size={13} />}>
              <div style={{ fontSize: 12, color: 'var(--portal-text)', marginTop: -4 }}>
                {m.origem === 'portal'
                  ? 'Fora do RH — cadastro vindo da Rota Exata (rastreador).'
                  : 'Dados do RH — pra corrigir o cadastro, edite lá no sistema de RH.'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 18px' }}>
                <Linha rotulo="CPF" valor={m.cpf_mascarado} />
                {det?.rh && <Linha rotulo="RG" valor={det.rh.rg} />}
                {det?.rh && <Linha rotulo="Nascimento" valor={fmtData(det.rh.data_nascimento)} />}
                <Linha rotulo="Empresa" valor={m.empresa} />
                <Linha rotulo="Cargo" valor={m.cargo} />
                <Linha rotulo="Departamento" valor={m.departamento} />
                <Linha rotulo="Contrato" valor={m.tipo_contrato?.toUpperCase()} />
                <Linha rotulo="Admissão" valor={m.data_admissao ? `${fmtData(m.data_admissao)}` : null} />
                <Linha rotulo="Tempo de casa" valor={tempoDeCasa(m.data_admissao, m.data_demissao)} />
                <Linha rotulo="Status no RH" valor={m.status_rh ? STATUS_RH_LABEL[m.status_rh] || m.status_rh : m.ativo_portal ? 'Ativo (portal)' : 'Inativo (portal)'} />
                {m.data_demissao && <Linha rotulo="Desligamento" valor={fmtData(m.data_demissao)} />}
                <Linha rotulo="Telefone" valor={m.telefone} />
                <Linha rotulo="Email" valor={m.email} />
                {det?.rh && (
                  <Linha
                    rotulo="Endereço"
                    valor={[det.rh.endereco, det.rh.bairro, [det.rh.cidade, det.rh.estado].filter(Boolean).join('/'), det.rh.cep].filter(Boolean).join(', ') || null}
                  />
                )}
              </div>
              {m.origem === 'portal' && podeEditar && (
                <button
                  onClick={alternarAtivo}
                  disabled={salvando}
                  title="Só pra quem está FORA do RH — pra quem está no RH, o desligamento é feito lá"
                  style={{
                    alignSelf: 'flex-start', padding: '7px 12px', borderRadius: 0, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                    border: '1px solid var(--portal-border)',
                    background: m.ativo_portal ? 'var(--portal-bg-input)' : '#1e40af',
                    color: m.ativo_portal ? '#b91c1c' : '#fff',
                  }}
                >
                  {m.ativo_portal ? 'Marcar como desligado' : 'Reativar (voltou pra empresa)'}
                </button>
              )}
            </Secao>
          )}

          {/* Habilitação (portal — editável) */}
          {m && (
            <Secao titulo="Habilitação (CNH)" icone={<IdCard size={13} />}>
              {!editando ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 18px' }}>
                    <Linha rotulo="Número" valor={m.cnh} />
                    <Linha rotulo="Categoria" valor={m.cnh_categoria} />
                    <Linha rotulo="Validade" valor={m.cnh_validade ? fmtData(m.cnh_validade) : null} />
                    <Linha
                      rotulo="Situação"
                      valor={{
                        ok: '✅ em dia', vencendo: '⚠️ vencendo', vencida: '🔴 VENCIDA',
                        sem_validade: 'sem validade', sem_cnh: 'sem CNH cadastrada',
                      }[m.situacao_cnh]}
                    />
                    <Linha rotulo="É motorista?" valor={m.e_motorista ? 'Sim' : 'Não'} />
                    {m.gestor && <Linha rotulo="Gestor (Rota Exata)" valor="Sim" />}
                  </div>
                  {m.cnh && !validarCnh(m.cnh) && (
                    <div style={{ fontSize: 12.5, color: '#b45309', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 0, padding: '6px 10px' }}>
                      ⚠ O número da CNH não passa no validador (dígito verificador) — confira a digitação.
                    </div>
                  )}
                  <a
                    href="https://portalservicos.senatran.serpro.gov.br/"
                    target="_blank"
                    rel="noreferrer"
                    title="Consulta oficial de situação e pontos — exige login gov.br do condutor"
                    style={{ alignSelf: 'flex-start', fontSize: 13, fontWeight: 700, color: '#1e40af', textDecoration: 'none' }}
                  >
                    Consultar CNH na Senatran ↗
                  </a>
                  {podeEditar && (
                    <button
                      onClick={() => setEditando(true)}
                      style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
                    >
                      <Pencil size={13} /> Editar CNH / flag motorista
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase' }}>
                      Nº da CNH
                      <input value={form.cnh} onChange={(e) => setForm((f) => ({ ...f, cnh: e.target.value }))} placeholder="00000000000"
                        style={{ padding: '8px 10px', borderRadius: 0, border: `1px solid ${form.cnh.trim() && !validarCnh(form.cnh) ? '#f59e0b' : 'var(--portal-border)'}`, background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 13 }} />
                      {form.cnh.trim() !== '' && (
                        <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'none', color: validarCnh(form.cnh) ? '#15803d' : '#b45309' }}>
                          {validarCnh(form.cnh) ? '✓ número válido' : '⚠ dígito verificador não confere'}
                        </span>
                      )}
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase' }}>
                      Categoria
                      <select value={form.cnh_categoria} onChange={(e) => setForm((f) => ({ ...f, cnh_categoria: e.target.value }))}
                        style={{ padding: '8px 10px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 13 }}>
                        {CATEGORIAS_CNH.map((c) => <option key={c} value={c}>{c || '—'}</option>)}
                      </select>
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase' }}>
                      Validade
                      <input type="date" value={form.cnh_validade} onChange={(e) => setForm((f) => ({ ...f, cnh_validade: e.target.value }))}
                        style={{ padding: '8px 10px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 13 }} />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--portal-text)', cursor: 'pointer', alignSelf: 'end', paddingBottom: 8 }}>
                      <input type="checkbox" checked={form.e_motorista} onChange={(e) => setForm((f) => ({ ...f, e_motorista: e.target.checked }))} />
                      É motorista (dirige carro da empresa)
                    </label>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--portal-text)' }}>
                    Campo editado aqui fica travado contra o sync da Rota Exata (o humano vence).
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={salvar} disabled={salvando}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 0, border: 'none', background: '#1e40af', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      {salvando ? <Loader2 size={14} className="spin" /> : null} Salvar
                    </button>
                    <button onClick={() => setEditando(false)}
                      style={{ padding: '8px 14px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text)', fontSize: 13, cursor: 'pointer' }}>
                      Cancelar
                    </button>
                  </div>
                </>
              )}
            </Secao>
          )}

          {/* Frota — veículos e multas */}
          {det && (
            <Secao titulo="Frota" icone={<Car size={13} />}>
              {veiculoAtual.length === 0 && historico.length === 0 && det.multas.length === 0 ? (
                <div style={{ fontSize: 13.5, color: 'var(--portal-text)' }}>Sem vínculos com veículos da frota.</div>
              ) : (
                <>
                  {veiculoAtual.map((v) => (
                    <div key={v.veiculo_id + v.inicio} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                      <Car size={13} color="#1e3a8a" />
                      <strong style={{ color: 'var(--portal-text)' }}>{formatarPlaca(v.placa)}</strong>
                      <span style={{ color: 'var(--portal-text)' }}>{v.modelo || ''}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#1e3a8a', background: '#dbeafe', borderRadius: 999, padding: '2px 8px' }}>
                        responsável desde {fmtData(v.inicio)}
                      </span>
                    </div>
                  ))}
                  {historico.length > 0 && (
                    <details>
                      <summary style={{ fontSize: 12.5, color: 'var(--portal-text)', cursor: 'pointer' }}>
                        histórico ({historico.length})
                      </summary>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                        {historico.map((v, i) => (
                          <div key={i} style={{ fontSize: 13, color: 'var(--portal-text)' }}>
                            {formatarPlaca(v.placa)} {v.modelo ? `· ${v.modelo}` : ''} — {fmtData(v.inicio)} → {fmtData(v.fim)}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  {det.multas.length > 0 && (
                    <div style={{ borderTop: '1px dashed var(--portal-border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#b91c1c', flexWrap: 'wrap' }}>
                        <ShieldAlert size={13} /> {det.multas_total.qtd} multa(s) · {fmtRS(det.multas_total.valor)} · {det.multas_total.pontos} ponto(s)
                        <span
                          title="Pontos na janela de 12 meses da CNH (fora arquivadas) — 20+ = risco de suspensão"
                          style={{
                            fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '1px 8px',
                            color: (det.multas_total.pontos_12m ?? 0) >= 20 ? '#b91c1c' : '#92400e',
                            background: (det.multas_total.pontos_12m ?? 0) >= 20 ? '#fef2f2' : '#fef3c7',
                            border: `1px solid ${(det.multas_total.pontos_12m ?? 0) >= 20 ? '#fca5a5' : '#fcd34d'}`,
                          }}
                        >
                          {det.multas_total.pontos_12m ?? 0} pts nos últimos 12m
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 280, overflowY: 'auto', paddingRight: 2 }}>
                        {det.multas.map((mu) => {
                          const st = STATUS_MULTA[mu.status_interno || ''] || null;
                          return (
                            <div key={mu.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--portal-text)' }}>
                              <span style={{ minWidth: 66 }}>{fmtData(mu.dt_multa)}</span>
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={mu.descricao || ''}>
                                {formatarPlaca(mu.placa)} — {mu.descricao || '—'}
                              </span>
                              {mu.pontos ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', whiteSpace: 'nowrap' }}>{mu.pontos} pts</span> : null}
                              {st && <span style={{ fontSize: 11, fontWeight: 700, color: st.cor, background: st.bg, borderRadius: 999, padding: '1px 7px' }}>{st.label}</span>}
                              <strong style={{ color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>{mu.valor != null ? fmtRS(mu.valor) : '—'}</strong>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </Secao>
          )}

          {/* Documentos do RH */}
          {det && m?.rh_id && (
            <Secao titulo="Documentos do RH" icone={<FileText size={13} />}>
              {det.documentos_rh.length === 0 ? (
                <div style={{ fontSize: 13.5, color: 'var(--portal-text)' }}>Nenhum documento anexado no RH.</div>
              ) : (
                det.documentos_rh.map((d) => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                    <FileText size={13} color="var(--portal-text-muted)" />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <strong style={{ color: 'var(--portal-text)', textTransform: 'capitalize' }}>{d.tipo.replace(/_/g, ' ')}</strong>
                      {d.descricao ? ` — ${d.descricao}` : ''}
                    </span>
                    {d.data_validade && <span style={{ fontSize: 12, color: 'var(--portal-text)' }}>até {fmtData(d.data_validade)}</span>}
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noreferrer" title="O link expira em 1 hora"
                        style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', textDecoration: 'none' }}>
                        abrir ↗
                      </a>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--portal-text)' }}>sem arquivo</span>
                    )}
                  </div>
                ))
              )}
            </Secao>
          )}
        </div>
      </div>
    </div>
  );
}
