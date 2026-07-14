'use client';
// Popup de drill-down: lista os abastecimentos que compõem o valor clicado
// num gráfico/tabela do dashboard, com ordenação por cabeçalho (A→Z/Z→A) e
// filtro por coluna. Carrega o recorte inteiro de uma vez (volumes pequenos)
// e permite exportar em PDF/CSV.

import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, Treemap, Tooltip } from 'recharts';
import { authHeaders } from '@/lib/auth/client';
import { FileDown, FileSpreadsheet, LayoutGrid, List, X } from 'lucide-react';
import { fmtRS } from '@/components/estoque/ui';
import TabelaOrdenavel, { type ColunaDef } from '@/components/abastecimento/TabelaOrdenavel';
import { gerarPdfTransacoes } from '@/lib/abastecimento/pdf';
import { gerarCsvTransacoes } from '@/lib/abastecimento/csv';
import type { TransacaoRow, TransacoesResp } from '@/lib/abastecimento/tipos';

function fmtDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Colunas do popup: `valor` cru p/ ordenar/filtrar, `render` p/ exibir.
export const COLUNAS_POPUP: ColunaDef<TransacaoRow>[] = [
  { chave: 'data', titulo: 'Data/Hora', valor: (l) => l.data_transacao, render: (l) => fmtDataHora(l.data_transacao) },
  { chave: 'placa', titulo: 'Placa', valor: (l) => l.placa, render: (l) => <strong>{l.placa}</strong> },
  { chave: 'motorista', titulo: 'Motorista', valor: (l) => l.motorista_nome || 'Sem motorista', render: (l) => l.motorista_nome || 'Sem motorista' },
  { chave: 'posto', titulo: 'Posto', valor: (l) => l.posto_nome, render: (l) => l.posto_nome || '—' },
  { chave: 'combustivel', titulo: 'Combustível', valor: (l) => l.combustivel, render: (l) => l.combustivel || '—' },
  { chave: 'litros', titulo: 'Litros', direita: true, valor: (l) => l.litros, render: (l) => l.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) },
  { chave: 'unitario', titulo: 'R$/L', direita: true, valor: (l) => l.valor_unitario, render: (l) => (l.valor_unitario != null ? l.valor_unitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—') },
  { chave: 'total', titulo: 'Total', direita: true, valor: (l) => l.valor_total, render: (l) => <strong>{fmtRS(l.valor_total)}</strong> },
];

export interface DetalheParams {
  titulo: string;
  params: Record<string, string>; // filtros da rota /transacoes (de, ate, mes, placa...)
}

// ----- Treemap da composição -----

type DimensaoTreemap = 'placa' | 'motorista' | 'posto' | 'combustivel';

const DIMENSOES: { id: DimensaoTreemap; label: string; de: (l: TransacaoRow) => string }[] = [
  { id: 'placa', label: 'Veículo', de: (l) => (l.modelo_veiculo ? `${l.modelo_veiculo} · ${l.placa}` : l.placa) },
  { id: 'motorista', label: 'Motorista', de: (l) => l.motorista_nome || 'Sem motorista' },
  { id: 'posto', label: 'Posto', de: (l) => l.posto_nome || 'Posto não informado' },
  { id: 'combustivel', label: 'Combustível', de: (l) => l.combustivel || 'Não informado' },
];

// Célula do treemap: tom único (vermelho) com intensidade pelo peso —
// o TAMANHO é a codificação principal; rótulo direto quando cabe.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CelulaTreemap(props: any) {
  const { x, y, width, height, name, value, somaTotal } = props;
  if (width <= 0 || height <= 0 || value == null) return null;
  const frac = somaTotal > 0 ? value / somaTotal : 0;
  const alpha = 0.25 + Math.min(0.7, frac * 1.8);
  const mostraTexto = width > 70 && height > 34;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={3} fill={`rgba(220,38,38,${alpha})`} stroke="#fff" strokeWidth={2} />
      {mostraTexto && (
        <>
          <text x={x + 6} y={y + 16} fill="#fff" fontSize={11} fontWeight={700} style={{ pointerEvents: 'none' }}>
            {String(name).length > Math.floor(width / 7) ? String(name).slice(0, Math.floor(width / 7)) + '…' : name}
          </text>
          <text x={x + 6} y={y + 30} fill="rgba(255,255,255,.9)" fontSize={10} style={{ pointerEvents: 'none' }}>
            {fmtRS(value)} ({(frac * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)
          </text>
        </>
      )}
    </g>
  );
}

export default function DetalheModal({ titulo, params, onClose }: DetalheParams & { onClose: () => void }) {
  const [linhas, setLinhas] = useState<TransacaoRow[]>([]);
  const [somas, setSomas] = useState({ valor: 0, litros: 0 });
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState('');
  const [erro, setErro] = useState('');
  const [visao, setVisao] = useState<'tabela' | 'treemap'>('tabela');
  const [dimensao, setDimensao] = useState<DimensaoTreemap>('placa');

  // composição p/ o treemap: soma do valor por dimensão (top 24 + Outros)
  const dadosTreemap = useMemo(() => {
    const dim = DIMENSOES.find((d) => d.id === dimensao)!;
    const grupos = new Map<string, number>();
    for (const l of linhas) grupos.set(dim.de(l), (grupos.get(dim.de(l)) || 0) + (l.valor_total || 0));
    const ordenado = [...grupos.entries()].sort((a, b) => b[1] - a[1]);
    const top = ordenado.slice(0, 24).map(([name, size]) => ({ name, size }));
    const resto = ordenado.slice(24).reduce((s, [, v]) => s + v, 0);
    if (resto > 0) top.push({ name: `Outros (${ordenado.length - 24})`, size: resto });
    return top;
  }, [linhas, dimensao]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCarregando(true);
      setErro('');
      try {
        const qs = new URLSearchParams({ ...params, limit: '0' }); // recorte inteiro
        const r = await fetch(`/api/abastecimento/transacoes?${qs}`, { headers: await authHeaders() });
        const d = (await r.json()) as TransacoesResp & { error?: string };
        if (cancelado) return;
        if (!r.ok) { setErro(d.error || 'Erro ao carregar.'); return; }
        setLinhas(d.linhas);
        setSomas({ valor: d.somaValor, litros: d.somaLitros });
      } catch (e) {
        if (!cancelado) setErro('Erro: ' + (e as Error).message);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [params]);

  const periodoExport = {
    de: params.de || (params.mes ? `${params.mes}-01` : '—'),
    ate: params.ate || '—',
  };

  const exportar = async (formato: 'pdf' | 'csv') => {
    setGerando(formato);
    try {
      if (formato === 'csv') gerarCsvTransacoes({ periodo: periodoExport, linhas });
      else await gerarPdfTransacoes({ periodo: periodoExport, filtros: [titulo], linhas, somaValor: somas.valor, somaLitros: somas.litros });
    } finally {
      setGerando('');
    }
  };

  const botao = (rotulo: string, formato: 'pdf' | 'csv') => (
    <button
      onClick={() => exportar(formato)}
      disabled={!!gerando || linhas.length === 0}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: formato === 'pdf' ? '#dc2626' : '#166534', border: `1px solid ${formato === 'pdf' ? '#dc2626' : '#166534'}`, borderRadius: 8, padding: '7px 12px', fontSize: '.78rem', fontWeight: 600, cursor: 'pointer' }}
    >
      {formato === 'pdf' ? <FileDown size={14} /> : <FileSpreadsheet size={14} />} {gerando === formato ? 'Gerando…' : rotulo}
    </button>
  );

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 12, width: 'min(1020px, 100%)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,.2)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid #eee' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: '#333', fontSize: '.95rem' }}>{titulo}</div>
            <div style={{ color: '#888', fontSize: '.76rem', marginTop: 2 }}>
              {linhas.length} abastecimento(s) · {somas.litros.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} L · <strong style={{ color: '#dc2626' }}>{fmtRS(somas.valor)}</strong>
            </div>
          </div>
          {botao('PDF', 'pdf')}
          {botao('CSV', 'csv')}
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* alternância Tabela × Treemap + dimensão da composição */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 18px 0', flexWrap: 'wrap' }}>
          {(['tabela', 'treemap'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVisao(v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: `1px solid ${visao === v ? '#dc2626' : '#ddd'}`, background: '#fff', color: visao === v ? '#dc2626' : '#666', fontWeight: visao === v ? 700 : 400, fontSize: '.78rem', cursor: 'pointer' }}
            >
              {v === 'tabela' ? <List size={14} /> : <LayoutGrid size={14} />} {v === 'tabela' ? 'Tabela' : 'Treemap'}
            </button>
          ))}
          {visao === 'treemap' && (
            <>
              <span style={{ color: '#888', fontSize: '.76rem' }}>composição por</span>
              {DIMENSOES.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDimensao(d.id)}
                  style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${dimensao === d.id ? '#dc2626' : '#ddd'}`, background: '#fff', color: dimensao === d.id ? '#dc2626' : '#666', fontWeight: dimensao === d.id ? 700 : 400, fontSize: '.78rem', cursor: 'pointer' }}
                >
                  {d.label}
                </button>
              ))}
            </>
          )}
        </div>

        <div style={{ overflow: 'auto', padding: '6px 18px 12px' }}>
          {erro && <div style={{ color: '#b91c1c', fontSize: '.82rem', padding: '12px 0' }}>{erro}</div>}
          {visao === 'tabela' ? (
            <TabelaOrdenavel colunas={COLUNAS_POPUP} linhas={linhas} chaveLinha={(l) => l.id} carregando={carregando} />
          ) : (
            <div style={{ width: '100%', height: 420 }}>
              {dadosTreemap.length === 0 && !carregando ? (
                <p style={{ color: '#888', fontSize: '.8rem' }}>Sem dados para compor o treemap.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <Treemap
                    data={dadosTreemap}
                    dataKey="size"
                    nameKey="name"
                    isAnimationActive={false}
                    content={<CelulaTreemap somaTotal={somas.valor} />}
                  >
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload;
                        return (
                          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: '8px 10px', fontSize: '.78rem', color: '#444', boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}>
                            <div style={{ fontWeight: 700 }}>{p.name}</div>
                            <div>{fmtRS(p.size)} · {somas.valor > 0 ? ((p.size / somas.valor) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : 0}% do total</div>
                          </div>
                        );
                      }}
                    />
                  </Treemap>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
