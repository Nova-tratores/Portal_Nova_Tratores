'use client';
// Submenu interno do módulo Ajustes (aparece em todas as páginas /ajustes via layout).
// Agrupado por DEPARTAMENTO (Financeiro / Estoque / Venda), com divisor gráfico entre eles.
// Mostra só as páginas que o usuário pode acessar (pode('ajustes', '<x>'); admin/total veem todas).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { PAGINAS_AJUSTES, DEPARTAMENTOS } from './paginas';

export default function AjustesNav() {
  const { userProfile } = useAuth();
  const { pode, loading } = usePermissoes(userProfile?.id);
  const pathname = usePathname();

  if (loading) return null;
  const visiveis = PAGINAS_AJUSTES.filter((p) => pode('ajustes', p.key.slice('ajustes:'.length)));
  if (visiveis.length === 0) return null;

  // Blocos por departamento (na ordem de DEPARTAMENTOS), só os que têm páginas visíveis.
  const blocos = DEPARTAMENTOS
    .map((dep) => ({ dep, itens: visiveis.filter((p) => p.departamento === dep.key) }))
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
      {blocos.map(({ dep, itens }, idx) => (
        <div
          key={dep.key}
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            padding: '6px 0',
            borderTop: idx > 0 ? '1px solid #eef2f7' : 'none',
          }}
        >
          {/* divisor gráfico do departamento */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: '.68rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '.5px',
              color: dep.cor,
              background: dep.corBg,
              border: `1px solid ${dep.cor}22`,
              borderLeft: `3px solid ${dep.cor}`,
              borderRadius: 6,
              padding: '3px 10px',
              minWidth: 108,
            }}
          >
            <span aria-hidden>{dep.icon}</span> {dep.label}
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
