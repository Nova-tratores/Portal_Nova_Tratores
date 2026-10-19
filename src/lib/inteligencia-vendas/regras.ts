// =============================================================================
// INTELIGÊNCIA DE VENDAS — regras de oportunidade e perguntas prontas. PURA.
//
// Cada regra olha a ficha do cliente e diz: POR QUE ligar e O QUE oferecer.
// Peso soma no score (teto 100). Mudar regra = mudar aqui + teste.
// =============================================================================
import { diasEntre } from './normalizar';
import type { ClienteIV, Oportunidade, RegraId } from './tipos';

export const REGRAS: Record<RegraId, { rotulo: string; cor: string; explicacao: string }> = {
  renovacao: { rotulo: 'Renovar trator', cor: '#DC2626', explicacao: 'Trator comprado conosco há 5 anos ou mais, ou horímetro alto na oficina.' },
  cruzada: { rotulo: 'Implemento', cor: '#EA580C', explicacao: 'Comprou trator nos últimos 4 anos e nenhum implemento conosco.' },
  outra_marca: { rotulo: 'Outra marca', cor: '#7C3AED', explicacao: 'Traz trator de outra marca na oficina, ou compra peças sem ter trator comprado conosco.' },
  reabordar: { rotulo: 'Reabordar', cor: '#0891B2', explicacao: 'Perdeu proposta entre 3 meses e 2 anos atrás. A situação pode ter mudado.' },
  proposta_parada: { rotulo: 'Proposta parada', cor: '#CA8A04', explicacao: 'Tem proposta em aberto. Ver a fila em "Propostas sem retorno".' },
  sumiu: { rotulo: 'Sumiu', cor: '#BE185D', explicacao: 'Comprava peças no ano anterior e não comprou nada nos últimos 12 meses.' },
  sem_visita: { rotulo: 'Sem visita', cor: '#475569', explicacao: 'Tem máquina nossa e nenhum vendedor visitou nos últimos 6 meses (CRM).' },
  perfil: { rotulo: 'Perfil', cor: '#16A34A', explicacao: 'Área ou cultura registrada no CRM combina com uma linha de máquinas.' },
  prestador: { rotulo: 'Prestador', cor: '#2563EB', explicacao: 'CNPJ de prestador de serviço agrícola (CNAE 0161): precisa de alta capacidade.' },
};

/** Perfil identificado → oportunidade a investigar (ideia 10). */
export const PERFIS: { id: string; quando: string; oferecer: string; casa: (c: ClienteIV) => boolean }[] = [
  {
    id: 'graos-grande', quando: 'Grãos (soja, milho, trigo, feijão) com 300 ha ou mais',
    oferecer: 'Plantadeira de maior capacidade, pulverizador, trator de alta potência',
    casa: (c) => temCultura(c, ['soja', 'milho', 'trigo', 'feijao', 'sorgo', 'graos']) && (c.areaHa || 0) >= 300,
  },
  {
    id: 'graos', quando: 'Grãos em área menor que 300 ha',
    oferecer: 'Plantadeira, distribuidor, pulverizador de barra',
    casa: (c) => temCultura(c, ['soja', 'milho', 'trigo', 'feijao', 'sorgo', 'graos']) && (c.areaHa || 0) < 300,
  },
  {
    id: 'pecuaria', quando: 'Pecuária / pastagem',
    oferecer: 'Vagão misturador, roçadeira, conjunto frontal, forrageira',
    casa: (c) => temCultura(c, ['pastagem', 'pecuaria', 'gado', 'leite', 'bovino']),
  },
  {
    id: 'perene', quando: 'Café, laranja ou fruta',
    oferecer: 'Trator estreito/fruteiro, pulverizador, trincha',
    casa: (c) => temCultura(c, ['cafe', 'laranja', 'citros', 'fruta', 'abacate', 'uva']),
  },
  {
    id: 'cana', quando: 'Cana-de-açúcar',
    oferecer: 'Trator de alta potência, carreta, subsolador',
    casa: (c) => temCultura(c, ['cana']),
  },
];

