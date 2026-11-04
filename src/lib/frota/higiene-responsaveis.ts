// Responsável de carro que NÃO pode continuar aberto (José, 22/10/2026):
//  - pessoa DESLIGADA no RH (status demitido/inativo) — caso real: o Nicolas
//    saiu e seguia como responsável do FXM4G90 por um registro antigo da Rota Exata;
//  - carro VENDIDO ou ARQUIVADO (saiu da frota, ninguém responde mais por ele).
// Regras puras; o servidor (higiene-responsaveis-server.ts) lê e grava.
import { normalizarCpf } from './motoristas';
import { mesmaPessoa } from './responsavel';

const DESLIGADO = new Set(['demitido', 'inativo']);

export interface MotoristaLocal { id: string; cpf: string | null; pessoa_id: string | null }
export interface FuncionarioStatus { id: string; cpf: string | null; status: string | null }

/** ids de frota_motoristas cuja pessoa está desligada no RH. Sem RH, ninguém. */
export function motoristasDesligados(locais: MotoristaLocal[], rh: FuncionarioStatus[]): Set<string> {
  const porId = new Map(rh.map((f) => [f.id, f]));
  const porCpf = new Map<string, FuncionarioStatus>();
  for (const f of rh) {
    const c = normalizarCpf(f.cpf);
    if (c.length === 11 && !porCpf.has(c)) porCpf.set(c, f);
  }
  const out = new Set<string>();
  for (const l of locais) {
    const f = (l.pessoa_id && porId.get(l.pessoa_id)) || porCpf.get(normalizarCpf(l.cpf));
    if (f && DESLIGADO.has(String(f.status || '').toLowerCase())) out.add(l.id);
  }
  return out;
}

export function estaDesligado(motoristaId: string | null | undefined, desligados: Set<string>): boolean {
  return !!motoristaId && desligados.has(motoristaId);
}

/**
 * Vínculos de técnico (tecnico_veiculos, por NOME) de quem o RH diz desligado.
 * Casa pelo nome tolerante (mesmaPessoa); se o nome também bate com alguém ATIVO
 * no RH (homônimo), não mexe. Caso real: Paulo Motta e Nicolas no TKY6E68.
 */
export function vinculosDeDesligados(
  linhas: { id: number; tecnico_nome: string }[],
  rh: { nome: string; status: string | null }[],
): number[] {
  const fora = rh.filter((f) => DESLIGADO.has(String(f.status || '').toLowerCase()));
  const ativos = rh.filter((f) => !DESLIGADO.has(String(f.status || '').toLowerCase()));
  return linhas
    .filter((l) => fora.some((f) => mesmaPessoa(l.tecnico_nome, f.nome)) && !ativos.some((f) => mesmaPessoa(l.tecnico_nome, f.nome)))
    .map((l) => l.id);
}

export interface ResponsavelAberto { id: string; veiculo_id: string; motorista_id: string | null; motorista_nome: string | null }
export interface VeiculoSituacao { id: string; status: string | null; ativo: boolean | null }

/** Períodos abertos que devem ser fechados, com o motivo. */
export function planejarHigiene(
  abertos: ResponsavelAberto[],
  veiculos: VeiculoSituacao[],
  desligados: Set<string>,
): { id: string; motivo: string }[] {
  const porVeiculo = new Map(veiculos.map((v) => [v.id, v]));
  const out: { id: string; motivo: string }[] = [];
  for (const r of abertos) {
    const v = porVeiculo.get(r.veiculo_id);
    if (v && (v.status === 'vendido' || v.status === 'arquivado')) out.push({ id: r.id, motivo: `carro ${v.status}` });
    else if (estaDesligado(r.motorista_id, desligados)) out.push({ id: r.id, motivo: 'pessoa desligada no RH' });
  }
  return out;
}

// ── UM CARRO = UMA PESSOA (José, 04/11/2026) ────────────────────────────────
// "Sempre que a gente vincula alguém em um carro, o que estava sai de jogo" e
// "se o Danilo está no outro, ele não pode continuar nesse". A troca de
// responsável só tirava quem ERA o responsável anterior; quem tinha entrado
// pela Janela Mecânicos ficava (TKY6E68 chegou a ter Danilo + Paulo + Nicolas).

export interface AbertoComInicio extends ResponsavelAberto { inicio: string | null }

/** A mesma pessoa: mesmo cadastro de motorista, ou nome que bate. */
export function mesmoResponsavel(
  a: { motorista_id: string | null; motorista_nome: string | null },
  b: { motorista_id: string | null; motorista_nome: string | null },
): boolean {
  if (a.motorista_id && b.motorista_id) return a.motorista_id === b.motorista_id;
  return mesmaPessoa(a.motorista_nome, b.motorista_nome);
}

/** Pessoa aberta em mais de um carro: fica só o período MAIS RECENTE. */
export function responsavelEmOutroCarro(abertos: AbertoComInicio[]): { id: string; motivo: string }[] {
  const out: { id: string; motivo: string }[] = [];
  for (const r of abertos) {
    const maisNovo = abertos.find((o) => o.id !== r.id && o.veiculo_id !== r.veiculo_id && mesmoResponsavel(r, o)
      && String(o.inicio || '') > String(r.inicio || ''));
    if (maisNovo) out.push({ id: r.id, motivo: 'a pessoa passou para outro carro' });
  }
  return out;
}

/**
 * Vínculos de técnico (tecnico_veiculos) num carro que TEM responsável aberto
 * e que não são dele. O nome casa com o responsável OU com o cadastro do
 * motorista dele ("ZECCA" é o José Oliveira, "GABRIEL GOMES" é o Gabriel Moraes).
 * Carro sem responsável não é mexido.
 */
export function tecnicosQueNaoSaoDoResponsavel(
  linhas: { id: number; tecnico_nome: string; placa: string | null }[],
  abertos: ResponsavelAberto[],
  placaDoVeiculo: Map<string, string>, // veiculo_id → placa resolvida
  nomeDoMotorista: Map<string, string>, // frota_motoristas.id → nome
  resolver: (p: string) => string,
): number[] {
  const porPlaca = new Map<string, string[]>();
  for (const r of abertos) {
    const placa = placaDoVeiculo.get(r.veiculo_id);
    if (!placa) continue;
    const nomes = [r.motorista_nome, r.motorista_id ? nomeDoMotorista.get(r.motorista_id) : null].filter(Boolean) as string[];
    porPlaca.set(placa, [...(porPlaca.get(placa) || []), ...nomes]);
  }
  return linhas
    .filter((l) => {
      const nomes = porPlaca.get(resolver(l.placa || ''));
      return !!nomes?.length && !nomes.some((n) => mesmaPessoa(l.tecnico_nome, n));
    })
    .map((l) => l.id);
}
