// Guias passo-a-passo de solicitação de garantia, por montadora.
// Conteúdo FIXO NO CÓDIGO (decisão do usuário) — aparece no botão "?" dos
// cards da aba Montadoras e no link "Como funciona?" do drawer.
// Match por nome normalizado (lower/trim/sem acento) — adicionar novas
// montadoras é acrescentar uma entrada em GUIAS.

export interface PassoGuia {
  titulo: string;
  descricao: string;
  dica?: string;
}

export interface GuiaMontadora {
  slug: string;
  titulo: string;
  resumo: string;
  documentos: string[];
  passos: PassoGuia[];
  observacoes?: string[];
}

export function normalizarNomeMontadora(nome?: string | null): string {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

const GUIAS: Record<string, GuiaMontadora> = {
  ipacol: {
    slug: 'ipacol',
    titulo: 'Ipacol',
    resumo:
      'A Ipacol trabalha em DUAS ETAPAS: primeiro a fábrica analisa e aprova as PEÇAS; ' +
      'o serviço é executado pelo técnico e só depois solicitamos o RESSARCIMENTO das horas ' +
      'e do deslocamento. A solicitação vai por E-MAIL, com o relato modelado pelo Tratorilson ' +
      'e os documentos anexados.',
    documentos: [
      'Fotos da OS (falha, peças, chassi, horímetro)',
      'Nota fiscal de venda do equipamento (busca automática pelo chassi)',
      'Relatório de Assistência Técnica — RAT (gerado no portal, digital ou impresso)',
      'Relato técnico formatado pelo Tratorilson (reclamação, diagnóstico e ação)',
    ],
    passos: [
      {
        titulo: 'Assuma a análise',
        descricao: 'Abra a garantia e clique em "Assumir análise". Confira as peças, horas e km sincronizados da OS.',
      },
      {
        titulo: 'Revise o relato do Tratorilson',
        descricao:
          'A IA formata reclamação, diagnóstico e ação a partir do relato do técnico. Revise e edite os textos — eles entram no corpo do e-mail e no RAT.',
        dica: 'Se o texto vier estranho, clique em "Regerar" ou edite direto nas caixas.',
      },
      {
        titulo: 'Preencha e gere o RAT',
        descricao:
          'O formulário do Relatório de Assistência Técnica vem pré-preenchido com os dados da OS. Gere o PDF preenchido — ou imprima a versão em branco pra preencher à mão e anexe o escaneado.',
      },
      {
        titulo: 'Anexe a NF de venda',
        descricao: 'Use o botão "Buscar NF pelo chassi". Se a busca não encontrar, anexe o PDF manualmente.',
        dica: 'A NF de venda comprova a data de início da garantia do equipamento.',
      },
      {
        titulo: 'Envie a garantia à fábrica',
        descricao: 'Com montadora e checklist completos, clique em "Enviar à fábrica" — o card vai pra "Em análise da fábrica" e libera o disparo do e-mail.',
      },
      {
        titulo: 'Dispare o e-mail de solicitação',
        descricao:
          'Revise o assunto e o corpo no preview, selecione as fotos e envie. O número da garantia fica no assunto pra rastrearmos a resposta. Vídeos vão como link.',
      },
      {
        titulo: 'Registre o retorno das peças (1ª etapa)',
        descricao:
          'Quando a fábrica responder, marque as peças aprovadas e o valor pago — a garantia fica "Aguardando serviço". Se recusar tudo, ela finaliza e a cobrança ao cliente é liberada.',
      },
      {
        titulo: 'Solicite o ressarcimento (2ª etapa)',
        descricao:
          'Com o serviço executado, as horas/km atualizam da OS. Confira e clique em "Solicitar ressarcimento". Com o retorno da fábrica, finalize a garantia.',
      },
    ],
    observacoes: [
      'As respostas da fábrica chegam sozinhas na seção "Conversa com a fábrica" do card (o portal lê a caixa de e-mail às 07:30 e às 12:00).',
    ],
  },

  mahindra: {
    slug: 'mahindra',
    titulo: 'Mahindra',
    resumo:
      'A Mahindra usa a planilha SG oficial, gerada automaticamente pelo portal — as fotos ' +
      'da OS já vão dentro do arquivo. Peças, horas e km vão juntos numa solicitação só.',
    documentos: [
      'SG (planilha xlsx) gerada pelo portal com os dados e fotos da OS',
      'Relato técnico formatado pelo Tratorilson (entra na própria SG)',
      'Anexos extras quando houver (NF de peças de terceiros, recibos)',
    ],
    passos: [
      {
        titulo: 'Assuma a análise',
        descricao: 'Abra a garantia, assuma e confira peças, horas e km sincronizados da OS.',
      },
      {
        titulo: 'Complete o checklist',
        descricao: 'Preencha os campos obrigatórios do checklist da Mahindra e escolha o Tipo de Garantia (Produto em Garantia, Pré-venda...).',
      },
      {
        titulo: 'Envie à fábrica',
        descricao: 'O portal gera a SG automaticamente (numeração 2026-XXX) com os textos do Tratorilson e as fotos embutidas.',
      },
      {
        titulo: 'Revise a SG',
        descricao: 'Baixe o xlsx, revise no Excel se precisar e anexe a versão revisada — a versão mais recente é a que vai pra fábrica.',
      },
      {
        titulo: 'Envie a SG por e-mail',
        descricao: 'Clique em "Enviar SG por e-mail à fábrica". O número da garantia vai no assunto pra rastrearmos a resposta.',
      },
      {
        titulo: 'Registre o retorno e finalize',
        descricao: 'Anexe o retorno da fábrica, marque o que foi pago (peças, mão de obra, deslocamento) e finalize. O que não for pago pode virar cobrança ao cliente.',
      },
    ],
  },
};

// Fluxo genérico mostrado quando a montadora ainda não tem guia escrito.
export const GUIA_GENERICO: PassoGuia[] = [
  { titulo: 'Assuma a análise', descricao: 'Abra a garantia, assuma e confira peças, horas e km da OS.' },
  { titulo: 'Complete o checklist', descricao: 'Defina a montadora e preencha o checklist configurado pra ela.' },
  { titulo: 'Envie à fábrica', descricao: 'Envie a solicitação conforme o processo da montadora (planilha, e-mail ou manual).' },
  { titulo: 'Registre o retorno e finalize', descricao: 'Anexe o retorno da fábrica, marque o que foi pago e finalize a garantia.' },
];

export function guiaDaMontadora(nome?: string | null): GuiaMontadora | null {
  return GUIAS[normalizarNomeMontadora(nome)] || null;
}
