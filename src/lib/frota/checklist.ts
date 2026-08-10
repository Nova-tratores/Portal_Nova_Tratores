// Checklist mensal de veículo — itens e score. Espelho do NT Mecânico (mesmas
// tabelas veiculo_checklist / veiculo_checklist_itens). Usado no portal para os
// veículos SEM responsável, que qualquer usuário do Frota pode preencher (mobile).

export interface ChecklistItemDef { key: string; cat: string; titulo: string; desc: string; }

export const CHECKLIST_ITEMS: ChecklistItemDef[] = [
  { key: 'crlv', cat: 'Documentação', titulo: 'CRLV', desc: 'Fotografe o documento CRLV do veículo e verifique a validade' },
  { key: 'lataria_frente', cat: 'Exterior', titulo: 'Frente do veículo', desc: 'Fotografe a frente mostrando para-choque, capô e faróis' },
  { key: 'lataria_traseira', cat: 'Exterior', titulo: 'Traseira do veículo', desc: 'Fotografe a traseira mostrando lanternas e para-choque' },
  { key: 'lataria_esquerda', cat: 'Exterior', titulo: 'Lateral esquerda', desc: 'Fotografe toda a lateral esquerda' },
  { key: 'lataria_direita', cat: 'Exterior', titulo: 'Lateral direita', desc: 'Fotografe toda a lateral direita' },
  { key: 'pneu_de', cat: 'Pneus', titulo: 'Pneu dianteiro esquerdo', desc: 'Fotografe mostrando a banda de rodagem' },
  { key: 'pneu_dd', cat: 'Pneus', titulo: 'Pneu dianteiro direito', desc: 'Fotografe mostrando a banda de rodagem' },
  { key: 'pneu_te', cat: 'Pneus', titulo: 'Pneu traseiro esquerdo', desc: 'Fotografe mostrando a banda de rodagem' },
  { key: 'pneu_td', cat: 'Pneus', titulo: 'Pneu traseiro direito', desc: 'Fotografe mostrando a banda de rodagem' },
  { key: 'estepe', cat: 'Pneus', titulo: 'Estepe', desc: 'Fotografe o estepe e verifique estado e calibragem' },
  { key: 'parabrisa', cat: 'Exterior', titulo: 'Para-brisa e limpador', desc: 'Fotografe de dentro para fora mostrando trincas se houver' },
  { key: 'oleo_motor', cat: 'Motor', titulo: 'Nível de óleo', desc: 'Com motor frio, verifique a vareta e fotografe' },
  { key: 'arrefecimento', cat: 'Motor', titulo: 'Fluido de arrefecimento', desc: 'Fotografe o reservatório mostrando o nível' },
  { key: 'bateria', cat: 'Motor', titulo: 'Bateria', desc: 'Fotografe mostrando terminais e fixação' },
  { key: 'painel', cat: 'Interior', titulo: 'Painel de instrumentos', desc: 'Ligue o veículo e fotografe o painel (luzes de alerta)' },
  { key: 'hodometro', cat: 'Interior', titulo: 'Hodômetro', desc: 'Fotografe mostrando a quilometragem atual' },
  { key: 'limpeza_interna', cat: 'Interior', titulo: 'Limpeza interna', desc: 'Fotografe o interior (bancos, tapetes, porta-objetos)' },
  { key: 'extintor', cat: 'Segurança', titulo: 'Extintor de incêndio', desc: 'Fotografe mostrando a etiqueta de validade' },
  { key: 'triangulo', cat: 'Segurança', titulo: 'Triângulo de segurança', desc: 'Fotografe o triângulo' },
  { key: 'macaco_chave', cat: 'Segurança', titulo: 'Macaco e chave de roda', desc: 'Fotografe o macaco e a chave de roda' },
];

// Anti-fraude: começa em 100 e penaliza (idêntico ao NT Mecânico). < 50 = suspeito.
export function calcularScore(checklist: any, itens: any[]): { score: number; alertas: string[] } {
  let score = 100;
  const alertas: string[] = [];

  if (checklist.duracao_total_seg != null) {
    if (checklist.duracao_total_seg < 480) { score -= 30; alertas.push('Checklist completo em menos de 8 minutos'); }
    else if (checklist.duracao_total_seg < 900) { score -= 15; alertas.push('Checklist completo em menos de 15 minutos'); }
  }

  const comTempo = itens.filter((i) => i.respondido_em && checklist.inicio_em);
  if (comTempo.length > 1) {
    const sorted = [...comTempo].sort((a, b) => new Date(a.respondido_em).getTime() - new Date(b.respondido_em).getTime());
    const duracoes: number[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const prev = i === 0 ? new Date(checklist.inicio_em).getTime() : new Date(sorted[i - 1].respondido_em).getTime();
      const curr = new Date(sorted[i].respondido_em).getTime();
      duracoes.push((curr - prev) / 1000);
    }
    const media = duracoes.reduce((a, b) => a + b, 0) / duracoes.length;
    if (media < 10) { score -= 25; alertas.push(`Tempo médio por item: ${Math.round(media)}s (muito rápido)`); }
    else if (media < 20) { score -= 10; alertas.push(`Tempo médio por item: ${Math.round(media)}s (rápido)`); }

    const rapidos = duracoes.filter((d) => d < 10).length;
    if (rapidos > 3) { score -= 5; alertas.push(`${rapidos} itens respondidos em menos de 10 segundos`); }

    if (duracoes.length >= 5) {
      const avg = duracoes.reduce((a, b) => a + b, 0) / duracoes.length;
      const variance = duracoes.reduce((s, d) => s + (d - avg) ** 2, 0) / duracoes.length;
      const stdDev = Math.sqrt(variance);
      if (stdDev < 3 && avg < 30) { score -= 15; alertas.push('Intervalo entre respostas muito regular (padrão robótico)'); }
    }
  }

  const respostas = itens.filter((i) => i.resposta);
  if (respostas.length >= 15 && respostas.every((i) => i.resposta === 'ok')) {
    score -= 10; alertas.push('Todos os itens marcados como OK (nenhum problema reportado)');
  }
  if (respostas.length >= 15 && !itens.some((i) => i.observacao?.trim())) {
    score -= 5; alertas.push('Nenhuma observação em nenhum item');
  }

  const tamanhos = itens.filter((i) => i.foto_tamanho).map((i) => i.foto_tamanho);
  const tamSet = new Map<number, number>();
  for (const t of tamanhos) { const r = Math.round(t / 1024); tamSet.set(r, (tamSet.get(r) || 0) + 1); }
  const duplicatas = [...tamSet.values()].filter((v) => v > 1).reduce((s, v) => s + v - 1, 0);
  if (duplicatas > 0) { score -= Math.min(30, duplicatas * 15); alertas.push(`${duplicatas} foto(s) com tamanho idêntico (possível reutilização)`); }

  if (checklist.loc_inicio && checklist.loc_fim) {
    const { lat: lat1, lng: lng1 } = checklist.loc_inicio;
    const { lat: lat2, lng: lng2 } = checklist.loc_fim;
    if (lat1 && lat2 && lng1 && lng2) {
      const dist = Math.sqrt((lat2 - lat1) ** 2 + (lng2 - lng1) ** 2) * 111000;
      if (dist < 5) { score -= 10; alertas.push('Posição GPS não mudou durante o checklist'); }
    }
  }

  if (checklist.inicio_em) {
    const hora = new Date(checklist.inicio_em).getHours();
    if (hora < 6 || hora >= 22) { score -= 5; alertas.push('Checklist realizado fora do horário comercial'); }
  }

  return { score: Math.max(0, score), alertas };
}
