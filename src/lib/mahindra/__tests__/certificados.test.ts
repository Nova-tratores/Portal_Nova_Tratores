import { describe, expect, it } from 'vitest';
import { anexosDeOutroTrator, chassiLimpo, conferirAnexos, dataBRparaISO, lerCertificado, lerListaCertificados } from '../certificados';

// Trechos do HTML real do portal da Mahindra (27/10/2026), encurtados.
const LISTA = `<table><tr id="x_DXDataRow0" class="dxgvDataRow"> <td id="c0" class="dxgv" align="center"> <a href='https://dealerportal.mahindrabrasil.com.br/en-us/Main/ctl/CERTEDIT/mid/383/ItemId/3536' target="_blank">LUCIANO ALVES DE CAMPOS BICUDO</a> </td><td class="dxgv" align="center">Aprovado</td><td class="dxgv" align="center" style="white-space:nowrap;">NOVA TRATORES - Piraju</td><td class="dxgv" align="center" style="white-space:nowrap;">MDI09520PT0006593.</td><td class="dxgv" align="center">20/10/2026 14:46</td><td class="dxgv" align="center" style="white-space:nowrap;">7095</td><td class="dxgv">2026</td><td class="dxgv">Out</td> </tr>
<tr id="x_DXDataRow1" class="dxgvDataRow"> <td class="dxgv"> <a href='https://dealerportal.mahindrabrasil.com.br/en-us/Main/ctl/CERTEDIT/mid/383/ItemId/3486' target="_blank">ERICA PAULA BLESSA</a> </td><td class="dxgv">Aprovado</td><td class="dxgv">NOVA TRATORES - Piraju</td><td class="dxgv">MDI07511JT0006821.</td><td class="dxgv">13/10/2026 14:32</td><td class="dxgv">6075BR</td><td class="dxgv">2026</td><td class="dxgv">Out</td> </tr></table>`;

const ent = (suf: string, v: string) => `<input class="dxeEditArea dxeEditAreaSys" name="dnn$ctr383$CertificadoDetail$${suf}" onkeyup="aspxEKeyUp(&#39;x&#39;, event)" value="${v}" id="dnn_ctr383_CertificadoDetail_${suf}_I" type="text" />`;
const CERT = [
  ent('cboStatus', 'Aprovado'), ent('ddModelos', '7095'), ent('ddOpcaoRodagem', '14.9-24R1+18.4-34R1(STD)'),
  ent('txtChassis', 'MDI09520PT0006593.'), ent('txtNrMotor', 'ZRA6SFH1713'), ent('txtNrBomba', '82247'), ent('txtNF', '56589'),
  ent('txtNrHoras', '1'), ent('txtNome', 'LUCIANO ALVES DE CAMPOS BICUDO'),
  `<input name="dnn$ctr383$CertificadoDetail$txtCPF" type="text" value="55.650.747/0001-87" id="dnn_ctr383_CertificadoDetail_txtCPF" class="cpfCnpj" />`,
  ent('txtCidade', 'MANDURI'), ent('ddEntrega', 'SIM'), ent('txtVendedor', 'GABRIEL'), ent('txtDataAquisicao', '20/10/2026'),
  ent('txtNFDealer', '8330'), ent('txtDataNFDealer', '25/09/2026'), ent('ddBanco', '&#192; VISTA'),
  `<tr id="dnn_ctr383_CertificadoDetail_gdDocs_DXDataRow0" class="dxgvDataRow"> <td class="dxgvCommandColumn dxgv" align="center">&nbsp;</td><td class="dxgv" align="left">Certificado de venda assinado</td><td class="dxgv"><a class="dxeHyperlink" href="../../../../../../../Docs/Mahindra/Certificados/87_30_CERT.pdf" target="_blank">~/Docs/Mahindra/Certificados/87_30_CERT.pdf</a></td><td class="dxgv">20/10/2026</td><td class="dxgv">novatratores</td> </tr>`,
].join('\n');

describe('certificados da Mahindra', () => {
  it('lista: id, proprietário, chassi limpo e modelo', () => {
    const l = lerListaCertificados(LISTA);
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ itemId: 3536, proprietario: 'LUCIANO ALVES DE CAMPOS BICUDO', status: 'Aprovado', chassi: 'MDI09520PT0006593', modelo: '7095' });
    expect(l[1].chassi).toBe('MDI07511JT0006821');
  });
  it('certificado: entrega técnica, venda e documentos', () => {
    const c = lerCertificado(CERT, 3536);
    expect(c).toMatchObject({
      chassi: 'MDI09520PT0006593', motor: 'ZRA6SFH1713', bombaInjetora: '82247', horasEntrega: 1, documento: '55.650.747/0001-87',
      entregaTecnica: true, responsavelTecnico: 'GABRIEL', dataEntrega: '2026-10-20', nfConcessionaria: '8330', dataNfConcessionaria: '2026-09-25',
      banco: 'À VISTA', cidade: 'MANDURI',
    });
    expect(c.documentos).toEqual([{ tipo: 'Certificado de venda assinado', url: 'https://dealerportal.mahindrabrasil.com.br/Docs/Mahindra/Certificados/87_30_CERT.pdf', data: '2026-10-20' }]);
  });
  it('datas e chassi', () => {
    expect(dataBRparaISO('20/10/2026 14:46')).toBe('2026-10-20');
    expect(dataBRparaISO('')).toBeNull();
    expect(chassiLimpo('mdi0952 0pt0006593.')).toBe('MDI09520PT0006593');
  });
});

