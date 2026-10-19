import { describe, expect, it } from 'vitest';
import { chaveCidade, cidadeNorm, dataISO, diasEntre, docNorm } from '../normalizar';
import { horimetroDoTexto, lojaDe, marcasCitadas, modeloDaDescricao, montarBase, tipoDaFamilia, type Fontes } from '../base';
import { PERGUNTAS } from '../regras';
import { calcularROI, parcelaPrice, PADRAO_ROI } from '../roi';
import { dataDoBackfill, montarFila } from '../retorno';
import { linhasParaCulturas, montarMunicipios } from '../municipios';
import type { FonteProposta } from '../tipos';

const HOJE = '2026-10-18';

describe('normalizar', () => {
  it('cidade com UF em vários formatos', () => {
    expect(cidadeNorm('PIRAJU (SP)')).toEqual({ nome: 'piraju', uf: 'SP' });
    expect(cidadeNorm('PIRAJU/SP')).toEqual({ nome: 'piraju', uf: 'SP' });
    expect(cidadeNorm('Carlópolis', 'PR')).toEqual({ nome: 'carlopolis', uf: 'PR' });
    expect(chaveCidade('ITAI')).toBe('itai|SP');
    expect(chaveCidade('')).toBe('');
  });
  it('documento e datas', () => {
    expect(docNorm('09.282.370/0001-33')).toBe('09282370000133');
    expect(docNorm('123')).toBe('');
    expect(dataISO('8/5/2024')).toBe('2024-05-08');
    expect(dataISO('2026-08-21T11:56:39+00:00')).toBe('2026-08-21');
    expect(dataISO('Sem validade')).toBe('');
    expect(diasEntre('2026-10-01', '2026-10-18')).toBe(17);
  });
});

describe('extração de texto', () => {
  it('família, loja, marcas, horímetro e modelo', () => {
    expect(tipoDaFamilia('Trator Novo')).toBe('trator');
    expect(tipoDaFamilia('Roçadeira')).toBe('implemento');
    expect(tipoDaFamilia('Peças')).toBeNull();
    expect(tipoDaFamilia('Ativo Imobilizado')).toBeNull();
    expect(lojaDe('Castro Peças')).toBe('CASTRO');
    expect(lojaDe('NOVA')).toBe('NOVA');
    expect(marcasCitadas('TRATOR MASSEY 275 - CHASSI X')).toEqual(['Massey Ferguson']);
    expect(marcasCitadas('TRATOR 6075 MAHINDRA')).toEqual([]);
    expect(horimetroDoTexto('MODELO: 8000S|HOR: 9.160,3|')).toBe(9160);
    expect(horimetroDoTexto('HORIMETRO 175H')).toBe(175);
    expect(horimetroDoTexto('REVISÃO 900H')).toBeNull();
    expect(modeloDaDescricao('TRATOR NOVO MAHINDRA 6075 - PNEU 18.4X30R1 2022', 'trator')).toBe('6075');
    expect(modeloDaDescricao('VEICULO NOVO MAHINDRA TRATOR JIVO 2025 MBN1', 'trator')).toBe('JIVO 2025');
    expect(modeloDaDescricao('TRATOR VEICULO NOVO 9500S T3 CAB', 'trator')).toBe('9500S');
  });
});

function fontes(p: Partial<Fontes>): Fontes {
  return { cadastro: [], vendas: [], tratores: [], propostas: [], os: [], propriedades: [], visitas: [], vendedores: [], cnpjs: [], ...p };
}
const cad = (cod: number, empresa: string, doc: string, nome: string, cidade = 'PIRAJU (SP)') => ({
  cod_cli: cod, empresa, cnpj_cpf: doc, razao_social: nome, nome_fantasia: null, cidade, estado: 'SP', telefone: null, inativo: 'N',
});

