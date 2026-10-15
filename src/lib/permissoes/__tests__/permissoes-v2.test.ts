import { describe, expect, it } from 'vitest';
import { planejarBackfill, type LinhaPermissao } from '../backfill';
import { antigoTem, efetivas, nivelDaChaveAntiga, type Concessao } from '../resolver';
import { SLUGS_FROTA } from '../frota';
import { SLUGS_MARKETING } from '../marketing';
import { catalogoRotas, catalogoTelas, rotaDoCaminho } from '../telas';

const TELAS = catalogoTelas();
const conc = (chaves: string[]): Concessao[] =>
  chaves.map((tela) => ({ tela, nivel: nivelDaChaveAntiga(tela), origem: 'x' }));
const NINGUEM = { admin: false, dev: false };
const tem = (chaves: string[], tela: string, papel = NINGUEM) => efetivas(TELAS, papel, conc(chaves)).has(tela);

// Única diferença aceita entre v2 e hoje: ter só uma ação de 3 níveis
// ('ajustes:pedidos:encerrar') dá 'ver' na tela do meio ('ajustes:pedidos').
// Hoje o permite() exato nega; a Frota e o Marketing já davam (prefixo).
function divergenciaConhecida(chaves: string[], tela: string): boolean {
  const [m, ...r] = tela.split(':');
  const slug = r.join(':');
  if (!slug) return false;
  if ((m === 'frota' && SLUGS_FROTA.has(slug)) || (m === 'marketing' && SLUGS_MARKETING.has(slug))) return false;
  return !chaves.includes(m) && !chaves.includes(tela) && chaves.some((k) => k.startsWith(tela + ':'));
}

function sorteio(seed: number, n: number): string[] {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const ids = TELAS.map((t) => t.id);
  return [...new Set(Array.from({ length: n }, () => ids[Math.floor(rnd() * ids.length)]))];
}

describe('resolvedor v2 = regra de hoje', () => {
  it('bate com permite/podeTelaFrota/podeTelaMarketing em 400 conjuntos sorteados', () => {
    let comparacoes = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const chaves = sorteio(seed, 1 + (seed % 25));
      const ef = efetivas(TELAS, NINGUEM, conc(chaves));
      for (const t of TELAS) {
        if (divergenciaConhecida(chaves, t.id)) continue;
        expect([seed, t.id, ef.has(t.id)]).toEqual([seed, t.id, antigoTem(chaves, NINGUEM, t.id)]);
        comparacoes++;
      }
    }
    expect(comparacoes).toBeGreaterThan(50_000);
  });

  it('módulo puro não concede ação explícita; a ação marcada concede', () => {
    expect(tem(['pos'], 'pos:criar')).toBe(true);
    expect(tem(['pos'], 'pos:faturar')).toBe(false);
    expect(tem(['pos'], 'pos:modelos_fiscais')).toBe(false);
    expect(tem(['pos:faturar'], 'pos:faturar')).toBe(true);
    expect(tem(['pos:faturar'], 'pos')).toBe(true); // abre a tela do botão
    expect(tem(['pos:faturar'], 'pos:criar')).toBe(false);
  });

  it('tela de um nível só não desce; Frota sobe pelo prefixo', () => {
    expect(tem(['ajustes:pedidos'], 'ajustes:pedidos:encerrar')).toBe(false);
    expect(tem(['frota:abastecimento:upload'], 'frota:abastecimento')).toBe(true);
    expect(tem(['estoque:notas'], 'estoque:notas-xml')).toBe(false);
  });

  it('dev tem tudo; admin comum não tem as fiscais só-Dev; vazio não tem nada', () => {
    const ADMIN = { admin: true, dev: false }, DEV = { admin: true, dev: true };
    expect(tem([], 'pos:faturar', DEV)).toBe(true);
    expect(tem([], 'pos:faturar', ADMIN)).toBe(false);
    expect(tem([], 'pos:cancelar_faturamento', ADMIN)).toBe(false);
    expect(tem(['pos:faturar'], 'pos:faturar', ADMIN)).toBe(true);
    expect(tem([], 'pos:modelos_fiscais', ADMIN)).toBe(true);
    expect(tem([], 'financeiro:editar_cards', ADMIN)).toBe(true);
    expect(tem(['financeiro'], 'financeiro:editar_cards')).toBe(false);
    for (const t of TELAS) {
      for (const papel of [ADMIN, DEV]) {
        for (const chaves of [[], ['pos'], ['pos:faturar'], ['financeiro', 'pos:substituir_omie']]) {
          expect([t.id, papel, chaves, tem(chaves, t.id, papel)]).toEqual([t.id, papel, chaves, antigoTem(chaves, papel, t.id)]);
        }
      }
    }
    expect(efetivas(TELAS, NINGUEM, []).size).toBe(0);
  });

  it('bloqueio vence a concessão e desce para as telas de dentro', () => {
    const ef = efetivas(TELAS, NINGUEM, conc(['estoque']), [{ tela: 'estoque:dashboard', nivel: 'ver' }]);
    expect(ef.has('estoque:dashboard')).toBe(false);
    expect(ef.has('estoque:notas')).toBe(true);
    const capado = efetivas(TELAS, NINGUEM, conc(['pos']), [{ tela: 'pos', nivel: 'editar' }]);
    expect(capado.get('pos:criar')?.nivel).toBe('ver');
  });

  it('documenta a única divergência', () => {
    expect(tem(['ajustes:pedidos:encerrar'], 'ajustes:pedidos')).toBe(true);
    expect(antigoTem(['ajustes:pedidos:encerrar'], NINGUEM, 'ajustes:pedidos')).toBe(false);
  });
});

