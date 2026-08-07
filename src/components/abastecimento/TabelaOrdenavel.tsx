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
}

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
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [mostrar, setMostrar] = useState(PASSO_EXIBICAO);

  const alternarOrdem = (chave: string) => {
    setOrdem((o) => (o?.chave === chave ? { chave, asc: !o.asc } : { chave, asc: true }));
  };

  const filtradas = useMemo(() => {
    let resultado = linhas;
    for (const c of colunas) {
      const f = (filtros[c.chave] || '').trim().toLowerCase();
      if (!f) continue;
      resultado = resultado.filter((l) => {
        const v = c.valor(l);
        return v != null && String(v).toLowerCase().includes(f);
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

  const temFiltro = Object.values(filtros).some((f) => f.trim());
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
              {colunas.map((c) => (
                <th key={c.chave} style={{ background: '#fafafa', padding: '2px 6px 8px', borderBottom: '1px solid #eee' }}>
                  <input
                    value={filtros[c.chave] || ''}
                    onChange={(e) => { setFiltros({ ...filtros, [c.chave]: e.target.value }); setMostrar(PASSO_EXIBICAO); }}
                    placeholder="filtrar…"
                    size={3}
                    style={filtroStyle}
                  />
                </th>
              ))}
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
