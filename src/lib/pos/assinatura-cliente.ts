// Assinatura do cliente por OS — parte PURA (sem banco).
export interface ResumoOS {
  osId: string;
  numero: string;          // nº no Omie quando houver, senão o do portal
  cliente: string;
  tipoServico: string;
  servico: string;         // solicitação (texto curto)
  data: string;            // DD/MM/YYYY
  tecnico: string;
  trator: string;          // "6075E CAB"
  chassi: string;
  horimetro: string;
  revisaoHoras: number | null; // OS de revisão → horas (mostra "cheque de revisão")
}

/** Mensagem pro WhatsApp com o link de assinatura. */
export function mensagemAssinatura(r: ResumoOS, link: string): string {
  const nome = (r.cliente || '').split(' ')[0];
  const oque = r.revisaoHoras
    ? `a revisão de ${r.revisaoHoras} horas do seu trator ${r.trator}${r.chassi ? ` (chassi final ${r.chassi.slice(-4)})` : ''} foi concluída. Para registrar na Mahindra, precisamos da sua assinatura no cheque de revisão`
    : `o serviço${r.trator ? ` no seu ${r.trator}` : ''}${r.data ? ` realizado em ${r.data}` : ''} foi concluído. Precisamos da sua assinatura na ordem de serviço nº ${r.numero}`;
  const frase = oque.charAt(0).toUpperCase() + oque.slice(1);
  return `Olá${nome ? `, ${nome}` : ''}! Aqui é da Nova Tratores. ${frase}. É só abrir o link e assinar na tela do celular: ${link}`;
}

/** Resumo curto da solicitação a partir do texto da OS. */
export function resumirSolicitacao(servSolicitado: string | null | undefined, max = 140): string {
  const solic = String(servSolicitado || '');
  const m = solic.match(/Solicita[çc][ãa]o(?: do cliente)?\s*:\s*([^\n]+)/i);
  let s = (m ? m[1] : solic.split('\n').filter((l) => l.trim() && !/^(modelo|chassis?|hor[ií]metro)\s*:/i.test(l))[0] || '').trim();
  if (s.length > max) s = s.slice(0, max - 1) + '…';
  return s;
}
