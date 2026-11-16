'use client';
// Botões de troca dentro de uma guia do módulo Site (ex.: Pedidos | Catálogo, 12/11/2026). Cada um é um endereço,
// então o Voltar do navegador funciona.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { T1, T3 } from './np';

export type SubAba = { label: string; href: string; icone: string; ativo?: (path: string) => boolean };

export default function SubAbas({ abas }: { abas: SubAba[] }) {
  const path = usePathname() ?? '';
  return (
    <nav style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', width: 'fit-content', maxWidth: '100%', overflowX: 'auto' }}>
      {abas.map((a) => {
        const on = a.ativo ? a.ativo(path) : path === a.href;
        return (
          <Link key={a.href} href={a.href}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 38, padding: '7px 16px', borderRadius: 9, fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap',
              background: on ? '#d97706' : 'transparent', color: on ? '#fefefe' : T1 }}>
            <i className={a.icone} style={{ fontWeight: a.icone.startsWith('fa-solid') ? 900 : 400, color: on ? '#fefefe' : T3 }} />{a.label}
          </Link>
        );
      })}
    </nav>
  );
}

export const ABAS_PEDIDOS_CATALOGO: SubAba[] = [
  { label: 'Pedidos do site', href: '/site', icone: 'fa-solid fa-inbox' },
  { label: 'Catálogo de máquinas', href: '/site/catalogo', icone: 'fa-solid fa-tractor', ativo: (p) => p.startsWith('/site/catalogo') },
];
