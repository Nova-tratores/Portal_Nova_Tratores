import { describe, it, expect } from 'vitest';
import {
  PAGINA_TALAO, dadosIniciais, dataBR, extrairHorimetro, modeloDoProjeto, normalizarDados, htmlCheque,
  assinaturaTecnicoPadrao, slugTecnico, mensagemWhatsApp, CONCESSIONARIA_PADRAO,
} from '../cheque';

describe('páginas do talão', () => {
  it('50h=15, 2700h=33 (medidos) e as demais de 2 em 2', () => {
    expect(PAGINA_TALAO[50]).toBe(15);
    expect(PAGINA_TALAO[300]).toBe(17);
    expect(PAGINA_TALAO[900]).toBe(21);
    expect(PAGINA_TALAO[2700]).toBe(33);
    expect(PAGINA_TALAO[3000]).toBe(35);
  });
});

describe('helpers', () => {
  it('dataBR aceita ISO e BR', () => {
    expect(dataBR('2026-06-24')).toBe('24/06/2026');
    expect(dataBR('13/01/2026')).toBe('13/01/2026');
    expect(dataBR('2026-06-24T00:00:00')).toBe('24/06/2026');
    expect(dataBR(null)).toBe('');
  });
  it('extrai horímetro do texto da OS', () => {
    expect(extrairHorimetro('Modelo: 6075\nChassis: X\nHorimetro:120\n')).toBe('120');
    expect(extrairHorimetro('Horímetro: 898.3')).toBe('898.3');
    expect(extrairHorimetro('Horimetro: \n')).toBe('');
  });
  it('modelo a partir do projeto', () => {
    expect(modeloDoProjeto('6075E CAB MDI07513LS0006165', 'MDI07513LS0006165')).toBe('6075E CAB');
  });
  it('slug e assinatura do técnico', () => {
    expect(slugTecnico('GABRIEL MORAES')).toBe('gabriel-moraes');
    expect(slugTecnico('Danilo de Souza')).toBe('danilo-de-souza');
    expect(assinaturaTecnicoPadrao('Gabriel Moraes')).toBe('/assinaturas/tecnicos/gabriel-moraes.png');
    expect(assinaturaTecnicoPadrao('Nicolas Dario')).toBeNull();
    expect(assinaturaTecnicoPadrao('')).toBeNull();
  });
});

describe('dadosIniciais', () => {
  const os = {
    Id_Ordem: 'OS-0494', Os_Cliente: 'PEDRO ALCANTARA RIBEIRO NETO E OUTRO', Cnpj_Cliente: '08.106.975/0001-00', Os_Tecnico: 'GABRIEL MORAES',
    Projeto: '6075E CAB MDI07513LS0006165', Serv_Solicitado: 'Modelo: 6075E\nChassis: CAB MDI07513LS0006165\nHorimetro: \n\nSolicitação do cliente: REV 900H',
    Data: '2026-06-23', Data_Fim_Servico: '2026-06-24', Ordem_Omie: '000000000005069', id_omie: 5069,
  };
  const trator = { Modelo: '6075 E', Numero_Motor: 'NSD7ACE0007', Entrega: '2026-01-13', Cliente: 'MARIA BEATRIZ' };
  it('monta o cheque da OS 5069 do 6165', () => {
    const d = dadosIniciais(os, 'MDI07513LS0006165', trator, '898.3');
    expect(d.os).toBe('5069');
    expect(d.cliente).toBe('PEDRO ALCANTARA RIBEIRO NETO E OUTRO');
    expect(d.doc).toBe('08.106.975/0001-00');
    expect(d.modelo).toBe('6075 E');
    expect(d.monobloco).toBe('NSD7ACE0007');
    expect(d.entrega).toBe('13/01/2026');
    expect(d.dataRevisao).toBe('24/06/2026');
    expect(d.horimetro).toBe('898,3 h');       // horímetro do relatório do técnico (OS sem)
    expect(d.tecnico).toBe('GABRIEL MORAES');
    expect(d.concessionaria).toBe(CONCESSIONARIA_PADRAO);
    expect(d.via).toBe('2ª via Mahindra Brasil');
  });
  it('sem Omie usa o número da OS do portal; sem trator usa o projeto', () => {
    const d = dadosIniciais({ ...os, Ordem_Omie: null, id_omie: null }, 'MDI07513LS0006165', null, null);
    expect(d.os).toBe('0494');
    expect(d.modelo).toBe('6075E CAB');
    expect(d.monobloco).toBe('');
    expect(d.horimetro).toBe('');
  });
  it('normalizarDados preenche o que falta', () => {
    const d = normalizarDados({ cliente: 'X' });
    expect(d.cliente).toBe('X');
    expect(d.concessionaria).toBe(CONCESSIONARIA_PADRAO);
    expect(normalizarDados(null).via).toBe('2ª via Mahindra Brasil');
  });
});

describe('htmlCheque', () => {
  const d = normalizarDados({ cliente: 'Pedro <Alcântara>', chassi: 'MDI07513LS0006165', tecnico: 'Gabriel Moraes', tecnicoCpf: '123' });
  it('gera documento com título, página, dados escapados e assinaturas', () => {
    const h = htmlCheque(d, { horas: 900, assinaturaClienteUrl: 'https://x/ass.png', assinaturaTecnicoUrl: '/assinaturas/tecnicos/gabriel-moraes.png', carimbo: true });
    expect(h).toContain('DAS 900 HORAS');
    expect(h).toContain('<span>21</span>');
    expect(h).toContain('Pedro &lt;Alcântara&gt;');
    expect(h).toContain('https://x/ass.png');
    expect(h).toContain('gabriel-moraes.png');
    expect(h).toContain('CPF 123');
    expect(h).not.toContain('Gabriel Moraes</span>'); // com rubrica, o nome não sai
    expect(h).toContain('NOVA TRATORES MÁQUINAS AGRÍCOLAS LTDA');
    expect(h).toContain('@page { size: A4 portrait; margin: 0; }');
  });
  it('em branco não imprime dados nem assinaturas', () => {
    const h = htmlCheque(d, { horas: 50, emBranco: true, assinaturaClienteUrl: 'https://x/ass.png' });
    expect(h).not.toContain('Pedro');
    expect(h).not.toContain('https://x/ass.png');
    expect(h).toContain('DAS 50 HORAS');
    expect(h).toContain('<span>15</span>');
  });
  it('mensagem do WhatsApp cita nome, horas, modelo, final do chassi e o link', () => {
    const m = mensagemWhatsApp({ ...d, modelo: '6075E CAB' }, 900, 'https://p/cheque/abc/assinar');
    expect(m).toContain('Pedro');
    expect(m).toContain('900 horas');
    expect(m).toContain('6075E CAB');
    expect(m).toContain('6165');
    expect(m).toContain('https://p/cheque/abc/assinar');
  });
});
