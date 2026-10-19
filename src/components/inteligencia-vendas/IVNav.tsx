'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { PAGINAS_IV, podeTelaIV, slugDaPaginaIV, slugDaRotaIV } from '@/app/(portal)/inteligencia-vendas/paginas';

// Guias estilo Chrome na faixa vermelha do Comercial (mesmo molde do Marketing/Frota).
export default function IVNav() {
  const pathname = usePathname() ?? '';
  const { userProfile } = useAuth();
  const { permissoes, isAdmin, loading } = usePermissoes(userProfile?.id);
  if (loading) return null;
  const perms = permissoes?.modulos_permitidos ?? [];
  const visiveis = PAGINAS_IV.filter((p) => podeTelaIV(perms, isAdmin, slugDaPaginaIV(p)));

  return (
    <div
      className="print:hidden"
      style={{
        display: 'flex', alignItems: 'flex-end', gap: 3, padding: '10px 24px 0',
        background: 'linear-gradient(135deg, #F87171, #991B1B)', overflowX: 'auto',
        WebkitOverflowScrolling: 'touch', boxShadow: '0 1px 4px var(--portal-shadow)', flexWrap: 'nowrap',
      }}
    >
      {visiveis.map((p) => {
        const ativo = slugDaRotaIV(pathname) === slugDaPaginaIV(p);
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
