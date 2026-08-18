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

  // Guias estilo Chrome na FAIXA AZUL do módulo (igual à barra colorida do PPV):
  // abas ancoradas na base com cantos arredondados em cima; a ativa "gruda"
  // branca na frente com texto preto, as inativas ficam brancas sobre o azul.
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 3,
        padding: '10px 24px 0',
        background: 'linear-gradient(135deg, #1D4ED8, #1E3A8A)',
        boxShadow: '0 1px 4px var(--portal-shadow)',
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
                padding: '11px 20px',
                fontSize: 14,
                fontWeight: ativo ? 700 : 500,
                color: ativo ? '#111827' : '#fff',
                background: ativo ? '#fff' : 'rgba(255,255,255,0.12)',
                borderRadius: '11px 11px 0 0',
                boxShadow: ativo ? '0 -2px 6px rgba(0,0,0,0.15)' : 'none',
                textDecoration: 'none',
                transition: '0.15s',
                whiteSpace: 'nowrap',
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
