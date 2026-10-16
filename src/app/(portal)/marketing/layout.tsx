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
    <div className="mkt-corpo" style={{ minHeight: 'calc(100vh - var(--portal-header-h))', background: 'var(--portal-bg)' }}>
      {/* Celular: nas barras de filtro (flex com quebra) os selects de largura fixa
          cortavam o texto ("Todo per…"); aqui eles dividem a linha por igual. */}
      <style>{`@media (max-width: 768px) {
        .mkt-corpo div[style*="flex-wrap: wrap"] > select { flex: 1 1 140px !important; min-width: 0 !important; }
        .mkt-corpo div[style*="flex-wrap: wrap"] > button { min-height: 42px; }
      }`}</style>
      <MarketingNav />
      {children}
    </div>
  );
}
