// Fotos de pneu do checklist mensal conferidas por IA — regras puras.
// Cada pneu (4 + estepe) tem duas fotos: a BANDA de rodagem (desgaste) e a
// LATERAL (marca, modelo, medida, DOT). A IA diz se a foto comprova o item;
// o resultado fica em veiculo_checklist_itens.ia_analise e entra no score.

export type TipoFotoPneu = 'banda' | 'lateral';
export type Desgaste = 'novo' | 'meia_vida' | 'perto_limite' | 'no_limite';

export interface AnalisePneu {
  tipo: TipoFotoPneu;
  /** a foto mostra o que o item pede (banda com sulcos / lateral legível) */
  comprova: boolean;
  /** por que não comprova, em linguagem de gente ("só aparece a calota") */
  motivo: string | null;
  desgaste: Desgaste | null;
  marca: string | null;
  modelo: string | null;
  medida: string | null;
  dot: string | null;
}

const POSICOES: Record<string, string> = {
  pneu_de: 'dianteiro esquerdo', pneu_dd: 'dianteiro direito',
  pneu_te: 'traseiro esquerdo', pneu_td: 'traseiro direito', estepe: 'estepe',
};

/** Qual foto de pneu é este item (ou null se não é pneu). */
export function tipoFotoPneu(itemKey: string): TipoFotoPneu | null {
  if (POSICOES[itemKey]) return 'banda';
  const base = itemKey.replace(/_lateral$/, '');
  return itemKey.endsWith('_lateral') && POSICOES[base] ? 'lateral' : null;
}

export const posicaoPneu = (itemKey: string) => POSICOES[itemKey.replace(/_lateral$/, '')] || itemKey;

export const DESGASTE_LABEL: Record<Desgaste, string> = {
  novo: 'novo', meia_vida: 'meia-vida', perto_limite: 'perto do limite', no_limite: 'no limite (careca)',
};

const texto = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s && !/^(null|n\/?a|desconhecid[oa]|ileg[ií]vel|-)$/i.test(s) ? s : null;
};

/** Normaliza o JSON da IA (ela às vezes devolve campos fora do combinado). */
export function normalizarAnalise(bruto: unknown, tipo: TipoFotoPneu): AnalisePneu {
  const o = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  const d = String(o.desgaste ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  const desgaste = (['novo', 'meia_vida', 'perto_limite', 'no_limite'] as const).find((x) => x === d) || null;
  const comprova = o.comprova === true || o.comprova === 'true';
  return {
    tipo,
    comprova,
    motivo: comprova ? null : texto(o.motivo) || (tipo === 'banda' ? 'A foto não mostra os sulcos da banda de rodagem.' : 'A foto não mostra a marca e a medida do pneu legíveis.'),
    desgaste: tipo === 'banda' ? desgaste : null,
    marca: tipo === 'lateral' ? texto(o.marca) : null,
    modelo: tipo === 'lateral' ? texto(o.modelo) : null,
    medida: tipo === 'lateral' ? texto(o.medida) : null,
    dot: tipo === 'lateral' ? (texto(o.dot)?.replace(/\s+/g, ' ').toUpperCase() ?? null) : null,
  };
}

/** Resumo de uma linha para a tela e o PDF. */
export function resumoAnalise(a: AnalisePneu | null | undefined): string {
  if (!a) return '';
  if (!a.comprova) return `IA: não comprova — ${a.motivo}`;
  if (a.tipo === 'banda') return `IA: banda visível${a.desgaste ? ` · ${DESGASTE_LABEL[a.desgaste]}` : ''}`;
  const partes = [a.marca, a.modelo, a.medida, a.dot && `DOT ${a.dot}`].filter(Boolean);
  return `IA: ${partes.length ? partes.join(' · ') : 'lateral visível'}`;
}

interface ItemComAnalise { item_key: string; ia_analise?: AnalisePneu | null }

/** Penalidades e alertas das fotos de pneu, para o score do checklist. */
export function avaliarPneus(itens: ItemComAnalise[]): { penalidade: number; alertas: string[] } {
  const alertas: string[] = [];
  let penalidade = 0;
  const comAnalise = itens.filter((i) => tipoFotoPneu(i.item_key) && i.ia_analise);

  const naoComprovam = comAnalise.filter((i) => !i.ia_analise!.comprova);
  if (naoComprovam.length) {
    penalidade += Math.min(30, naoComprovam.length * 10);
    alertas.push(`${naoComprovam.length} foto(s) de pneu não comprovam o item (${naoComprovam.map((i) => posicaoPneu(i.item_key)).join(', ')})`);
  }

  // o mesmo pneu fotografado várias vezes: DOT igual em posições diferentes
  const porDot = new Map<string, string[]>();
  for (const i of comAnalise) {
    const a = i.ia_analise!;
    if (a.tipo !== 'lateral' || !a.comprova || !a.dot) continue;
    porDot.set(a.dot, [...(porDot.get(a.dot) || []), posicaoPneu(i.item_key)]);
  }
  for (const [dot, pos] of porDot) {
    // DOT curto (só a data, ex. "2323") é comum entre pneus do mesmo lote
    if (pos.length > 1 && dot.replace(/\D/g, '').length > 4) {
      penalidade += 15;
      alertas.push(`Mesmo DOT (${dot}) em ${pos.join(' e ')} — possível foto repetida`);
    }
  }

  for (const i of comAnalise) {
    const a = i.ia_analise!;
    if (a.tipo === 'banda' && (a.desgaste === 'no_limite' || a.desgaste === 'perto_limite')) {
      alertas.push(`Pneu ${posicaoPneu(i.item_key)} ${DESGASTE_LABEL[a.desgaste]} (pela foto)`);
    }
  }
  return { penalidade, alertas };
}
