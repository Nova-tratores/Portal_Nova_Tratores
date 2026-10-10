// Textos do botão "?" das telas da Frota (o painel é o AjudaTela do DRE).
// Indexado pelo href da página (a faixa passa a página ativa, então
// /frota/checklist/<placa> mostra a ajuda de Checklists). Tela sem entrada
// aqui não mostra o botão.
import { CLASSE_AJUDA } from '@/lib/frota/classes';
import { GRAVIDADE_AJUDA } from '@/lib/frota/gravidade';

export interface AjudaFrota {
  titulo: string;
  icon: string;
  resumo: string;
  oQueMostra: string;
  comoUsar?: string[];
  termos?: { t: string; d: string }[];
}

const TERMOS_CLASSES = [
  { t: 'Parado', d: CLASSE_AJUDA.parado },
  { t: 'Defeito', d: CLASSE_AJUDA.defeito },
  { t: 'Cadastro', d: CLASSE_AJUDA.cadastro },
];

const AJUDA: Record<string, AjudaFrota> = {
  '/frota': {
    titulo: 'Hoje',
    icon: '📋',
    resumo: 'O que precisa de atenção na frota agora.',
    oQueMostra:
      'Junta numa tela só o que antes ficava espalhado: veículos parados, problemas graves abertos, documentos vencidos ou ' +
      'vencendo em 30 dias, checklists do mês que faltam, cadastro a corrigir, paradas atípicas da semana sem explicação e ' +
      'motoristas com CNH a resolver. Bloco vazio não aparece: ele vai para a linha "Em dia" no fim.',
    comoUsar: [
      'Os números do topo levam ao bloco correspondente; o de combustível abre a tela de Abastecimento.',
      'A placa abre a Ficha do veículo; o botão de cada linha leva direto para onde se resolve.',
      'Paradas atípicas: marque várias, escreva a justificativa e clique em Justificar (ou Ignorar).',
    ],
    termos: [...TERMOS_CLASSES, { t: 'Grave / Crítica', d: `${GRAVIDADE_AJUDA.grave} Crítica: ${GRAVIDADE_AJUDA.critica}` }],
  },
  '/frota/veiculos': {
    titulo: 'Veículos',
    icon: '🚗',
    resumo: 'A frota inteira com a situação de cada carro.',
    oQueMostra:
      'Um cartão por veículo com foto, placa, modelo, onde está agora (rastreador), responsável e os selos do que está aberto. ' +
      'Os números do topo contam os veículos ativos parados, com defeito e com cadastro a corrigir.',
    comoUsar: [
      'Clique num número do topo para filtrar a lista; clique de novo para tirar o filtro.',
      'Clique no cartão para abrir a Ficha (documentos, responsável, histórico, mapa do veículo).',
      'Dá para mandar o link direto da Ficha: /frota/veiculos?placa=ABC1D23.',
    ],
    termos: [
      ...TERMOS_CLASSES,
      { t: 'DOC', d: 'Há documento vencido ou vencendo em até 30 dias.' },
      { t: 'Pendência de vínculo', d: 'O carro só apareceu no cartão de abastecimento e ainda não tem o cadastro completo na Frota.' },
      { t: 'Satélite', d: 'O veículo tem rastreador (posição e km vêm dele).' },
    ],
  },
  '/frota/pendencias': {
    titulo: 'Pendências por veículo',
    icon: '🔧',
    resumo: 'Tudo que está aberto em cada carro, do mais urgente para o menos.',
    oQueMostra:
      'As pendências nascem de 6 lugares: abertas à mão, régua de cadastro da Ficha, checklist do mês, requisição "Veicular ' +
      'Manutenção", OS do pós-vendas com a placa no projeto e Opa vinculado ao veículo. As automáticas fecham sozinhas quando ' +
      'a causa some (requisição no financeiro, OS concluída, item OK no checklist seguinte).',
    comoUsar: [
      'Filtre pela classe (Parados, Com defeito, Cadastro) e abra o carro para ver, resolver ou classificar cada item.',
      'Ao abrir uma pendência à mão, marque "criar requisição" para já pedir o conserto.',
    ],
    termos: [
      ...TERMOS_CLASSES,
      { t: 'Gravidade', d: 'Leve, média, grave ou crítica. Nasce sugerida pelo componente e pode ser corrigida.' },
      { t: '"Era pra durar mais"', d: 'O mesmo componente deu problema antes da vida útil cadastrada.' },
    ],
  },
  '/frota/checklists': {
    titulo: 'Checklists mensais',
    icon: '✅',
    resumo: 'Quem fez o checklist do mês e quem falta.',
    oQueMostra:
      'Cruza os técnicos com veículo (NT Mecânico) e os carros sem responsável com os checklists feitos no mês. ' +
      'Veículo com o checklist desligado na Ficha (parado no pátio) não entra. A mesma placa de dois técnicos aparece uma vez só.',
    termos: [
      { t: 'Score', d: 'Confiança no checklist (fotos, km, tempo de preenchimento). Abaixo de 50% fica marcado como suspeito.' },
      { t: 'Sem responsável', d: 'Carro sem técnico nem responsável na Frota: qualquer pessoa com o módulo faz pelo portal.' },
    ],
  },
};

export function ajudaFrota(href: string | null | undefined): AjudaFrota | null {
  if (!href) return null;
  return AJUDA[href] || null;
}
