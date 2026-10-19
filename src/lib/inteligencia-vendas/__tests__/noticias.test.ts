import { describe, expect, it } from 'vitest';
import {
  alertasClima, categoriaPorPalavra, cidadesCitadas, deduplicar, filtrarJanela, focusComparado, limparTexto,
  montarIndicadores, noticiasDosIndicadores, numerosConferem, parseConab, parseRSS, precosConab, SERIES_CONAB,
  tendenciaDe, tendenciaFocus, tirarVeiculoDoTitulo, validarNoticiasIA, type DiaClima, type FontePermitida,
} from '../noticias';

const RSS = `<?xml version="1.0"?><rss><channel><title>Feed</title>
<item><title><![CDATA[Soja sobe em Ourinhos &amp; região]]></title><link>https://g1.globo.com/a.html</link>
<pubDate>Mon, 19 Oct 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Preço da <b>soja</b> &quot;dispara&quot;.</p>]]></description></item>
<item><title>Geada em Avaré - Jornal X</title><link>https://news.google.com/rss/articles/ABC?oc=5</link>
<pubDate>Sun, 18 Oct 2026 08:00:00 GMT</pubDate><description>&lt;a href="x"&gt;Geada&lt;/a&gt;</description><source url="https://x.com">Jornal X</source></item>
<item><title>Sem link</title></item>
</channel></rss>`;

describe('parseRSS e texto', () => {
  it('lê título, link, data, descrição e veículo (CDATA e entidades)', () => {
    const itens = parseRSS(RSS);
    expect(itens).toHaveLength(2);
    expect(itens[0]).toMatchObject({ titulo: 'Soja sobe em Ourinhos & região', link: 'https://g1.globo.com/a.html', descricao: 'Preço da soja "dispara".', fonte: null });
    expect(itens[0].publicadoEm).toBe('2026-10-19T10:00:00.000Z');
    expect(itens[1].fonte).toBe('Jornal X');
    expect(tirarVeiculoDoTitulo(itens[1].titulo, itens[1].fonte)).toBe('Geada em Avaré');
  });
  it('limparTexto tira tags e entidades', () => {
    expect(limparTexto('&lt;p&gt;Olá &amp;amp; até&#8230;&lt;/p&gt;')).toBe('Olá & até…');
  });
  it('janela de horas descarta antigo e sem data', () => {
    const agora = new Date('2026-10-19T12:00:00Z');
    const r = filtrarJanela([
      { publicadoEm: '2026-10-19T10:00:00Z' }, { publicadoEm: '2026-10-16T10:00:00Z' }, { publicadoEm: null },
    ], 48, agora);
    expect(r).toHaveLength(1);
  });
});

describe('deduplicar', () => {
  it('tira link repetido e título parecido, mantém o primeiro', () => {
    const r = deduplicar([
      { titulo: 'Governo anuncia Plano Safra 2026/27 com juros menores', link: 'https://a.com/1?utm=x' },
      { titulo: 'Outra coisa', link: 'https://a.com/1' },
      { titulo: 'Governo anuncia o Plano Safra 2026/27 com juros menores para produtor', link: 'https://b.com/2' },
      { titulo: 'Preço do café cai na semana', link: 'https://c.com/3' },
    ]);
    expect(r.map((x) => x.link)).toEqual(['https://a.com/1?utm=x', 'https://c.com/3']);
  });
});

describe('cidades e categoria', () => {
  const cidades = ['Piraju', 'Fartura', 'Óleo', 'Avaré', 'Itaí'];
  it('acha cidade, evita "fartura" e "óleo" comuns', () => {
    expect(cidadesCitadas('Produtores de Piraju e Avaré colhem com fartura; óleo diesel sobe', cidades)).toEqual(['Piraju', 'Avaré']);
    expect(cidadesCitadas('Feira agro em Fartura (SP) e em Itai', cidades)).toEqual(['Fartura', 'Itaí']);
  });
  it('categoria por palavra-chave', () => {
    expect(categoriaPorPalavra('Pronaf terá mais recursos')).toBe('credito');
    expect(categoriaPorPalavra('Frente fria traz geada')).toBe('clima');
    expect(categoriaPorPalavra('Copom mantém Selic')).toBe('taxas');
    expect(categoriaPorPalavra('Festa do peão movimenta cidade', true)).toBe('regiao');
  });
});

