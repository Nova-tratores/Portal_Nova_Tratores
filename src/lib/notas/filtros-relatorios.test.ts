import { describe, expect, it } from 'vitest';
import { colunaBanco } from './cache-regras';
import {
  categoriaDe, rotuloCategoria, categoriasDaAba, lerFiltrosColuna, escreverFiltrosColuna, contarFiltrosColuna, opsFiltrosColuna,
  numeroBR, somar, montarRelatorio, relatorioCsv, FILTROS_VAZIOS, type LinhaRel,
} from './filtros-relatorios';

const L = (o: Partial<LinhaRel>): LinhaRel => ({
  tipo: 'saida_produto', categoria: null, valor: 100, cancelada: false, conta_omie: 'NOVA', numero: '1', serie: '1',
  data_emissao: '2026-10-05', parte_nome: 'CLIENTE A', parte_doc: '46223699000150', pedido_num: null, os_num: null, maquina: null, chave_nfe: null, ...o,
});

describe('tipo da nota', () => {
  it('usa a categoria gravada; sem ela, NFS-e e Entrada pelo tipo e NF-e fica genérica', () => {
    expect(categoriaDe({ tipo: 'saida_produto', categoria: 'nfe_maquinas' })).toBe('nfe_maquinas');
    expect(categoriaDe({ tipo: 'saida_servico', categoria: null })).toBe('nfs');
    expect(categoriaDe({ tipo: 'entrada' })).toBe('entrada');
    expect(categoriaDe({ tipo: 'saida_produto', categoria: 'lixo' })).toBeNull();
    expect(rotuloCategoria({ tipo: 'saida_produto', categoria: null })).toBe('NF-e');
    expect(rotuloCategoria({ tipo: 'saida_produto', categoria: 'nfe_mista' })).toBe('NF-e Peças e Máquinas');
  });
  it('categorias da aba', () => {
    expect(categoriasDaAba('entrada', true)).toEqual(['entrada']);
    expect(categoriasDaAba('saida', true)).not.toContain('entrada');
    expect(categoriasDaAba('todas', false)).not.toContain('entrada');
  });
  it('ordenar por Tipo usa a categoria (e o tipo cru sem a migration)', () => {
    expect(colunaBanco({ coluna: 'tipo', dir: 'asc' })).toBe('categoria');
    expect(colunaBanco({ coluna: 'tipo', dir: 'asc' }, { semCategoria: true })).toBe('tipo');
  });
});

describe('filtros do cabeçalho', () => {
  it('lê e escreve a URL (ida e volta)', () => {
    const f = lerFiltrosColuna(new URLSearchParams('f_cat=nfe_pecas,lixo,nfs&f_parte=46.223.699&f_vmin=1.000,50&situacao=incompleta'));
    expect(f.cat).toEqual(['nfe_pecas', 'nfs']);
    expect(f.vmin).toBe(1000.5);
    expect(f.situacao).toBe('incompleta');
    expect(contarFiltrosColuna(f)).toBe(4);
    const p = escreverFiltrosColuna(f, new URLSearchParams());
    expect(lerFiltrosColuna(p)).toEqual(f);
    expect(contarFiltrosColuna(FILTROS_VAZIOS)).toBe(0);
  });
  it('número BR', () => {
    expect(numeroBR('1.234,56')).toBe(1234.56);
    expect(numeroBR('R$ 1.000')).toBe(1000);
    expect(numeroBR('1234.5')).toBe(1234.5);
    expect(numeroBR('')).toBeNull();
    expect(numeroBR('abc')).toBeNull();
  });
  it('vira operações do PostgREST', () => {
    const ops = opsFiltrosColuna({ ...FILTROS_VAZIOS, cat: ['nfe_maquinas'], parte: '46.223.699/0001-50', pedido: 'OS 0777', maquina: 'MBNY.12', vmax: 500 });
    expect(ops).toContainEqual({ op: 'in', col: 'categoria', val: ['nfe_maquinas'] });
    expect(ops).toContainEqual({ op: 'or', val: 'parte_doc.ilike.*46223699000150*' });
    expect(ops).toContainEqual({ op: 'or', val: 'pedido_num.ilike.*777*,os_num.ilike.*777*' });
    expect(ops).toContainEqual({ op: 'or', val: 'maquina.ilike."*MBNY.12*"' });
    expect(ops).toContainEqual({ op: 'lte', col: 'valor', val: 500 });
  });
  it('sem a migration da categoria, filtra pelo tipo cru', () => {
    const ops = opsFiltrosColuna({ ...FILTROS_VAZIOS, cat: ['nfe_pecas', 'nfe_maquinas', 'nfs'] }, { semCategoria: true });
    expect(ops).toEqual([{ op: 'in', col: 'tipo', val: ['saida_produto', 'saida_servico'] }, { op: 'notTrue', col: 'cancelada' }]);
  });
  it('nome do cliente vai para ilike entre aspas', () => {
    const ops = opsFiltrosColuna({ ...FILTROS_VAZIOS, parte: 'Agro, Silva (ME)' });
    expect(ops).toEqual([{ op: 'or', val: 'parte_nome.ilike."*Agro  Silva  ME*"' }, { op: 'notTrue', col: 'cancelada' }]);
  });
  it('canceladas: escondidas por padrão; com canc=1 aparecem e não contam como filtro', () => {
    const f = lerFiltrosColuna(new URLSearchParams('canc=1'));
    expect(f.canceladas).toBe(true);
    expect(contarFiltrosColuna(f)).toBe(0);
    expect(opsFiltrosColuna(f)).toEqual([]);
    expect(escreverFiltrosColuna(f, new URLSearchParams()).toString()).toBe('canc=1');
  });
});

