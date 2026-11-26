'use client';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import MarketingNav from '@/components/marketing/MarketingNav';
import { ESTILO_MKT_VN } from '@/components/marketing/visualMarketing';
import { podeTelaMarketing, slugDaRota } from '@/lib/permissoes/marketing';
import { grupoDoSlug } from './paginas';

// 25/11/2026 (José: "melhora essas fontes que não dá para ler… bagulho cinza, deixa preto"): no módulo inteiro,
// os cinzas do portal (#737373 / #a3a3a3) viram quase preto, saindo da cor do texto principal (funciona no
// claro e no escuro). Inclui o texto de dica das caixas (placeholder) e os cinzas claros escritos direto no código.
const ESTILO_LEGIVEL = `
.mkt-legivel {
  --portal-text-secondary: color-mix(in srgb, var(--portal-text, #0f172a) 86%, transparent);
  --portal-text-muted: color-mix(in srgb, var(--portal-text, #0f172a) 74%, transparent);
}
.mkt-legivel ::placeholder { color: color-mix(in srgb, var(--portal-text, #0f172a) 62%, transparent) !important; opacity: 1; }
.mkt-legivel [style*="color: rgb(148, 163, 184)"], .mkt-legivel [style*="color: rgb(156, 163, 175)"],
.mkt-legivel [style*="color: rgb(170, 170, 170)"], .mkt-legivel [style*="color: rgb(163, 163, 163)"],
.mkt-legivel [style*="color: rgb(100, 116, 139)"], .mkt-legivel [style*="color: rgb(107, 114, 128)"] {
  color: color-mix(in srgb, var(--portal-text, #0f172a) 74%, transparent) !important;
}
`;

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
    <div className={eventos ? 'mkt-vn mkt-legivel' : 'mkt-legivel'} style={{ minHeight: 'calc(100vh - 84px)', background: 'var(--portal-bg)' }}>
      {eventos && <style>{ESTILO_MKT_VN}</style>}
      <style>{ESTILO_LEGIVEL}</style>
      <MarketingNav />
      {children}
    </div>
  );
}
