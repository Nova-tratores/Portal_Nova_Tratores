'use client';
// Aba "Transações": últimos abastecimentos com filtros (veículo, motorista,
// posto/combustível herdam do drill-down) + exportação PDF analítica.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileDown } from 'lucide-react';
import { fmtRS } from '@/components/estoque/ui';
import { gerarPdfTransacoes } from '@/lib/abastecimento/pdf';
import type { TransacaoRow, TransacoesResp } from '@/lib/abastecimento/tipos';

const PAGINA = 100;

const thStyle: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.82rem' };
const selStyle: React.CSSProperties = { padding: '8px 10px', border: '1px solid #ddd', borderRadius: 8, fontSize: '.82rem', background: '#fff', color: '#444' };

function fmtDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  de: string;
  ate: string;
  filial: string;
  placa: string;
  motoristas: string[];
  placas: string[];
}

export default function TabelaTransacoes({ de, ate, filial, placa, motoristas, placas }: Props) {
  const [motorista, setMotorista] = useState('');
  const [placaLocal, setPlacaLocal] = useState('');
  const [linhas, setLinhas] = useState<TransacaoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [somas, setSomas] = useState({ valor: 0, litros: 0 });
  const [carregando, setCarregando] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  const params = useMemo(() => {
    const p: Record<string, string> = { de, ate };
    if (filial) p.filial = filial;
    const placaEfetiva = placaLocal || placa;
    if (placaEfetiva) p.placa = placaEfetiva;
    if (motorista) p.motorista = motorista;
    return p;
  }, [de, ate, filial, placa, placaLocal, motorista]);

  const buscar = useCallback(async (offset: number) => {
    setCarregando(true);
    try {
      const qs = new URLSearchParams({ ...params, limit: String(PAGINA), offset: String(offset) });
      const r = await fetch(`/api/abastecimento/transacoes?${qs}`);
      const d = (await r.json()) as TransacoesResp;
      if (!r.ok) return;
      setLinhas((prev) => (offset === 0 ? d.linhas : [...prev, ...d.linhas]));
      setTotal(d.total);
      setSomas({ valor: d.somaValor, litros: d.somaLitros });
    } finally {
      setCarregando(false);
    }
  }, [params]);

  useEffect(() => { buscar(0); }, [buscar]);

  const exportarPdf = async () => {
    setGerandoPdf(true);
    try {
      const qs = new URLSearchParams({ ...params, limit: '0' });
      const r = await fetch(`/api/abastecimento/transacoes?${qs}`);
      const d = (await r.json()) as TransacoesResp;
      const filtros: string[] = [];
      if (filial) filtros.push(`Filial: ${filial}`);
      if (params.placa) filtros.push(`Veículo: ${params.placa}`);
      if (motorista) filtros.push(`Motorista: ${motorista === '__sem__' ? 'Sem motorista' : motorista}`);
      await gerarPdfTransacoes({ periodo: { de, ate }, filtros, linhas: d.linhas, somaValor: d.somaValor, somaLitros: d.somaLitros });
    } finally {
      setGerandoPdf(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <select value={placaLocal} onChange={(e) => setPlacaLocal(e.target.value)} style={selStyle}>
          <option value="">Todos os veículos</option>
          {placas.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={motorista} onChange={(e) => setMotorista(e.target.value)} style={selStyle}>
          <option value="">Todos os motoristas</option>
          <option value="__sem__">Sem motorista</option>
          {motoristas.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <span style={{ color: '#888', fontSize: '.8rem' }}>
          {total} registro(s) · {somas.litros.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} L · <strong style={{ color: '#dc2626' }}>{fmtRS(somas.valor)}</strong>
        </span>
        <button
          onClick={exportarPdf}
          disabled={gerandoPdf || total === 0}
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: '#dc2626', border: '1px solid #dc2626', borderRadius: 8, padding: '8px 12px', fontSize: '.8rem', fontWeight: 600, cursor: 'pointer' }}
        >
          <FileDown size={14} /> {gerandoPdf ? 'Gerando…' : 'PDF analítico'}
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Data/Hora</th>
              <th style={thStyle}>Placa</th>
              <th style={thStyle}>Modelo</th>
              <th style={thStyle}>Motorista</th>
              <th style={thStyle}>Posto</th>
              <th style={thStyle}>Combustível</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Litros</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>R$/L</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Hodômetro</th>
              <th style={thStyle}>OS</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <td style={tdStyle}>{fmtDataHora(l.data_transacao)}</td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{l.placa}</td>
                <td style={tdStyle}>{l.modelo_veiculo || '—'}</td>
                <td style={tdStyle}>{l.motorista_nome || 'Sem motorista'}</td>
                <td style={tdStyle}>{l.posto_nome || '—'}</td>
                <td style={tdStyle}>{l.combustivel || '—'}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{l.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{l.valor_unitario != null ? l.valor_unitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtRS(l.valor_total)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{l.hodometro != null ? l.hodometro.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—'}</td>
                <td style={tdStyle}>{l.ordem_servico || '—'}</td>
              </tr>
            ))}
            {!carregando && linhas.length === 0 && (
              <tr><td style={tdStyle} colSpan={11}>Nenhum abastecimento no filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {carregando && <div style={{ color: '#888', fontSize: '.8rem', padding: '10px 0' }}>Carregando…</div>}
      {!carregando && linhas.length < total && (
        <button
          onClick={() => buscar(linhas.length)}
          style={{ margin: '10px 0', background: '#fafafa', border: '1px solid #ddd', borderRadius: 8, padding: '8px 14px', fontSize: '.8rem', cursor: 'pointer', color: '#444' }}
        >
          Carregar mais ({linhas.length} de {total})
        </button>
      )}
    </div>
  );
}
