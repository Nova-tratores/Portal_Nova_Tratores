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
  '/frota/mapa': {
    titulo: 'Mapa',
    icon: '🗺️',
    resumo: 'Onde cada carro está agora, quem está com ele e por onde andou.',
    oQueMostra:
      'Os carros ATIVOS da frota com rastreador, cada um na última posição recebida, com a cor da situação e há quanto tempo ' +
      'foi o último sinal. A lista mostra o técnico (vínculo da Gestão Pós Vendas ou quem pegou o carro hoje), o lugar ("Loja", ' +
      '"Cliente X") e a OS do Pós-Vendas em execução com o cliente. Carros muito próximos viram um grupo ("9 carros · Loja"). ' +
      'Camadas opcionais (começam desligadas): visitas do CRM do dia, locais cadastrados, propriedades rurais (CAR) e vias fora do mapa.',
    comoUsar: [
      'Clique num carro (no mapa ou na lista) para ver o trajeto, as paradas e a linha do tempo do dia; a lista de dias fica no painel.',
      'Clique num grupo para ver os carros dele e escolher um.',
      'Propriedades (CAR): ligue e aproxime o mapa; aparecem os contornos das fazendas dos municípios na tela. Roxo = tem cliente vinculado.',
      'Vias fora do mapa: ligue para ver por onde os carros andaram longe das estradas do mapa de fundo (fazenda, carreador). Escolha o período e o carro; clique numa linha para ver quem passou, quando, de onde vinha e para onde ia; "Baixar as rotas (GPX)" leva as linhas para o celular ou o GPS.',
      'A busca encontra um cliente ou local e leva o mapa até ele.',
      'Clique num ponto do mapa (ou num cliente, local ou propriedade) para ver quanto tempo a frota leva da loja até ali e de volta.',
    ],
    termos: [
      { t: 'Seta no carro', d: 'Para onde o carro andando está indo, pelos últimos pontos do rastreador.' },
      { t: '↩ Loja ~14:32', d: 'O carro está andando e se aproximando da loja: hora prevista de chegada. Se ele está refazendo o caminho da ida, conta o km desse caminho e a velocidade que fez nele na ida; senão, a distância com as curvas da estrada e a velocidade dos últimos 20 min ("aproximado"). Parada no meio do caminho atrasa a chegada.' },
      { t: 'Tempo com a loja', d: 'Mediana das viagens reais (desde jan/2026) que saíram da loja e pararam a até 2 km do ponto (ou 5 km), sem as fora da curva: as que levaram mais de 2,5× o normal para a distância e as que ficam fora dos quartis. Sem viagens por perto, é estimado pela distância.' },
      { t: 'Km rodados × projetado', d: 'Rodados = mediana do que os carros andaram de verdade nessas viagens (pontos do rastreador dos últimos 90 dias). Projetado = o caminho mais curto pela estrada, calculado pelo mapa de rotas.' },
      { t: 'Via fora do mapa', d: 'Trecho em que o carro andou a mais de 40 m de qualquer via do OpenStreetMap (o mapa de fundo), por pelo menos 200 m. Trilhas e carreadores já desenhados no OpenStreetMap não contam. Calculado uma vez por dia, de madrugada: o dia de hoje aparece amanhã.' },
      { t: 'Passagens', d: 'Quantas vezes a mesma via foi usada: cada carro em cada dia conta uma vez (ida e volta no mesmo dia = 1). Mais grossa e mais vermelha = mais usada.' },
      { t: 'Andando', d: 'Motor ligado e acima de 5 km/h.' },
      { t: 'Parado com motor ligado', d: 'Motor ligado e parado (marcha lenta).' },
      { t: 'Desligado', d: 'Motor desligado, com sinal nas últimas 24 h.' },
      { t: 'Sem sinal', d: 'Mais de 1 h sem posição com o motor ligado, ou mais de 24 h desligado.' },
    ],
  },
  '/frota/ranking': {
    titulo: 'Ranking de uso',
    icon: '🏆',
    resumo: 'Quem mais rodou e mais ficou com o motor ligado, no período que você escolher.',
    oQueMostra:
      'Soma, por veículo ou por motorista, os km rodados, o tempo de motor ligado (em movimento e em marcha lenta) e os dias ' +
      'em que o carro foi usado. Os dados vêm do rastreador e cada dia é fechado de madrugada, então o último dia é ontem. ' +
      'Motorista = quem estava com o carro naquele dia; dia sem motorista registrado entra em "Sem motorista".',
    comoUsar: [
      'Escolha o período (ontem, semana, mês, ano ou Período… com as datas).',
      'Por veículo ou Por motorista; a métrica escolhida define a ordem (ou clique no título da coluna).',
      'Por dia / Por semana / Por mês mostra a métrica escolhida em cada coluna, mais forte onde é maior; passe o mouse para ver tudo.',
      'CSV baixa o que está na tela para abrir no Excel.',
    ],
    termos: [
      { t: 'Ligado', d: 'Tempo com a ignição ligada, andando ou parado.' },
      { t: 'Marcha lenta', d: 'Ligado e parado: combustível gasto sem sair do lugar. Acima de 25% do tempo ligado fica em laranja.' },
      { t: 'Dias', d: 'Dias em que o carro rodou ou ligou o motor.' },
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
  '/frota/preventivas': {
    titulo: 'Preventivas',
    icon: '🗓️',
    resumo: 'O que vence por km, horas de motor ou data em cada carro.',
    oQueMostra:
      'Cada carro segue o plano do modelo dele, com os intervalos do manual do fabricante (cadastrados em Planos por modelo). ' +
      'Para cada item a tela mostra a situação e o que falta. Quando um item fica perto de vencer, abre sozinho uma pendência ' +
      '"Preventiva: …" no carro, que fecha quando o serviço é registrado.',
    comoUsar: [
      'Clique num item para ver o intervalo do manual, a última vez e a próxima, e para registrar que foi feito (data e km).',
      'Numa revisão, marque os outros itens feitos junto — todos reiniciam a contagem de uma vez.',
      'Item "Sem histórico": informe a última vez que foi feito (mesmo que tenha sido antes do portal).',
    ],
    termos: [
      { t: 'Vence o que chegar primeiro', d: 'Se o manual diz 10.000 km ou 6 meses, vale o que acontecer antes.' },
      { t: 'Vence em breve', d: 'Dentro do aviso do item (padrão: 1.000 km, 25 horas ou 30 dias antes).' },
      { t: 'Marcos fixos', d: 'O manual fala em 10.000, 20.000, 30.000 km: fazer antes não empurra o próximo marco.' },
      { t: '?', d: 'O km do carro está velho ou estimado — peça uma foto do painel (Registrar km).' },
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
