// =============================================================================
// IGNIÇÃO — agrega as posições de UM dia em métricas de motor.
//
// O que o usuário pediu: "o carro foi ligado? quantas vezes? quanto tempo
// ficou ligado?". O cálculo que existia (tempo_dirigindo) exigia vel > 0 —
// descartava justamente o motor ligado PARADO. Aqui:
//
//   partidas               transições 0->1 (com debounce: flicker do rastreador
//                          religando em <2min não é partida nova)
//   tempo_ligado_min       motor girando (inclui marcha lenta)  ← "quanto tempo ligado"
//   tempo_movimento_min    ligado E vel > 0 (≈ o tempo_dirigindo antigo)
//   tempo_marcha_lenta_min ligado − movimento = combustível queimando parado.
//                          É a métrica de gestão que não existia em lugar nenhum.
//
// Cuidados deliberados:
//   - gap de sinal > 15min não soma em nada (não dá pra afirmar o estado do motor)
//   - 1º fix do dia já ligado NÃO conta partida (seria inflar: pode ser a
//     continuação da noite) — vira a flag ja_ligado_no_inicio
// =============================================================================

export interface PontoIgnicao {
  dt: string;        // ISO
  ignicao: number;   // 0 | 1
  vel: number;       // km/h
}

export interface MetricasIgnicao {
  partidas: number;
  ja_ligado_no_inicio: boolean;
  primeira_partida: string | null;
  ultimo_desligamento: string | null;
  tempo_ligado_min: number;
  tempo_movimento_min: number;
  tempo_marcha_lenta_min: number;
  tempo_desligado_min: number;
  vel_max: number;
}

const GAP_MAX_MIN = 15;          // gap sem fix: capa a contribuição do intervalo
const DEBOUNCE_PARTIDA_MIN = 2;  // religou em <2min = flicker, não é partida

export function agregarIgnicao(pontosBrutos: PontoIgnicao[]): MetricasIgnicao {
  const vazio: MetricasIgnicao = {
    partidas: 0,
    ja_ligado_no_inicio: false,
    primeira_partida: null,
    ultimo_desligamento: null,
    tempo_ligado_min: 0,
    tempo_movimento_min: 0,
    tempo_marcha_lenta_min: 0,
    tempo_desligado_min: 0,
    vel_max: 0,
  };
  const pontos = (pontosBrutos || [])
    .filter((p) => p && p.dt)
    .sort((a, b) => a.dt.localeCompare(b.dt));
  if (pontos.length === 0) return vazio;

  const m = { ...vazio };
  m.ja_ligado_no_inicio = pontos[0].ignicao === 1;

  let ligadoMs = 0;
  let movimentoMs = 0;
  let desligadoMs = 0;
  let ultimoDesligamentoTs = 0; // p/ debounce da partida

  for (let i = 1; i < pontos.length; i++) {
    const prev = pontos[i - 1];
    const cur = pontos[i];
    const dtMs = Math.min(
      new Date(cur.dt).getTime() - new Date(prev.dt).getTime(),
      GAP_MAX_MIN * 60_000,
    );
    if (dtMs > 0) {
      if (prev.ignicao === 1) {
        ligadoMs += dtMs;
        if ((prev.vel || 0) > 0) movimentoMs += dtMs;
      } else {
        desligadoMs += dtMs;
      }
    }

    if (prev.ignicao === 0 && cur.ignicao === 1) {
      const ts = new Date(cur.dt).getTime();
      const desdeDesligou = ultimoDesligamentoTs ? ts - ultimoDesligamentoTs : Infinity;
      if (desdeDesligou >= DEBOUNCE_PARTIDA_MIN * 60_000) {
        m.partidas++;
        if (!m.primeira_partida) m.primeira_partida = cur.dt;
      }
    }
    if (prev.ignicao === 1 && cur.ignicao === 0) {
      ultimoDesligamentoTs = new Date(cur.dt).getTime();
      m.ultimo_desligamento = cur.dt;
    }

    if ((cur.vel || 0) > m.vel_max) m.vel_max = cur.vel || 0;
  }
  if ((pontos[0].vel || 0) > m.vel_max) m.vel_max = pontos[0].vel || 0;

  m.tempo_ligado_min = Math.round(ligadoMs / 60_000);
  m.tempo_movimento_min = Math.round(movimentoMs / 60_000);
  m.tempo_marcha_lenta_min = Math.max(0, m.tempo_ligado_min - m.tempo_movimento_min);
  m.tempo_desligado_min = Math.round(desligadoMs / 60_000);
  return m;
}