function temCultura(c: ClienteIV, chaves: string[]): boolean {
  const txt = c.culturas.join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return chaves.some((k) => txt.includes(k));
}

const CNAE_PRESTADOR = /^0161/; // Atividades de apoio à agricultura

export function avaliarCliente(c: ClienteIV, hoje: string): Oportunidade[] {
  const out: Oportunidade[] = [];
  const t = c.ultimoTrator;

  // Renovação
  if (t && c.anosUltimoTrator != null && c.anosUltimoTrator >= 5) {
    out.push({
      regra: 'renovacao', peso: 30 + Math.min(15, (c.anosUltimoTrator - 5) * 3),
      titulo: `Trator ${t.modelo} com ${c.anosUltimoTrator} anos`,
      porque: `Comprou o ${t.modelo} em ${fmt(t.data)}${c.maiorHorimetro ? `; maior horímetro visto na oficina: ${c.maiorHorimetro} h` : ''}.`,
      oferecer: 'Troca do trator (avaliar o usado na negociação)',
    });
  } else if (c.maiorHorimetro != null && c.maiorHorimetro >= 5000) {
    out.push({
      regra: 'renovacao', peso: 20, // horímetro pode ser de outra máquina da frota: pesa menos que a idade
      titulo: `Trator com ${c.maiorHorimetro.toLocaleString('pt-BR')} h na oficina`,
      porque: `Horímetro de ${c.maiorHorimetro.toLocaleString('pt-BR')} h numa OS (pode ser de outra máquina da frota dele).`,
      oferecer: 'Troca do trator (avaliar o usado na negociação)',
    });
  }

  // Venda cruzada
  if (t && c.qtdImplementos === 0 && (diasEntre(t.data, hoje) ?? 9999) <= 4 * 365) {
    out.push({
      regra: 'cruzada', peso: 25,
      titulo: `Tem o ${t.modelo} e nenhum implemento conosco`,
      porque: `Trator comprado em ${fmt(t.data)}; nenhum implemento na nossa base.`,
      oferecer: `Implementos para o ${t.modelo} (roçadeira, grade, carreta, plantadeira)`,
    });
  }

  // Outra marca / cliente de peças sem trator nosso
  if (c.qtdTratores === 0 && (c.marcasNaOficina.length > 0 || c.pecas12m + c.pecas12a24m >= 3000)) {
    const marcas = c.marcasNaOficina.join(', ');
    out.push({
      regra: 'outra_marca', peso: 25,
      titulo: marcas ? `Trator ${marcas} na oficina` : 'Compra peças, trator não é nosso',
      porque: marcas
        ? `As OS citam ${marcas}. Ainda não comprou trator conosco.`
        : `R$ ${Math.round(c.pecas12m + c.pecas12a24m).toLocaleString('pt-BR')} em peças em 2 anos, sem trator comprado aqui.`,
      oferecer: 'Apresentar a linha Mahindra (demonstração / comparativo)',
    });
  }

  // Reabordar proposta perdida
  if (c.ultimaPerdida) {
    const d = diasEntre(c.ultimaPerdida.data, hoje);
    if (d != null && d >= 90 && d <= 730) {
      const oq = [c.ultimaPerdida.marca, c.ultimaPerdida.modelo].filter(Boolean).join(' ');
      out.push({
        regra: 'reabordar', peso: 20,
        titulo: `Perdeu proposta ${oq ? `de ${oq} ` : ''}há ${Math.round(d / 30)} meses`,
        porque: `Proposta não vendida em ${fmt(c.ultimaPerdida.data)}.`,
        oferecer: oq ? `Nova condição para ${oq}` : 'Nova proposta',
      });
    }
  }

  // Proposta parada
  if (c.propostasAbertas > 0) {
    out.push({
      regra: 'proposta_parada', peso: 15,
      titulo: `${c.propostasAbertas} proposta(s) em aberto`,
      porque: `R$ ${Math.round(c.valorPropostasAbertas).toLocaleString('pt-BR')} em aberto.`,
      oferecer: 'Ligar para fechar ou registrar o motivo da perda',
    });
  }

  // Sumiu
  if (c.pedidosPecas12a24m >= 2 && c.pedidosPecas12m === 0) {
    out.push({
      regra: 'sumiu', peso: 15,
      titulo: 'Parou de comprar peças',
      porque: `${c.pedidosPecas12a24m} pedidos no ano anterior; nenhum nos últimos 12 meses (última compra ${fmt(c.ultimaCompraPecas)}).`,
      oferecer: 'Ligar: revisão, peças, entender por que parou',
    });
  }

  // Sem visita
  if (c.qtdTratores > 0) {
    const d = c.ultimaVisita ? diasEntre(c.ultimaVisita, hoje) : null;
    if (d == null || d > 180) {
      out.push({
        regra: 'sem_visita', peso: 10,
        titulo: c.ultimaVisita ? `Última visita há ${Math.round(d! / 30)} meses` : 'Nunca visitado pelo CRM',
        porque: 'Tem trator comprado conosco.',
        oferecer: 'Visita de relacionamento',
      });
    }
  }

  // Perfil do CRM (área / cultura)
  const perfil = PERFIS.find((p) => p.casa(c));
  if (perfil) {
    out.push({
      regra: 'perfil', peso: 15,
      titulo: perfil.quando,
      porque: `CRM: ${c.culturas.join(', ') || '—'}${c.areaHa ? ` · ${Math.round(c.areaHa)} ha` : ''}.`,
      oferecer: perfil.oferecer,
    });
  }

  // Prestador de serviço (CNAE)
  if (CNAE_PRESTADOR.test(c.cnae.replace(/\D/g, ''))) {
    out.push({
      regra: 'prestador', peso: 20,
      titulo: 'Prestador de serviço agrícola',
      porque: `CNAE ${c.cnae} — ${c.cnaeDescricao}.`,
      oferecer: 'Equipamento de alta capacidade operacional',
    });
  }

  return out.sort((a, b) => b.peso - a.peso);
}

