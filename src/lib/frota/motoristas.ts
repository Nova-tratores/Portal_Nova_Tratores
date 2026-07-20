// =============================================================================
// MOTORISTAS — funções puras (server e client), pra régua ser UMA só:
//   - normalizarCpf / mascararCpf: o CPF cru NUNCA vai pro navegador — toda
//     resposta de API leva só a versão mascarada (***.***.***-XX)
//   - situacaoCnh: ok | vencendo (≤30d) | vencida | sem_validade | sem_cnh
//   - pendenciasDoMotorista: o que falta arrumar → pinta o card de VERMELHO
//     (mesmo espírito de pendenciasDoVeiculo)
// =============================================================================

/** Só os dígitos ('' se vazio/nulo). É a chave de cruzamento portal ↔ RH. */
export function normalizarCpf(s: string | null | undefined): string {
  return String(s ?? '').replace(/\D/g, '');
}

/** '***.***.***-XX' (últimos 2 dígitos) — null se não há CPF utilizável. */
export function mascararCpf(s: string | null | undefined): string | null {
  const d = normalizarCpf(s);
  if (d.length !== 11) return null;
  return `***.***.***-${d.slice(-2)}`;
}

export type SituacaoCnh = 'ok' | 'vencendo' | 'vencida' | 'sem_validade' | 'sem_cnh';

/** Situação da habilitação. `validade` em 'YYYY-MM-DD'. */
export function situacaoCnh(
  cnh: string | null | undefined,
  validade: string | null | undefined,
  hoje: Date = new Date(),
  diasAviso = 30,
): SituacaoCnh {
  if (!cnh?.trim()) return 'sem_cnh';
  if (!validade) return 'sem_validade';
  const v = new Date(`${String(validade).slice(0, 10)}T23:59:59`);
  if (isNaN(v.getTime())) return 'sem_validade';
  if (v < hoje) return 'vencida';
  if (v.getTime() - hoje.getTime() <= diasAviso * 86400000) return 'vencendo';
  return 'ok';
}

// ── Montagem da linha mesclada RH × portal (usada pela lista e pelo detalhe) ──
import type { MotoristaRH } from './tipos';
import type { FuncionarioRH } from './rh'; // import type: não puxa nada em runtime

/** Linha crua de frota_motoristas (o que as rotas selecionam). */
export interface LinhaLocalMotorista {
  id: string;
  re_id: number | null;
  nome: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  cargo: string | null;
  cnh: string | null;
  cnh_categoria?: string | null; // só existe após a migração frota-motoristas-rh
  cnh_validade: string | null;
  ativo: boolean;
  gestor: boolean;
  e_motorista: boolean;
  pessoa_id: string | null;
}

export function montarMotoristaRH(
  rh: FuncionarioRH | null,
  local: LinhaLocalMotorista | null,
  responsavelPorVeiculo: boolean,
  hoje: Date = new Date(),
): MotoristaRH {
  const cnh = local?.cnh ?? null;
  const cnhValidade = local?.cnh_validade ?? null;
  const statusRh = rh?.status ?? null;
  const eMotorista = !!local?.e_motorista;
  const ativoPortal = local ? !!local.ativo : true;
  return {
    id: local?.id ?? null,
    rh_id: rh?.id ?? null,
    nome: rh?.nome || local?.nome || '(sem nome)',
    cpf_mascarado: mascararCpf(rh?.cpf ?? local?.cpf),
    origem: rh && local ? 'ambos' : rh ? 'rh' : 'portal',
    empresa: rh?.empresa ?? null,
    cargo: rh?.cargo ?? local?.cargo ?? null,
    departamento: rh?.departamento ?? null,
    status_rh: statusRh,
    data_admissao: rh?.data_admissao ?? null,
    data_demissao: rh?.data_demissao ?? null,
    tipo_contrato: rh?.tipo_contrato ?? null,
    telefone: rh?.telefone ?? local?.telefone ?? null,
    email: rh?.email ?? local?.email ?? null,
    cidade: rh?.cidade ?? null,
    estado: rh?.estado ?? null,
    foto_url: rh?.foto_url ?? null,
    e_motorista: eMotorista,
    gestor: !!local?.gestor,
    ativo_portal: ativoPortal,
    cnh,
    cnh_categoria: local?.cnh_categoria ?? null,
    cnh_validade: cnhValidade,
    situacao_cnh: situacaoCnh(cnh, cnhValidade, hoje),
    pendencias: pendenciasDoMotorista(
      {
        e_motorista: eMotorista,
        status_rh: statusRh,
        ativo_portal: ativoPortal,
        cnh,
        cnh_validade: cnhValidade,
        responsavel_por_veiculo: responsavelPorVeiculo,
      },
      hoje,
    ),
    responsavel_por_veiculo: responsavelPorVeiculo,
  };
}

export interface DadosPendenciaMotorista {
  e_motorista: boolean;
  status_rh: string | null; // ativo|ferias|afastado|inativo|demitido — null = fora do RH
  ativo_portal: boolean;
  cnh: string | null;
  cnh_validade: string | null; // 'YYYY-MM-DD'
  responsavel_por_veiculo: boolean; // tem vínculo ABERTO em frota_responsaveis
}

const DESLIGADO = new Set(['demitido', 'inativo']);

/** O que falta neste motorista (vazio = card normal; 1+ = card vermelho). */
export function pendenciasDoMotorista(
  d: DadosPendenciaMotorista,
  hoje: Date = new Date(),
  diasAviso = 30,
): string[] {
  const fmtBR = (s: string) => {
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
  };

  const desligado =
    (d.status_rh != null && DESLIGADO.has(d.status_rh)) ||
    (d.status_rh == null && !d.ativo_portal);

  // desligado é HISTÓRICO — não cobra CNH de quem já saiu…
  if (desligado) {
    // …exceto se ainda está como responsável por um carro (isso é um problema real)
    return d.responsavel_por_veiculo
      ? ['Desligado, mas ainda consta como responsável por veículo — trocar o responsável']
      : [];
  }

  const p: string[] = [];
  if (d.e_motorista) {
    const sit = situacaoCnh(d.cnh, d.cnh_validade, hoje, diasAviso);
    if (sit === 'sem_cnh') p.push('Motorista sem CNH cadastrada');
    else if (sit === 'sem_validade') p.push('CNH sem validade cadastrada');
    else if (sit === 'vencida') p.push(`CNH vencida em ${fmtBR(d.cnh_validade!)}`);
    else if (sit === 'vencendo') {
      const v = new Date(`${String(d.cnh_validade).slice(0, 10)}T23:59:59`);
      const dias = Math.max(0, Math.ceil((v.getTime() - hoje.getTime()) / 86400000));
      p.push(`CNH vence em ${dias} dia(s) — ${fmtBR(d.cnh_validade!)}`);
    }
  } else if (d.responsavel_por_veiculo) {
    p.push('Responsável por veículo sem a marcação "é motorista" (cadastre a CNH)');
  }
  return p;
}
