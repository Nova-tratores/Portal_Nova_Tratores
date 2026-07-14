'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { GRUPOS_FROTA, PAGINAS_FROTA, slugDaPagina } from '@/app/(portal)/frota/paginas';
import { podeTelaFrota } from '@/lib/permissoes/frota';

// Sub-nav do Frota. Mostra só as telas que a pessoa pode ver — a fonte é
// PAGINAS_FROTA (o mesmo array que alimenta o gate e o catálogo de permissões).
export default function FrotaNav() {
  const pathname = usePathname() ?? '';
  const { userProfile } = useAuth();
  const { permissoes, isAdmin, loading } = usePermissoes(userProfile?.id);

  if (loading) return null;

  const perms = permissoes?.modulos_permitidos ?? [];
  const visiveis = PAGINAS_FROTA.filter((p) =>
    podeTelaFrota(perms, isAdmin, slugDaPagina(p)),
  );
  if (visiveis.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        padding: '16px 32px 0',
        borderBottom: '1px solid var(--portal-border)',
        background: 'var(--portal-bg)',
        flexWrap: 'wrap',
      }}
    >
      {GRUPOS_FROTA.map((grupo) => {
        const doGrupo = visiveis.filter((p) => p.grupo === grupo);
        if (doGrupo.length === 0) return null;
        return doGrupo.map((p) => {
          const ativo =
            p.href === '/frota' ? pathname === '/frota' : pathname.startsWith(p.href);
          return (
            <Link
              key={p.key}
              href={p.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: ativo ? 700 : 500,
                color: ativo ? '#0d9488' : 'var(--portal-text-secondary)',
                borderBottom: `3px solid ${ativo ? '#0d9488' : 'transparent'}`,
                textDecoration: 'none',
                transition: '0.15s',
                marginBottom: -1,
              }}
            >
              {p.label}
            </Link>
          );
        });
      })}
    </div>
  );
}
