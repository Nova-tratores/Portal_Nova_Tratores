'use client';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import MarketingNav from '@/components/marketing/MarketingNav';
import { podeTelaMarketing, slugDaRota } from '@/lib/permissoes/marketing';

// Gate centralizado do módulo (mesmo padrão do frota/layout.tsx): módulo + tela
// num lugar só, em vez de repetir a checagem em cada page.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const { userProfile } = useAuth();
  const { permissoes, isAdmin, temAcesso, loading } = usePermissoes(userProfile?.id);

  // Só bloqueia DEPOIS que tudo carregou. Durante o loading renderiza o layout
  // normal — trocar a árvore de filhos entre renders confunde o Router do Next.
  if (!loading && userProfile) {
    if (!temAcesso('marketing')) return <SemPermissao />;
    const slug = slugDaRota(pathname);
    const perms = permissoes?.modulos_permitidos ?? [];
    if (slug && !podeTelaMarketing(perms, isAdmin, slug)) return <SemPermissao />;
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 84px)', background: 'var(--portal-bg)' }}>
      <MarketingNav />
      {children}
    </div>
  );
}
