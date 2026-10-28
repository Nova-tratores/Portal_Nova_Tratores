import { describe, it, expect } from 'vitest';
import { extrairAlvos, normalizarValor, proximoPasso, lerEstado, fnv1a, alvosDoCaso, chassisDoTexto, marcarNoEstado, descarregarPendente } from './jornada';

describe('normalizarValor', () => {
  it('tira zeros à esquerda e prefixos de código', () => {
    expect(normalizarValor('os', '0777')).toBe('777');
    expect(normalizarValor('', 'OS-0777')).toBe('777');
  });
  it('chassi casa pelo final de 7', () => {
    expect(normalizarValor('chassi', 'MDI07513V50005756')).toBe('0005756');
    expect(normalizarValor('chassis', 'v5-0005756')).toBe('0005756');
  });
  it('CNPJ com pontuação vira só dígitos', () => {
    expect(normalizarValor('doc', '12.345.678/0001-90')).toBe('12345678000190');
  });
  it('valor curto demais é ignorado', () => {
    expect(normalizarValor('id', '7')).toBe('');
  });
});

describe('extrairAlvos', () => {
  it('pega segmento dinâmico e query da lista; ignora o resto', () => {
    const a = extrairAlvos('/pos/123', '?id=99&aba=x&q=abc');
    expect(a).toContain(fnv1a('123'));
    expect(a).toContain(fnv1a('99'));
    expect(a).not.toContain(fnv1a('X'));
    expect(a.length).toBe(2);
  });
  it('o mesmo caso em telas diferentes dá o mesmo hash', () => {
    const r = extrairAlvos('/revisoes', '?chassi=MDI07513V50005756');
    const q = extrairAlvos('/requisicoes', '?chassis=V50005756');
    expect(r.some((h) => q.includes(h))).toBe(true);
  });
  it('não devolve o valor cru', () => {
    const a = extrairAlvos('/clientes', '?doc=12.345.678/0001-90');
    expect(a.join(',')).not.toContain('12345678');
  });
});

describe('proximoPasso', () => {
  const t0 = 1_000_000;
  it('primeira tela não gera transição', () => {
    const r = proximoPasso(null, '/pos', [], t0);
    expect(r.transicao).toBeNull();
    expect(r.estado?.rota).toBe('/pos');
  });
  it('mesma rota não conta e junta os alvos', () => {
    const e = proximoPasso(null, '/pos/1', ['a'], t0).estado;
    const r = proximoPasso(e, '/pos/2', ['b'], t0 + 5000);
    expect(r.transicao).toBeNull();
    expect(r.estado?.alvos).toEqual(['a', 'b']);
  });
  it('transição com mesmo alvo e tempo na tela anterior', () => {
    const e = proximoPasso(null, '/revisoes', ['h1'], t0).estado;
    const r = proximoPasso(e, '/requisicoes', ['h1', 'h2'], t0 + 42_000);
    expect(r.transicao).toEqual({ de: '/revisoes', para: '/requisicoes', gapS: 42, mesmoAlvo: true, volta: false });
  });
  it('intervalo > 30 min não conta', () => {
    const e = proximoPasso(null, '/pos', [], t0).estado;
    const r = proximoPasso(e, '/ppv', [], t0 + 31 * 60_000);
    expect(r.transicao).toBeNull();
    expect(r.estado?.rota).toBe('/ppv');
  });
  it('detecta ida-e-volta A→B→A', () => {
    let e = proximoPasso(null, '/pos', [], t0).estado;
    e = proximoPasso(e, '/clientes', [], t0 + 20_000).estado;
    const r = proximoPasso(e, '/pos', [], t0 + 60_000);
    expect(r.transicao?.volta).toBe(true);
    const tarde = proximoPasso(proximoPasso(proximoPasso(null, '/pos', [], t0).estado, '/clientes', [], t0 + 20_000).estado, '/pos', [], t0 + 6 * 60_000);
    expect(tarde.transicao?.volta).toBe(false);
  });
  it('rota que não se mede (login, raiz) é ignorada', () => {
    const e = proximoPasso(null, '/pos', [], t0).estado;
    const r = proximoPasso(e, '/login', [], t0 + 1000);
    expect(r.transicao).toBeNull();
    expect(r.estado?.rota).toBe('/pos');
  });
});

