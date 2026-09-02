'use client';
// Seção de importação do módulo Abastecimento: upload do CSV mensal da
// operadora + tabela de lotes (com exclusão do lote inteiro para admin).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { Card } from '@/components/estoque/ui';
import { authHeaders } from '@/lib/auth/client';
import type { DuplicadaImport, LoteResumo, ResultadoUpload } from '@/lib/abastecimento/tipos';

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
  // lista de duplicadas do último upload + estado das substituições
  const [mostrarDuplicadas, setMostrarDuplicadas] = useState(false);
  const [substituindo, setSubstituindo] = useState<Set<number>>(new Set());
  const [substituidas, setSubstituidas] = useState<Set<number>>(new Set());
  const [erroSubst, setErroSubst] = useState<Map<number, string>>(new Map());

  const carregarLotes = useCallback(async () => {
    try {
      const r = await fetch('/api/abastecimento/lotes', { headers: await authHeaders() });
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
      setMostrarDuplicadas(false);
      setSubstituindo(new Set()); setSubstituidas(new Set()); setErroSubst(new Map());
      carregarLotes();
      onMudou();
    } catch (e) {
      setErroUpload('Erro: ' + (e as Error).message);
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  // "Tirar a duplicada": troca o registro JÁ importado pelos valores corrigidos
  // do arquivo (caso do reexport da operadora). Só aparece quando há diferença.
  const substituir = async (itens: DuplicadaImport[]) => {
    const ids = itens.map((i) => i.existenteId);
    setSubstituindo((prev) => new Set([...prev, ...ids]));
    try {
      const r = await fetch('/api/abastecimento/substituir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ itens: itens.map((i) => ({ existenteId: i.existenteId, motivo: i.motivo, linha: i.linha })) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErroSubst((prev) => { const m = new Map(prev); for (const id of ids) m.set(id, d.error || 'Falha ao substituir.'); return m; });
        return;
      }
      const oks = new Set<number>(); const errs = new Map<number, string>();
      for (const res of (d.resultados || []) as { existenteId: number; ok: boolean; erro?: string }[]) {
        if (res.ok) oks.add(res.existenteId); else errs.set(res.existenteId, res.erro || 'Falha.');
      }
      setSubstituidas((prev) => new Set([...prev, ...oks]));
      setErroSubst((prev) => { const m = new Map(prev); for (const [k, v] of errs) m.set(k, v); return m; });
      if (oks.size > 0) onMudou();
    } catch (e) {
      setErroSubst((prev) => { const m = new Map(prev); for (const id of ids) m.set(id, (e as Error).message); return m; });
    } finally {
      setSubstituindo((prev) => { const n = new Set(prev); for (const id of ids) n.delete(id); return n; });
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
          {resultado.duplicados} duplicado(s) ignorado(s)
          {(resultado.duplicadosAutorizacao || 0) > 0 && (
            <> — {resultado.duplicadosAutorizacao} pela autorização da operadora (transação já importada com outros valores)</>
          )}, {resultado.erros.length} linha(s) com erro
          {' '}(de {resultado.totalLinhas} linhas).
          {resultado.placasDesconhecidas.length > 0 && (
            <div style={{ marginTop: 6, color: '#92400e' }}>
              Placas fora da frota cadastrada:{' '}
              {resultado.placasDesconhecidas.map((p) => `${p.placa} (${p.ocorrencias}×)`).join(', ')}
              {' '}— importadas mesmo assim, sem vínculo.
            </div>
          )}
          {(resultado.duplicadas?.length || 0) > 0 && (
            <div style={{ marginTop: 6 }}>
              <button onClick={() => setMostrarDuplicadas((v) => !v)} style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', fontSize: '.8rem', padding: 0, textDecoration: 'underline' }}>
                {mostrarDuplicadas ? 'Ocultar duplicadas' : `Ver as ${resultado.duplicadas!.length} duplicada(s)`}
              </button>
              {(resultado.duplicadasOcultas || 0) > 0 && (
                <span style={{ marginLeft: 8, color: '#92400e' }}>(+{resultado.duplicadasOcultas} não listadas)</span>
              )}
              {mostrarDuplicadas && (() => {
                const comDif = resultado.duplicadas!.filter((dp) => dp.diferencas.length > 0 && !substituidas.has(dp.existenteId));
                return (
                <div style={{ marginTop: 8 }}>
                  {comDif.length > 1 && (
                    <button onClick={() => substituir(comDif)} disabled={substituindo.size > 0}
                      style={{ marginBottom: 8, background: '#166534', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: '.78rem', fontWeight: 600, cursor: 'pointer' }}>
                      Substituir todas com diferenças ({comDif.length}) pelos valores do arquivo
                    </button>
                  )}
                  <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #d1fae5', borderRadius: 8, background: '#fff' }}>
                    {resultado.duplicadas!.map((dp) => {
                      const feito = substituidas.has(dp.existenteId);
                      const rodando = substituindo.has(dp.existenteId);
                      const errS = erroSubst.get(dp.existenteId);
                      return (
                        <div key={`${dp.existenteId}-${dp.linha.data_transacao}`} style={{ padding: '8px 12px', borderBottom: '1px solid #f0fdf4', fontSize: '.78rem', color: '#374151' }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <strong>{dp.linha.placa}</strong>
                            <span>{fmtDataHora(dp.linha.data_transacao)}</span>
                            <span>{Number(dp.linha.litros).toLocaleString('pt-BR')} L</span>
                            {dp.linha.valor_total != null && <span>R$ {Number(dp.linha.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                            <span style={{ fontSize: '.68rem', fontWeight: 700, padding: '1px 8px', borderRadius: 999, background: dp.motivo === 'autorizacao' ? '#fef3c7' : '#e0e7ff', color: dp.motivo === 'autorizacao' ? '#92400e' : '#3730a3' }}>
                              {dp.motivo === 'autorizacao' ? `autorização ${dp.existente.autorizacao}` : 'mesma placa+data+litros'}
                            </span>
                            <span style={{ color: '#9ca3af' }}>já importada{dp.existente.lote_id ? ` (lote ${dp.existente.lote_id})` : ''}</span>
                            {dp.diferencas.length === 0 ? (
                              <span style={{ color: '#16a34a', fontWeight: 600 }}>idêntica — nada a fazer</span>
                            ) : feito ? (
                              <span style={{ color: '#16a34a', fontWeight: 700 }}>substituída ✓</span>
                            ) : (
                              <button onClick={() => substituir([dp])} disabled={rodando}
                                title="Trocar o registro já importado pelos valores desta linha do arquivo"
                                style={{ background: '#fff', color: '#166534', border: '1px solid #86efac', borderRadius: 6, padding: '3px 10px', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer' }}>
                                {rodando ? 'Substituindo…' : 'Usar valores do arquivo'}
                              </button>
                            )}
                          </div>
                          {dp.diferencas.length > 0 && !feito && (
                            <div style={{ marginTop: 4, color: '#92400e' }}>
                              {dp.diferencas.map((f) => `${f.rotulo}: ${f.de} → ${f.para}`).join(' · ')}
                            </div>
                          )}
                          {errS && <div style={{ marginTop: 4, color: '#b91c1c' }}>Falhou: {errS}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
                );
              })()}
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
