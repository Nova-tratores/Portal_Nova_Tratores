'use client';
// Frota > Ranking de uso — quem mais rodou (km) e mais ficou com o motor ligado,
// por veículo ou por motorista, no período escolhido, com quebra por dia,
// semana ou mês. Dados de frota_dias (fechados de madrugada: o último dia é ontem).
import { useEffect, useMemo, useState } from 'react';
import { Trophy, Download } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/client';
import { diaBR } from '@/lib/frota/mapa-vivo';
import { formatarPlaca } from '@/lib/frota/placa';
import {
  METRICA_INFO, PRESETS, baldesDoPeriodo, csvRanking, fmtHoras, fmtKm, fmtValor, montarRanking, periodoDoPreset,
  quebraSugerida, rotuloBalde, totalGeral, valor,
  type AgruparPor, type DiaUso, type Metrica, type Preset, type Quebra,
} from '@/lib/frota/ranking-uso';

const AZUL = '#1e40af';
const QUEBRAS: { id: Quebra; label: string }[] = [
  { id: 'total', label: 'Total' }, { id: 'dia', label: 'Por dia' }, { id: 'semana', label: 'Por semana' }, { id: 'mes', label: 'Por mês' },
];
const METRICAS: Metrica[] = ['km', 'ligado', 'lenta', 'dias'];
const fmtData = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

