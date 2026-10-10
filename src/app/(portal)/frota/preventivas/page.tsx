'use client';
// Frota > Manutenção > PREVENTIVAS (Fase 2, fatia 2 — 10/10/2026).
// Cada carro com os itens do plano do modelo dele (intervalos do manual) e a
// situação de cada um: vencida, vence em breve, em dia, sem histórico. Clicar
// num item registra que foi feito (é o que reinicia a contagem).
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Check, Loader2, Settings2, X } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import { formatarPlaca } from '@/lib/frota/placa';
import { ESTADO_COR, ESTADO_LABEL, type EstadoPreventiva, type ItemPlano, type SituacaoPreventiva } from '@/lib/frota/preventiva';
import { CabecalhoFrota, CarregandoFrota, KpiFrota, KpisFrota, VazioFrota, AZUL_FROTA } from '@/components/frota/ui';

interface Item {
  plano: ItemPlano;
  ultimo: { data: string; km: number | null; horas_motor?: number | null; origem: string; obs: string | null; criado_por: string | null } | null;
  situacao: SituacaoPreventiva;
}
interface Veic {
  veiculo_id: string; placa: string; descricao: string;
  modelo: { id: string; nome: string; manual_url: string | null; manual_referencia: string | null } | null;
  km: { km: number | null; selo: string; descricao: string } | null;
  itens: Item[];
}
interface Dados {
  migracaoFaltando?: boolean; error?: string;
  resumo: { vencida: number; em_breve: number; em_dia: number; sem_leitura: number; sem_historico: number; pctEmDia: number | null };
  semPlano: string[];
  veiculos: Veic[];
  podeRegistrar: boolean;
  podePlanos: boolean;
}

type Filtro = 'todas' | 'vencida' | 'em_breve' | 'sem_historico' | 'sem_plano';
const PESO: Record<EstadoPreventiva, number> = { vencida: 4, em_breve: 3, sem_leitura: 2, sem_historico: 1, em_dia: 0 };
const COR_SELO: Record<string, string> = { verde: '#15803d', ambar: '#b45309', vermelho: '#b91c1c', cinza: '#64748b' };
const fmtKm = (n: number) => Math.round(n).toLocaleString('pt-BR');
const fmtData = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');

