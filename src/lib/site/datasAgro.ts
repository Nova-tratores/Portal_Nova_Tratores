// Datas do agro para o calendário de conteúdo (arquivo do José "calendario-agro-marketing-2027.md", 12/11/2026).
// Aparecem nos dias do calendário como sugestão; tocar cria o post já com o tema. Feiras: confirmar 30 dias antes.
// prior: 3 = obrigatória (planejar 2–3 semanas antes), 2 = boa, 1 = opcional (só stories).

export type DataAgro = { d: string; ate?: string; nome: string; prior: 1 | 2 | 3; ideia: string; formato: 'feed' | 'reels' | 'story'; confirmar?: boolean };
export type TemporadaAgro = { mes: string; ate?: string; nome: string; prior: 1 | 2 | 3; ideia: string };

const D = (d: string, nome: string, prior: 1 | 2 | 3, ideia: string, formato: DataAgro['formato'], extra: Partial<DataAgro> = {}): DataAgro => ({ d, nome, prior, ideia, formato, ...extra });

export const DATAS_AGRO: DataAgro[] = [
  // 2026
  D('2026-11-20', 'Consciência Negra (feriado)', 1, 'Aviso de horário de funcionamento', 'story'),
  D('2026-11-27', 'Black Friday', 3, 'Condição especial em peças e kits de revisão, implementos em estoque. Prazo curto e claro ("só até domingo") + botão de WhatsApp', 'reels'),
  D('2026-11-30', 'Dia do Estatuto da Terra', 1, 'Curiosidade histórica', 'story'),
  D('2026-12-05', 'Dia Mundial do Solo', 2, 'Compactação do solo × escolha de pneu e lastro do trator; implementos de preparo de solo', 'feed'),
  D('2026-12-06', 'Dia do Extensionista Rural', 1, 'Homenagem aos técnicos da CATI / Casa da Agricultura da região', 'feed'),
  D('2026-12-20', 'Dia do Mecânico', 3, 'Apresentar os técnicos da oficina pelo nome, um a um (rosto + tempo de casa + especialidade)', 'reels'),
  D('2026-12-25', 'Natal', 2, 'Vídeo da equipe toda + horário de fim de ano', 'reels'),
  // 2027
  D('2027-01-01', 'Ano Novo', 2, 'Retrospectiva: máquinas entregues, clientes atendidos, revisões feitas no ano', 'feed'),
  D('2027-01-11', 'Combate à Poluição por Agrotóxicos', 1, 'Só se tiver gancho (pulverizador, regulagem, EPI)', 'story'),
  D('2027-01-16', 'Dia dos Cortadores de Cana', 1, 'Opcional', 'story'),
  D('2027-01-20', 'Aniversário de Piraju? + São Sebastião', 3, 'Homenagem à cidade com foto ou vídeo local (rio, café, campo). Confirmar a data com a Prefeitura (20/01 ou 25/04)', 'reels', { confirmar: true }),
  D('2027-02-01', 'Show Rural Coopavel', 2, 'Repost dos lançamentos da Mahindra na feira; "o que vem por aí"', 'reels', { ate: '2027-02-05' }),
  D('2027-02-09', 'Carnaval', 1, 'Horário de funcionamento', 'story'),
  D('2027-02-10', 'Dia Mundial do Feijão', 1, 'Opcional', 'story'),
  D('2027-03-08', 'Dia Internacional da Mulher', 3, 'Mulheres do campo da região: produtora, operadora, filha que assumiu a fazenda + mulheres da nossa equipe', 'reels'),
  D('2027-03-15', 'Dia do Consumidor', 2, 'Condição especial / garantia Mahindra (a maior do mercado)', 'feed'),
  D('2027-03-20', 'Dia Mundial da Agricultura', 1, 'Opcional', 'feed'),
  D('2027-03-22', 'Dia Mundial da Água', 2, 'Rio Paranapanema / irrigação; ligar com implementos de irrigação', 'reels'),
  D('2027-03-28', 'Páscoa', 1, 'Card institucional', 'feed'),
  D('2027-04-15', 'Conservação do Solo', 2, 'Carrossel "5 erros que compactam seu solo": plantio direto, lastro e pneu certos', 'feed'),
  D('2027-04-24', 'Dia do Milho / Dia do Churrasco', 2, 'Churrasco com clientes ou equipe: post de bastidor', 'reels'),
  D('2027-04-25', 'Aniversário de Piraju?', 3, 'Confirmar a data com a Prefeitura (20/01 ou 25/04)', 'reels', { confirmar: true }),
  D('2027-04-26', 'Agrishow (Ribeirão Preto)', 3, 'Antes: "vai na Agrishow? fale com a gente". Durante: estande Mahindra / equipe na feira. Depois: resumo dos lançamentos', 'reels', { ate: '2027-04-30' }),
  D('2027-05-01', 'Dia do Trabalho', 2, 'Equipe trabalhando (oficina, entrega técnica, campo)', 'reels'),
  D('2027-05-05', 'Dia do Campo', 2, 'Paisagem e rotina do campo na região', 'reels'),
  D('2027-05-09', 'Dia das Mães', 2, 'Mães produtoras rurais (cliente real) ou mães da equipe', 'feed'),
  D('2027-05-20', 'Dia Mundial das Abelhas', 1, 'Curiosidade: polinização × café', 'story'),
  D('2027-05-24', 'Dia Nacional do Café + do Milho', 3, 'Data forte para Piraju. Trator estreito para café (6075 E / linha 6000 estreita) em cafezal de cliente', 'reels'),
  D('2027-05-25', 'Dia do Trabalhador Rural', 3, 'Homenagem a operadores e tratoristas de clientes: rosto + nome + fazenda', 'reels'),
  D('2027-05-27', 'Corpus Christi', 1, 'Horário de funcionamento', 'story'),
  D('2027-06-01', 'Dia Mundial do Leite', 2, 'Cliente de pecuária leiteira: trator no trato, vagão, ensilagem', 'reels'),
  D('2027-06-05', 'Dia Mundial do Meio Ambiente', 2, 'Economia de diesel / motor eficiente; produtor que preserva mata ciliar', 'feed'),
  D('2027-06-08', 'Dia do Citricultor', 1, 'Só se tiver cliente de citros', 'story'),
  D('2027-06-24', 'São João', 2, 'Festa junina da equipe ou da cidade: bastidor', 'reels'),
  D('2027-06-30', 'Dia do Caminhoneiro', 1, 'Opcional (frete de máquinas)', 'story'),
  D('2027-07-03', 'Dia do Cooperativismo', 1, 'Se tiver parceria com cooperativa da região', 'feed'),
  D('2027-07-09', 'Revolução Constitucionalista (feriado SP)', 1, 'Horário de funcionamento', 'story'),
  D('2027-07-15', 'Dia do Pecuarista', 2, 'Cliente pecuarista: trator + implemento no manejo de pasto', 'reels'),
  D('2027-07-25', 'Dia do Motorista + Agricultura Familiar', 2, 'Foco no motorista/operador e na agricultura familiar (trator compacto)', 'reels'),
  D('2027-07-28', 'Dia do Agricultor', 3, 'A data mais importante do ano: vídeo com vários clientes reais (10–15 s de cada) + condição especial na semana + WhatsApp para a base', 'reels'),
  D('2027-08-08', 'Dia dos Pais', 3, 'Sucessão familiar: pai e filho na mesma fazenda, no mesmo trator', 'reels'),
  D('2027-08-28', 'Dia da Avicultura', 1, 'Opcional', 'story'),
  D('2027-09-07', 'Independência', 1, 'Horário de funcionamento', 'story'),
  D('2027-09-15', 'Dia do Cliente', 3, 'Depoimento de cliente antigo ("comprei há X anos e…") + condição para quem vier na loja', 'reels'),
  D('2027-09-21', 'Dia da Árvore', 1, 'Opcional', 'story'),
  D('2027-09-22', 'Começo do plantio da soja', 2, '"Plantio 2027/28 começou": máquina de cliente', 'reels'),
  D('2027-10-01', 'Dia Internacional do Café', 2, 'Resultado da colheita de um cliente', 'feed'),
  D('2027-10-02', 'Aniversário do Grupo Mahindra', 1, 'Confirmar com a fábrica se querem usar a data', 'feed', { confirmar: true }),
  D('2027-10-04', 'Dia dos Animais', 1, 'Bicho da fazenda do cliente "ajudando" no trator', 'reels'),
  D('2027-10-12', 'Engenheiro Agrônomo + Crianças', 3, 'Agrônomos parceiros da região + "pequeno produtor" (criança no trator, com autorização dos pais)', 'reels'),
  D('2027-10-15', 'Dia da Mulher Rural', 2, 'Repetir o formato do 08/03 com outras clientes', 'feed'),
  D('2027-10-16', 'Dia Mundial da Alimentação', 2, '"Do campo de Piraju para a sua mesa"', 'reels'),
  D('2027-10-27', 'Dia do Engenheiro Agrícola', 1, 'Opcional', 'story'),
  D('2027-11-05', 'Dia do Técnico Agrícola', 2, 'Técnicos de campo da região e da nossa equipe', 'feed'),
  D('2027-11-14', 'Agritechnica (Alemanha)', 1, 'Novidades mundiais da Mahindra (repost)', 'story', { ate: '2027-11-20' }),
  D('2027-11-20', 'Consciência Negra (feriado)', 1, 'Horário de funcionamento', 'story'),
  D('2027-11-26', 'Black Friday', 3, 'Mesma lógica de 2026, com o que deu certo', 'reels'),
  D('2027-12-05', 'Dia Mundial do Solo', 2, 'Carrossel educativo', 'feed'),
  D('2027-12-20', 'Dia do Mecânico', 3, 'Equipe da oficina', 'reels'),
  D('2027-12-25', 'Natal', 2, 'Vídeo da equipe', 'reels'),
];

