'use client';
// Janela "Exportar relatórios" de /financeiro/notas: relatórios prontos (por mês, por
// tipo, por máquina, por cliente, por empresa, lista completa) sobre OS MESMOS filtros
// da tela, em Excel, CSV ou PDF. Precisa de financeiro:notas-relatorios e cada
// exportação fica registrada (audit_log) — o servidor só devolve a tabela depois de logar.
import { useEffect, useState } from 'react';
import { authHeaders } from '@/lib/auth/client';
import { RELATORIOS, type FormatoRelatorio, type Relatorio, type TipoRelatorio } from '@/lib/notas/filtros-relatorios';
import { gerarArquivoRelatorio } from '@/lib/notas/relatorio-arquivo';

const VERDE = '#15803d';
const FORMATOS: Array<{ id: FormatoRelatorio; nome: string; icone: string }> = [
  { id: 'xlsx', nome: 'Excel', icone: 'fa-file-excel' },
  { id: 'pdf', nome: 'PDF', icone: 'fa-file-pdf' },
  { id: 'csv', nome: 'CSV', icone: 'fa-file-csv' },
];

export default function RelatoriosNotas({ filtrosQs, resumo, totalNotas, onClose }: {
  filtrosQs: string; resumo: string[]; totalNotas: number | null; onClose: () => void;
}) {
  const [rel, setRel] = useState<TipoRelatorio>('mes');
  const [formato, setFormato] = useState<FormatoRelatorio>('xlsx');
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState('');

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !gerando) onClose(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [gerando, onClose]);

  const gerar = async () => {
    setGerando(true); setErro(''); setPronto('');
    try {
      const r = await fetch('/api/financeiro/notas/relatorio', {
        method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ relatorio: rel, formato, filtros: filtrosQs }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.erro) { setErro(j.erro || `Erro ${r.status}`); return; }
      const relatorio = j.relatorio as Relatorio;
      await gerarArquivoRelatorio(relatorio, { filtros: j.filtros, geradoPor: j.geradoPor, geradoEm: j.geradoEm, notas: j.notas }, formato);
      setPronto(`${relatorio.titulo}: ${relatorio.linhas.length.toLocaleString('pt-BR')} linha(s) de ${Number(j.notas).toLocaleString('pt-BR')} nota(s). Baixado e registrado no log.`);
    } catch (e) { setErro((e as Error).message); } finally { setGerando(false); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Exportar relatórios" onClick={() => { if (!gerando) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(760px, 100%)', maxHeight: '92vh', overflow: 'auto', background: 'var(--surface, #fefefe)', color: 'var(--portal-text, #0f172a)', borderRadius: 16, border: '1px solid var(--border, #e2e8f0)', boxShadow: '0 20px 50px rgba(15,23,42,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${VERDE} 12%, transparent)`, color: VERDE }}><i className="fa-solid fa-file-export" /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Exportar relatórios</div>
            <div style={{ fontSize: 14, color: 'var(--portal-text-secondary, #475569)' }}>Usa os filtros que estão na tela{totalNotas != null ? ` · ${totalNotas.toLocaleString('pt-BR')} nota(s)` : ''}</div>
          </div>
          <button type="button" onClick={onClose} disabled={gerando} aria-label="Fechar" style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--portal-text-secondary, #475569)' }}>×</button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 14.5, color: 'var(--portal-text-secondary, #475569)', marginBottom: 8 }}>1. Qual relatório</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
              {RELATORIOS.map((r) => {
                const on = rel === r.id;
                return (
                  <button key={r.id} type="button" onClick={() => setRel(r.id)} aria-pressed={on}
                    style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start',
                      border: `1.5px solid ${on ? VERDE : 'var(--border, #e2e8f0)'}`, background: on ? `color-mix(in srgb, ${VERDE} 8%, var(--surface, #fefefe))` : 'var(--surface, #fefefe)', color: 'inherit' }}>
                    <i className={`fa-solid ${r.icone}`} style={{ color: VERDE, marginTop: 3, width: 16 }} />
                    <span>
                      <span style={{ display: 'block', fontSize: 15.5, fontWeight: 600 }}>{r.nome}</span>
                      <span style={{ display: 'block', fontSize: 13.5, color: 'var(--portal-text-secondary, #475569)', marginTop: 2 }}>{r.descricao}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 14.5, color: 'var(--portal-text-secondary, #475569)', marginBottom: 8 }}>2. Formato</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {FORMATOS.map((f) => {
                const on = formato === f.id;
                return (
                  <button key={f.id} type="button" onClick={() => setFormato(f.id)} aria-pressed={on}
                    style={{ height: 38, padding: '0 16px', borderRadius: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15,
                      border: `1.5px solid ${on ? VERDE : 'var(--border, #e2e8f0)'}`, background: on ? VERDE : 'var(--surface, #fefefe)', color: on ? '#fefefe' : 'inherit' }}>
                    <i className={`fa-solid ${f.icone}`} /> {f.nome}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ fontSize: 14, background: 'var(--portal-bg-secondary, #f8fafc)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 12, padding: '10px 14px' }}>
            <div style={{ color: 'var(--portal-text-secondary, #475569)', marginBottom: 4 }}>Filtros que vão no relatório</div>
            {resumo.map((t) => <div key={t}>{t}</div>)}
          </div>

          <div style={{ fontSize: 14, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '10px 14px', display: 'flex', gap: 8 }}>
            <i className="fa-solid fa-user-shield" style={{ marginTop: 2 }} />
            <span>A exportação fica registrada com o seu nome, o relatório, o formato e os filtros (Atividades). Notas canceladas ficam fora das somas.</span>
          </div>

          {erro && <div style={{ color: '#dc2626', fontSize: 15 }}>{erro}</div>}
          {pronto && <div style={{ color: VERDE, fontSize: 15 }}><i className="fa-solid fa-circle-check" /> {pronto}</div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border, #e2e8f0)' }}>
          <button type="button" onClick={onClose} disabled={gerando} style={{ height: 38, padding: '0 16px', borderRadius: 10, border: '1px solid var(--border, #e2e8f0)', background: 'var(--surface, #fefefe)', color: 'inherit', fontSize: 15, cursor: 'pointer' }}>Fechar</button>
          <button type="button" onClick={gerar} disabled={gerando}
            style={{ height: 38, padding: '0 18px', borderRadius: 10, border: 'none', background: VERDE, color: '#fefefe', fontSize: 15, fontWeight: 600, cursor: gerando ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <i className={`fa-solid ${gerando ? 'fa-spinner fa-spin' : 'fa-download'}`} /> {gerando ? 'Gerando…' : 'Gerar e baixar'}
          </button>
        </div>
      </div>
    </div>
  );
}
