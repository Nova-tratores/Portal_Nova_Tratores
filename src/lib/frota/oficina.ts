// Oficina da frota: regras da ORDEM DE SERVIÇO (puro — testado em
// __tests__/oficina.test.ts). Banco em oficina-server.ts; rota /api/frota/oficina.
//
// Etapas (plano da Fase 2, 10/10/2026):
//   aberta → em_oficina → aguardando_peca ⇄ em_oficina → pronta → concluida
//   cancelada a partir de qualquer etapa ativa; "pronta" volta para a oficina
//   se o carro não ficou bom.
// Travas de campo: entrar na oficina pede km com foto; aguardando peça pede a
// peça e a previsão; concluir (= entregar o carro) pede km de saída com foto e
// quem retirou; cancelar pede o motivo.
// O carro conta como PARADO de "em oficina" até "pronta" (quando já pode rodar),
// se a OS imobiliza. Custo do parado = dias × diária (R$ 250, decisão do José).

export type EtapaOS = 'aberta' | 'em_oficina' | 'aguardando_peca' | 'pronta' | 'concluida' | 'cancelada';

export const ETAPAS_ATIVAS: EtapaOS[] = ['aberta', 'em_oficina', 'aguardando_peca', 'pronta'];

export const ETAPA_INFO: Record<EtapaOS, { label: string; cor: string; fundo: string }> = {
  aberta:          { label: 'Aberta',          cor: '#475569', fundo: '#f1f5f9' },
  em_oficina:      { label: 'Em oficina',      cor: '#1d4ed8', fundo: '#dbeafe' },
  aguardando_peca: { label: 'Aguardando peça', cor: '#b45309', fundo: '#fef3c7' },
  pronta:          { label: 'Pronta',          cor: '#15803d', fundo: '#dcfce7' },
  concluida:       { label: 'Concluída',       cor: '#334155', fundo: '#e2e8f0' },
  cancelada:       { label: 'Cancelada',       cor: '#991b1b', fundo: '#fee2e2' },
};

const TRANSICOES: Record<EtapaOS, EtapaOS[]> = {
  aberta:          ['em_oficina', 'cancelada'],
  em_oficina:      ['aguardando_peca', 'pronta', 'cancelada'],
  aguardando_peca: ['em_oficina', 'pronta', 'cancelada'],
  pronta:          ['concluida', 'em_oficina', 'cancelada'],
  concluida:       [],
  cancelada:       [],
};

export const ehEtapa = (x: unknown): x is EtapaOS => typeof x === 'string' && x in ETAPA_INFO;
export const proximasEtapas = (de: EtapaOS): EtapaOS[] => TRANSICOES[de] || [];
export const podeIr = (de: EtapaOS, para: EtapaOS) => proximasEtapas(de).includes(para);
export const ativa = (e: EtapaOS) => ETAPAS_ATIVAS.includes(e);

/** Diária do carro parado (R$). Valor único para todos os veículos. */
export const DIARIA_PARADO = 250;
/** Acima disso o tempo na etapa fica vermelho no kanban. */
export const DIAS_ALERTA_ETAPA = 3;
/** km de saída pode ficar até isso abaixo da entrada (erro de leitura do painel). */
export const TOLERANCIA_KM_SAIDA = 50;

export interface DadosEtapa {
  km?: number | null;
  foto_url?: string | null;
  peca?: string | null;
  previsao_peca?: string | null;   // YYYY-MM-DD
  retirado_por?: string | null;
  motivo?: string | null;
}

export interface OsEstado {
  etapa: EtapaOS;
  km_entrada?: number | null;
  foto_entrada?: string | null;
}