describe('backfill', () => {
  const linhas: LinhaPermissao[] = [
    { user_id: 'a', is_admin: false, is_dev: false, categoria: 'Peças', modulos_permitidos: ['ppv', 'estoque:dashboard', 'opa'] },
    { user_id: 'b', is_admin: false, is_dev: false, categoria: 'Peças', modulos_permitidos: ['ppv', 'orcamentos'] },
    { user_id: 'c', is_admin: false, is_dev: false, categoria: '', modulos_permitidos: ['painel-mecanicos', 'patrimonio'] },
  ];
  const plano = planejarBackfill(linhas, TELAS);

  it('departamento = o que todos da categoria já têm; o resto vira extra', () => {
    expect(plano.departamentos).toEqual([{ nome: 'Peças', telas: [{ tela: 'ppv', nivel: 'gerir' }], membros: ['a', 'b'] }]);
    expect(plano.extras.filter((e) => e.user_id === 'a').map((e) => e.tela)).toEqual(['estoque:dashboard', 'opa']);
    expect(plano.extras.filter((e) => e.user_id === 'c').map((e) => e.tela)).toEqual(['painel-mecanicos', 'patrimonio']);
  });

  it('chave desconhecida vira tela legado', () => {
    expect(plano.telasNovas.map((t) => t.id)).toEqual(['patrimonio']);
  });

  it('ninguém ganha nem perde: departamento + extras = chaves de hoje', () => {
    for (const l of linhas) {
      const dep = plano.departamentos.find((d) => d.membros.includes(l.user_id));
      const nova = [...(dep?.telas.map((t) => t.tela) ?? []), ...plano.extras.filter((e) => e.user_id === l.user_id).map((e) => e.tela)];
      expect(nova.sort()).toEqual([...(l.modulos_permitidos ?? [])].sort());
    }
  });
});

describe('rotas', () => {
  const rotas = catalogoRotas();
  const ids = new Set(TELAS.map((t) => t.id));
  const r = (p: string) => rotaDoCaminho(p, rotas);

  it('toda rota aponta para tela que existe', () => {
    for (const x of rotas) {
      if (x.tela_id) expect(ids.has(x.tela_id), x.padrao).toBe(true);
      for (const a of x.alternativas ?? []) expect(ids.has(a), `${x.padrao} → ${a}`).toBe(true);
    }
  });

  it('casa pelo prefixo mais longo, como os gates de hoje', () => {
    expect(r('/frota')?.tela_id).toBe('frota:dashboard');
    expect(r('/frota/veiculos/ABC1234')?.tela_id).toBe('frota:dashboard');
    expect(r('/frota/checklist/ABC1234')?.tela_id).toBe('frota:checklists');
    expect(r('/frota/abastecimento/flex')?.tela_id).toBe('frota:abastecimento:flex');
    expect(r('/marketing/2f1c0a1e-1111-4444-8888-000000000000')?.tela_id).toBe('marketing:dashboard');
    expect(r('/estoque/notas')?.tela_id).toBe('estoque:notas');
    expect(r('/estoque')?.tela_id).toBe('estoque');
    expect(r('/pos/modelos-fiscais')?.tela_id).toBe('pos:modelos_fiscais');
    expect(r('/dre-financeiro/fluxo')).toMatchObject({ tela_id: 'dre:fluxo', alternativas: ['financeiro'] });
    expect(r('/clientes/projetos')?.tela_id).toBe('clientes');
    expect(r('/clientes/projeto')?.acesso).toBe('livre');
    expect(r('/financeiro/home-pecas')?.acesso).toBe('livre');
    expect(r('/financeiro')?.tela_id).toBe('financeiro');
    expect(r('/admin')?.acesso).toBe('admin');
    expect(r('/ideias')?.acesso).toBe('dev');
    expect(r('/feedbacks/atendimento/123')?.tela_id).toBe('feedbacks:atendimento');
  });
});