describe('indicadores e tendência', () => {
  it('regra simples para quem vende trator', () => {
    expect(tendenciaDe(1.2, 'alta_ruim', 0.3)).toBe('ruim');   // dólar subiu
    expect(tendenciaDe(-0.8, 'alta_ruim', 0.3)).toBe('boa');   // dólar caiu
    expect(tendenciaDe(3, 'alta_boa', 1)).toBe('boa');         // soja subiu
    expect(tendenciaDe(-2, 'alta_boa', 1)).toBe('ruim');
    expect(tendenciaDe(0.4, 'alta_boa', 1)).toBe('neutra');
    expect(tendenciaDe(null, 'alta_boa', 1)).toBe('neutra');
  });
  it('CONAB: lê o arquivo, escolhe praça recente e converte para saca', () => {
    const txt = [
      'produto;classificao_produto;id_produto;nom_municipio;cod_ibge;uf;regiao;ano;mes;data_inicial_final_semana;semana;dsc_nivel_comercializacao;valor_produto_kg',
      'SOJA     ;EM GRÃOS   ;1;ASSIS-SP   ;1;SP  ;SUDESTE;2025;12;01-12-2025 - 05-12-2025  ;1;PREÇO RECEBIDO P/ PR;2,10',
      'SOJA     ;EM GRÃOS   ;1;ORLÂNDIA-SP;1;SP  ;SUDESTE;2026;10;05-10-2026 - 09-10-2026  ;1;PREÇO RECEBIDO P/ PR;2,00',
      'SOJA     ;EM GRÃOS   ;1;ORLÂNDIA-SP;1;SP  ;SUDESTE;2026;10;12-10-2026 - 16-10-2026  ;2;PREÇO RECEBIDO P/ PR;2,10',
      'MILHO    ;EM GRÃOS   ;1;OURINHOS-SP;1;SP  ;SUDESTE;2026;10;12-10-2026 - 16-10-2026  ;2;ATACADO             ;1,0',
      'MILHO    ;EM GRÃOS   ;1;SORRISO-MT ;1;MT  ;C-O    ;2026;10;12-10-2026 - 16-10-2026  ;2;ATACADO             ;0,9',
    ].join('\n');
    const linhas = parseConab(txt);
    expect(linhas).toHaveLength(4);
    const precos = precosConab(linhas, '2026-10-19');
    const soja = precos.find((p) => p.cfg.id === 'soja')!;
    expect(soja).toMatchObject({ praca: 'ORLÂNDIA', valor: 126, anterior: 120, semana: '2026-10-12' }); // Assis está velha
    const ind = montarIndicadores({ precos, dolar: { valor: 5.1, anterior: 5.0, data: '2026-10-19', fonte_nome: 'BCB', fonte_url: 'https://bcb' } });
    const iSoja = ind.find((i) => i.id === 'preco-soja')!;
    expect(iSoja).toMatchObject({ texto: 'R$ 126,00/sc', variacaoPct: 5, tendencia: 'boa', referencia: 'Orlândia · semana de 12/10' });
    expect(ind.find((i) => i.id === 'dolar')).toMatchObject({ texto: 'R$ 5,10', variacaoPct: 2, tendencia: 'ruim' });
    expect(SERIES_CONAB.length).toBeGreaterThan(4);
  });
  it('Focus compara com ~4 semanas antes', () => {
    const f = focusComparado([
      { Indicador: 'Selic', Data: '2026-10-16', DataReferencia: '2027', Mediana: 12.25 },
      { Indicador: 'Selic', Data: '2026-09-25', DataReferencia: '2027', Mediana: 12.5 },
      { Indicador: 'Selic', Data: '2026-09-18', DataReferencia: '2027', Mediana: 12 },
    ], ['2027']);
    expect(f).toEqual([{ indicador: 'Selic', ano: '2027', mediana: 12.25, anterior: 12, data: '2026-10-16' }]);
    expect(tendenciaFocus(f[0])).toBe('ruim');
    expect(tendenciaFocus({ indicador: 'PIB Agropecuária', ano: '2026', mediana: 3, anterior: 2.5, data: '' })).toBe('boa');
  });
});

