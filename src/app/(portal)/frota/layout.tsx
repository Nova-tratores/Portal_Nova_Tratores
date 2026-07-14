'use client';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import FrotaNav from '@/components/frota/FrotaNav';
import { podeTelaFrota, slugDaRota } from '@/lib/permissoes/frota';

// Gate centralizado do módulo (mesmo padrão do feedbacks/layout.tsx): módulo +
// tela num lugar só, em vez de repetir a checagem em cada page.
export default function FrotaLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const { userProfile } = useAuth();
  const { permissoes, isAdmin, temAcesso, loading } = usePermissoes(userProfile?.id);

  // Só bloqueia DEPOIS que tudo carregou. Durante o loading renderiza o layout
  // normal — trocar a árvore de filhos entre renders confunde o Router do Next.
  if (!loading && userProfile) {
    if (!temAcesso('frota')) return <SemPermissao />;
    const slug = slugDaRota(pathname);
    const perms = permissoes?.modulos_permitidos ?? [];
    if (slug && !podeTelaFrota(perms, isAdmin, slug)) return <SemPermissao />;
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 84px)', background: 'var(--portal-bg)' }}>
      <FrotaNav />
      {children}
    </div>
  );
}