describe('montarBase', () => {
  it('junta NOVA e CASTRO pelo documento e aplica as regras', () => {
    const b = montarBase(fontes({
      cadastro: [cad(1, 'Nova Tratores', '111.111.111-11', 'JOAO SILVA'), cad(9, 'Castro Pecas', '11111111111', 'JOAO SILVA')],
      vendas: [
        { conta_omie: 'NOVA', codigo_cliente: '1', familia: 'Trator Novo', descricao: 'TRATOR NOVO MAHINDRA 6075', data_pedido: '10/01/2020', valor_total: 200000, numero_pedido: '1' },
        { conta_omie: 'CASTRO', codigo_cliente: '9', familia: 'Peças', descricao: 'FILTRO', data_pedido: '10/03/2025', valor_total: 500, numero_pedido: '7' },
      ],
    }), HOJE);
    expect(b).toHaveLength(1);
    const c = b[0];
    expect(c.lojas.sort()).toEqual(['CASTRO', 'NOVA']);
    expect(c.qtdTratores).toBe(1);
    expect(c.anosUltimoTrator).toBe(6);
    expect(c.oportunidades.map((o) => o.regra)).toContain('renovacao');
    expect(c.oportunidades.map((o) => o.regra)).toContain('sem_visita');
    expect(c.oportunidades.map((o) => o.regra)).not.toContain('cruzada'); // trator com mais de 4 anos
    expect(PERGUNTAS.find((p) => p.id === 'trator5')!.filtro(c, HOJE)).toBe(true);
  });

  it('não duplica o trator que está no Omie e no controle de revisões', () => {
    const b = montarBase(fontes({
      cadastro: [cad(1, 'Nova Tratores', '22222222222', 'MARIA DE SOUZA LTDA')],
      vendas: [{ conta_omie: 'NOVA', codigo_cliente: '1', familia: 'Trator Novo', descricao: 'TRATOR NOVO MAHINDRA 6075E BR', data_pedido: '01/12/2024', valor_total: 246000, numero_pedido: '5' }],
      tratores: [
        { Modelo: '6075E', Chassis: 'X', Cliente: 'Maria de Souza Ltda', Cidade: '', Vendedor: 'FERNANDO', Entrega: '15/01/2025' },
        { Modelo: '4530', Chassis: 'Y', Cliente: 'MARIA DE SOUZA LTDA', Cidade: '', Vendedor: 'FERNANDO', Entrega: '28/02/2019' },
      ],
    }), HOJE);
    expect(b[0].qtdTratores).toBe(2);
    expect(b[0].oportunidades.map((o) => o.regra)).toContain('cruzada');
    expect(b[0].vendedor).toBe('FERNANDO');
  });

  it('cliente de peças com trator de outra marca e cliente que sumiu', () => {
    const b = montarBase(fontes({
      cadastro: [cad(1, 'Nova Tratores', '33333333333', 'PEDRO ALVES')],
      vendas: [
        { conta_omie: 'NOVA', codigo_cliente: '1', familia: 'Peças', descricao: 'X', data_pedido: '01/03/2025', valor_total: 2000, numero_pedido: 'a' },
        { conta_omie: 'NOVA', codigo_cliente: '1', familia: 'Peças', descricao: 'X', data_pedido: '01/05/2025', valor_total: 1500, numero_pedido: 'b' },
      ],
      os: [{ cod_cli: 1, empresa: 'Nova Tratores', descricao: 'TRATOR VALTRA BM 125|HORIMETRO 7200H', data_inclusao: '2025-04-01', cancelada: false }],
    }), HOJE);
    const regras = b[0].oportunidades.map((o) => o.regra);
    expect(regras).toEqual(expect.arrayContaining(['outra_marca', 'sumiu', 'renovacao']));
    expect(b[0].maiorHorimetro).toBe(7200);
  });

  it('limpa &amp; do nome e o "()" do telefone', () => {
    const b = montarBase(fontes({ cadastro: [{ ...cad(1, 'Nova Tratores', '55555555555', 'JAPY GOLF &amp; HOTEL'), telefone: '() 11998539913' }] }), HOJE);
    expect(b[0].nome).toBe('JAPY GOLF & HOTEL');
    expect(b[0].telefone).toBe('11998539913');
  });

  it('ignora a própria loja', () => {
    const b = montarBase(fontes({ cadastro: [cad(1, 'Nova Tratores', '44444444000144', 'NOVA TRATORES MAQUINAS')] }), HOJE);
    expect(b).toHaveLength(0);
  });
});

