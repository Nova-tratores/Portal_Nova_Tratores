'use client';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import MarketingNav from '@/components/marketing/MarketingNav';
import { ESTILO_MKT_VN } from '@/components/marketing/visualMarketing';
import { podeTelaMarketing, slugDaRota } from '@/lib/permissoes/marketing';
import { grupoDoSlug } from './paginas';

// Gate centralizado do Controle Marketing (Site + Marketing & Eventos, 18/11/2026):
// módulo + tela num lugar só, em vez de repetir a checagem em cada page.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const { userProfile } = useAuth();
  const { permissoes, isAdmin, temAcesso, loading } = usePermissoes(userProfile?.id);
  const slug = slugDaRota(pathname);

  // Só bloqueia DEPOIS que tudo carregou. Durante o loading renderiza o layout
  // normal — trocar a árvore de filhos entre renders confunde o Router do Next.
  if (!loading && userProfile) {
    if (!temAcesso('marketing')) return <SemPermissao />;
    const perms = permissoes?.modulos_permitidos ?? [];
    if (slug && !podeTelaMarketing(perms, isAdmin, slug)) return <SemPermissao />;
  }

  // A camada de estilo .mkt-vn foi feita para as telas de Eventos; as de Redes
  // sociais (o antigo Site) já nasceram com o visual delas e ficam de fora.
  const eventos = grupoDoSlug(slug) !== 'Redes sociais';

  return (
    <div className={eventos ? 'mkt-vn' : undefined} style={{ minHeight: 'calc(100vh - 84px)', background: 'var(--portal-bg)' }}>
      {eventos && <style>{ESTILO_MKT_VN}</style>}
      <MarketingNav />
      {children}
    </div>
  );
}
