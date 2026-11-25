'use client';
// Botões de troca dentro de uma guia do módulo Site (ex.: Pedidos | Catálogo, 12/11/2026). Cada um é um endereço,
// então o Voltar do navegador funciona. 25/11/2026: aba de rede mostra a logo de verdade (LogoRede) e a página
// recebe o EstiloNP (animações das telas de Redes).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { RedeId } from '@/lib/marketing/redes/redes';
import { LogoRede } from './LogoRede';
import { EstiloNP, T1, T3 } from './np';

export type SubAba = { label: string; href: string; icone: string; ativo?: (path: string) => boolean; rede?: RedeId };

export default function SubAbas({ abas }: { abas: SubAba[] }) {
  const path = usePathname() ?? '';
  return (
    <nav style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', width: 'fit-content', maxWidth: '100%', overflowX: 'auto' }}>
      <EstiloNP />
      {abas.map((a) => {
        const on = a.ativo ? a.ativo(path) : path === a.href;
        return (
          <Link key={a.href} href={a.href}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 38, padding: '7px 16px', borderRadius: 9, fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap',
              background: on ? '#d97706' : 'transparent', color: on ? '#fefefe' : T1, transition: 'background .15s ease' }}>
            {a.rede
              ? <span style={{ display: 'inline-flex', borderRadius: 7, boxShadow: on ? '0 0 0 2px #fefefe' : 'none' }}><LogoRede id={a.rede} tam={22} /></span>
              : <i className={a.icone} style={{ fontWeight: a.icone.startsWith('fa-solid') ? 900 : 400, color: on ? '#fefefe' : T3 }} />}
            {a.label}
          </Link>
        );
      })}
    </nav>
  );
}

export const ABAS_PEDIDOS_CATALOGO: SubAba[] = [
  { label: 'Pedidos do site', href: '/marketing/pedidos', icone: 'fa-solid fa-inbox' },
  { label: 'Catálogo de máquinas', href: '/marketing/catalogo', icone: 'fa-solid fa-tractor', ativo: (p) => p.startsWith('/marketing/catalogo') },
];
