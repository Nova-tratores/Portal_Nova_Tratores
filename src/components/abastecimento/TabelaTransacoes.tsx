'use client';
// Aba "Transações": últimos abastecimentos com ordenação por cabeçalho
// (A→Z/Z→A), filtro por coluna, seletores de veículo/motorista e exportação
// PDF/CSV. Carrega o recorte inteiro (client-side sort/filter).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import { fmtRS } from '@/components/estoque/ui';
import TabelaOrdenavel, { type ColunaDef } from '@/components/abastecimento/TabelaOrdenavel';
import { gerarPdfTransacoes } from '@/lib/abastecimento/pdf';
import { gerarCsvTransacoes } from '@/lib/abastecimento/csv';
import type { TransacaoRow, TransacoesResp } from '@/lib/abastecimento/tipos';

const selStyle: React.CSSProperties = { padding: '8px 10px', border: '1px solid #ddd', borderRadius: 8, fontSize: '.82rem', background: '#fff', color: '#444' };

function fmtDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
// requisição só tem a DATA — mostrar "12:00" seria hora inventada
function fmtDataLinha(l: TransacaoRow): string {
  return l.origem === 'requisicao'
    ? new Date(l.data_transacao).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' })
    : fmtDataHora(l.data_transacao);
}

// selo da fonte: cartão-frota ou requisição (com link pro card)
export function SeloOrigem({ l }: { l: TransacaoRow }) {
  if (l.origem !== 'requisicao') {
    return <span style={{ fontSize: '.68rem', color: '#888' }}>Cartão</span>;
  }
  return (
    <a
      href={`/requisicoes?req=${l.req_id}`}
      target="_blank"
      rel="noreferrer"
      title={`${l.req_tipo || 'Requisição'} — abrir o card`}
      style={{ fontSize: '.68rem', fontWeight: 700, color: '#b45309', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 999, padding: '1px 8px', textDecoration: 'none', whiteSpace: 'nowrap' }}
    >
      Req. #{l.req_id}
    </a>
  );
}

