// Acessos dividido por rede (12/11/2026): o site (contador próprio) e cada rede social.
import type { SubAba } from './SubAbas';
import { REDES } from '@/lib/site/redes';

export const ABAS_ACESSOS: SubAba[] = REDES.map((r) => (r.id === 'site'
  ? { label: 'Site', href: '/site/acessos', icone: r.icone }
  : { label: r.nome, href: `/site/acessos/${r.id}`, icone: r.icone }));