describe('ROI', () => {
  it('parcela Price', () => {
    expect(parcelaPrice(1000, 0, 4)).toBe(250);
    expect(parcelaPrice(100000, 0.1, 5)).toBeCloseTo(26379.75, 1);
    expect(parcelaPrice(1000, 0.1, 0)).toBeNull();
  });
  it('economia, payback e financiamento', () => {
    const r = calcularROI({ ...PADRAO_ROI, financiar: false });
    // 600 ha / 2,5 = 240 h × (12×6,2 + 35) = 26.256 + manutenção 10.500
    expect(r.horasAno).toBe(240);
    expect(r.custoOperacionalAno).toBeCloseTo(36756, 0);
    expect(r.economiaAno).toBeCloseTo(108000 - 36756, 0);
    expect(r.paybackAnos).toBeCloseTo(350000 / (108000 - 36756), 3);
    const f = calcularROI(PADRAO_ROI);
    expect(f.entrada).toBe(70000);
    expect(f.financiado).toBe(280000);
    expect(f.parcela).toBeGreaterThan(280000 / 7);
  });
  it('sem economia não inventa payback', () => {
    const r = calcularROI({ ...PADRAO_ROI, custoAtualHa: 0 });
    expect(r.paybackAnos).toBeNull();
    expect(calcularROI({ ...PADRAO_ROI, rendimentoHaH: 0 }).horasAno).toBeNull();
  });
});

const prop = (p: Partial<FonteProposta>): FonteProposta => ({
  id: 1, Cliente: 'A', cliente_doc_norm: null, Cidade: '', Modelo: '6075', Marca: 'MAHINDRA', status: 'AGUARDANDO RESPOSTA CLIENTE',
  vendedor_nome: 'DOUGRAS', criado_em: '2026-10-10T10:00:00Z', status_desde: '2026-10-10T10:00:00Z', proximo_contato: null,
  previsao_fechamento: null, validade: null, Valor_Total: '100.000,00', em_aberto: true, motivo_perda_id: null, concorrente: null,
  concorrente_valor: null, fechado_em: null, termometro: null, ...p,
});

describe('fila de retorno', () => {
  const sem = { negocios: [], visitas: [], nomePropriedade: () => ({ nome: '', cidade: '' }), nomeVendedor: () => '', hoje: HOJE };
  it('classifica por motivo', () => {
    const f = montarFila({
      ...sem, propostas: [
        prop({ id: 1, proximo_contato: '2026-10-10' }),
        prop({ id: 2, status_desde: '2026-08-01T00:00:00Z' }),
        prop({ id: 3 }),
        prop({ id: 4, em_aberto: false }),
      ],
    });
    expect(f.map((i) => [i.id, i.motivo]).sort()).toEqual([[1, 'contato_vencido'], [2, 'parada'], [3, 'sem_proximo']]);
    expect(f[2].motivo).toBe('sem_proximo'); // o menos urgente fica por último
    expect(f[0].valor).toBe(100000);
  });
  it('marca a idade incerta do backfill', () => {
    const muitas = Array.from({ length: 12 }, (_, i) => prop({ id: i + 1, criado_em: 'X', status_desde: 'X' }));
    expect(dataDoBackfill(muitas)).toBe('X');
  });
  it('retorno de visita vencido só pela última visita', () => {
    const f = montarFila({
      ...sem, propostas: [],
      visitas: [
        { id: 1, vendedor_id: 4, propriedade_id: 10, data_visita: '2026-06-01', data_proximo_contato: '2026-06-10', proximos_passos: '' },
        { id: 2, vendedor_id: 4, propriedade_id: 10, data_visita: '2026-07-01', data_proximo_contato: null, proximos_passos: '' },
        { id: 3, vendedor_id: 4, propriedade_id: 11, data_visita: '2026-07-01', data_proximo_contato: '2026-07-20', proximos_passos: 'mandar preço' },
      ],
    });
    expect(f.map((i) => i.id)).toEqual([3]);
  });
});

describe('municípios', () => {
  it('linhas por cultura e foco', () => {
    expect(linhasParaCulturas([{ nome: 'Soja (em grão)', ha: 1000 }], null)[0]).toMatch(/grãos/);
    expect(linhasParaCulturas([{ nome: 'Cana-de-açúcar', ha: 1000 }], 30000)).toHaveLength(2);
    const ms = montarMunicipios({
      municipios: [{ ibge: 1, nome: 'A', uf: 'SP', daLoja: true }, { ibge: 2, nome: 'B', uf: 'SP', daLoja: true }],
      publicos: new Map([[1, { culturas: [{ nome: 'Soja', ha: 10000 }], valorProducaoMil: 1, bovinos: 0, ano: '2025' }],
        [2, { culturas: [{ nome: 'Soja', ha: 1000 }], valorProducaoMil: 1, bovinos: 0, ano: '2025' }]]),
      agro: new Map([[1, { imoveis: 100, areaUtilHa: 1, credito12m: 0, credito36m: 0, invest36m: 0, imoveisComCredito: 0 }]]),
      clientes: [],
      ibgeDaCidade: () => null,
    });
    expect(ms[0].ibge).toBe(1);
    expect(ms[0].penetracao).toBe(0);
  });
});