const COLUNAS: ColunaDef<TransacaoRow>[] = [
  { chave: 'data', titulo: 'Data/Hora', valor: (l) => l.data_transacao, render: (l) => fmtDataLinha(l) },
  { chave: 'origem', titulo: 'Origem', valor: (l) => (l.origem === 'requisicao' ? `Requisição #${l.req_id}` : 'Cartão'), render: (l) => <SeloOrigem l={l} /> },
  { chave: 'placa', titulo: 'Placa', valor: (l) => l.placa, render: (l) => <strong>{l.placa}</strong> },
  { chave: 'modelo', titulo: 'Modelo', valor: (l) => l.modelo_veiculo, render: (l) => l.modelo_veiculo || '—' },
  { chave: 'departamento', titulo: 'Depto', valor: (l) => l.departamento, render: (l) => l.departamento || '—' },
  { chave: 'motorista', titulo: 'Motorista', valor: (l) => l.motorista_nome || 'Sem motorista', render: (l) => l.motorista_nome || 'Sem motorista' },
  { chave: 'posto', titulo: 'Posto', valor: (l) => l.posto_nome, render: (l) => l.posto_nome || '—' },
  { chave: 'combustivel', titulo: 'Combustível', valor: (l) => l.combustivel, render: (l) => l.combustivel || '—' },
  { chave: 'litros', titulo: 'Litros', direita: true, valor: (l) => l.litros, render: (l) => l.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) },
  { chave: 'unitario', titulo: 'R$/L', direita: true, valor: (l) => l.valor_unitario, render: (l) => (l.valor_unitario != null ? l.valor_unitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—') },
  { chave: 'total', titulo: 'Total', direita: true, valor: (l) => l.valor_total, render: (l) => <strong>{fmtRS(l.valor_total)}</strong> },
  { chave: 'hodometro', titulo: 'Hodômetro', direita: true, valor: (l) => l.hodometro, render: (l) => (l.hodometro != null ? l.hodometro.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—') },
  { chave: 'os', titulo: 'OS', valor: (l) => l.ordem_servico, render: (l) => l.ordem_servico || '—' },
];

interface Props {
  de: string;
  ate: string;
  filial: string;
  placa: string;
  motoristas: string[];
  veiculos: { placa: string; modelo: string | null }[];
}

export default function TabelaTransacoes({ de, ate, filial, placa, motoristas, veiculos }: Props) {
  const [motorista, setMotorista] = useState('');
  const [placaLocal, setPlacaLocal] = useState('');
  const [linhas, setLinhas] = useState<TransacaoRow[]>([]);
  const [somas, setSomas] = useState({ valor: 0, litros: 0 });
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState('');

  const params = useMemo(() => {
    const p: Record<string, string> = { de, ate };
    if (filial) p.filial = filial;
    const placaEfetiva = placaLocal || placa;
    if (placaEfetiva) p.placa = placaEfetiva;
    if (motorista) p.motorista = motorista;
    return p;
  }, [de, ate, filial, placa, placaLocal, motorista]);

  const buscar = useCallback(async () => {
    setCarregando(true);
    try {
      const qs = new URLSearchParams({ ...params, limit: '0' }); // recorte inteiro
      const r = await fetch(`/api/abastecimento/transacoes?${qs}`, { headers: await authHeaders() });
      const d = (await r.json()) as TransacoesResp;
      if (!r.ok) return;
      setLinhas(d.linhas);
      setSomas({ valor: d.somaValor, litros: d.somaLitros });
    } finally {
      setCarregando(false);
    }
  }, [params]);

  useEffect(() => { buscar(); }, [buscar]);

  const exportar = async (formato: 'pdf' | 'csv') => {
    setGerando(formato);
    try {
      if (formato === 'csv') {
        gerarCsvTransacoes({ periodo: { de, ate }, linhas });
        return;
      }
      const filtros: string[] = [];
      if (filial) filtros.push(`Filial: ${filial}`);
      if (params.placa) filtros.push(`Veículo: ${params.placa}`);
      if (motorista) filtros.push(`Motorista: ${motorista === '__sem__' ? 'Sem motorista' : motorista}`);
      await gerarPdfTransacoes({ periodo: { de, ate }, filtros, linhas, somaValor: somas.valor, somaLitros: somas.litros });
    } finally {
      setGerando('');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <select value={placaLocal} onChange={(e) => setPlacaLocal(e.target.value)} style={selStyle}>
          <option value="">Todos os veículos</option>
          {veiculos.map((v) => (
            <option key={v.placa} value={v.placa}>{v.modelo ? `${v.modelo} · ${v.placa}` : v.placa}</option>
          ))}
        </select>
        <select value={motorista} onChange={(e) => setMotorista(e.target.value)} style={selStyle}>
          <option value="">Todos os motoristas</option>
          <option value="__sem__">Sem motorista</option>
          {motoristas.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <span style={{ color: '#888', fontSize: '.8rem' }}>
          {linhas.length} registro(s) · {somas.litros.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} L · <strong style={{ color: '#dc2626' }}>{fmtRS(somas.valor)}</strong>
        </span>
        <button
          onClick={() => exportar('pdf')}
          disabled={!!gerando || linhas.length === 0}
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: '#dc2626', border: '1px solid #dc2626', borderRadius: 8, padding: '8px 12px', fontSize: '.8rem', fontWeight: 600, cursor: 'pointer' }}
        >
          <FileDown size={14} /> {gerando === 'pdf' ? 'Gerando…' : 'PDF'}
        </button>
        <button
          onClick={() => exportar('csv')}
          disabled={!!gerando || linhas.length === 0}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: '#166534', border: '1px solid #166534', borderRadius: 8, padding: '8px 12px', fontSize: '.8rem', fontWeight: 600, cursor: 'pointer' }}
        >
          <FileSpreadsheet size={14} /> {gerando === 'csv' ? 'Gerando…' : 'CSV'}
        </button>
      </div>

      <TabelaOrdenavel colunas={COLUNAS} linhas={linhas} chaveLinha={(l) => l.id} carregando={carregando} />
    </div>
  );
}