export const TEMPORADAS_AGRO: TemporadaAgro[] = [
  { mes: '2026-12', nome: 'Pré-safra: revisão antes da colheita', prior: 2, ideia: '"Revise antes de precisar": chamada para agendar revisão' },
  { mes: '2027-02', nome: 'Colheita da soja + plantio do milho safrinha', prior: 2, ideia: 'Máquina do cliente em ação; plantadeira e implementos' },
  { mes: '2027-04', nome: 'Tecnoshow Comigo (data a confirmar)', prior: 1, ideia: 'Repost de lançamentos' },
  { mes: '2027-05', ate: '2027-09', nome: 'Colheita do café', prior: 3, ideia: 'Série "Colheita 2027": 1 cliente por semana' },
  { mes: '2027-06', ate: '2027-08', nome: 'Colheita do milho safrinha', prior: 2, ideia: 'Máquina de cliente em ação' },
  { mes: '2027-08', ate: '2027-09', nome: 'Pré-safra de verão: revisão e preparo de solo', prior: 3, ideia: 'Campanha "Revisão pré-plantio" com prazo e preço fechado' },
  { mes: '2027-10', ate: '2027-12', nome: 'Plantio da soja', prior: 2, ideia: 'Máquina de cliente em ação' },
];

export const COR_PRIOR = { 3: '#dc2626', 2: '#2563eb', 1: '#94a3b8' } as const;
export const NOME_PRIOR = { 3: 'Obrigatória', 2: 'Boa', 1: 'Opcional' } as const;

/** Datas que caem no dia (inclui feiras de vários dias). */
export function datasDoDia(dia: string): DataAgro[] {
  return DATAS_AGRO.filter((x) => x.d === dia || (x.ate && x.d <= dia && dia <= x.ate));
}
export function temporadasDoMes(mes: string): TemporadaAgro[] {
  return TEMPORADAS_AGRO.filter((t) => t.mes === mes || (t.ate && t.mes <= mes && mes <= t.ate));
}
