// =============================================================================
// Backfill portal_permissoes → permissões v2 (Fase 2: NINGUÉM ganha nem perde).
//
// - Um conjunto 'departamento' por categoria de hoje ('Pós Vendas', 'Peças'...)
//   com as chaves que TODOS daquela categoria já têm (interseção).
// - O que sobra de cada pessoa vira override 'extra' com motivo de backfill.
// - Toda chave de alguém vira tela (as desconhecidas entram como 'Legado').
// Os templates de verdade (v1) só entram na Fase 5, com relatório de impacto.
// =============================================================================
import { nivelDaChaveAntiga } from './resolver';
import type { Nivel, TelaDef } from './telas';

export interface LinhaPermissao {
  user_id: string;
  is_admin: boolean | null;
  is_dev: boolean | null;
  categoria: string | null;
  modulos_permitidos: string[] | null;
}

export interface PlanoBackfill {
  telasNovas: TelaDef[];
  departamentos: { nome: string; telas: { tela: string; nivel: Nivel }[]; membros: string[] }[];
  extras: { user_id: string; tela: string; nivel: Nivel }[];
}

export const MOTIVO_BACKFILL = 'Backfill 13/10/2026: permissão individual que já existia em portal_permissoes';
const ID_OK = /^[a-z0-9_-]+(:[a-z0-9_-]+)*$/;

export function planejarBackfill(linhas: LinhaPermissao[], catalogo: TelaDef[]): PlanoBackfill {
  const conhecidas = new Set(catalogo.map((t) => t.id));
  const chavesDe = (l: LinhaPermissao) => [...new Set((l.modulos_permitidos || []).map((k) => k.trim()).filter(Boolean))];

  const telasNovas = new Map<string, TelaDef>();
  for (const l of linhas) {
    for (const k of chavesDe(l)) {
      if (!ID_OK.test(k)) throw new Error(`chave com formato inesperado: "${k}" (user ${l.user_id})`);
      const partes = k.split(':');
      for (let i = 1; i <= partes.length; i++) {
        const id = partes.slice(0, i).join(':');
        if (!conhecidas.has(id) && !telasNovas.has(id)) {
          telasNovas.set(id, { id, nome: `${id} (legado)`, categoria_menu: 'Legado', explicita: false, so_dev: false });
        }
      }
    }
  }

  const porCategoria = new Map<string, LinhaPermissao[]>();
  for (const l of linhas) {
    const c = (l.categoria || '').trim();
    if (!c) continue;
    porCategoria.set(c, [...(porCategoria.get(c) || []), l]);
  }

  const departamentos: PlanoBackfill['departamentos'] = [];
  const doDepartamento = new Map<string, Set<string>>(); // user -> chaves cobertas pelo departamento
  for (const [nome, membros] of [...porCategoria].sort(([a], [b]) => a.localeCompare(b))) {
    const conjuntos = membros.map((m) => new Set(chavesDe(m)));
    const comuns = [...conjuntos[0]].filter((k) => conjuntos.every((s) => s.has(k))).sort();
    departamentos.push({
      nome,
      telas: comuns.map((tela) => ({ tela, nivel: nivelDaChaveAntiga(tela) })),
      membros: membros.map((m) => m.user_id),
    });
    for (const m of membros) doDepartamento.set(m.user_id, new Set(comuns));
  }

  const extras: PlanoBackfill['extras'] = [];
  for (const l of linhas) {
    const cobertas = doDepartamento.get(l.user_id) ?? new Set<string>();
    for (const k of chavesDe(l).sort()) {
      if (!cobertas.has(k)) extras.push({ user_id: l.user_id, tela: k, nivel: nivelDaChaveAntiga(k) });
    }
  }

  return { telasNovas: [...telasNovas.values()], departamentos, extras };
}

// =============================================================================
// ESPELHO (Fase 3a, modo sombra): enquanto o Admin antigo é onde se edita,
// as tabelas v2 acompanham portal_permissoes. Mexe SÓ no que o backfill criou:
// vínculo de departamento sem `criado_por` e overrides 'extra' com
// MOTIVO_BACKFILL. Ajustes feitos à mão na v2 nunca são tocados.
// =============================================================================

export interface DepartamentoV2 { id: string; nome: string; telas: { tela: string; nivel: Nivel }[] }
export interface EstadoEspelho {
  /** ids de departamentos em que o usuário está por backfill (criado_por nulo) */
  conjuntos: string[];
  /** extras de backfill que o usuário já tem */
  extras: { tela: string; nivel: Nivel }[];
}
export interface PlanoEspelho {
  entrar: string[];
  sair: string[];
  incluirExtras: { tela: string; nivel: Nivel }[];
  removerExtras: string[];
  /** chaves com formato inválido, ignoradas (não derrubam a rodada) */
  ignoradas: string[];
}

export function planejarEspelho(linha: LinhaPermissao, departamentos: DepartamentoV2[], estado: EstadoEspelho): PlanoEspelho {
  const todas = [...new Set((linha.modulos_permitidos || []).map((k) => k.trim()).filter(Boolean))];
  const ignoradas = todas.filter((k) => !ID_OK.test(k));
  const chaves = new Set(todas.filter((k) => ID_OK.test(k)));

  // Só entra no departamento da categoria quem já tem TODAS as telas dele —
  // senão o vínculo daria acesso que a pessoa não tem hoje.
  const dep = departamentos.find((d) => d.nome === (linha.categoria || '').trim());
  const membro = !!dep && dep.telas.every((t) => chaves.has(t.tela));
  const desejados = membro ? [dep!.id] : [];
  const cobertas = new Set(membro ? dep!.telas.map((t) => t.tela) : []);

  const extrasDesejados = [...chaves].filter((k) => !cobertas.has(k)).sort()
    .map((tela) => ({ tela, nivel: nivelDaChaveAntiga(tela) }));
  const atual = new Map(estado.extras.map((e) => [e.tela, e.nivel]));
  const desejado = new Map(extrasDesejados.map((e) => [e.tela, e.nivel]));

  return {
    entrar: desejados.filter((id) => !estado.conjuntos.includes(id)),
    sair: estado.conjuntos.filter((id) => !desejados.includes(id)),
    incluirExtras: extrasDesejados.filter((e) => atual.get(e.tela) !== e.nivel),
    removerExtras: estado.extras.filter((e) => !desejado.has(e.tela)).map((e) => e.tela),
    ignoradas,
  };
}

export const planoVazio = (p: PlanoEspelho) =>
  !p.entrar.length && !p.sair.length && !p.incluirExtras.length && !p.removerExtras.length;
