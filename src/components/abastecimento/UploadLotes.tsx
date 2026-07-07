'use client';
// Seção de importação do módulo Abastecimento: upload do CSV mensal da
// operadora + tabela de lotes (com exclusão do lote inteiro para admin).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { Card } from '@/components/estoque/ui';
import { authHeaders } from '@/lib/auth/client';
import type { LoteResumo, ResultadoUpload } from '@/lib/abastecimento/tipos';

const thStyle: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.82rem' };

function fmtDataHora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtData(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

interface Props {
  usuario: string;
  isAdmin: boolean;
  onMudou: () => void; // dashboard refaz o fetch após importar/excluir
}

export default function UploadLotes({ usuario, isAdmin, onMudou }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erroUpload, setErroUpload] = useState('');
  const [resultado, setResultado] = useState<ResultadoUpload | null>(null);
  const [mostrarErros, setMostrarErros] = useState(false);
  const [lotes, setLotes] = useState<LoteResumo[]>([]);
  const [excluindo, setExcluindo] = useState<number | null>(null);

  const carregarLotes = useCallback(async () => {
    try {
      const r = await fetch('/api/abastecimento/lotes');
      const d = await r.json();
      setLotes(d.lotes || []);
    } catch {
      setLotes([]);
    }
  }, []);

  useEffect(() => { carregarLotes(); }, [carregarLotes]);

  const enviar = async (file: File) => {
    setEnviando(true);
    setErroUpload('');
    setResultado(null);
    setMostrarErros(false);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('usuario', usuario);
      const r = await fetch('/api/abastecimento/upload', {
        method: 'POST',
        headers: await authHeaders(),
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) { setErroUpload(d.error || 'Erro no upload.'); return; }
      setResultado(d as ResultadoUpload);
      carregarLotes();
      onMudou();
    } catch (e) {
      setErroUpload('Erro: ' + (e as Error).message);
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const excluirLote = async (lote: LoteResumo) => {
    const ok = window.confirm(
      `Excluir o lote "${lote.arquivo_nome}" (${lote.novos} abastecimentos importados)?\nIsso apaga TODOS os registros desse upload.`,
    );
    if (!ok) return;
    setExcluindo(lote.id);
    try {
      const r = await fetch(`/api/abastecimento/lotes/${lote.id}`, {
        method: 'DELETE',
        headers: await authHeaders(),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Erro ao excluir o lote.'); return; }
      setResultado(null);
      carregarLotes();
      onMudou();
    } catch (e) {
      alert('Erro: ' + (e as Error).message);
    } finally {
      setExcluindo(null);
    }
  };

  return (
    <Card titulo="Importação (CSV da operadora)">
      {/* upload */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={enviando}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 600, fontSize: '.85rem', cursor: enviando ? 'wait' : 'pointer', opacity: enviando ? 0.7 : 1 }}
        >
          <Upload size={16} /> {enviando ? 'Importando…' : 'Enviar CSV do mês'}
        </button>
        <span style={{ color: '#888', fontSize: '.78rem' }}>
          Relatório de análise de consumo (.csv). Reenviar o mesmo arquivo não duplica nada.
        </span>
      </div>

      {erroUpload && (
        <div style={{ marginTop: 12, background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 8, padding: '10px 12px', fontSize: '.82rem' }}>
          {erroUpload}
        </div>
      )}

      {/* resultado do último upload */}
      {resultado && (
        <div style={{ marginTop: 14, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 14px', fontSize: '.84rem', color: '#166534' }}>
          <strong>{resultado.lote.arquivo_nome}</strong>: {resultado.novos} novo(s) importado(s),{' '}
          {resultado.duplicados} duplicado(s) ignorado(s), {resultado.erros.length} linha(s) com erro
          {' '}(de {resultado.totalLinhas} linhas).
          {resultado.placasDesconhecidas.length > 0 && (
            <div style={{ marginTop: 6, color: '#92400e' }}>
              Placas fora da frota cadastrada:{' '}
              {resultado.placasDesconhecidas.map((p) => `${p.placa} (${p.ocorrencias}×)`).join(', ')}
              {' '}— importadas mesmo assim, sem vínculo.
            </div>
          )}
          {resultado.erros.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <button onClick={() => setMostrarErros((v) => !v)} style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: '.8rem', padding: 0, textDecoration: 'underline' }}>
                {mostrarErros ? 'Ocultar erros' : 'Ver erros por linha'}
              </button>
              {mostrarErros && (
                <ul style={{ margin: '6px 0 0 18px', color: '#b91c1c' }}>
                  {resultado.erros.map((e, i) => (
                    <li key={i}>Linha {e.linha}: {e.motivo}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* lotes */}
      <div style={{ marginTop: 16, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Arquivo</th>
              <th style={thStyle}>Enviado por</th>
              <th style={thStyle}>Quando</th>
              <th style={thStyle}>Período dos dados</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Novos</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Duplicados</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Erros</th>
              {isAdmin && <th style={thStyle} />}
            </tr>
          </thead>
          <tbody>
            {lotes.length === 0 && (
              <tr><td style={tdStyle} colSpan={isAdmin ? 8 : 7}>Nenhum upload ainda.</td></tr>
            )}
            {lotes.map((l) => (
              <tr key={l.id}>
                <td style={tdStyle}>{l.arquivo_nome}</td>
                <td style={tdStyle}>{l.enviado_por || '—'}</td>
                <td style={tdStyle}>{fmtDataHora(l.created_at)}</td>
                <td style={tdStyle}>{fmtData(l.periodo_min)} a {fmtData(l.periodo_max)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{l.novos}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{l.duplicados}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{l.erros}</td>
                {isAdmin && (
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <button
                      onClick={() => excluirLote(l)}
                      disabled={excluindo === l.id}
                      title="Excluir o lote inteiro (apaga os abastecimentos deste upload)"
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 4 }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
