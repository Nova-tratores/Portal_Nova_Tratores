'use client';
// Tabela com ordenação A→Z / Z→A clicando no cabeçalho e filtro por coluna
// (linha de inputs abaixo do cabeçalho). Usada no popup de drill-down e na
// aba Transações do Abastecimento. Ordena/filtra client-side — o chamador
// carrega todas as linhas do recorte.

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export interface ColunaDef<T> {
  chave: string;
  titulo: string;
  direita?: boolean;
  /** valor cru p/ ordenar e filtrar (string ou número) */
  valor: (t: T) => string | number | null;
  /** conteúdo exibido na célula */
  render: (t: T) => ReactNode;
  /** modo do filtro por coluna: 'texto' (default, busca), 'categorico' (dropdown
   *  de valores distintos, match exato), 'numero' (operador >/</= + valor). */
  tipoFiltro?: 'texto' | 'categorico' | 'numero';
}

type FiltroVal = { termo: string; op?: '>' | '<' | '=' };

const thStyle: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.6rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '7px 6px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '6px 6px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.78rem' };
// size={3} derruba a largura intrínseca do input (~150px cada) — com 11+
// colunas era ele que estourava a tabela e cortava a coluna da direita
const filtroStyle: React.CSSProperties = { width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '3px 5px', border: '1px solid #e5e5e5', borderRadius: 6, fontSize: '.68rem', color: '#444', background: '#fff' };

const PASSO_EXIBICAO = 300;

export default function TabelaOrdenavel<T>({ colunas, linhas, chaveLinha, carregando }: {
  colunas: ColunaDef<T>[];
  linhas: T[];
  chaveLinha: (t: T) => string | number;
  carregando?: boolean;
}) {
  const [ordem, setOrdem] = useState<{ chave: string; asc: boolean } | null>(null);
  const [filtros, setFiltros] = useState<Record<string, FiltroVal>>({});
  const [mostrar, setMostrar] = useState(PASSO_EXIBICAO);

  const alternarOrdem = (chave: string) => {
    setOrdem((o) => (o?.chave === chave ? { chave, asc: !o.asc } : { chave, asc: true }));
  };

  // opções distintas por coluna categórica (para o dropdown de filtro)
  const opcoesCat = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const c of colunas) {
      if (c.tipoFiltro !== 'categorico') continue;
      const s = new Set<string>();
      for (const l of linhas) { const v = c.valor(l); if (v != null && String(v) !== '') s.add(String(v)); }
      m[c.chave] = [...s].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    }
    return m;
  }, [colunas, linhas]);

  const filtradas = useMemo(() => {
    let resultado = linhas;
    for (const c of colunas) {
      const fv = filtros[c.chave];
      const termo = (fv?.termo ?? '').trim();
      if (!termo) continue;
      const tipo = c.tipoFiltro ?? 'texto';
      resultado = resultado.filter((l) => {
        const v = c.valor(l);
        if (v == null) return false;
        if (tipo === 'numero') {
          const nv = Number(v); const nt = Number(termo.replace(',', '.'));
          if (!Number.isFinite(nv) || !Number.isFinite(nt)) return false;
          const op = fv?.op ?? '>';
          return op === '>' ? nv > nt : op === '<' ? nv < nt : nv === nt;
        }
        if (tipo === 'categorico') return String(v) === termo;
        return String(v).toLowerCase().includes(termo.toLowerCase());
      });
    }
    if (ordem) {
      const col = colunas.find((c) => c.chave === ordem.chave);
      if (col) {
        const dir = ordem.asc ? 1 : -1;
        resultado = [...resultado].sort((a, b) => {
          const va = col.valor(a);
          const vb = col.valor(b);
          if (va == null && vb == null) return 0;
          if (va == null) return 1; // vazios sempre no fim
          if (vb == null) return -1;
          if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
          return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * dir;
        });
      }
    }
    return resultado;
  }, [linhas, colunas, filtros, ordem]);

  const temFiltro = Object.values(filtros).some((f) => (f?.termo ?? '').trim());
  const visiveis = filtradas.slice(0, mostrar);

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {colunas.map((c) => (
                <th
                  key={c.chave}
                  onClick={() => alternarOrdem(c.chave)}
                  title="Clique para ordenar (A→Z / Z→A)"
                  style={{ ...thStyle, textAlign: c.direita ? 'right' : 'left' }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {c.titulo}
                    {ordem?.chave === c.chave
                      ? (ordem.asc ? <ArrowUp size={12} color="#dc2626" /> : <ArrowDown size={12} color="#dc2626" />)
                      : <ArrowUpDown size={12} color="#ccc" />}
                  </span>
                </th>
              ))}
            </tr>
            <tr>
              {colunas.map((c) => {
                const setTermo = (termo: string, op?: '>' | '<' | '=') => { setFiltros({ ...filtros, [c.chave]: { termo, op: op ?? filtros[c.chave]?.op } }); setMostrar(PASSO_EXIBICAO); };
                const fv = filtros[c.chave];
                return (
                  <th key={c.chave} style={{ background: '#fafafa', padding: '2px 6px 8px', borderBottom: '1px solid #eee' }}>
                    {c.tipoFiltro === 'categorico' ? (
                      <select value={fv?.termo ?? ''} onChange={(e) => setTermo(e.target.value)} style={filtroStyle}>
                        <option value="">todos</option>
                        {(opcoesCat[c.chave] ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : c.tipoFiltro === 'numero' ? (
                      <div style={{ display: 'flex', gap: 2 }}>
                        <select value={fv?.op ?? '>'} onChange={(e) => setTermo(fv?.termo ?? '', e.target.value as '>' | '<' | '=')} style={{ ...filtroStyle, width: 34, flex: '0 0 auto', padding: '3px 2px' }} title="maior que / menor que / igual">
                          <option value=">">&gt;</option>
                          <option value="<">&lt;</option>
                          <option value="=">=</option>
                        </select>
                        <input type="number" value={fv?.termo ?? ''} onChange={(e) => setTermo(e.target.value, fv?.op ?? '>')} placeholder="valor" style={{ ...filtroStyle, minWidth: 0 }} />
                      </div>
                    ) : (
                      <input value={fv?.termo ?? ''} onChange={(e) => setTermo(e.target.value)} placeholder="filtrar…" size={3} style={filtroStyle} />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={chaveLinha(l)}>
                {colunas.map((c) => (
                  <td key={c.chave} style={{ ...tdStyle, textAlign: c.direita ? 'right' : 'left' }}>{c.render(l)}</td>
                ))}
              </tr>
            ))}
            {!carregando && filtradas.length === 0 && (
              <tr><td style={tdStyle} colSpan={colunas.length}>{temFiltro ? 'Nenhuma linha bate com os filtros.' : 'Nenhum registro.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
        {carregando && <span style={{ color: '#888', fontSize: '.8rem' }}>Carregando…</span>}
        {!carregando && temFiltro && (
          <span style={{ color: '#888', fontSize: '.76rem' }}>{filtradas.length} de {linhas.length} registro(s) após o filtro</span>
        )}
        {!carregando && visiveis.length < filtradas.length && (
          <button
            onClick={() => setMostrar((m) => m + PASSO_EXIBICAO)}
            style={{ background: '#fafafa', border: '1px solid #ddd', borderRadius: 8, padding: '7px 12px', fontSize: '.78rem', cursor: 'pointer', color: '#444' }}
          >
            Mostrar mais ({visiveis.length} de {filtradas.length})
          </button>
        )}
      </div>
    </div>
  );
}
