'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { PAGINAS_SITE, podeTelaSite, slugDaPaginaSite, slugDaRotaSite } from '@/app/(portal)/site/paginas';

// Guias estilo Chrome na faixa vermelha do Comercial (molde do IVNav).
export default function SiteNav() {
  const pathname = usePathname() ?? '';
  const { userProfile } = useAuth();
  const { permissoes, isAdmin, loading } = usePermissoes(userProfile?.id);
  if (loading) return null;
  const perms = permissoes?.modulos_permitidos ?? [];
  const visiveis = PAGINAS_SITE.filter((p) => podeTelaSite(perms, isAdmin, slugDaPaginaSite(p)));
  return (
    <div
      className="print:hidden"
      style={{
        display: 'flex', alignItems: 'flex-end', gap: 3, padding: '10px clamp(12px, 2vw, 28px) 0',
        background: 'linear-gradient(135deg, #F87171, #991B1B)', overflowX: 'auto',
        WebkitOverflowScrolling: 'touch', boxShadow: '0 1px 4px var(--portal-shadow)', flexWrap: 'nowrap',
      }}
    >
      {visiveis.map((p) => {
        const ativo = slugDaRotaSite(pathname) === slugDaPaginaSite(p);
        return (
          <Link
            key={p.key}
            href={p.href}
            style={{
              padding: '11px 22px', fontSize: 15, fontWeight: ativo ? 700 : 500, color: '#111111',
              background: ativo ? '#fefefe' : 'rgba(255,255,255,0.30)', borderRadius: '11px 11px 0 0',
              boxShadow: ativo ? '0 -2px 6px rgba(0,0,0,0.15)' : 'none', textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}
