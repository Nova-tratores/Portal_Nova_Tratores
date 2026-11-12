// Acessos dividido por rede (12/11/2026): todas juntas, o site (contador próprio) e cada rede social.
import type { SubAba } from './SubAbas';
import { REDES } from '@/lib/site/redes';

export const ABAS_ACESSOS: SubAba[] = [
  { label: 'Todas as redes', href: '/site/acessos/todas', icone: 'fa-solid fa-layer-group' },
  ...REDES.map((r) => (r.id === 'site'
    ? { label: 'Site', href: '/site/acessos', icone: r.icone }
    : { label: r.nome, href: `/site/acessos/${r.id}`, icone: r.icone })),
];
