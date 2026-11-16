'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { ABAS_SITE, PAGINAS_SITE, podeTelaSite, slugDaPaginaSite, slugDaRotaSite } from '@/app/(portal)/site/paginas';

// Guias estilo Chrome na faixa amarela do Site (cor do módulo, 12/11) (molde do IVNav).
export default function SiteNav() {
  const pathname = usePathname() ?? '';
  const { userProfile } = useAuth();
  const { permissoes, isAdmin, loading } = usePermissoes(userProfile?.id);
  if (loading) return null;
  const perms = permissoes?.modulos_permitidos ?? [];
  const pode = (key: string) => { const p = PAGINAS_SITE.find((x) => x.key === key); return !!p && podeTelaSite(perms, isAdmin, slugDaPaginaSite(p)); };
  // cada guia abre a primeira tela dela que a pessoa pode ver
  const visiveis = ABAS_SITE.map((a) => ({ ...a, telas: a.telas.filter(pode) })).filter((a) => a.telas.length)
    .map((a) => ({ key: a.label, label: a.label, href: PAGINAS_SITE.find((p) => p.key === a.telas[0])!.href, slugs: a.telas.map((t) => t.slice('site:'.length)) }));
  return (
    <div
      className="print:hidden"
      style={{
        display: 'flex', alignItems: 'flex-end', gap: 3, padding: '10px clamp(12px, 2vw, 28px) 0',
        background: 'linear-gradient(135deg, #FBBF24, #B45309)', overflowX: 'auto',
        WebkitOverflowScrolling: 'touch', boxShadow: '0 1px 4px var(--portal-shadow)', flexWrap: 'nowrap',
      }}
    >
      {visiveis.map((p) => {
        const ativo = p.slugs.includes(slugDaRotaSite(pathname));
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
