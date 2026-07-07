'use client';
// Abastecimento da frota — upload mensal do CSV da operadora de cartão-frota
// + dashboard (evolução, rankings, preço médio e consumo km/l).
// Permissões: abastecimento:upload (importar/lotes) e abastecimento:dashboard (relatórios).

import { useCallback, useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { Card, fmtRS } from '@/components/estoque/ui';
import UploadLotes from '@/components/abastecimento/UploadLotes';
import type { DashboardAbastecimento } from '@/lib/abastecimento/tipos';

const COR_VALOR = '#dc2626'; // R$ (identidade do portal)
const COR_LITROS = '#2563eb'; // litros

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const thStyle: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.82rem' };
const selStyle: React.CSSProperties = { padding: '8px 10px', border: '1px solid #ddd', borderRadius: 8, fontSize: '.82rem', background: '#fff', color: '#444' };

function fmtL(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' L';
}
function fmtKm(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' km';
}
function rotuloMes(mes: string): string {
  const [ano, m] = mes.split('-');
  return `${MESES_ABREV[Number(m) - 1]}/${ano.slice(2)}`;
}
function isoHoje(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoMesesAtras(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}
function isoInicioMes(): string {
  return isoHoje().slice(0, 8) + '01';
}

type Preset = 'mes' | '3m' | '12m' | 'custom';

function KPI({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
      <div style={{ color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#333' }}>{valor}</div>
    </div>
  );
}

// Gráfico de barras horizontal (rankings). Uma série só — o título identifica.
function RankingChart({ dados, cor, formato }: {
  dados: { nome: string; valor: number }[];
  cor: string;
  formato: (v: number) => string;
}) {
  const altura = Math.max(180, dados.length * 32);
  return (
    <div style={{ width: '100%', height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} layout="vertical" margin={{ left: 8, right: 24 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#888' }} tickFormatter={(v) => formato(Number(v))} />
          <YAxis type="category" dataKey="nome" width={150} tick={{ fontSize: 11, fill: '#444' }} />
          <Tooltip formatter={(v) => formato(Number(v))} labelStyle={{ color: '#444' }} />
          <Bar dataKey="valor" fill={cor} radius={[0, 4, 4, 0]} barSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function AbastecimentoPage() {
  const { userProfile } = useAuth();
  const { pode, isAdmin, loading: permLoading } = usePermissoes(userProfile?.id);
  const podeDash = pode('abastecimento', 'dashboard');
  const podeUpload = pode('abastecimento', 'upload');

  const [preset, setPreset] = useState<Preset>('12m');
  const [de, setDe] = useState(isoMesesAtras(12));
  const [ate, setAte] = useState(isoHoje());
  const [filial, setFilial] = useState('');
  const [placa, setPlaca] = useState('');

  const [dados, setDados] = useState<DashboardAbastecimento | null>(null);
  const [opcoes, setOpcoes] = useState<{ filiais: string[]; placas: string[] }>({ filiais: [], placas: [] });
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const aplicarPreset = (p: Preset) => {
    setPreset(p);
    if (p === 'mes') { setDe(isoInicioMes()); setAte(isoHoje()); }
    if (p === '3m') { setDe(isoMesesAtras(3)); setAte(isoHoje()); }
    if (p === '12m') { setDe(isoMesesAtras(12)); setAte(isoHoje()); }
  };

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const params = new URLSearchParams({ de, ate });
      if (filial) params.set('filial', filial);
      if (placa) params.set('placa', placa);
      const r = await fetch(`/api/abastecimento/dashboard?${params}`);
      const d = await r.json();
      if (!r.ok) { setErro(d.error || 'Erro ao carregar.'); return; }
      setDados(d as DashboardAbastecimento);
      // opções dos selects: só do resultado sem filtro (senão o dropdown encolhe)
      if (!filial && !placa) setOpcoes((d as DashboardAbastecimento).opcoesFiltro);
    } catch (e) {
      setErro('Erro: ' + (e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [de, ate, filial, placa]);

  useEffect(() => {
    if (podeDash) carregar();
  }, [carregar, podeDash]);

  if (permLoading || !userProfile) {
    return <div style={{ padding: 40, color: '#888' }}>Carregando…</div>;
  }
  if (!podeDash && !podeUpload) return <SemPermissao />;

  const evolucao = dados?.evolucaoMensal.map((m) => ({ ...m, rotulo: rotuloMes(m.mes) })) || [];

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#333', marginBottom: 4 }}>Abastecimento da Frota</h1>
      <p style={{ color: '#888', fontSize: '.82rem', marginBottom: 16 }}>
        Gastos com combustível por veículo, motorista e posto — importados do relatório mensal da operadora.
      </p>

      {podeUpload && (
        <UploadLotes
          usuario={userProfile.nome || ''}
          usuarioId={userProfile.id}
          isAdmin={isAdmin}
          onMudou={carregar}
        />
      )}

      {podeDash && (
        <>
          {/* filtros */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '16px 0' }}>
            {(['mes', '3m', '12m'] as Preset[]).map((p) => (
              <button
                key={p}
                onClick={() => aplicarPreset(p)}
                style={{ ...selStyle, cursor: 'pointer', fontWeight: preset === p ? 700 : 400, borderColor: preset === p ? '#dc2626' : '#ddd', color: preset === p ? '#dc2626' : '#444' }}
              >
                {p === 'mes' ? 'Mês atual' : p === '3m' ? 'Últimos 3 meses' : 'Últimos 12 meses'}
              </button>
            ))}
            <input type="date" value={de} onChange={(e) => { setDe(e.target.value); setPreset('custom'); }} style={selStyle} />
            <span style={{ color: '#888', fontSize: '.8rem' }}>a</span>
            <input type="date" value={ate} onChange={(e) => { setAte(e.target.value); setPreset('custom'); }} style={selStyle} />
            <select value={filial} onChange={(e) => setFilial(e.target.value)} style={selStyle}>
              <option value="">Todas as filiais</option>
              {opcoes.filiais.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <select value={placa} onChange={(e) => setPlaca(e.target.value)} style={selStyle}>
              <option value="">Todos os veículos</option>
              {opcoes.placas.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {carregando && <span style={{ color: '#888', fontSize: '.8rem' }}>Carregando…</span>}
          </div>

          {erro && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 8, padding: '10px 12px', fontSize: '.82rem', marginBottom: 16 }}>
              {erro}
            </div>
          )}

          {dados && (
            <>
              {/* KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
                <KPI label="Gasto total" valor={fmtRS(dados.totais.valor)} />
                <KPI label="Litros" valor={fmtL(dados.totais.litros)} />
                <KPI label="Abastecimentos" valor={String(dados.totais.transacoes)} />
                <KPI label="Veículos" valor={String(dados.totais.veiculos)} />
                <KPI label="Preço médio do litro" valor={fmtRS(dados.totais.precoMedioLitro)} />
              </div>

              {/* evolução mensal — dois gráficos (R$ e litros), um eixo cada */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
                <Card titulo="Gasto por mês (R$)">
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={evolucao}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#888' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#888' }} tickFormatter={(v) => (Number(v) / 1000).toLocaleString('pt-BR') + 'k'} />
                        <Tooltip formatter={(v) => fmtRS(Number(v))} labelStyle={{ color: '#444' }} />
                        <Bar dataKey="valor" name="Gasto" fill={COR_VALOR} radius={[4, 4, 0, 0]} barSize={26} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card titulo="Litros por mês">
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={evolucao}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#888' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#888' }} />
                        <Tooltip formatter={(v) => fmtL(Number(v))} labelStyle={{ color: '#444' }} />
                        <Bar dataKey="litros" name="Litros" fill={COR_LITROS} radius={[4, 4, 0, 0]} barSize={26} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>

              {/* rankings */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
                <Card titulo="Gasto por veículo (top 15)">
                  <RankingChart
                    dados={dados.porVeiculo.slice(0, 15).map((v) => ({ nome: v.detalhe ? `${v.chave} · ${v.detalhe}` : v.chave, valor: v.valor }))}
                    cor={COR_VALOR}
                    formato={(v) => fmtRS(v)}
                  />
                </Card>
                <Card titulo="Gasto por motorista (top 15)">
                  <RankingChart
                    dados={dados.porMotorista.slice(0, 15).map((m) => ({ nome: m.chave, valor: m.valor }))}
                    cor={COR_VALOR}
                    formato={(v) => fmtRS(v)}
                  />
                </Card>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
                <Card titulo="Gasto por posto">
                  <RankingChart
                    dados={dados.porPosto.slice(0, 12).map((p) => ({ nome: p.detalhe ? `${p.chave} · ${p.detalhe}` : p.chave, valor: p.valor }))}
                    cor={COR_VALOR}
                    formato={(v) => fmtRS(v)}
                  />
                </Card>
                <Card titulo="Por combustível">
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Combustível</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>Litros</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>Gasto</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>Preço médio/L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dados.porCombustivel.map((c) => (
                          <tr key={c.combustivel}>
                            <td style={tdStyle}>{c.combustivel}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtL(c.litros)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtRS(c.valor)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtRS(c.precoMedio)}</td>
                          </tr>
                        ))}
                        {dados.porCombustivel.length === 0 && (
                          <tr><td style={tdStyle} colSpan={4}>Sem dados no período.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>

              {/* consumo km/l */}
              <Card titulo="Consumo por veículo (km/l pelo hodômetro)">
                <p style={{ color: '#888', fontSize: '.76rem', marginBottom: 10 }}>
                  Calculado entre abastecimentos com hodômetro informado. Trechos com quilometragem
                  negativa ou acima de 5.000 km (erro de digitação do motorista) são descartados e
                  contados na última coluna.
                </p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Veículo</th>
                        <th style={thStyle}>Modelo</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Km rodados</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Litros</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Km/L</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Trechos</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Descartados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.consumo.map((c) => (
                        <tr key={c.placa}>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{c.placa}</td>
                          <td style={tdStyle}>{c.modelo || '—'}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtKm(c.kmRodado)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtL(c.litrosConsiderados)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#333' }}>
                            {c.kmPorLitro > 0 ? c.kmPorLitro.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{c.trechos}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: c.trechosDescartados ? '#b45309' : '#444' }}>{c.trechosDescartados}</td>
                        </tr>
                      ))}
                      {dados.consumo.length === 0 && (
                        <tr><td style={tdStyle} colSpan={7}>Sem dados de hodômetro no período.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
