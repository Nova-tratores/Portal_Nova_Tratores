'use client';
// Submenu interno do módulo Estoque (aparece em todas as páginas /estoque via layout).
// Agrupado por GRUPO (Consulta / Entradas / Análise / Admin), com divisor gráfico.
// Mostra só as páginas que o usuário pode acessar (pode('estoque', key); admin/total veem todas).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { PAGINAS_ESTOQUE, GRUPOS_ESTOQUE } from './paginas';

export default function EstoqueNav() {
  const { userProfile } = useAuth();
  const { pode, loading } = usePermissoes(userProfile?.id);
  const pathname = usePathname();

  if (loading) return null;
  const visiveis = PAGINAS_ESTOQUE.filter((p) => pode('estoque', p.key));
  if (visiveis.length === 0) return null;

  // Blocos por grupo (na ordem de GRUPOS_ESTOQUE), só os que têm páginas visíveis.
  const blocos = GRUPOS_ESTOQUE
    .map((g) => ({ g, itens: visiveis.filter((p) => p.grupo === g.key) }))
    .filter((b) => b.itens.length > 0);

  const linkBase: React.CSSProperties = {
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: '.8rem',
    textDecoration: 'none',
    color: '#334155',
    whiteSpace: 'nowrap',
  };

  return (
    <nav
      style={{
        background: '#fff',
        borderBottom: '1px solid #e2e8f0',
        padding: '6px 16px',
        marginBottom: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      {/* Landing do módulo (busca de produto) */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '6px 0' }}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: '.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px',
            color: '#334155', background: '#f1f5f9', border: '1px solid #cbd5e133',
            borderLeft: '3px solid #334155', borderRadius: 6, padding: '3px 10px', minWidth: 108,
          }}
        >
          <span aria-hidden>🏭</span> Estoque
        </span>
        <Link
          href="/estoque"
          style={{ ...linkBase, background: pathname === '/estoque' ? '#dc2626' : '#f1f5f9', color: pathname === '/estoque' ? '#fff' : '#334155', fontWeight: pathname === '/estoque' ? 600 : 400 }}
        >
          Consulta de Produto
        </Link>
      </div>
      {blocos.map(({ g, itens }) => (
        <div
          key={g.key}
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            padding: '6px 0',
            borderTop: '1px solid #eef2f7',
          }}
        >
          {/* divisor gráfico do grupo */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: '.68rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '.5px',
              color: g.cor,
              background: g.corBg,
              border: `1px solid ${g.cor}22`,
              borderLeft: `3px solid ${g.cor}`,
              borderRadius: 6,
              padding: '3px 10px',
              minWidth: 108,
            }}
          >
            <span aria-hidden>{g.icon}</span> {g.label}
          </span>
          {itens.map((p) => {
            const ativo = pathname === p.href;
            return (
              <Link
                key={p.key}
                href={p.href}
                style={{
                  ...linkBase,
                  background: ativo ? '#dc2626' : '#f1f5f9',
                  color: ativo ? '#fff' : '#334155',
                  fontWeight: ativo ? 600 : 400,
                }}
              >
                {p.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
