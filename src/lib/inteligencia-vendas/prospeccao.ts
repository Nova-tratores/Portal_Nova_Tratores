// =============================================================================
// INTELIGÊNCIA DE VENDAS — aba Prospecção (José, 19/10/2026: "juntar esses em uma aba,
// separando como você me explicou, para ficar bem fácil do usuário entender, com a
// ajuda do Tratorilson para explicar"). Lib PURA: o formato do resumo e as falas do
// Tratorilson, montadas a partir dos números (sem IA: sai na hora e nunca inventa).
//
//   Carteira ........ quem já compra conosco e tem motivo para uma ligação
//   Recuperar ....... negócio parado e proposta perdida que pode voltar
//   Novos clientes .. propriedades sem cliente nosso, indicações, empresas novas
//   Território ...... onde vale mais a pena (mercado grande, pouca presença nossa)
// =============================================================================
import type { ClienteIV, RegraId } from './tipos';
import type { ItemRetorno } from './retorno';

export type GrupoId = 'carteira' | 'recuperar' | 'novos' | 'territorio';

export interface Propriedade { cod: string; municipio: string; areaHa: number; cultura: string; investimento: number; credito: number }
export interface MunicipioResumo { nome: string; foco: number; cultura: string; clientes: number; tratores: number; areaHa: number; linhas: string[] }

export interface ResumoProspeccao {
  geradoEm: string;
  carteira: { clientes: number; comMotivo: number; porMotivo: { regra: RegraId; rotulo: string; cor: string; qtd: number }[]; top: ClienteIV[] };
  recuperar: {
    parados: number; valorParado: number; topParados: ItemRetorno[];
    reabordar: number; topReabordar: ClienteIV[];
    perdidas12m: number; concorrentes: { nome: string; qtd: number }[];
  };
  novos: {
    propriedades: Propriedade[];
    sugestoesVinculo: number;
    indicacoesAbertas: number; indicacoes: { nome: string; cidade: string; quem: string; status: string }[];
    empresasNovas: number; empresas: { nome: string; municipio: string; cnae: string; abertura: string }[];
  };
  territorio: { municipios: MunicipioResumo[] };
}

const n = (v: number) => Math.round(v).toLocaleString('pt-BR');
const reais = (v: number) => (v >= 1e6 ? `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} milhões` : v >= 1e3 ? `R$ ${n(v / 1e3)} mil` : `R$ ${n(v)}`);
const primeiro = (nome: string) => nome.split(/\s+/).slice(0, 2).map((p) => p[0] + p.slice(1).toLowerCase()).join(' ');
/** Só a 1ª letra em minúscula: modelo de trator (6075E) continua como está. */
const minus = (t: string) => t.replace(/^./, (x) => x.toLowerCase());
export const cidadeBonita = (c: string) => c.replace(/\s*\(..\)$/, '').toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase());
const plural =(q: number, um: string, varios: string) => `${n(q)} ${q === 1 ? um : varios}`;

export interface Fala { titulo: string; texto: string; dica: string }