describe('alertasClima', () => {
  const dia = (data: string, chuva: number, tmin = 15): DiaClima => ({ data, chuva_mm: chuva, prob: null, tmin, tmax: 28 });
  it('geada, chuva forte e estiagem', () => {
    const a = alertasClima([dia('2026-07-01', 0, 2), dia('2026-07-02', 0), dia('2026-07-03', 1), dia('2026-07-04', 0), dia('2026-07-05', 0), dia('2026-07-06', 0), dia('2026-07-07', 0)]);
    expect(a.map((x) => x.tipo)).toEqual(['geada', 'estiagem']);
    expect(a.every((x) => x.tendencia === 'ruim')).toBe(true);
    const b = alertasClima([dia('2026-11-01', 45), dia('2026-11-02', 5)]);
    expect(b.map((x) => x.tipo)).toEqual(['chuva_forte']);
  });
  it('chuva boa no plantio (out) e nada fora da época', () => {
    const semana = (mes: string) => Array.from({ length: 7 }, (_, i) => dia(`2026-${mes}-0${i + 1}`, 6));
    expect(alertasClima(semana('10')).map((x) => x.tipo)).toEqual(['chuva_boa']);
    expect(alertasClima(semana('05'))).toEqual([]);
  });
  it('vira notícia agrupando as cidades', () => {
    const n = noticiasDosIndicadores([], [], [
      { cidade: 'Piraju', alertas: alertasClima([dia('2026-07-01', 0, 1)]), fonte_url: 'https://om/1' },
      { cidade: 'Avaré', alertas: alertasClima([dia('2026-07-01', 0, 2)]), fonte_url: 'https://om/2' },
    ]);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ categoria: 'clima', tendencia: 'ruim', cidades: ['Piraju', 'Avaré'] });
  });
});

describe('validarNoticiasIA', () => {
  const permitidas: FontePermitida[] = [
    { ref: 'c1', url: 'https://g1.globo.com/a', fonte_nome: 'G1', publicado_em: '2026-10-19T10:00:00Z', texto: 'Soja sobe 3% em Ourinhos — Saca chega a R$ 130', cidades: ['Ourinhos'] },
    { ref: 'c2', url: 'https://canal.com/b', fonte_nome: 'Canal Rural', publicado_em: null, texto: 'Pronaf terá novos recursos' },
  ];
  it('aceita só ref/link da lista e usa o link e o veículo da nossa lista', () => {
    const r = validarNoticiasIA({
      manchete: { titulo: 'Soja em alta anima a região', resumo: 'Preço subiu 3%.' },
      noticias: [
        { ref: 'c1', titulo: 'Soja sobe 3% em Ourinhos', resumo: 'Saca a R$ 130.', impacto: 'Produtor capitalizado.', categoria: 'mercado', tendencia: 'boa', destaque: true, cidades: ['ourinhos', 'Paris'], fonte_url: 'https://inventado.com' },
        { ref: 'c9', titulo: 'Inventada', resumo: '', categoria: 'mercado', tendencia: 'boa' },
        { fonte_url: 'https://canal.com/b', titulo: 'Pronaf ganha reforço', resumo: 'Mais dinheiro.', categoria: 'xyz', tendencia: 'otima' },
        { ref: 'c1', titulo: 'Repetida', resumo: '' },
      ],
    }, permitidas, ['Ourinhos', 'Piraju']);
    expect(r.manchete).toEqual({ titulo: 'Soja em alta anima a região', resumo: 'Preço subiu 3%.' });
    expect(r.noticias).toHaveLength(2);
    expect(r.noticias[0]).toMatchObject({ fonte_url: 'https://g1.globo.com/a', fonte_nome: 'G1', destaque: true, cidades: ['Ourinhos'], tendencia: 'boa' });
    expect(r.noticias[1]).toMatchObject({ fonte_url: 'https://canal.com/b', categoria: 'credito', tendencia: 'neutra' });
  });
  it('número inventado volta ao texto original; título muito longo é cortado', () => {
    const r = validarNoticiasIA({ noticias: [
      { ref: 'c1', titulo: 'Soja sobe 7% em Ourinhos', resumo: 'Saca a R$ 145.', impacto: 'Venda 20 tratores.' },
      { ref: 'c2', titulo: 'Pronaf '.repeat(40), resumo: 'ok', impacto: 'ok' },
    ] }, permitidas);
    expect(r.noticias[0]).toMatchObject({ titulo: 'Soja sobe 3% em Ourinhos', resumo: 'Saca chega a R$ 130', impacto: '' });
    expect(r.noticias[1].titulo.length).toBeLessThanOrEqual(110);
    expect(r.manchete).toBeNull();
  });
  it('números conferem com a fonte (milhar, vírgula, dia e ano liberados)', () => {
    expect(numerosConferem('Dólar a R$ 5,05 em 19 de outubro de 2026', 'cotação 5,05')).toBe(true);
    expect(numerosConferem('Safra de 1.200 sacas', 'colheu 1200 sacas')).toBe(true);
    expect(numerosConferem('alta de 4,5%', 'alta de 4%')).toBe(false);
  });
  it('lixo vira lista vazia', () => {
    expect(validarNoticiasIA(null, permitidas)).toEqual({ manchete: null, noticias: [] });
  });
});
