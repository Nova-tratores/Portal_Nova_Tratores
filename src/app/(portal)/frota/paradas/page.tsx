'use client';
// Frota > Paradas & trajetos — o resumo diário por veículo (km, PARTIDAS,
// tempo LIGADO, marcha lenta) e as paradas classificadas, com o filtro que o
// usuário pediu: só as ATÍPICAS (fora de cliente/loja/visita/abastecimento).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coffee, MapPin, MessageSquarePlus, EyeOff, ExternalLink, Gauge } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { authHeaders } from '@/lib/auth/client';
import { formatarPlaca } from '@/lib/frota/placa';
import { MSG_SEM_PERMISSAO } from '@/lib/permissoes/ui';

const fmtData = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString('pt-BR');
const fmtHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtMin = (min: number | null) => {
  const m = Number(min) || 0;
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}min`;
};

const CLASSE_LABEL: Record<string, string> = {
  loja: 'Loja', cliente: 'Cliente', manutencao: 'Manutenção', estacionamento: 'Estacionamento',
  descarga: 'Descarga', outro_destino: 'Destino cadastrado', visita: 'Visita comercial',
  cliente_portal: 'Propriedade de cliente',
  abastecimento: 'Abastecimento', fora_geocerca: 'FORA DE GEOCERCA',
};

interface DiaRow {
  veiculo_id: string; placa: string; data: string; motorista_nome: string | null;
  km_total: number; km_odometro: number | null; partidas: number;
  tempo_ligado_min: number; tempo_marcha_lenta_min: number;
  paradas_total: number; paradas_atipicas: number; posicoes_total: number;
}
interface ParadaRow {
  id: string; placa: string; data: string; inicio: string; fim: string | null;
  duracao_min: number; latitude: number; longitude: number; classe: string;
  destino_nome: string | null; atipica: boolean; nivel: string | null;
  fora_horario: boolean; fim_de_semana: boolean; justificativa: string | null;
  justificado_por: string | null; ignorada: boolean;
}

export default function FrotaParadasPage() {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeJustificar = pode('frota', 'paradas:justificar');

  const [periodo, setPeriodo] = useState(14); // dias
  const [placaFiltro, setPlacaFiltro] = useState('');
  const [soAtipicas, setSoAtipicas] = useState(true);
  const [duracaoMin, setDuracaoMin] = useState(15);
  const [dias, setDias] = useState<DiaRow[]>([]);
  const [paradas, setParadas] = useState<ParadaRow[]>([]);
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState('');

  const carregar = useCallback(async () => {
    const de = new Date(Date.now() - periodo * 86400_000).toISOString().slice(0, 10);
    const [d, p] = await Promise.all([
      supabase.from('frota_dias').select('*').gte('data', de).order('data', { ascending: false }),
      supabase.from('frota_paradas').select('*').gte('data', de).order('inicio', { ascending: false }).limit(800),
    ]);
    if (d.error || p.error) { setErro((d.error || p.error)!.message); return; }
    setDias((d.data || []) as DiaRow[]);
    setParadas((p.data || []) as ParadaRow[]);
  }, [periodo]);
  useEffect(() => { carregar(); }, [carregar]);

  const placas = useMemo(() => [...new Set(dias.map((d) => d.placa))].sort(), [dias]);

  const diasVisiveis = useMemo(
    () => dias.filter((d) => (!placaFiltro || d.placa === placaFiltro) && d.posicoes_total > 0),
    [dias, placaFiltro],
  );
  const paradasVisiveis = useMemo(
    () =>
      paradas.filter(
        (p) =>
          (!placaFiltro || p.placa === placaFiltro) &&
          (!soAtipicas || (p.atipica && !p.ignorada)) &&
          p.duracao_min >= duracaoMin,
      ),
    [paradas, placaFiltro, soAtipicas, duracaoMin],
  );

  const justificar = async (p: ParadaRow) => {
    const texto = prompt(`Justificativa da parada de ${fmtMin(p.duracao_min)} em ${fmtData(p.data)}:`, p.justificativa || '');
    if (texto === null) return;
    setBusy(p.id);
    try {
      const r = await fetch('/api/frota/paradas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ id: p.id, justificativa: texto }),
      });
      if (!r.ok) { const d = await r.json(); alert(d.error || 'Falha ao salvar.'); return; }
      await carregar();
    } finally { setBusy(''); }
  };

  const ignorar = async (p: ParadaRow) => {
    setBusy(p.id);
    try {
      const r = await fetch('/api/frota/paradas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ id: p.id, ignorada: !p.ignorada }),
      });
      if (!r.ok) { const d = await r.json(); alert(d.error || 'Falha.'); return; }
      await carregar();
    } finally { setBusy(''); }
  };

  const selStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 8, border: '1px solid var(--portal-border)',
    background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 12.5,
  };

  return (
    <div style={{ padding: '28px 40px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Coffee size={20} color="#0d9488" /> Paradas & trajetos
        </h2>
        <div style={{ flex: 1 }} />
        <select value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))} style={selStyle}>
          <option value={7}>últimos 7 dias</option>
          <option value={14}>últimos 14 dias</option>
          <option value={30}>últimos 30 dias</option>
        </select>
        <select value={placaFiltro} onChange={(e) => setPlacaFiltro(e.target.value)} style={selStyle}>
          <option value="">todos os veículos</option>
          {placas.map((p) => <option key={p} value={p}>{formatarPlaca(p)}</option>)}
        </select>
        <select value={duracaoMin} onChange={(e) => setDuracaoMin(Number(e.target.value))} style={selStyle}>
          <option value={0}>qualquer duração</option>
          <option value={15}>≥ 15 min</option>
          <option value={30}>≥ 30 min</option>
          <option value={60}>≥ 1 h</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--portal-text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={soAtipicas} onChange={() => setSoAtipicas((v) => !v)} /> só atípicas
        </label>
      </div>

      {erro && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 10 }}>{erro}</div>}
      {dias.length === 0 && !erro && (
        <div style={{ color: 'var(--portal-text-muted)', fontSize: 13, marginBottom: 16 }}>
          Nenhum dia consolidado ainda — o fechamento roda de madrugada (ou peça um backfill).
        </div>
      )}

      {/* Paradas (o foco: as atípicas) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {soAtipicas ? `Paradas atípicas (${paradasVisiveis.length})` : `Paradas (${paradasVisiveis.length})`}
        </div>
        {paradasVisiveis.length === 0 && (
          <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>Nada por aqui. 🎉</span>
        )}
        {paradasVisiveis.map((p) => (
          <div key={p.id} style={{ background: 'var(--portal-bg-card)', border: `1px solid ${p.atipica && !p.ignorada ? '#fca5a5' : 'var(--portal-border)'}`, borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', opacity: p.ignorada ? 0.55 : 1 }}>
            <div style={{ minWidth: 88 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--portal-text)' }}>{formatarPlaca(p.placa)}</div>
              <div style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>{fmtData(p.data)}</div>
            </div>
            <div style={{ minWidth: 110 }}>
              <div style={{ fontSize: 12.5, color: 'var(--portal-text)' }}>{fmtHora(p.inicio)} → {fmtHora(p.fim)}</div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: p.duracao_min >= 60 ? '#b91c1c' : 'var(--portal-text-secondary)' }}>{fmtMin(p.duracao_min)} parado</div>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: p.atipica ? '#b91c1c' : '#0f766e', background: p.atipica ? '#fee2e2' : '#ccfbf1', borderRadius: 999, padding: '2px 8px' }}>
                {CLASSE_LABEL[p.classe] || p.classe}
              </span>
              {p.destino_nome && <span style={{ fontSize: 12, color: 'var(--portal-text-secondary)', marginLeft: 6 }}>{p.destino_nome}</span>}
              {p.fora_horario && <span style={{ fontSize: 10.5, color: '#b45309', marginLeft: 6 }}>fora de horário</span>}
              {p.fim_de_semana && <span style={{ fontSize: 10.5, color: '#7c3aed', marginLeft: 6 }}>fim de semana</span>}
              {p.justificativa && (
                <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)', marginTop: 2 }}>
                  💬 {p.justificativa} <span style={{ opacity: 0.7 }}>({p.justificado_por})</span>
                </div>
              )}
            </div>
            <a
              href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`}
              target="_blank" rel="noopener noreferrer"
              title="Ver o local no mapa"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#0d9488', textDecoration: 'none', fontWeight: 600 }}
            >
              <MapPin size={12} /> local <ExternalLink size={10} />
            </a>
            {p.atipica && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => justificar(p)}
                  disabled={!podeJustificar || busy === p.id}
                  title={podeJustificar ? 'Justificar a parada' : MSG_SEM_PERMISSAO}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text-secondary)', fontSize: 11.5, fontWeight: 600, cursor: podeJustificar ? 'pointer' : 'not-allowed', opacity: podeJustificar ? 1 : 0.5 }}
                >
                  <MessageSquarePlus size={12} /> justificar
                </button>
                <button
                  onClick={() => ignorar(p)}
                  disabled={!podeJustificar || busy === p.id}
                  title={podeJustificar ? (p.ignorada ? 'Voltar a considerar' : 'Ignorar (some do filtro)') : MSG_SEM_PERMISSAO}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text-muted)', fontSize: 11.5, cursor: podeJustificar ? 'pointer' : 'not-allowed', opacity: podeJustificar ? 1 : 0.5 }}
                >
                  <EyeOff size={12} /> {p.ignorada ? 'reativar' : 'ignorar'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Resumo diário (ignição) */}
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Gauge size={13} /> Uso diário (dias com movimento)
      </div>
      <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 12, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 100px 1fr 70px 80px 90px 100px 90px 90px', padding: '10px 14px', background: 'var(--portal-bg-secondary)', fontSize: 10.5, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 860 }}>
          <span>Data</span><span>Placa</span><span>Motorista</span><span>KM</span><span>Partidas</span><span>Ligado</span><span>M. lenta</span><span>Paradas</span><span>Atípicas</span>
        </div>
        {diasVisiveis.map((d) => (
          <div key={`${d.veiculo_id}-${d.data}`} style={{ display: 'grid', gridTemplateColumns: '90px 100px 1fr 70px 80px 90px 100px 90px 90px', padding: '8px 14px', borderTop: '1px solid var(--portal-border)', fontSize: 12.5, color: 'var(--portal-text-secondary)', alignItems: 'center', minWidth: 860 }}>
            <span>{fmtData(d.data)}</span>
            <strong style={{ color: 'var(--portal-text)' }}>{formatarPlaca(d.placa)}</strong>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.motorista_nome || '—'}</span>
            <span>{Number(d.km_odometro ?? d.km_total).toFixed(0)}</span>
            <span>{d.partidas}</span>
            <span>{fmtMin(d.tempo_ligado_min)}</span>
            <span style={{ color: d.tempo_marcha_lenta_min >= 60 ? '#b45309' : undefined }}>{fmtMin(d.tempo_marcha_lenta_min)}</span>
            <span>{d.paradas_total}</span>
            <span style={{ fontWeight: 700, color: d.paradas_atipicas > 0 ? '#b91c1c' : 'var(--portal-text-muted)' }}>{d.paradas_atipicas}</span>
          </div>
        ))}
        {diasVisiveis.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 12.5 }}>Sem dias consolidados no período.</div>
        )}
      </div>
    </div>
  );
}