/** O que o Tratorilson diz na abertura e em cada grupo. */
export function falasTratorilson(r: ResumoProspeccao): { abertura: string; grupos: Record<GrupoId, Fala> } {
  const c = r.carteira, rec = r.recuperar, nv = r.novos, t = r.territorio;
  const motivoTop = c.porMotivo[0];
  const topCli = c.top[0];
  const parado = rec.topParados[0];
  const conc = rec.concorrentes[0];
  const prop = nv.propriedades[0];
  const cid = t.municipios[0];

  const abertura = c.comMotivo
    ? `Separei a prospecção em 4 caminhos. Comece pela Carteira: ${plural(c.comMotivo, 'cliente já compra', 'clientes já compram')} com a gente e ${c.comMotivo === 1 ? 'tem' : 'têm'} motivo para uma ligação${motivoTop ? ` — o mais comum é "${motivoTop.rotulo}" (${n(motivoTop.qtd)})` : ''}. Depois vá para Recuperar, que é dinheiro que já esteve na mesa.`
    : 'Separei a prospecção em 4 caminhos: Carteira, Recuperar, Novos clientes e Território. Clique em cada um que eu explico.';

  return {
    abertura,
    grupos: {
      carteira: {
        titulo: 'Quem da carteira eu ligo hoje?',
        texto: `São clientes que já compraram com a gente. Eu cruzo vendas, revisões, oficina, propostas e as visitas do CRM e dou uma nota de 0 a 100 para cada um: quanto maior, mais vale ligar agora. Hoje são ${plural(c.comMotivo, 'cliente', 'clientes')} com pelo menos um motivo.`,
        dica: topCli ? `Comece por ${primeiro(topCli.nome)}${topCli.cidade ? ` (${cidadeBonita(topCli.cidade)})` : ''}: ${minus(topCli.oportunidades[0]?.titulo || 'tem motivo para ligar')}. Ofereça ${minus(topCli.oportunidades[0]?.oferecer || 'uma visita')}.` : 'Ninguém da carteira com motivo agora.',
      },
      recuperar: {
        titulo: 'Que negócio eu deixei pelo caminho?',
        texto: `Aqui é venda que quase aconteceu. ${rec.parados ? `${plural(rec.parados, 'proposta ou negócio parado', 'propostas e negócios parados')}${rec.valorParado ? ` somando ${reais(rec.valorParado)}` : ''}` : 'Nenhuma proposta parada'}${rec.reabordar ? `, e ${plural(rec.reabordar, 'cliente perdeu', 'clientes perderam')} proposta entre 3 meses e 2 anos atrás — a situação deles pode ter mudado` : ''}.${rec.perdidas12m ? ` No último ano perdemos ${plural(rec.perdidas12m, 'proposta', 'propostas')}${conc ? `; quem mais ganhou de nós foi ${conc.nome} (${n(conc.qtd)})` : ''}.` : ''}`,
        dica: parado ? `O mais urgente: ${primeiro(parado.cliente)}${parado.oque ? `, ${parado.oque}` : ''}${parado.dias ? `, parado há ${parado.dias} dias` : ''}${parado.vendedor ? ` com ${primeiro(parado.vendedor)}` : ''}. Ligue para fechar ou registrar o motivo da perda.` : rec.reabordar ? 'Ligue para quem perdeu proposta: pergunte se a máquina que ele comprou está atendendo.' : 'Nada parado agora.',
      },
      novos: {
        titulo: 'Quem é cliente novo?',
        texto: `Gente que ainda não compra com a gente. ${nv.propriedades.length ? 'Achei propriedades grandes, com bom potencial no CAR, sem nenhum cliente nosso ligado a elas.' : 'Sem propriedades do CAR para mostrar agora.'} ${nv.indicacoesAbertas ? `Tem ${plural(nv.indicacoesAbertas, 'indicação esperando', 'indicações esperando')} contato.` : 'Ainda não há indicações registradas — peça uma em cada entrega de máquina.'} ${nv.empresasNovas ? `E ${plural(nv.empresasNovas, 'empresa rural nova', 'empresas rurais novas')} na região.` : 'O levantamento de empresas rurais novas da Receita ainda não foi rodado.'}`,
        dica: prop ? `A maior: ${n(prop.areaHa)} ha${prop.cultura ? ` de ${prop.cultura.toLowerCase()}` : ''} em ${prop.municipio}${prop.investimento ? `, que pegou ${reais(prop.investimento)} de crédito para investir nos últimos 3 anos` : ''}. Descubra quem é o dono numa visita na região.` : 'Cadastre as indicações que os clientes fizerem: elas aparecem aqui.',
      },
      territorio: {
        titulo: 'Em que cidade vale mais a pena?',
        texto: 'Aqui eu não aponto pessoas, aponto onde. A nota de foco junta o tamanho do mercado da cidade (área plantada, valor da produção, crédito rural) com o espaço que ainda temos (poucos clientes com trator nosso).',
        dica: cid ? `${cid.nome} está em 1º (foco ${cid.foco}): ${cid.cultura ? `forte em ${cid.cultura.toLowerCase()}, ` : ''}${plural(cid.clientes, 'cliente nosso', 'clientes nossos')} e ${plural(cid.tratores, 'trator vendido', 'tratores vendidos')}. Vale um dia de visitas por lá.` : 'Sem dados de municípios agora.',
      },
    },
  };
}
