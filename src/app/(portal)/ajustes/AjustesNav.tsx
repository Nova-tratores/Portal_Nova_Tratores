'use client';
// Submenu interno do módulo Ajustes (aparece em todas as páginas /ajustes via layout).
// Mostra só as páginas que o usuário pode acessar (pode('ajustes', '<x>'); admin/total veem todas).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { PAGINAS_AJUSTES, GRUPOS_AJUSTES, type GrupoAjustes } from './paginas';

export default function AjustesNav() {
  const { userProfile } = useAuth();
  const { pode, loading } = usePermissoes(userProfile?.id);
  const pathname = usePathname();

  if (loading) return null;
  const visiveis = PAGINAS_AJUSTES.filter((p) => pode('ajustes', p.key.slice('ajustes:'.length)));
  if (visiveis.length === 0) return null;

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
        padding: '8px 16px',
        marginBottom: 4,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 14,
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      {GRUPOS_AJUSTES.map((grupo) => {
        const itens = visiveis.filter((p) => p.grupo === (grupo as GrupoAjustes));
        if (itens.length === 0) return null;
        return (
          <div key={grupo} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {grupo !== 'Início' && (
              <span style={{ fontSize: '.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px' }}>{grupo}</span>
            )}
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
        );
      })}
    </nav>
  );
}