function Pilulas<T extends string>({ opcoes, valor: v, onChange }: { opcoes: { id: T; label: string }[]; valor: T; onChange: (x: T) => void }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--portal-border)', flexWrap: 'wrap' }}>
      {opcoes.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          style={{ padding: '6px 11px', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            background: v === o.id ? AZUL : 'var(--portal-bg-input)', color: v === o.id ? '#fefefe' : 'var(--portal-text)' }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function RankingUsoPage() {
  const hoje = diaBR();
  const [preset, setPreset] = useState<Preset>('mes');
  const [custom, setCustom] = useState(() => periodoDoPreset('30d', hoje));
  const [por, setPor] = useState<AgruparPor>('veiculo');
  const [metrica, setMetrica] = useState<Metrica>('km');
  const [quebra, setQuebra] = useState<Quebra | null>(null); // null = sugerida pelo período
  // Resultado guardado com a chave do período: "carregando" = a chave não bate.
  const [res, setRes] = useState<{ chave: string; dias: DiaUso[]; ultimoDia: string | null; erro: string }>({ chave: '', dias: [], ultimoDia: null, erro: '' });

  const periodo = preset === 'periodo' ? custom : periodoDoPreset(preset, hoje);
  const q: Quebra = quebra ?? quebraSugerida(periodo.de, periodo.ate);
  const chave = `${periodo.de}|${periodo.ate}`;
  const carregando = res.chave !== chave;
  const dias = res.dias;
  const { ultimoDia, erro } = res;

  useEffect(() => {
    const [de, ate] = chave.split('|');
    if (de > ate) return;
    let vivo = true;
    fetchAuth(`/api/frota/ranking-uso?de=${de}&ate=${ate}`)
      .then(async (r) => {
        const j = await r.json();
        if (!vivo) return;
        if (!r.ok) { setRes({ chave, dias: [], ultimoDia: null, erro: j.error || 'Falha ao carregar.' }); return; }
        setRes({ chave, dias: j.dias || [], ultimoDia: j.ultimoDia || null, erro: '' });
      })
      .catch((e) => vivo && setRes({ chave, dias: [], ultimoDia: null, erro: String(e) }));
    return () => { vivo = false; };
  }, [chave]);

  const linhas = useMemo(() => montarRanking(dias, por, q, metrica), [dias, por, q, metrica]);
  const baldes = useMemo(() => baldesDoPeriodo(periodo.de, periodo.ate, q), [periodo.de, periodo.ate, q]);
  const tot = useMemo(() => totalGeral(linhas), [linhas]);
  const maior = Math.max(1, ...linhas.map((l) => valor(l, metrica)));
  const maiorBalde = Math.max(1, ...linhas.flatMap((l) => Object.values(l.porBalde).map((t) => valor(t, metrica))));

  const baixarCsv = () => {
    const csv = csvRanking(linhas, por, q, metrica, baldes);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ranking-uso-${por}-${periodo.de}_${periodo.ate}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const inp: React.CSSProperties = { padding: '6px 8px', border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 13 };
  const th: React.CSSProperties = { padding: '9px 10px', fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--portal-text)', textAlign: 'right', whiteSpace: 'nowrap', background: 'var(--portal-bg-secondary)', position: 'sticky', top: 0 };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13.5, color: 'var(--portal-text)', textAlign: 'right', whiteSpace: 'nowrap', borderTop: '1px solid var(--portal-border)' };
  const cabMetrica = (m: Metrica, rotulo: string) => (
    <th style={{ ...th, cursor: 'pointer', color: metrica === m ? AZUL : th.color }} onClick={() => setMetrica(m)} title="Ordenar por esta coluna">
      {rotulo}{metrica === m ? ' ▼' : ''}
    </th>
  );
  const nomeLinha = (nome: string) => (por === 'veiculo' ? formatarPlaca(nome) : nome);

  return (
    <div className="frota-pg" style={{ padding: '24px 32px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Trophy size={20} color={AZUL} /> Ranking de uso
        </h2>
        <div style={{ flex: 1 }} />
        <button onClick={baixarCsv} disabled={!linhas.length}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 13, fontWeight: 700, cursor: linhas.length ? 'pointer' : 'not-allowed' }}>
          <Download size={14} /> CSV
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Pilulas opcoes={PRESETS} valor={preset} onChange={(p) => { setPreset(p); setQuebra(null); }} />
          {preset === 'periodo' && (
            <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--portal-text)' }}>
              <input type="date" value={custom.de} min="2026-01-01" max={custom.ate} style={inp}
                onChange={(e) => e.target.value && setCustom((c) => ({ ...c, de: e.target.value }))} />
              até
              <input type="date" value={custom.ate} min={custom.de} style={inp}
                onChange={(e) => e.target.value && setCustom((c) => ({ ...c, ate: e.target.value }))} />
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Pilulas opcoes={[{ id: 'veiculo' as AgruparPor, label: 'Por veículo' }, { id: 'motorista' as AgruparPor, label: 'Por motorista' }]} valor={por} onChange={setPor} />
          <Pilulas opcoes={METRICAS.map((m) => ({ id: m, label: METRICA_INFO[m].label }))} valor={metrica} onChange={setMetrica} />
          <Pilulas opcoes={QUEBRAS} valor={q} onChange={setQuebra} />
        </div>
      </div>

      <div style={{ fontSize: 13, color: 'var(--portal-text)', marginBottom: 12 }}>
        <strong>{fmtData(periodo.de)}</strong> a <strong>{fmtData(periodo.ate)}</strong>
        {' · '}{linhas.length} {por === 'veiculo' ? 'veículos' : 'motoristas'}
        {' · '}<strong>{fmtKm(tot.km)}</strong> · <strong>{fmtHoras(tot.ligado)}</strong> ligado
        {tot.ligado > 0 && <> · {Math.round((tot.lenta / tot.ligado) * 100)}% em marcha lenta</>}
        <span style={{ color: 'var(--portal-text-secondary)' }}>
          {' · '}o dia fecha de madrugada{ultimoDia ? ` (último dia com dados: ${fmtData(ultimoDia)})` : ''}
        </span>
      </div>

      {erro && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 10 }}>{erro}</div>}

      <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', overflow: 'auto', maxHeight: '70vh', opacity: carregando ? 0.5 : 1 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'center', width: 36 }}>#</th>
              <th style={{ ...th, textAlign: 'left', left: 0, zIndex: 2 }}>{por === 'veiculo' ? 'Veículo' : 'Motorista'}</th>
              {q === 'total' ? (
                <>
                  {cabMetrica('km', 'Km')}
                  {cabMetrica('ligado', 'Ligado')}
                  <th style={th}>Movimento</th>
                  {cabMetrica('lenta', 'M. lenta')}
                  {cabMetrica('dias', 'Dias')}
                  <th style={th}>Km/dia</th>
                  <th style={{ ...th, textAlign: 'left', minWidth: 160 }}>{METRICA_INFO[metrica].label}</th>
                </>
              ) : (
                <>
                  {baldes.map((b) => <th key={b} style={th}>{rotuloBalde(b, q)}</th>)}
                  <th style={{ ...th, color: AZUL }}>Total</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={l.chave}>
                <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: i < 3 ? AZUL : td.color }}>{i + 1}</td>
                <td style={{ ...td, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--portal-bg-card)', maxWidth: 'min(260px, 42vw)' }}>
                  <div style={{ fontWeight: 800 }}>{nomeLinha(l.nome)}</div>
                  {l.detalhe && <div style={{ fontSize: 11.5, color: 'var(--portal-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }} title={l.detalhe}>{l.detalhe}</div>}
                </td>
                {q === 'total' ? (
                  <>
                    <td style={{ ...td, fontWeight: metrica === 'km' ? 800 : 400 }}>{Math.round(l.km).toLocaleString('pt-BR')}</td>
                    <td style={{ ...td, fontWeight: metrica === 'ligado' ? 800 : 400 }}>{fmtHoras(l.ligado)}</td>
                    <td style={td}>{fmtHoras(l.movimento)}</td>
                    <td style={{ ...td, fontWeight: metrica === 'lenta' ? 800 : 400, color: l.ligado && l.lenta / l.ligado > 0.25 ? '#b45309' : td.color }}>
                      {fmtHoras(l.lenta)}{l.ligado ? <span style={{ fontSize: 11, opacity: 0.75 }}> ({Math.round((l.lenta / l.ligado) * 100)}%)</span> : null}
                    </td>
                    <td style={{ ...td, fontWeight: metrica === 'dias' ? 800 : 400 }}>{l.dias}</td>
                    <td style={td}>{l.dias ? Math.round(l.km / l.dias).toLocaleString('pt-BR') : '—'}</td>
                    <td style={{ ...td, textAlign: 'left' }}>
                      <div style={{ height: 10, background: AZUL, width: `${(valor(l, metrica) / maior) * 100}%`, minWidth: 2 }} />
                    </td>
                  </>
                ) : (
                  <>
                    {baldes.map((b) => {
                      const t = l.porBalde[b];
                      const f = t ? valor(t, metrica) / maiorBalde : 0;
                      return (
                        <td key={b} style={{ ...td, background: f ? `rgba(30, 64, 175, ${0.08 + f * 0.55})` : undefined, color: f > 0.6 ? '#fefefe' : td.color }}
                          title={t ? `${fmtKm(t.km)} · ${fmtHoras(t.ligado)} ligado · ${fmtHoras(t.lenta)} marcha lenta · ${t.dias} dia(s)` : 'sem uso'}>
                          {fmtValor(t, metrica)}
                        </td>
                      );
                    })}
                    <td style={{ ...td, fontWeight: 800 }}>{fmtValor(l, metrica) || '—'}</td>
                  </>
                )}
              </tr>
            ))}
            {!linhas.length && !carregando && (
              <tr><td colSpan={20} style={{ ...td, textAlign: 'center', padding: 24 }}>Nenhum uso registrado no período.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
