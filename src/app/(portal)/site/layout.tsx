'use client';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import SiteNav from '@/components/site/SiteNav';
import { podeTelaSite, slugDaRotaSite } from './paginas';

// Gate do módulo Site: módulo + tela num lugar só (mesmo molde do Marketing/IV).
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const { userProfile } = useAuth();
  const { permissoes, isAdmin, temAcesso, loading } = usePermissoes(userProfile?.id);

  if (!loading && userProfile) {
    if (!temAcesso('site')) return <SemPermissao />;
    if (!podeTelaSite(permissoes?.modulos_permitidos ?? [], isAdmin, slugDaRotaSite(pathname))) return <SemPermissao />;
  }
  return (
    <div style={{ minHeight: 'calc(100vh - 84px)', background: 'var(--portal-bg)' }}>
      <SiteNav />
      {children}
    </div>
  );
}