describe('equipe', () => {
  it('casa o nome do vendedor entre as fontes', async () => {
    const { mesmoVendedor } = await import('../equipe');
    expect(mesmoVendedor('DOUGRAS BOMFIM', 'DOUGRAS MOGRS DE JESUS BOMFIM')).toBe(true);
    expect(mesmoVendedor('Joaquim Fernando Leme', 'JOAQUIM FERNANDO LEME')).toBe(true);
    expect(mesmoVendedor('PAULO', 'Paulo Magalhães de Carvalho')).toBe(true);
    expect(mesmoVendedor('Danilo Correa', 'Técnico: Danilo de Souza')).toBe(false);
    expect(mesmoVendedor('FERNANDO', 'Luiz Fernando Sanches')).toBe(false);
  });
  it('dias úteis ignoram fim de semana', async () => {
    const { diasUteisEntre } = await import('../equipe');
    expect(diasUteisEntre('2026-10-16', '2026-10-19')).toBe(1); // sexta → segunda
  });
  it('placar e alertas', async () => {
    const { montarEquipe } = await import('../equipe');
    const vis = (id: number, data: string, extra = {}) => ({
      id, vendedor_id: 4, propriedade_id: id, tipo: 'presencial', data_visita: data, latitude: -23, retroativa: false,
      acionar_pos_vendas: false, pos_vendas_resolvido: false, data_proximo_contato: null, resumo: '', proximos_passos: '',
      cliente_nome: 'X', propriedade_nome: 'X', ...extra,
    });
    const [l] = montarEquipe({
      vendedores: [{ id: 4, nome: 'PEDRO FAVARO' }, { id: 15, nome: 'HENRI (TESTE)' }],
      visitas: [vis(1, '2026-10-15'), vis(2, '2026-10-01', { latitude: null }), vis(3, '2026-09-01', { data_proximo_contato: '2026-09-20' })],
      negocios: [{ id: 1, vendedor_id: 4, status: 'andamento', valor: 100, updated_at: '2026-10-01' }],
      propostas: [prop({ vendedor_nome: 'Pedro Favaro', status_desde: '2026-08-01T00:00:00Z' })],
      pedidos: [{ vendedor: 'Pedro Favaro', data_emissao: '10/05/2026', valor_total: 250000, categoria: 'Venda de Tratores', cancelada: 'NAO', etapa: 'FATURADO', cliente: 'A' }],
      clientes: [], hoje: HOJE,
    });
    expect(l.nome).toBe('PEDRO FAVARO');
    expect(l.visitas30).toBe(2);
    expect(l.semGps30).toBe(1);
    expect(l.retornosVencidos).toBe(1);
    expect(l.propostasParadas).toBe(1);
    expect(l.vendasMaquina12m).toBe(250000);
    expect(l.situacao).toBe('atencao');
  });
});

