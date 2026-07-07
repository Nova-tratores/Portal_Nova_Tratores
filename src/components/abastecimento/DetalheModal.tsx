'use client';
// Popup de drill-down: lista os abastecimentos que compõem o valor clicado
// num gráfico/tabela do dashboard. Busca /api/abastecimento/transacoes com
// os filtros correspondentes e permite exportar o subconjunto em PDF.

import { useCallback, useEffect, useState } from 'react';
import { FileDown, X } from 'lucide-react';
import { fmtRS } from '@/components/estoque/ui';
import { gerarPdfTransacoes } from '@/lib/abastecimento/pdf';
import type { TransacaoRow, TransacoesResp } from '@/lib/abastecimento/tipos';

const PAGINA = 200;

const thStyle: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '8px 9px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600, position: 'sticky', top: 0 };
const tdStyle: React.CSSProperties = { padding: '7px 9px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.8rem' };

function fmtDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export interface DetalheParams {
  titulo: string;
  params: Record<string, string>; // filtros da rota /transacoes (de, ate, mes, placa...)
}

export default function DetalheModal({ titulo, params, onClose }: DetalheParams & { onClose: () => void }) {
  const [linhas, setLinhas] = useState<TransacaoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [somas, setSomas] = useState({ valor: 0, litros: 0 });
  const [carregando, setCarregando] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [erro, setErro] = useState('');

  const buscar = useCallback(async (offset: number) => {
    setCarregando(true);
    setErro('');
    try {
      const qs = new URLSearchParams({ ...params, limit: String(PAGINA), offset: String(offset) });
      const r = await fetch(`/api/abastecimento/transacoes?${qs}`);
      const d = (await r.json()) as TransacoesResp & { error?: string };
      if (!r.ok) { setErro(d.error || 'Erro ao carregar.'); return; }
      setLinhas((prev) => (offset === 0 ? d.linhas : [...prev, ...d.linhas]));
      setTotal(d.total);
      setSomas({ valor: d.somaValor, litros: d.somaLitros });
    } catch (e) {
      setErro('Erro: ' + (e as Error).message);
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
      await gerarPdfTransacoes({
        periodo: { de: params.de || params.mes ? (params.de || `${params.mes}-01`) : '—', ate: params.ate || '—' },
        filtros: [titulo],
        linhas: d.linhas,
        somaValor: d.somaValor,
        somaLitros: d.somaLitros,
      });
    } finally {
      setGerandoPdf(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 12, width: 'min(980px, 100%)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,.2)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid #eee' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: '#333', fontSize: '.95rem' }}>{titulo}</div>
            <div style={{ color: '#888', fontSize: '.76rem', marginTop: 2 }}>
              {total} abastecimento(s) · {somas.litros.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} L · <strong style={{ color: '#dc2626' }}>{fmtRS(somas.valor)}</strong>
            </div>
          </div>
          <button
            onClick={exportarPdf}
            disabled={gerandoPdf || total === 0}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: '#dc2626', border: '1px solid #dc2626', borderRadius: 8, padding: '7px 12px', fontSize: '.78rem', fontWeight: 600, cursor: 'pointer' }}
          >
            <FileDown size={14} /> {gerandoPdf ? 'Gerando…' : 'PDF'}
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ overflow: 'auto', padding: '0 18px 12px' }}>
          {erro && <div style={{ color: '#b91c1c', fontSize: '.82rem', padding: '12px 0' }}>{erro}</div>}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Data/Hora</th>
                <th style={thStyle}>Placa</th>
                <th style={thStyle}>Motorista</th>
                <th style={thStyle}>Posto</th>
                <th style={thStyle}>Combustível</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Litros</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>R$/L</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id}>
                  <td style={tdStyle}>{fmtDataHora(l.data_transacao)}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{l.placa}</td>
                  <td style={tdStyle}>{l.motorista_nome || 'Sem motorista'}</td>
                  <td style={tdStyle}>{l.posto_nome || '—'}</td>
                  <td style={tdStyle}>{l.combustivel || '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{l.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{l.valor_unitario != null ? l.valor_unitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtRS(l.valor_total)}</td>
                </tr>
              ))}
              {!carregando && linhas.length === 0 && !erro && (
                <tr><td style={tdStyle} colSpan={8}>Nenhum abastecimento neste recorte.</td></tr>
              )}
            </tbody>
          </table>
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
      </div>
    </div>
  );
}
