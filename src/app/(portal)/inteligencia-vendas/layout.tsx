'use client';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import IVNav from '@/components/inteligencia-vendas/IVNav';
import { podeTelaIV, slugDaRotaIV } from './paginas';

// Gate do módulo Inteligência de Vendas: módulo + tela num lugar só.
export default function InteligenciaVendasLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const { userProfile } = useAuth();
  const { permissoes, isAdmin, temAcesso, loading } = usePermissoes(userProfile?.id);

  if (!loading && userProfile) {
    if (!temAcesso('inteligencia-vendas')) return <SemPermissao />;
    const perms = permissoes?.modulos_permitidos ?? [];
    if (!podeTelaIV(perms, isAdmin, slugDaRotaIV(pathname))) return <SemPermissao />;
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 84px)', background: 'var(--portal-bg)' }}>
      {/* na página de teste a proposta de abas desenha a própria faixa */}
      {!pathname.startsWith('/inteligencia-vendas/teste') && <IVNav />}
      {children}
    </div>
  );
}
