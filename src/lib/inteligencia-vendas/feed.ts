// =============================================================================
// INTELIGÊNCIA DE VENDAS — feed do vendedor (José, 20/10/2026: "fazer um feed para o
// vendedor; ele vai trabalhar com uma rota e, dependendo do perfil, indicamos mais
// clientes novos, renegociações ou outro"). Lib PURA.
//
// O portal monta, para cada vendedor, uma RESERVA de contatos das cidades dele:
//   carteira  ... clientes que já compram e têm motivo (renovar, implemento, sumiu…)
//   recuperar ... propostas/negócios parados dele e quem perdeu proposta (reabordar)
//   novos ..... propriedades grandes do CAR sem cliente nosso
// Cada contato vai com cidade e posição (GPS da propriedade ou o centro da cidade).
// O app de vendas aplica a mistura do perfil do vendedor e monta a rota.
// =============================================================================
import type { ClienteIV } from './tipos';
import type { ItemRetorno } from './retorno';
import { textoNorm } from './normalizar';

export type TipoFeed = 'carteira' | 'recuperar' | 'novos';

export interface ItemFeed {
  id: string;
  tipo: TipoFeed;
  titulo: string;
  sub: string;
  cidade: string;      // nome da cidade, sem UF ("Piraju")
  porque: string;
  acao: string;
  selo: string;        // nota 55 · R$ 1,4 mi · 2.099 ha
  peso: number;        // 0..1 dentro do tipo (1 = mais urgente/valioso)
  lat: number | null;
  lng: number | null;
  aprox: boolean;      // posição = centro da cidade (sem GPS da propriedade)
  propriedadeId?: number; // abre o check-in no app
  telefone?: string;
}

export interface PropriedadeCAR { cod: string; municipio: string; areaHa: number; cultura: string; investimento: number; lat: number | null; lng: number | null }