describe('anexos de outro trator no certificado', () => {
  const U = 'https://dealerportal.mahindrabrasil.com.br/Docs/Mahindra/Certificados/';
  const finais = new Set(['3784', '2093', '4356', '5756', '5279', '4352', '6901']);
  it('9500 do Jair (…3784) com a nota e o certificado do Jivo do Paulo César (…2093)', () => {
    const docs = [{ url: `${U}87_20_20260615170157_NF6901PAULOCESARJIVO20252093.pdf` }, { url: `${U}87_30_20260615170141_CERTIFICADODEGARANTIAPAULOCESARJIVO20252093.pdf` }];
    expect(anexosDeOutroTrator('MDI09524KP0003784', docs, finais)).toContain('2093');
  });
  it('anexos do próprio trator: ok (o carimbo de data do portal não conta)', () => {
    expect(anexosDeOutroTrator('MDI09524KP0003784', [{ url: `${U}87_20_20252230131216_NFNOVATRATORES95003784.pdf` }], finais)).toBeNull();
    expect(anexosDeOutroTrator('MDI07510LS0005278', [{ url: `${U}87_20_20255128101140_6075RAFAELLANDUCCI.pdf` }], finais)).toBeNull();
  });
  it('cita o próprio e outro: não acusa (pode ser nº de nota)', () => {
    const docs = [{ url: `${U}87_20_1_NF6901.pdf` }, { url: `${U}87_30_1_CERT95003784.pdf` }];
    expect(anexosDeOutroTrator('MDI09524KP0003784', docs, finais)).toBeNull();
  });
  it('6075 do João (…4352) com o certificado do Rosan (…5279)', () => {
    expect(anexosDeOutroTrator('MDI07510LR0004352', [{ url: `${U}87_30_20251028161039_CERTIFICADODEGARANTIA60755279.pdf` }], finais)).toEqual(['5279']);
  });
});

describe('conferir anexos do certificado', () => {
  const U = 'https://dealerportal.mahindrabrasil.com.br/Docs/Mahindra/Certificados/';
  const finais = new Set(['3784', '2093']);
  const jair = [`${U}87_20_20265503151130_NF6820JAIRDECAMPOS9500S3784.pdf`, `${U}87_10_20265503151123_NF33.4649500S3784.pdf`, `${U}87_30_20265503151112_CERTIFICADODEGARANTIAJAIRDECAMPOSBICUDO9500S3784.pdf`].map((url) => ({ url }));
  const paulo = [`${U}87_20_20260615170157_NF6901PAULOCESARJIVO20252093.pdf`, `${U}87_10_20260615170150_NF50.503JIVO20252093.pdf`, `${U}87_30_20260615170141_CERTIFICADODEGARANTIAPAULOCESARJIVO20252093.pdf`].map((url) => ({ url }));
  it('1002 do Jair depois de 03/11: 3 dele + 3 do Paulo César → os do Jair primeiro e avisa', () => {
    const r = conferirAnexos('MDI09524KP0003784', [...jair, ...paulo], finais);
    expect(r.trocado).toBeNull();
    expect(r.documentos).toEqual(jair.concat(paulo));
    expect(r.alerta).toMatch(/3 anexos que parecem de outro trator \(final 2093\)/);
    // os do Paulo César vindo antes na Mahindra: os do Jair continuam primeiro
    expect(conferirAnexos('MDI09524KP0003784', [...paulo, ...jair], finais).documentos).toEqual(jair.concat(paulo));
  });
  it('só os do Paulo César: trocado', () => {
    expect(conferirAnexos('MDI09524KP0003784', paulo, finais).trocado).toEqual(['2093']);
  });
  it('mais de 3 anexos sem chassi no nome: avisa que pode ter erro', () => {
    const r = conferirAnexos('MDI09524KP0003784', [...jair, { url: `${U}87_20_1_NOTACLIENTE.pdf` }], finais);
    expect(r.alerta).toMatch(/tem 4 anexos/);
    expect(r.documentos).toHaveLength(4);
  });
  it('3 anexos certos: sem aviso', () => {
    expect(conferirAnexos('MDI09524KP0003784', jair, finais).alerta).toBeNull();
  });
});
