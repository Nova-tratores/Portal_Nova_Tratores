'use client';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { PAGINAS_IV, podeTelaIV, slugDaPaginaIV, slugDaRotaIV } from './paginas';

// Gate do módulo Inteligência de Vendas: módulo + tela num lugar só.
// 21/10/2026: tudo numa página só (/inteligencia-vendas, bolinhas por módulo — CentralIV);
// as abas saíram. Na página única basta poder ver UMA das telas: a própria página mostra
// só as bolinhas permitidas. As rotas antigas de cada aba redirecionam para ?m=<slug>.
export default function InteligenciaVendasLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const { userProfile } = useAuth();
  const { permissoes, isAdmin, temAcesso, loading } = usePermissoes(userProfile?.id);

  if (!loading && userProfile) {
    if (!temAcesso('inteligencia-vendas')) return <SemPermissao />;
    const perms = permissoes?.modulos_permitidos ?? [];
    const paginaUnica = pathname === '/inteligencia-vendas' || pathname === '/inteligencia-vendas/' || pathname.startsWith('/inteligencia-vendas/teste');
    const pode = paginaUnica
      ? PAGINAS_IV.some((p) => podeTelaIV(perms, isAdmin, slugDaPaginaIV(p)))
      : podeTelaIV(perms, isAdmin, slugDaRotaIV(pathname));
    if (!pode) return <SemPermissao />;
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 84px)', background: 'var(--portal-bg)' }}>
      {children}
    </div>
  );
}
