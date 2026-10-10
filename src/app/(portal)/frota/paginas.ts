// =============================================================================
// FONTE ÚNICA das páginas do módulo Frota.
//
// Alimenta ao mesmo tempo:
//   - a sub-nav (FrotaNav.tsx)
//   - o gate por tela (frota/layout.tsx)
//   - o catálogo de permissões (lib/permissoes/catalogo.ts -> ACOES_POR_MODULO.frota)
//
// Adicionar uma tela = editar SÓ este arquivo. (Mesmo padrão do PAGINAS_AJUSTES.)
//
// ⚠️ Só liste aqui páginas que EXISTEM — a sub-nav renderiza um link pra cada
// uma, e um link pra rota inexistente vira 404.
// =============================================================================

export type GrupoFrota = 'Início' | 'Cadastro' | 'Operação' | 'Custos';

// As 6 ABAS da faixa azul (10/10/2026, Raio-X da Frota): o módulo é organizado
// pela PERGUNTA que a pessoa quer responder, não por tabela. Cada aba junta
// páginas; quando tem mais de uma, a 2ª linha mostra as sub-guias.
export type AbaFrota = 'hoje' | 'veiculos' | 'manutencao' | 'combustivel' | 'pessoas' | 'custos';

export const ABAS_FROTA: { id: AbaFrota; label: string }[] = [
  { id: 'hoje',        label: 'Hoje' },
  { id: 'veiculos',    label: 'Veículos' },
  { id: 'manutencao',  label: 'Manutenção' },
  { id: 'combustivel', label: 'Combustível' },
  { id: 'pessoas',     label: 'Pessoas' },
  { id: 'custos',      label: 'Custos' },
];

export interface PaginaFrota {
  key: string;    // 'frota:<slug>' — o slug é o que vai pra permissão
  label: string;
  href: string;
  grupo: GrupoFrota;
  aba: AbaFrota;
}

export const GRUPOS_FROTA: GrupoFrota[] = ['Início', 'Cadastro', 'Operação', 'Custos'];

// ⚠️ As CHAVES (frota:<slug>) são o que está gravado nas permissões dos
// usuários — renomear uma tira o acesso de quem a tem. Para reorganizar,
// mude `aba`/`label`/ordem, nunca a chave.
export const PAGINAS_FROTA: PaginaFrota[] = [
  // Hoje e Veículos usam a MESMA chave (frota:dashboard): quem via a antiga
  // Visão geral continua vendo as duas. Hoje = o que fazer agora; Veículos =
  // KPIs de saúde + grid completo com a Ficha (a antiga Visão geral).
  { key: 'frota:dashboard',          label: 'Hoje',              href: '/frota',                    grupo: 'Início',   aba: 'hoje' },
  { key: 'frota:dashboard',          label: 'Veículos',          href: '/frota/veiculos',           grupo: 'Início',   aba: 'veiculos' },
  // Pátio NÃO tem tela (decisão do usuário, 13/07): o rótulo de localização nos
  // cards de Veículos substituiu o grid arrastável; o valor FIPE é editado na
  // Ficha do Veículo. Documentos também vivem na Ficha (ação frota:documentos:editar).
  { key: 'frota:mapa',               label: 'Mapa',              href: '/frota/mapa',               grupo: 'Operação', aba: 'veiculos' },
  // Pendências por veículo: régua de cadastro/documentação + checklist,
  // requisição, OS e Opa, num lugar só.
  { key: 'frota:pendencias',         label: 'Pendências',        href: '/frota/pendencias',         grupo: 'Operação', aba: 'manutencao' },
  // Preventiva por km, horas ou data (Fase 2): plano por modelo, pelo manual de
  // cada veículo; o que foi feito reinicia a contagem. Planos em /frota/preventivas/planos.
  { key: 'frota:preventivas',        label: 'Preventivas',       href: '/frota/preventivas',        grupo: 'Operação', aba: 'manutencao' },
  { key: 'frota:manutencoes',        label: 'Manutenções',       href: '/frota/manutencoes',        grupo: 'Operação', aba: 'manutencao' },
  // Checklists mensais dos veículos (feitos no NT Mecânico) — status por técnico/veículo.
  { key: 'frota:checklists',         label: 'Checklists',        href: '/frota/checklists',         grupo: 'Operação', aba: 'manutencao' },
  // Avarias: danos de veículo atribuíveis a motorista (registro manual).
  // A cobrança tem fim no RH (fila em Descontos → Avarias da frota).
  { key: 'frota:avarias',            label: 'Avarias',           href: '/frota/avarias',            grupo: 'Operação', aba: 'manutencao' },
  { key: 'frota:abastecimento',      label: 'Abastecimento',     href: '/frota/abastecimento',      grupo: 'Custos',   aba: 'combustivel' },
  { key: 'frota:abastecimento:flex', label: 'Álcool × Gasolina', href: '/frota/abastecimento/flex', grupo: 'Custos',   aba: 'combustivel' },
  // Motoristas: funcionários do RH (Supabase próprio, sem salário) + CNH e
  // vínculos da frota. Só CNH/flag motorista editáveis aqui — o cadastro é do RH.
  { key: 'frota:motoristas',         label: 'Motoristas',        href: '/frota/motoristas',         grupo: 'Cadastro', aba: 'pessoas' },
  { key: 'frota:multas',             label: 'Multas',            href: '/frota/multas',             grupo: 'Operação', aba: 'pessoas' },
  { key: 'frota:paradas',            label: 'Paradas',           href: '/frota/paradas',            grupo: 'Operação', aba: 'pessoas' },
  { key: 'frota:custos',             label: 'Custos (TCO)',      href: '/frota/custos',             grupo: 'Custos',   aba: 'custos' },
];

/** 'frota:abastecimento:flex' -> 'abastecimento:flex' */
export function slugDaPagina(p: PaginaFrota): string {
  return p.key.slice('frota:'.length);
}

/** Página ativa para a URL: entre as que casam com o prefixo, a de href mais longo
 *  ('/frota' só casa exato; '/frota/checklist/<placa>' cai em Checklists). */
export function paginaDaRota(pathname: string, paginas: PaginaFrota[] = PAGINAS_FROTA): PaginaFrota | null {
  const p = pathname.replace(/\/+$/, '') || '/';
  const alvo = p.startsWith('/frota/checklist/') ? '/frota/checklists' : p;
  let melhor: PaginaFrota | null = null;
  for (const pg of paginas) {
    const casa = pg.href === '/frota' ? alvo === '/frota' : (alvo === pg.href || alvo.startsWith(pg.href + '/'));
    if (casa && (!melhor || pg.href.length > melhor.href.length)) melhor = pg;
  }
  return melhor;
}