describe('caso marcado pela tela', () => {
  const t0 = 1_000_000;
  it('tipo separa OS e PPV com o mesmo número; chassi casa entre URL e tela', () => {
    expect(alvosDoCaso({ os: 'OS-0012' })).not.toEqual(alvosDoCaso({ ppv: '12' }));
    const url = extrairAlvos('/revisoes', '?chassi=MDI07513V50005756');
    const tela = alvosDoCaso({ textoChassi: '6075E 4WD V50005756' });
    expect(url.some((h) => tela.includes(h))).toBe(true);
  });
  it('acha chassi em texto livre e ignora palavras comuns', () => {
    expect(chassisDoTexto('MAHINDRA 6075E MDI07513V50005756')).toEqual(['MDI07513V50005756']);
    expect(chassisDoTexto('TRATOR ARROZEIRO')).toEqual([]);
  });
  it('transição sem caso em comum fica pendente e sai quando o caso casa', () => {
    let e = proximoPasso(null, '/revisoes', [], t0).estado;
    e = marcarNoEstado(e, '/revisoes', alvosDoCaso({ chassi: 'V50005756' })).estado;
    const p = proximoPasso(e, '/pos', [], t0 + 30_000);
    expect(p.enviar).toEqual([]);
    expect(p.estado?.pendente?.para).toBe('/pos');
    const outro = marcarNoEstado(p.estado, '/pos', alvosDoCaso({ os: '55' }));
    expect(outro.enviar).toBeNull();
    const casou = marcarNoEstado(outro.estado, '/pos', alvosDoCaso({ os: '55', textoChassi: '6075E V50005756' }));
    expect(casou.enviar).toEqual({ de: '/revisoes', para: '/pos', gapS: 30, mesmoAlvo: true, volta: false });
    expect(casou.estado?.pendente).toBeNull();
  });
  it('pendente sem caso sai na próxima troca de tela ou ao fechar a aba', () => {
    let e = proximoPasso(null, '/clientes', [], t0).estado;
    e = proximoPasso(e, '/pos', [], t0 + 10_000).estado;
    const r = proximoPasso(e, '/ppv', [], t0 + 20_000);
    expect(r.enviar).toEqual([{ de: '/clientes', para: '/pos', gapS: 10, mesmoAlvo: false, volta: false }]);
    const fechou = descarregarPendente(r.estado);
    expect(fechou.enviar?.de).toBe('/pos');
    expect(descarregarPendente(fechou.estado).enviar).toBeNull();
  });
  it('caso marcado antes de a jornada registrar a tela é aproveitado na entrada', () => {
    let e = proximoPasso(null, '/clientes', [], t0).estado;
    e = marcarNoEstado(e, '/clientes', alvosDoCaso({ doc: '12.345.678/0001-90' })).estado;
    e = marcarNoEstado(e, '/pos', alvosDoCaso({ doc: '12345678000190' })).estado;
    const r = proximoPasso(e, '/pos', [], t0 + 5_000);
    expect(r.enviar).toEqual([{ de: '/clientes', para: '/pos', gapS: 5, mesmoAlvo: true, volta: false }]);
  });
  it('estado salvo com pendente sobrevive ao sessionStorage', () => {
    let e = proximoPasso(null, '/a1', [], t0).estado;
    e = proximoPasso(e, '/b1', [], t0 + 1000).estado;
    expect(lerEstado(JSON.stringify(e))?.pendente?.de).toBe('/a1');
  });
});

describe('lerEstado', () => {
  it('tolera lixo', () => {
    expect(lerEstado('xx')).toBeNull();
    expect(lerEstado(null)).toBeNull();
    expect(lerEstado(JSON.stringify({ rota: '/pos', em: 1 }))?.alvos).toEqual([]);
  });
});
