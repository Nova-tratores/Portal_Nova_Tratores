import { describe, expect, it } from 'vitest';
import { chaveNoTexto, chaveValida, dadosDaChave, extrairDoTextoDanfe, limparLeituraIA } from '../ler-nota';

// chave real de uma nota de entrada (notas_entrada id 57778)
const CHAVE = '35241253425237000695550010000163651900481634';

describe('chave de acesso', () => {
  it('confere o dígito verificador', () => {
    expect(chaveValida(CHAVE)).toBe(true);
    expect(chaveValida(CHAVE.slice(0, 43) + '5')).toBe(false);
    expect(chaveValida('123')).toBe(false);
  });
  it('tira CNPJ, série e número da chave', () => {
    expect(dadosDaChave(CHAVE)).toEqual({ chave: CHAVE, cnpj: '53425237000695', serie: '1', numero: '16365' });
  });
  it('acha a chave no texto mesmo quebrada em grupos', () => {
    const quebrada = CHAVE.match(/.{1,4}/g)!.join(' ');
    expect(chaveNoTexto(`CHAVE DE ACESSO ${quebrada} Consulta`)).toBe(CHAVE);
    expect(chaveNoTexto('nada aqui 123')).toBeNull();
  });
});

describe('texto da DANFE', () => {
  it('chave, valor total e data de emissão', () => {
    const t = `DANFE ... CHAVE DE ACESSO ${CHAVE} ... DATA DA EMISSÃO 31/12/2024 ... VALOR TOTAL DA NOTA 369,00`;
    const d = extrairDoTextoDanfe(t);
    expect(d.numero).toBe('16365');
    expect(d.cnpj).toBe('53425237000695');
    expect(d.valor).toBe(369);
    expect(d.data).toBe('2024-12-31');
  });
});

describe('leitura da IA', () => {
  it('chave inválida é ignorada; CNPJ e número limpos', () => {
    const d = limparLeituraIA({ chave: '1234', cnpj: '53.425.237/0006-95', numero: '000016365', nome: 'COMERCIAL DE TINTAS', data: '31/12/2024', valor: '369,00' });
    expect(d.chave).toBeNull();
    expect(d.cnpj).toBe('53425237000695');
    expect(d.numero).toBe('16365');
    expect(d.valor).toBe(369);
    expect(d.data).toBe('2024-12-31');
  });
  it('CNPJ e nome da própria empresa (destinatário) são descartados', () => {
    const d = limparLeituraIA({ cnpj: '31.463.139/0001-03', nome: 'NOVA TRATORES MAQUINAS AGRICOLAS LTDA', numero: '000.043.811', valor: 14.9 });
    expect(d.cnpj).toBeNull();
    expect(d.nome).toBeNull();
    expect(d.numero).toBe('43811');
  });
  it('chave válida manda no CNPJ e no número', () => {
    const d = limparLeituraIA({ chave: CHAVE, cnpj: '11111111111111', numero: '9', valor: 10 });
    expect(d.cnpj).toBe('53425237000695');
    expect(d.numero).toBe('16365');
  });
});
