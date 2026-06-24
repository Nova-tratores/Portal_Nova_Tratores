'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GanttChartSquare, CalendarDays, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';

const TABS = [
  { href: '/cronograma', label: 'Projetos', icon: GanttChartSquare, match: (p: string) => !p.includes('/calendarios') && !p.includes('/recursos') },
  { href: '/cronograma/calendarios', label: 'Calendários', icon: CalendarDays, match: (p: string) => p.includes('/calendarios') },
  { href: '/cronograma/recursos', label: 'Recursos', icon: Users, match: (p: string) => p.includes('/recursos') },
];

export default function CronogramaLayout({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth();
  const { temAcesso, loading } = usePermissoes(userProfile?.id);
  const pathname = usePathname();

  if (!loading && userProfile && !temAcesso('cronograma')) return <SemPermissao />;

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--portal-bg)' }}>
      <nav style={{ display: 'flex', gap: 4, padding: '0 16px', borderBottom: '1px solid var(--portal-border,#eee)', background: 'var(--portal-surface,#fff)' }}>
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const ativo = match(pathname);
          return (
            <Link key={href} href={href} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '12px 14px', textDecoration: 'none',
              fontSize: 14, fontWeight: 600,
              color: ativo ? '#dc2626' : 'var(--portal-text-muted,#888)',
              borderBottom: ativo ? '2px solid #dc2626' : '2px solid transparent',
            }}>
              <Icon size={16} /> {label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