describe('painel dos vendedores', () => {
  it('períodos e navegação', async () => {
    const { periodo, andar } = await import('../painel-vendedores');
    expect(periodo('semana', '2026-10-18')).toMatchObject({ de: '2026-10-12', ate: '2026-10-18' });
    expect(periodo('mes', '2026-02-10')).toMatchObject({ de: '2026-02-01', ate: '2026-02-28', rotulo: 'fev/2026' });
    expect(periodo('trimestre', '2026-11-03')).toMatchObject({ de: '2026-10-01', ate: '2026-12-31' });
    expect(andar('mes', '2026-01-31', -1)).toBe('2025-12-01');
    expect(andar('semana', '2026-10-18', 1)).toBe('2026-10-19');
  });
  it('eventos, soma e conversão', async () => {
    const { montarEventos, somar, conversao, variacao } = await import('../painel-vendedores');
    const ev = montarEventos({
      vendedores: [{ id: 5, nome: 'DOUGRAS BOMFIM' }],
      visitas: [],
      propostas: [prop({ vendedor_nome: 'Dougras Bomfim', em_aberto: false, status: 'Concluida-Vendido', fechado_em: '2026-10-05', criado_em: '2026-09-20T00:00:00Z' })],
      pedidos: [
        { vendedor: 'DOUGRAS MOGRS DE JESUS BOMFIM', data_emissao: '06/10/2026', valor_total: 300000, categoria: 'Venda de Tratores', cancelada: 'NAO', etapa: 'FATURADO', cliente: 'A' },
        { vendedor: '(Cód: 0)', data_emissao: '06/10/2026', valor_total: 500, categoria: '10. @Revenda de Peças Balcão', cancelada: 'NAO', etapa: 'FATURADO', cliente: 'B' },
        { vendedor: 'DOUGRAS BOMFIM', data_emissao: '06/10/2026', valor_total: 9, categoria: 'Venda de Tratores', cancelada: 'SIM', etapa: 'FATURADO', cliente: 'C' },
      ],
      desde: '2026-01-01',
    });
    const out = somar(ev, '2026-10-01', '2026-10-31', 5);
    expect(out).toMatchObject({ ganhas: 1, maquinas: 1, valorMaquinas: 300000, propostas: 0 });
    expect(somar(ev, '2026-10-01', '2026-10-31', null).valorPecas).toBe(500);
    expect(conversao(out)).toBe(1);
    expect(variacao(10, 0)).toBeNull();
  });
});

describe('comparação justa', () => {
  it('período em andamento compara até o mesmo dia', async () => {
    const { anteriorComparavel } = await import('../painel-vendedores');
    expect(anteriorComparavel('mes', '2026-10-18', '2026-10-18')).toEqual({ de: '2026-09-01', ate: '2026-09-18', mesmoDia: true });
    expect(anteriorComparavel('mes', '2026-09-10', '2026-10-18')).toEqual({ de: '2026-08-01', ate: '2026-08-31', mesmoDia: false });
    expect(anteriorComparavel('mes', '2026-03-31', '2026-03-31').ate).toBe('2026-02-28');
  });
});

describe('plano safra', () => {
  it('extrai só as condições e o hash é estável', async () => {
    const { extrairCondicoes, hashTexto } = await import('../plano-safra');
    const html = '<nav>Menu Home</nav><p>Taxa de juros prefixada de até 11,5% ao ano</p><script>x()</script><p>Prazo máximo de 7 anos, com carência de até 14 meses</p><p>Fale conosco</p>';
    const t = extrairCondicoes(html);
    expect(t).toContain('11,5% ao ano');
    expect(t).toContain('carência');
    expect(t).not.toContain('Menu');
    expect(hashTexto(t)).toBe(hashTexto(extrairCondicoes(html.replace('<p>', '<p>  '))));
  });
  it('valida o que a IA devolve e descarta o implausível', async () => {
    const { validarLinhas } = await import('../plano-safra');
    const v = validarLinhas({ linhas: [
      { nome: 'Moderfrota até R$ 45 mi', taxa_aa: '11,5', prazo_anos: 7, carencia_meses: 14 },
      { nome: 'Inventada', taxa_aa: 95 },
      { nome: '', taxa_aa: 5 },
      { nome: 'Faixa', taxa_aa: 12.5, taxa_aa_max: 11.5 },
    ] });
    expect(v).toHaveLength(2);
    expect(v[0].taxa_aa).toBe(11.5);
    expect(v[1]).toMatchObject({ taxa_aa: 11.5, taxa_aa_max: 12.5 });
  });
  it('safra corrente vai de julho a junho', async () => {
    const { safraAtual } = await import('../plano-safra');
    expect(safraAtual('2026-10-19')).toBe('2026/27');
    expect(safraAtual('2027-03-01')).toBe('2026/27');
    expect(safraAtual('2027-07-01')).toBe('2027/28');
  });
});

describe('plano safra — repetição', () => {
  it('não repete a mesma linha', async () => {
    const { validarLinhas } = await import('../plano-safra');
    expect(validarLinhas([{ nome: 'Pronaf', taxa_aa: 5, prazo_anos: 7 }, { nome: 'Pronaf', taxa_aa: 5, prazo_anos: 7 }])).toHaveLength(1);
  });
});
