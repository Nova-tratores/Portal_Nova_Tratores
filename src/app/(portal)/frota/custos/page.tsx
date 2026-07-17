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
import { DollarSign, Fuel, Wrench, ShieldAlert, Gauge, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatarPlaca, PLACAS_AVULSAS } from '@/lib/frota/placa';

const fmtRS = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtRS2 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = (s: string) => new Date(`${String(s).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');

interface LinhaTco {
  veiculo_id: string;
  placa: string;
  modelo: string | null;
  tem_rastreador: boolean;
  avulso: boolean;
  ativo: boolean;
  status: string | null;
  km: number;
  combustivel: number;
  manutencao: number;
  multas: number;
  outros: number;
  total: number;
}

interface EntradaCusto {
  veiculo_id: string;
  data: string;
  tipo: string;
  valor: number;
  fonte: string | null;
}

const FONTE_LABEL: Record<string, string> = {
  abastecimentos: 'cartão combustível',
  requisicao: 'requisição',
  rotaexata: 'Rota Exata',
  multa: 'multa de trânsito',
  manual: 'lançamento manual',
};

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
  const [entradas, setEntradas] = useState<EntradaCusto[]>([]); // lançamentos crus (pro modal)
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [modalId, setModalId] = useState<string | null>(null);
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
        supabase.from('frota_veiculos').select('id, placa, modelo, descricao, marca, tem_rastreador, tipo_registro, placa_exibicao, ativo, status'),
        buscarTudo('vw_frota_custos', 'veiculo_id, tipo, valor, data, fonte', deIso),
        buscarTudo('frota_dias', 'veiculo_id, km_total, km_odometro', deIso),
      ]);
      if (veic.error) throw new Error(veic.error.message);
      setEntradas(custos as EntradaCusto[]);

      const porVeiculo = new Map<string, LinhaTco>();
      for (const v of veic.data || []) {
        porVeiculo.set(v.id, {
          veiculo_id: v.id,
          placa: v.placa,
          modelo: PLACAS_AVULSAS[v.placa] || [v.marca, v.modelo || v.descricao].filter(Boolean).join(' ') || null,
          tem_rastreador: !!v.tem_rastreador,
          avulso: v.tipo_registro !== 'veiculo',
          ativo: !!v.ativo,
          status: v.status || null,
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

  const todosCarros = useMemo(() => linhas.filter((l) => !l.avulso), [linhas]);
  const foraDaFrota = useMemo(() => todosCarros.filter((l) => !l.ativo), [todosCarros]);
  // vendidos/arquivados fora por padrão (mesma régua do resto do módulo)
  const carros = useMemo(
    () => (mostrarInativos ? todosCarros : todosCarros.filter((l) => l.ativo)),
    [todosCarros, mostrarInativos],
  );
  const avulsos = useMemo(() => linhas.filter((l) => l.avulso), [linhas]);
  const soma = (ls: LinhaTco[], k: keyof LinhaTco) => ls.reduce((s, l) => s + (l[k] as number), 0);
  const linhaModal = modalId ? linhas.find((l) => l.veiculo_id === modalId) || null : null;

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

      {foraDaFrota.length > 0 && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--portal-text-secondary)', cursor: 'pointer', marginBottom: 10 }}>
          <input type="checkbox" checked={mostrarInativos} onChange={() => setMostrarInativos((v) => !v)} />
          mostrar vendidos/arquivados ({foraDaFrota.length})
        </label>
      )}

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
                  <tr
                    key={l.veiculo_id}
                    onClick={() => setModalId(l.veiculo_id)}
                    title="Clique pra ver todos os lançamentos deste veículo"
                    style={{ borderTop: '1px solid var(--portal-border)', cursor: 'pointer', opacity: l.ativo ? 1 : 0.6 }}
                  >
                    <td style={{ ...td, textAlign: 'left' }}>
                      <strong style={{ color: 'var(--portal-text)' }}>{formatarPlaca(l.placa)}</strong>
                      {l.modelo && <span style={{ color: 'var(--portal-text-muted)' }}> · {l.modelo}</span>}
                      {l.status === 'vendido' && (
                        <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 800, color: '#6d28d9', background: '#ede9fe', borderRadius: 999, padding: '2px 7px' }}>VENDIDO</span>
                      )}
                      {l.status === 'arquivado' && (
                        <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 800, color: '#475569', background: '#e2e8f0', borderRadius: 999, padding: '2px 7px' }}>ARQUIVADO</span>
                      )}
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

      {/* Modal: todos os lançamentos do veículo clicado (o extrato do TCO) */}
      {linhaModal && (
        <ModalCustos
          linha={linhaModal}
          meses={meses}
          entradas={entradas.filter((e) => e.veiculo_id === linhaModal.veiculo_id)}
          onClose={() => setModalId(null)}
        />
      )}
    </div>
  );
}

function ModalCustos({ linha, meses, entradas, onClose }: {
  linha: LinhaTco;
  meses: number;
  entradas: EntradaCusto[];
  onClose: () => void;
}) {
  const rkm = linha.km >= 50 ? linha.total / linha.km : null;
  // agrupa por TIPO, cada grupo com subtotal e lançamentos em ordem cronológica inversa
  const grupos = useMemo(() => {
    const porTipo = new Map<string, EntradaCusto[]>();
    for (const e of entradas) {
      const t = e.tipo || 'Outros';
      const l = porTipo.get(t) || [];
      l.push(e);
      porTipo.set(t, l);
    }
    return [...porTipo.entries()]
      .map(([tipo, itens]) => ({
        tipo,
        itens: [...itens].sort((a, b) => String(b.data).localeCompare(String(a.data))),
        total: itens.reduce((s, i) => s + (Number(i.valor) || 0), 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [entradas]);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 950, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(680px, 96vw)', maxHeight: '85vh', background: 'var(--portal-bg)', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,0.4)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--portal-border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <DollarSign size={17} color="#0d9488" />
          <strong style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-text)' }}>Custos · {formatarPlaca(linha.placa)}</strong>
          {linha.modelo && <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>{linha.modelo}</span>}
          {linha.status === 'vendido' && <span style={{ fontSize: 9.5, fontWeight: 800, color: '#6d28d9', background: '#ede9fe', borderRadius: 999, padding: '2px 7px' }}>VENDIDO</span>}
          {linha.status === 'arquivado' && <span style={{ fontSize: 9.5, fontWeight: 800, color: '#475569', background: '#e2e8f0', borderRadius: 999, padding: '2px 7px' }}>ARQUIVADO</span>}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--portal-border)', display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>
          <span>Últimos {meses} meses</span>
          <span><strong style={{ color: 'var(--portal-text)' }}>{fmtRS(linha.total)}</strong> em {entradas.length} lançamento{entradas.length !== 1 ? 's' : ''}</span>
          {linha.tem_rastreador && <span>{Math.round(linha.km).toLocaleString('pt-BR')} km</span>}
          {rkm != null && <span style={{ fontWeight: 700, color: rkm > 1.5 ? '#b45309' : '#0f766e' }}>{fmtRS2(rkm)}/km</span>}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
          {grupos.length === 0 && <div style={{ fontSize: 13, color: 'var(--portal-text-muted)', padding: 20, textAlign: 'center' }}>Nenhum lançamento no período.</div>}
          {grupos.map((g) => (
            <div key={g.tipo} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: 8, fontSize: 12.5 }}>
                <strong style={{ color: 'var(--portal-text)' }}>{g.tipo}</strong>
                <span style={{ color: 'var(--portal-text-muted)' }}>{g.itens.length}</span>
                <div style={{ flex: 1 }} />
                <strong style={{ color: '#0d9488' }}>{fmtRS(g.total)}</strong>
              </div>
              {g.itens.map((e, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 10px 4px 22px', fontSize: 12, color: 'var(--portal-text-secondary)', borderBottom: '1px dashed var(--portal-border)' }}>
                  <span style={{ minWidth: 70 }}>{fmtData(e.data)}</span>
                  <span style={{ flex: 1, color: 'var(--portal-text-muted)', fontSize: 11 }}>{FONTE_LABEL[e.fonte || ''] || e.fonte || '—'}</span>
                  <strong style={{ color: 'var(--portal-text)' }}>{fmtRS2(Number(e.valor))}</strong>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
