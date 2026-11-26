// Acessos dividido por rede (12/11/2026): todas juntas, o site (contador próprio) e cada rede social.
import type { SubAba } from './SubAbas';
import { REDES } from '@/lib/marketing/redes/redes';

export const ABAS_ACESSOS: SubAba[] = [
  { label: 'Todas as redes', href: '/marketing/acessos/todas', icone: 'fa-solid fa-layer-group' },
  ...REDES.map((r) => (r.id === 'site'
    ? { label: 'Site', href: '/marketing/acessos', icone: r.icone, rede: r.id, ativo: (p: string) => p === '/marketing/acessos' || p.startsWith('/marketing/acessos/textos') }
    : { label: r.nome, href: `/marketing/acessos/${r.id}`, icone: r.icone, rede: r.id })),
];