describe('total e relatórios', () => {
  const linhas = [
    L({ categoria: 'nfe_pecas', valor: 100, data_emissao: '2026-09-10', maquina: '6075 MBNYA1234567890XY' }),
    L({ categoria: 'nfe_maquinas', valor: 200000, data_emissao: '2026-10-02', maquina: 'MBNYA1234567890XY', parte_nome: 'CLIENTE B', parte_doc: '11111111111' }),
    L({ tipo: 'saida_servico', categoria: 'nfs', valor: 350.5, data_emissao: '2026-10-20', maquina: '6075 MBNYA1234567890XY' }),
    L({ categoria: 'nfe_pecas', valor: 999, cancelada: true }),
  ];
  it('soma sem as canceladas, separado por tipo', () => {
    const s = somar(linhas);
    expect(s.valor).toBe(200450.5);
    expect(s.canceladas).toBe(1);
    expect(s.valorCanceladas).toBe(999);
    expect(s.porCategoria.map((c) => c.id)).toEqual(['nfs', 'nfe_pecas', 'nfe_maquinas']);
  });
  it('por mês', () => {
    const r = montarRelatorio('mes', linhas);
    expect(r.linhas.map((l) => l.mes)).toEqual(['set/2026', 'out/2026']);
    expect(r.linhas[1].total).toBe(200350.5);
    expect(r.total?.total).toBe(200450.5);
    expect(r.observacao).toMatch(/1 nota/);
  });
  it('por tipo com % e ticket', () => {
    const r = montarRelatorio('tipo', linhas);
    const maq = r.linhas.find((l) => l.tipo === 'NF-e Máquinas')!;
    expect(maq.notas).toBe(1);
    expect(Number(maq.pct)).toBeCloseTo(200000 / 200450.5);
  });
  it('por máquina junta pelo chassi', () => {
    const r = montarRelatorio('maquina', linhas);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({ chassi: 'MBNYA1234567890XY', notas: 3, pecas: 100, nfs: 350.5, venda: 200000, total: 200450.5 });
  });
  it('por cliente ordena pelo valor', () => {
    const r = montarRelatorio('cliente', linhas);
    expect(r.linhas[0].nome).toBe('CLIENTE B');
  });
  it('por empresa e mês', () => {
    const r = montarRelatorio('empresa_mes', [...linhas, L({ conta_omie: 'CASTRO', valor: 50, data_emissao: '2026-10-03' })]);
    expect(r.colunas.map((c) => c.rotulo)).toEqual(['Mês', 'Notas', 'Castro', 'Nova', 'Total']);
  });
  it('CSV com ; e vírgula decimal', () => {
    const csv = relatorioCsv(montarRelatorio('tipo', linhas));
    expect(csv.split('\r\n')[0]).toBe('Tipo;Notas;Valor;% do valor;Ticket médio');
    expect(csv).toContain('NFS-e;1;350,5;');
  });
});