const nomeCidade = (c: string) => c.replace(/\s*[(/-]\s*[A-Za-z]{2}\)?\s*$/, '').trim();
export const chaveNome = (c: string) => textoNorm(nomeCidade(c));
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase());
const nomeCurto = (s: string) => {
  const ps = s.split(/\s+/).filter(Boolean).slice(0, 3);
  while (ps.length > 1 && /^(da|de|do|das|dos|e)$/i.test(ps[ps.length - 1])) ps.pop();
  return ps.map((p) => (p.length > 2 ? p[0] + p.slice(1).toLowerCase() : p.toLowerCase())).join(' ');
};
const reais = (v: number) => (v >= 1e6 ? `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : v >= 1e3 ? `R$ ${Math.round(v / 1e3).toLocaleString('pt-BR')} mil` : `R$ ${Math.round(v)}`);
const fone = (t: string) => { let d = String(t || '').replace(/\D/g, ''); if (d.startsWith('55') && d.length > 11) d = d.slice(2); return d.length >= 10 ? d : ''; };

/**
 * Reserva de um vendedor. `cidades` = nomes já normalizados (chaveNome) das cidades dele;
 * `centro` acha a posição da cidade quando o contato não tem GPS.
 */
export function montarReserva(e: {
  cidades: Set<string>;
  ehDoVendedor: (nomeVendedor: string) => boolean;
  clientes: ClienteIV[];
  parados: ItemRetorno[];
  propriedades: PropriedadeCAR[];
  centro: (cidade: string) => [number, number] | null;
  limites?: { carteira: number; recuperar: number; novos: number };
}): ItemFeed[] {
  const lim = e.limites || { carteira: 60, recuperar: 30, novos: 30 };
  const naArea = (cidade: string) => e.cidades.has(chaveNome(cidade));
  const pos = (cidade: string, local: [number, number] | null) => {
    if (local) return { lat: local[0], lng: local[1], aprox: false };
    const c = e.centro(cidade);
    return c ? { lat: c[0], lng: c[1], aprox: true } : { lat: null, lng: null, aprox: true };
  };
  const out: ItemFeed[] = [];

  // carteira: na área dele ou atendido por ele; os de nota maior primeiro
  const cart = e.clientes.filter((c) => c.oportunidades.some((o) => o.regra !== 'reabordar') && (naArea(c.cidade) || (c.vendedor && e.ehDoVendedor(c.vendedor))))
    .sort((a, b) => b.score - a.score).slice(0, lim.carteira);
  const maxS = Math.max(1, ...cart.map((c) => c.score));
  for (const c of cart) {
    const o = c.oportunidades.find((x) => x.regra !== 'reabordar') || c.oportunidades[0];
    out.push({
      id: `c:${c.chave}`, tipo: 'carteira', titulo: nomeCurto(c.nome), sub: [titulo(nomeCidade(c.cidade)), c.ultimoTrator?.modelo].filter(Boolean).join(' · '),
      cidade: titulo(nomeCidade(c.cidade)), porque: `${o.titulo}. ${o.porque}`, acao: `Ofereça ${o.oferecer.replace(/^./, (x) => x.toLowerCase())}.`,
      selo: `nota ${c.score}`, peso: c.score / maxS, ...pos(c.cidade, c.local), propriedadeId: c.propriedades?.[0], telefone: fone(c.telefone) || undefined,
    });
  }

  // recuperar: propostas/negócios parados DELE + quem perdeu proposta na área
  const par = e.parados.filter((p) => e.ehDoVendedor(p.vendedor) || (!p.vendedor && naArea(p.cidade)))
    .sort((a, b) => b.gravidade - a.gravidade || (b.valor || 0) - (a.valor || 0)).slice(0, lim.recuperar);
  const maxV = Math.max(1, ...par.map((p) => p.valor || 0));
  for (const p of par) {
    out.push({
      id: `p:${p.origem}:${p.id}`, tipo: 'recuperar', titulo: nomeCurto(p.cliente), sub: p.oque || p.fase, cidade: titulo(nomeCidade(p.cidade || '')),
      porque: `${p.detalhe || p.fase}${p.dias != null && !/dias/.test(p.detalhe || '') ? ` — parado há ${p.dias} dias` : ''}.`, acao: 'Feche o negócio ou registre o motivo da perda.',
      selo: p.valor ? reais(p.valor) : 'sem valor', peso: 0.5 + 0.5 * ((p.valor || 0) / maxV) * (p.gravidade / 3), ...pos(p.cidade || '', null),
    });
  }
  const reab = e.clientes.filter((c) => c.oportunidades.some((o) => o.regra === 'reabordar') && naArea(c.cidade)).slice(0, 10);
  for (const c of reab) {
    const o = c.oportunidades.find((x) => x.regra === 'reabordar')!;
    out.push({
      id: `r:${c.chave}`, tipo: 'recuperar', titulo: nomeCurto(c.nome), sub: titulo(nomeCidade(c.cidade)), cidade: titulo(nomeCidade(c.cidade)),
      porque: `${o.titulo}. ${o.porque}`, acao: 'Pergunte se a máquina que ele comprou está atendendo.', selo: 'reabordar', peso: 0.4,
      ...pos(c.cidade, c.local), propriedadeId: c.propriedades?.[0], telefone: fone(c.telefone) || undefined,
    });
  }

  // novos: propriedades do CAR sem cliente nosso, nas cidades dele
  const novos = e.propriedades.filter((p) => naArea(p.municipio)).sort((a, b) => b.areaHa - a.areaHa).slice(0, lim.novos);
  const maxA = Math.max(1, ...novos.map((p) => p.areaHa));
  for (const p of novos) {
    const temGps = p.lat != null && p.lng != null;
    out.push({
      id: `n:${p.cod}`, tipo: 'novos', titulo: `${Math.round(p.areaHa).toLocaleString('pt-BR')} ha${p.cultura ? ` de ${p.cultura.toLowerCase()}` : ''}`,
      sub: `Propriedade sem cliente nosso · ${p.municipio}`, cidade: titulo(nomeCidade(p.municipio)),
      porque: `Propriedade grande no CAR sem nenhum cliente nosso ligado${p.investimento ? `, que pegou ${reais(p.investimento)} de crédito para investir em 3 anos` : ''}.`,
      acao: 'Passe na propriedade ou pergunte aos vizinhos quem é o dono.', selo: `${Math.round(p.areaHa).toLocaleString('pt-BR')} ha`, peso: p.areaHa / maxA,
      ...(temGps ? { lat: p.lat, lng: p.lng, aprox: false } : pos(p.municipio, null)),
    });
  }
  return out;
}
