'use client';
// Faixa do módulo SERVIÇOS: todos os sistemas do grupo viram guias estilo
// Chrome numa faixa azul-céu — igual ao esquema do Peças/Frota/Financeiro.
// Injetada de uma vez pelo layout do route group (portal)/(servicos).
// Só mostra as guias que a pessoa tem permissão de ver (módulos do Admin).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';

const ABAS = [
  { modulo: 'pos', label: 'Pós-Vendas (OS)', href: '/pos' },
  { modulo: 'lousa', label: 'Lousa Virtual', href: '/lousa' },
  { modulo: 'garantias', label: 'Garantias', href: '/garantias' },
  { modulo: 'revisoes', label: 'Revisões', href: '/revisoes' },
  { modulo: 'clientes', label: 'Clientes', href: '/clientes' },
  { modulo: 'mecanicos', label: 'Gestão Pós Vendas', href: '/mecanicos' },
  { modulo: 'sat', label: 'SAT', href: '/sat' },
  { modulo: 'mapa-geral', label: 'Mapa Técnico', href: '/mapa-geral' },
  { modulo: 'fotos-tecnicos', label: 'Fotos Técnicos', href: '/fotos-tecnicos' },
];

export default function ServicosNav() {
  const pathname = usePathname() ?? '';
  const { userProfile } = useAuth();
  const { temAcesso, loading } = usePermissoes(userProfile?.id);
  // celular: a faixa rola de lado e a guia do módulo aberto ficava fora da tela — rola só a faixa até ela
  const faixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const f = faixa.current, a = f?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!f || !a || f.scrollWidth <= f.clientWidth) return;
    const df = f.getBoundingClientRect(), da = a.getBoundingClientRect();
    f.scrollLeft += da.left - df.left - (df.width - da.width) / 2;
  }, [pathname, loading, userProfile]);

  if (loading || !userProfile) return null;
  const visiveis = ABAS.filter((a) => temAcesso(a.modulo));
  if (visiveis.length <= 1) return null; // só uma tela liberada → faixa não ajuda

  return (
    <div
      ref={faixa}
      className="print:hidden servicos-nav"
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 4,
        padding: '12px 16px 0',
        background: 'linear-gradient(135deg, #38BDF8, #0369A1)',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {visiveis.map((a) => {
        const ativo = pathname === a.href || pathname.startsWith(`${a.href}/`);
        return (
          <Link
            key={a.href}
            href={a.href}
            aria-current={ativo ? 'page' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '11px 18px',
              fontSize: 14.5,
              fontWeight: ativo ? 700 : 600,
              // fonte preta nas guias fechadas (padrão pedido pelo usuário); a ativa segue o tema
              color: ativo ? 'var(--portal-text)' : '#111111',
              // ativa = mesma cor do conteúdo (tom do módulo, globals.css) — sem divisão (José, 19/10/2026)
              background: ativo ? 'var(--tom-modulo)' : 'rgba(255,255,255,0.30)',
              borderRadius: '11px 11px 0 0',
              boxShadow: 'none',
              textDecoration: 'none',
              transition: '0.15s',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {a.label}
          </Link>
        );
      })}
    </div>
  );
}