/** Erro que impede a mudança de etapa, ou null se pode. */
export function validarMudanca(os: OsEstado, para: EtapaOS, d: DadosEtapa, hoje: string): string | null {
  if (!podeIr(os.etapa, para)) {
    return `Não dá para ir de "${ETAPA_INFO[os.etapa].label}" para "${ETAPA_INFO[para].label}".`;
  }
  const km = d.km != null && Number.isFinite(Number(d.km)) ? Number(d.km) : null;
  if (para === 'em_oficina' && os.etapa === 'aberta') {
    if (!km || km < 1) return 'Informe o km do painel na entrada da oficina.';
    if (!d.foto_url) return 'Tire a foto do painel na entrada da oficina.';
  }
  if (para === 'aguardando_peca') {
    if (!String(d.peca || '').trim()) return 'Diga qual peça está faltando.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.previsao_peca || ''))) return 'Informe a previsão de chegada da peça.';
    if (String(d.previsao_peca) < hoje) return 'A previsão da peça não pode ser no passado.';
  }
  if (para === 'concluida') {
    if (!km || km < 1) return 'Informe o km do painel na entrega do carro.';
    if (!d.foto_url) return 'Tire a foto do painel na entrega do carro.';
    if (!String(d.retirado_por || '').trim()) return 'Informe quem retirou o carro.';
    if (os.km_entrada && km < os.km_entrada - TOLERANCIA_KM_SAIDA) {
      return `O km de saída (${km.toLocaleString('pt-BR')}) é menor que o da entrada (${os.km_entrada.toLocaleString('pt-BR')}). Confira o painel.`;
    }
  }
  if (para === 'cancelada' && !String(d.motivo || '').trim()) return 'Diga por que a OS foi cancelada.';
  return null;
}

/** Dias inteiros entre dois instantes (mínimo 0). */
export function diasEntre(deIso: string | null | undefined, ateMs: number): number {
  if (!deIso) return 0;
  const ms = ateMs - new Date(deIso).getTime();
  return ms > 0 ? Math.floor(ms / 86_400_000) : 0;
}

export interface OsParado {
  etapa: EtapaOS;
  imobiliza: boolean;
  entrada_em?: string | null;
  pronta_em?: string | null;
}

/** O carro está parado agora por causa desta OS? */
export const paradoAgora = (os: OsParado) =>
  os.imobiliza && (os.etapa === 'em_oficina' || os.etapa === 'aguardando_peca');

/** Dias parados por esta OS: da entrada na oficina até ficar pronta (ou agora).
 *  Conta o dia começado: entrou hoje = 1 dia. */
export function diasParado(os: OsParado, agoraMs: number): number {
  if (!os.imobiliza || !os.entrada_em) return 0;
  const fim = os.pronta_em ? new Date(os.pronta_em).getTime() : agoraMs;
  const ms = fim - new Date(os.entrada_em).getTime();
  if (!(ms > 0)) return 0;
  return Math.ceil(ms / 86_400_000);
}

export const custoParado = (dias: number, diaria = DIARIA_PARADO) => dias * diaria;

/** "1 dia" · "3 dias" */
export const fmtParado = (dias: number) => (dias === 1 ? '1 dia' : `${dias} dias`);

export const numeroOS = (n: number | string | null | undefined) => (n == null ? 'OS-F' : `OS-F ${n}`);

export interface ItemConclusao {
  id: string;
  tipo: 'pendencia' | 'preventiva' | 'avulso';
  pendencia_id?: string | null;
  plano_id?: string | null;
  feito: boolean;
}

/** O que a conclusão faz: item feito resolve a pendência / registra o serviço
 *  da preventiva; item não feito deixa a pendência aberta. */
export function planejarConclusao(itens: ItemConclusao[]) {
  const feitos = itens.filter((i) => i.feito);
  return {
    pendenciasResolver: [...new Set(feitos.map((i) => i.pendencia_id).filter((x): x is string => !!x))],
    planosServico: [...new Set(feitos.map((i) => i.plano_id).filter((x): x is string => !!x))],
    naoFeitos: itens.filter((i) => !i.feito).length,
  };
}

/** Texto curto do estado no cartão do kanban. */
export function resumoEtapa(os: OsParado & { etapa_desde: string; peca?: string | null; previsao_peca?: string | null }, agoraMs: number): string {
  const d = diasEntre(os.etapa_desde, agoraMs);
  const ha = d === 0 ? 'hoje' : d === 1 ? 'há 1 dia' : `há ${d} dias`;
  if (os.etapa === 'aguardando_peca') {
    const prev = os.previsao_peca ? ` · previsão ${os.previsao_peca.slice(8, 10)}/${os.previsao_peca.slice(5, 7)}` : '';
    return `${ha}${os.peca ? ` · ${os.peca}` : ''}${prev}`;
  }
  return ha;
}

/** Peça atrasada: a previsão já passou e ainda está aguardando. */
export const pecaAtrasada = (os: { etapa: EtapaOS; previsao_peca?: string | null }, hoje: string) =>
  os.etapa === 'aguardando_peca' && !!os.previsao_peca && os.previsao_peca < hoje;
