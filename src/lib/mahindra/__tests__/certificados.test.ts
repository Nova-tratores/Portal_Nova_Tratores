import { describe, expect, it } from 'vitest';
import { chassiLimpo, dataBRparaISO, lerCertificado, lerListaCertificados } from '../certificados';

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
