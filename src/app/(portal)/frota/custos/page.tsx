'use client';
// Frota > Custos (TCO) — quanto cada veículo CUSTA por km rodado.
//
// Fontes (tudo leitura autenticada, direto das views/tabelas):
//  - vw_frota_custos: combustível + manutenção + multas, cada real conta UMA
//    vez (a view v2 já resolve o anti-duplo-conto)
//  - frota_dias: km rodado por dia (km_odometro do rastreador > km haversine)
//    — veículo sem rastreador mostra os custos mas fica sem R$/km
// Os "baldes" avulsos (CLI0002 clientes / TRA0001 tratores / 0000000
// quadriciclos) entram numa linha separada: o cartão pagou de verdade, mas
// não são carros — não têm km nem entram no ranking.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DollarSign, Fuel, Wrench, ShieldAlert, Gauge } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatarPlaca, PLACAS_AVULSAS } from '@/lib/frota/placa';

const fmtRS = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtRS2 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface LinhaTco {
  veiculo_id: string;
  placa: string;
  modelo: string | null;
  tem_rastreador: boolean;
  avulso: boolean;
  km: number;
  combustivel: number;
  manutencao: number;
  multas: number;
  outros: number;
  total: number;
}

async function buscarTudo(tabela: string, colunas: string, de: string): Promise<any[]> {
  // PostgREST devolve no máx. 1000 por request — pagina até secar
  const out: any[] = [];
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const { data, error } = await supabase
      .from(tabela)
      .select(colunas)
      .gte('data', de)
      .range(offset, offset + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export default function FrotaCustosPage() {
  const [meses, setMeses] = useState(12);
  const [linhas, setLinhas] = useState<LinhaTco[]>([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const de = new Date();
      de.setMonth(de.getMonth() - meses);
      const deIso = de.toISOString().slice(0, 10);

      const [veic, custos, dias] = await Promise.all([
        supabase.from('frota_veiculos').select('id, placa, modelo, descricao, marca, tem_rastreador, tipo_registro, placa_exibicao'),
        buscarTudo('vw_frota_custos', 'veiculo_id, tipo, valor', deIso),
        buscarTudo('frota_dias', 'veiculo_id, km_total, km_odometro', deIso),
      ]);
      if (veic.error) throw new Error(veic.error.message);

      const porVeiculo = new Map<string, LinhaTco>();
      for (const v of veic.data || []) {
        porVeiculo.set(v.id, {
          veiculo_id: v.id,
          placa: v.placa,
          modelo: PLACAS_AVULSAS[v.placa] || [v.marca, v.modelo || v.descricao].filter(Boolean).join(' ') || null,
          tem_rastreador: !!v.tem_rastreador,
          avulso: v.tipo_registro !== 'veiculo',
          km: 0, combustivel: 0, manutencao: 0, multas: 0, outros: 0, total: 0,
        });
      }
      for (const c of custos) {
        const l = porVeiculo.get(c.veiculo_id);
        if (!l) continue;
        const valor = Number(c.valor) || 0;
        const tipo = String(c.tipo || '').toLowerCase();
        if (tipo.includes('combust')) l.combustivel += valor;
        else if (tipo.includes('manut')) l.manutencao += valor;
        else if (tipo.includes('multa')) l.multas += valor;
        else l.outros += valor;
        l.total += valor;
      }
      for (const d of dias) {
        const l = porVeiculo.get(d.veiculo_id);
        if (l) l.km += Number(d.km_odometro ?? d.km_total) || 0;
      }

      setLinhas(
        [...porVeiculo.values()]
          .filter((l) => l.total > 0 || l.km > 0)
          .sort((a, b) => b.total - a.total),
      );
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    setCarregando(false);
  }, [meses]);
  useEffect(() => { carregar(); }, [carregar]);

  const carros = useMemo(() => linhas.filter((l) => !l.avulso), [linhas]);
  const avulsos = useMemo(() => linhas.filter((l) => l.avulso), [linhas]);
  const soma = (ls: LinhaTco[], k: keyof LinhaTco) => ls.reduce((s, l) => s + (l[k] as number), 0);

  const th: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'right', padding: '10px 12px' };
  const td: React.CSSProperties = { fontSize: 12.5, color: 'var(--portal-text-secondary)', textAlign: 'right', padding: '8px 12px', whiteSpace: 'nowrap' };

  return (
    <div style={{ padding: '28px 40px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <DollarSign size={20} color="#0d9488" /> Custos & TCO
        </h2>
        <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>
          combustível + manutenção + multas ÷ km rodado — quem custa caro aparece primeiro
        </span>
        <div style={{ flex: 1 }} />
        <select value={meses} onChange={(e) => setMeses(Number(e.target.value))} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 12.5 }}>
          <option value={3}>Últimos 3 meses</option>
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Últimos 12 meses</option>
        </select>
      </div>

      {erro && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{erro}</div>}
      {carregando && <div style={{ color: 'var(--portal-text-muted)', fontSize: 13 }}>Carregando…</div>}

      {!carregando && (
        <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 12, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
            <thead>
              <tr style={{ background: 'var(--portal-bg-secondary)' }}>
                <th style={{ ...th, textAlign: 'left' }}>Veículo</th>
                <th style={th}><span title="Soma dos dias fechados (hodômetro do rastreador quando há)"><Gauge size={11} style={{ verticalAlign: '-1px' }} /> KM</span></th>
                <th style={th}><Fuel size={11} style={{ verticalAlign: '-1px' }} /> Combustível</th>
                <th style={th}><Wrench size={11} style={{ verticalAlign: '-1px' }} /> Manutenção</th>
                <th style={th}><ShieldAlert size={11} style={{ verticalAlign: '-1px' }} /> Multas</th>
                <th style={th}>Outros</th>
                <th style={th}>Total</th>
                <th style={th}>R$/km</th>
              </tr>
            </thead>
            <tbody>
              {carros.map((l) => {
                const rkm = l.km >= 50 ? l.total / l.km : null; // km de menos = divisão mentirosa
                return (
                  <tr key={l.veiculo_id} style={{ borderTop: '1px solid var(--portal-border)' }}>
                    <td style={{ ...td, textAlign: 'left' }}>
                      <strong style={{ color: 'var(--portal-text)' }}>{formatarPlaca(l.placa)}</strong>
                      {l.modelo && <span style={{ color: 'var(--portal-text-muted)' }}> · {l.modelo}</span>}
                    </td>
                    <td style={td} title={l.tem_rastreador ? undefined : 'Sem rastreador — km indisponível'}>
                      {l.tem_rastreador ? Math.round(l.km).toLocaleString('pt-BR') : '—'}
                    </td>
                    <td style={td}>{l.combustivel ? fmtRS(l.combustivel) : '—'}</td>
                    <td style={td}>{l.manutencao ? fmtRS(l.manutencao) : '—'}</td>
                    <td style={{ ...td, color: l.multas > 0 ? '#b91c1c' : undefined }}>{l.multas ? fmtRS(l.multas) : '—'}</td>
                    <td style={td}>{l.outros ? fmtRS(l.outros) : '—'}</td>
                    <td style={{ ...td, fontWeight: 800, color: 'var(--portal-text)' }}>{fmtRS(l.total)}</td>
                    <td style={{ ...td, fontWeight: 700, color: rkm != null && rkm > 1.5 ? '#b45309' : '#0f766e' }}>
                      {rkm != null ? fmtRS2(rkm) : '—'}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: '2px solid var(--portal-border)', background: 'var(--portal-bg-secondary)' }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 800, color: 'var(--portal-text)' }}>Total ({carros.length} veículos)</td>
                <td style={{ ...td, fontWeight: 700 }}>{Math.round(soma(carros, 'km')).toLocaleString('pt-BR')}</td>
                <td style={{ ...td, fontWeight: 700 }}>{fmtRS(soma(carros, 'combustivel'))}</td>
                <td style={{ ...td, fontWeight: 700 }}>{fmtRS(soma(carros, 'manutencao'))}</td>
                <td style={{ ...td, fontWeight: 700, color: '#b91c1c' }}>{fmtRS(soma(carros, 'multas'))}</td>
                <td style={{ ...td, fontWeight: 700 }}>{fmtRS(soma(carros, 'outros'))}</td>
                <td style={{ ...td, fontWeight: 800, color: 'var(--portal-text)' }}>{fmtRS(soma(carros, 'total'))}</td>
                <td style={td} />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {!carregando && avulsos.length > 0 && (
        <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>
          <strong style={{ color: 'var(--portal-text)' }}>Abastecimento avulso</strong> (não são carros — sem km):{' '}
          {avulsos.map((a) => `${a.modelo || a.placa} ${fmtRS(a.total)}`).join(' · ')}
          {' — total '}<strong>{fmtRS(soma(avulsos, 'total'))}</strong>
        </div>
      )}
    </div>
  );
}