function fmt(iso: string): string {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

// ── Perguntas prontas do buscador (ideia 20) ────────────────────────────────
export interface Pergunta {
  id: string;
  texto: string;
  filtro: (c: ClienteIV, hoje: string) => boolean;
}

export const PERGUNTAS: Pergunta[] = [
  { id: 'trator5', texto: 'Compraram trator há mais de 5 anos', filtro: (c) => (c.anosUltimoTrator ?? -1) >= 5 },
  { id: 'sem-implemento', texto: 'Têm trator e nunca compraram implemento', filtro: (c) => c.qtdTratores > 0 && c.qtdImplementos === 0 },
  { id: 'outra-marca', texto: 'Trazem trator de outra marca na oficina', filtro: (c) => c.marcasNaOficina.length > 0 && c.qtdTratores === 0 },
  { id: 'pecas-sem-trator', texto: 'Compram peças e não têm trator nosso', filtro: (c) => c.qtdTratores === 0 && c.pecas12m >= 1000 },
  { id: 'perdida', texto: 'Perderam proposta (reabordar)', filtro: (c) => c.oportunidades.some((o) => o.regra === 'reabordar') },
  { id: 'aberta', texto: 'Têm proposta em aberto', filtro: (c) => c.propostasAbertas > 0 },
  { id: 'sumiu', texto: 'Pararam de comprar peças', filtro: (c) => c.oportunidades.some((o) => o.regra === 'sumiu') },
  { id: 'sem-visita', texto: 'Têm trator nosso e ninguém visitou em 6 meses', filtro: (c) => c.oportunidades.some((o) => o.regra === 'sem_visita') },
  { id: 'nunca-proposta', texto: 'Clientes ativos que nunca receberam proposta', filtro: (c) => !c.ultimaProposta && (c.pecas12m > 0 || c.os12m > 0) },
  { id: 'horimetro', texto: 'Trator com mais de 5.000 h na oficina', filtro: (c) => (c.maiorHorimetro ?? 0) >= 5000 },
  { id: 'prestador', texto: 'Prestadores de serviço agrícola (CNAE)', filtro: (c) => c.oportunidades.some((o) => o.regra === 'prestador') },
];