export default function PreventivasPage() {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [aberto, setAberto] = useState<{ v: Veic; item: Item } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/frota/preventivas', { headers: await authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error || `Falha ao carregar (${r.status}).`); return; }
      setErro('');
      setD({ ...j, semPlano: j.semPlano || [], veiculos: j.veiculos || [] } as Dados);
    } catch (e) { setErro(String(e)); }
  }, []);
  // carregar só grava estado depois do fetch (assíncrono)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar(); }, [carregar]);

  const lista = useMemo(() => {
    if (!d) return [];
    const pior = (v: Veic) => Math.max(-1, ...v.itens.map((i) => PESO[i.situacao.estado]));
    return d.veiculos
      .filter((v) => {
        if (filtro === 'todas') return true;
        if (filtro === 'sem_plano') return !v.modelo;
        return v.itens.some((i) => i.situacao.estado === filtro);
      })
      .sort((a, b) => (pior(b) - pior(a)) || a.placa.localeCompare(b.placa));
  }, [d, filtro]);

  if (!d) {
    return (
      <div className="frota-pg" style={{ padding: '28px 40px' }}>
        <CabecalhoFrota titulo="Preventivas" resumo="O que vence por km, horas de motor ou data em cada carro." />
        {erro ? <div style={{ color: '#b91c1c', fontSize: 13 }}>{erro}</div> : <CarregandoFrota kpis={4} linhas={6} />}
      </div>
    );
  }

  const r = d.resumo;
  const chips: [Filtro, string][] = [
    ['todas', `Todos (${d.veiculos.length})`],
    ['vencida', `Vencidas (${r.vencida})`],
    ['em_breve', `Vencem em breve (${r.em_breve})`],
    ['sem_historico', `Sem histórico (${r.sem_historico})`],
    ['sem_plano', `Sem plano (${d.semPlano.length})`],
  ];

  return (
    <div className="frota-pg" style={{ padding: '28px 40px' }}>
      <CabecalhoFrota
        titulo="Preventivas"
        icone={<CalendarClock size={20} color={AZUL_FROTA} />}
        resumo="O que vence por km, horas de motor ou data em cada carro, pelos intervalos do manual de cada modelo. Clique num item para registrar que foi feito."
        acoes={d.podePlanos ? (
          <Link href="/frota/preventivas/planos" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: AZUL_FROTA, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            <Settings2 size={15} /> Planos por modelo
          </Link>
        ) : undefined}
      />

      {d.migracaoFaltando ? (
        <VazioFrota titulo="Preventiva ainda não ativada" texto={d.error || 'Falta aplicar sql/frota-preventiva.sql no Supabase.'} />
      ) : (
        <>
          <KpisFrota>
            <KpiFrota rotulo="Preventivas em dia" valor={r.pctEmDia != null ? `${r.pctEmDia}%` : '—'}
              contexto={`${r.em_dia + r.em_breve} de ${r.em_dia + r.em_breve + r.vencida} itens com histórico`}
              tom={r.pctEmDia == null ? 'neutro' : r.pctEmDia >= 90 ? 'bom' : r.pctEmDia >= 75 ? 'atencao' : 'ruim'} />
            <KpiFrota rotulo="Vencidas" valor={r.vencida} contexto="itens passados do limite" tom={r.vencida ? 'ruim' : 'bom'} onClick={() => setFiltro('vencida')} />
            <KpiFrota rotulo="Vencem em breve" valor={r.em_breve} contexto="dentro do aviso (1.000 km / 30 dias)" tom={r.em_breve ? 'atencao' : 'bom'} onClick={() => setFiltro('em_breve')} />
            <KpiFrota rotulo="Falta cadastrar" valor={d.semPlano.length + r.sem_historico}
              contexto={`${d.semPlano.length} carro(s) sem plano · ${r.sem_historico} item(ns) sem a última vez`}
              tom={d.semPlano.length + r.sem_historico ? 'atencao' : 'bom'} onClick={() => setFiltro(d.semPlano.length ? 'sem_plano' : 'sem_historico')} />
          </KpisFrota>

          <div role="group" aria-label="Filtrar" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {chips.map(([k, rot]) => (
              <button key={k} type="button" onClick={() => setFiltro(k)} aria-pressed={filtro === k}
                style={{ padding: '6px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', borderRadius: 999,
                  border: `1px solid ${filtro === k ? AZUL_FROTA : 'var(--portal-border)'}`,
                  background: filtro === k ? AZUL_FROTA : 'var(--portal-bg-card)', color: filtro === k ? '#fff' : 'var(--portal-text)' }}>
                {rot}
              </button>
            ))}
          </div>

          {erro && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{erro}</div>}
          {!lista.length && <VazioFrota titulo="Nada neste filtro" />}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lista.map((v) => (
              <div key={v.placa} style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderLeft: `4px solid ${AZUL_FROTA}`, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <Link href={`/frota/veiculos?placa=${v.placa}`} style={{ fontSize: 16, fontWeight: 800, color: 'var(--portal-text)', textDecoration: 'none' }}>{formatarPlaca(v.placa)}</Link>
                  <span style={{ fontSize: 13, color: 'var(--portal-text-secondary)' }}>{v.descricao}</span>
                  {v.km?.km != null && (
                    <span title={`De onde vem: ${v.km.descricao}`} style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>
                      <span style={{ color: COR_SELO[v.km.selo] }}>●</span> {fmtKm(v.km.km)} km
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>
                    {v.modelo ? <>Plano: <strong style={{ color: 'var(--portal-text)' }}>{v.modelo.nome}</strong></> : null}
                  </span>
                </div>
                {!v.modelo ? (
                  <span style={{ fontSize: 13, color: '#b45309' }}>
                    Sem plano — cadastre pelo manual deste modelo{d.podePlanos ? <> em <Link href="/frota/preventivas/planos" style={{ color: AZUL_FROTA, fontWeight: 700 }}>Planos por modelo</Link></> : null}.
                  </span>
                ) : !v.itens.length ? (
                  <span style={{ fontSize: 13, color: 'var(--portal-text-secondary)' }}>O plano deste modelo ainda não tem itens.</span>
                ) : (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[...v.itens].sort((a, b) => PESO[b.situacao.estado] - PESO[a.situacao.estado]).map((i) => {
                      const c = ESTADO_COR[i.situacao.estado];
                      return (
                        <button key={i.plano.id} type="button" onClick={() => setAberto({ v, item: i })}
                          title={`${ESTADO_LABEL[i.situacao.estado]}${i.ultimo ? ` · feito em ${fmtData(i.ultimo.data)}` : ''}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', border: `1px solid ${c.forte}`, background: c.bg, color: c.cor, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.forte }} />
                          {i.plano.nome} · {i.situacao.texto}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {aberto && (
        <RegistrarServico veiculo={aberto.v} item={aberto.item} podeRegistrar={d.podeRegistrar}
          onClose={() => setAberto(null)} onSalvo={() => { setAberto(null); carregar(); }} />
      )}
    </div>
  );
}

function RegistrarServico({ veiculo, item, podeRegistrar, onClose, onSalvo }: {
  veiculo: Veic; item: Item; podeRegistrar: boolean; onClose: () => void; onSalvo: () => void;
}) {
  const p = item.plano;
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [km, setKm] = useState(veiculo.km?.km != null ? String(Math.round(veiculo.km.km)) : '');
  const [obs, setObs] = useState('');
  // uma revisão costuma cobrir vários itens: marca os outros feitos junto
  const [juntos, setJuntos] = useState<Set<string>>(new Set([p.id]));
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');

  const regras = [
    p.intervalo_km ? `${fmtKm(p.intervalo_km)} km` : null,
    p.intervalo_horas ? `${p.intervalo_horas} h de motor` : null,
    p.intervalo_meses ? `${p.intervalo_meses} ${p.intervalo_meses === 1 ? 'mês' : 'meses'}` : null,
  ].filter(Boolean).join(' ou ');

  const salvar = async () => {
    setSalvando(true); setMsg('');
    try {
      const r = await fetch('/api/frota/preventivas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ placa: veiculo.placa, plano_ids: [...juntos], data, km: km || null, obs }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error || 'Não deu para salvar.'); return; }
      onSalvo();
    } catch { setMsg('Falha de conexão — tente de novo.'); }
    finally { setSalvando(false); }
  };

  const campo: React.CSSProperties = { minHeight: 42, padding: '0 10px', fontSize: 15, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', width: '100%', boxSizing: 'border-box' };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Preventiva ${p.nome}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 10500, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ flex: 1, fontSize: 16, color: 'var(--portal-text)' }}>{formatarPlaca(veiculo.placa)} · {p.nome}</strong>
          <button type="button" onClick={onClose} aria-label="Fechar" style={{ width: 36, height: 36, border: 'none', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--portal-text)', display: 'grid', gap: 4 }}>
          <span><strong>Situação:</strong> <span style={{ color: ESTADO_COR[item.situacao.estado].cor }}>{ESTADO_LABEL[item.situacao.estado]}</span> — {item.situacao.texto}</span>
          <span><strong>Intervalo do manual:</strong> {regras || '—'}{p.modo === 'fixo' ? ' (marcos fixos)' : ''}{p.referencia ? ` · ${p.referencia}` : ''}</span>
          {veiculo.modelo?.manual_url && <a href={veiculo.modelo.manual_url} target="_blank" rel="noreferrer" style={{ color: AZUL_FROTA, fontWeight: 700 }}>Abrir o manual</a>}
          <span><strong>Última vez:</strong> {item.ultimo ? `${fmtData(item.ultimo.data)}${item.ultimo.km != null ? ` · ${fmtKm(item.ultimo.km)} km` : ''}${item.ultimo.criado_por ? ` · ${item.ultimo.criado_por}` : ''}` : 'não registrada'}</span>
          {(item.situacao.proximoKm != null || item.situacao.proximaData) && (
            <span><strong>Próxima:</strong> {[item.situacao.proximoKm != null ? `${fmtKm(item.situacao.proximoKm)} km` : null, item.situacao.proximaData ? fmtData(item.situacao.proximaData) : null].filter(Boolean).join(' ou ')}</span>
          )}
        </div>

        {podeRegistrar ? (
          <>
            <strong style={{ fontSize: 14, color: 'var(--portal-text)' }}>{item.ultimo ? 'Registrar que foi feito' : 'Informar a última vez que foi feito'}</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 10 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 12.5, fontWeight: 700, color: 'var(--portal-text)' }}>
                Data
                <input type="date" value={data} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setData(e.target.value)} style={campo} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12.5, fontWeight: 700, color: 'var(--portal-text)' }}>
                Km no dia
                <input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value.replace(/\D/g, ''))} placeholder="km do painel" style={campo} />
              </label>
            </div>
            {veiculo.itens.length > 1 && (
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--portal-text)' }}>Feito junto (mesma revisão)</span>
                {veiculo.itens.map((i) => (
                  <label key={i.plano.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--portal-text)' }}>
                    <input type="checkbox" checked={juntos.has(i.plano.id)}
                      onChange={() => setJuntos((s) => { const n = new Set(s); if (n.has(i.plano.id)) n.delete(i.plano.id); else n.add(i.plano.id); return n; })} />
                    {i.plano.nome} <span style={{ color: ESTADO_COR[i.situacao.estado].cor, fontSize: 12 }}>({i.situacao.texto})</span>
                  </label>
                ))}
              </div>
            )}
            <label style={{ display: 'grid', gap: 4, fontSize: 12.5, fontWeight: 700, color: 'var(--portal-text)' }}>
              Observação (oficina, NF, peças)
              <input value={obs} onChange={(e) => setObs(e.target.value)} style={campo} />
            </label>
            {msg && <span style={{ color: '#b91c1c', fontSize: 13 }}>{msg}</span>}
            <button type="button" disabled={salvando || !juntos.size || !data} onClick={salvar}
              style={{ minHeight: 46, border: 'none', background: '#15803d', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {salvando ? <Loader2 size={18} className="spin" /> : <Check size={18} />} Registrar {juntos.size > 1 ? `${juntos.size} itens` : 'serviço'}
            </button>
          </>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--portal-text-secondary)' }}>Quem registra é o pós-vendas ou quem edita a Ficha.</span>
        )}
      </div>
    </div>
  );
}
