import { describe, it, expect } from 'vitest';
import {
  caminhoArquivo, nomeArquivo, proximaTentativa, adiarPendente, ehPdf, ehXml, selo,
  ehBloqueioOmie, ehOmieFora, ehNaoConcluida, filtroBusca, percent, MAX_TENTATIVAS, desescaparXml, pareceUrl,
} from './cache-regras';

const base = { id: 1, conta_omie: 'NOVA', tipo: 'entrada' as const, chave_nfe: null, n_cod_nf: 6049268011, numero: '515688', serie: '3', data_emissao: '2026-10-08', parte_nome: 'MABRACO', parte_doc: '44552685000154', valor: 246.73, cancelada: false, pdf_path: null, xml_path: null, tentativas: 0, proxima_tentativa_em: null, ultimo_erro: null };

describe('caminho e nome do arquivo', () => {
  it('conta/tipo/ano/nCodNF.ext', () => {
    expect(caminhoArquivo(base, 'pdf')).toBe('NOVA/entrada/2026/6049268011.pdf');
    expect(caminhoArquivo({ ...base, data_emissao: null }, 'xml')).toBe('NOVA/entrada/sem-ano/6049268011.xml');
    expect(caminhoArquivo({ ...base, conta_omie: 'castro' }, 'pdf')).toBe('CASTRO/entrada/2026/6049268011.pdf');
  });
  it('nome ao baixar', () => {
    expect(nomeArquivo(base, 'pdf')).toBe('NF-515688-NOVA.pdf');
    expect(nomeArquivo({ ...base, tipo: 'saida_servico', numero: '67' }, 'xml')).toBe('NFSe-67-NOVA.xml');
    expect(nomeArquivo({ ...base, numero: null }, 'pdf')).toBe('NF-6049268011-NOVA.pdf');
  });
});

describe('backoff', () => {
  const agora = new Date('2026-10-13T12:00:00Z');
  it('2^tentativas horas com teto de 7 dias', () => {
    expect(proximaTentativa(1, agora).toISOString()).toBe('2026-10-13T14:00:00.000Z');
    expect(proximaTentativa(3, agora).toISOString()).toBe('2026-10-13T20:00:00.000Z');
    expect(proximaTentativa(20, agora).toISOString()).toBe('2026-10-20T12:00:00.000Z');
  });
  it('pendente adia 7 dias', () => {
    expect(adiarPendente(agora).toISOString()).toBe('2026-10-20T12:00:00.000Z');
  });
});

describe('validação de conteúdo', () => {
  it('pdf e xml', () => {
    expect(ehPdf(new TextEncoder().encode('%PDF-1.4 ...'))).toBe(true);
    expect(ehPdf(new TextEncoder().encode('<html>'))).toBe(false);
    expect(ehPdf(null)).toBe(false);
    expect(ehXml('<?xml version="1.0"?><nfeProc>...</nfeProc>')).toBe(true);
    expect(ehXml('erro')).toBe(false);
    expect(ehXml('')).toBe(false);
  });
});

describe('xml da Omie', () => {
  it('ObterNfe: XML com entidades HTML', () => {
    const cru = '&lt;?xml version=&quot;1.0&quot; encoding=&quot;UTF-8&quot;?&gt;&lt;nfeProc versao=&quot;4.00&quot;&gt;&lt;a&gt;x &amp;amp; y&lt;/a&gt;&lt;/nfeProc&gt;';
    expect(desescaparXml(cru)).toBe('<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00"><a>x &amp; y</a></nfeProc>');
  });
  it('XML cru (com BOM) passa; URL e lixo não', () => {
    expect(desescaparXml('﻿<?xml version="1.0"?><nfeProc>........</nfeProc>')).toMatch(/^<\?xml/);
    expect(desescaparXml('https://click.omie.com/xmlnfse-abc')).toBeNull();
    expect(pareceUrl('https://click.omie.com/xmlnfse-abc')).toBe(true);
    expect(pareceUrl('<?xml')).toBe(false);
    expect(desescaparXml('erro')).toBeNull();
  });
});

describe('selo', () => {
  it('classifica pelos arquivos e pela fila', () => {
    expect(selo({ ...base, pdf_path: 'a', xml_path: 'b' })).toBe('completa');
    expect(selo({ ...base, pdf_path: 'a' })).toBe('so_pdf');
    expect(selo({ ...base, xml_path: 'b' })).toBe('so_xml');
    expect(selo(base)).toBe('na_fila');
    expect(selo({ ...base, ultimo_erro: 'NF ainda não concluída na Omie' })).toBe('pendente_omie');
    expect(selo({ ...base, tentativas: MAX_TENTATIVAS })).toBe('sem_documento');
  });
});

describe('erros da Omie', () => {
  it('bloqueio', () => {
    expect(ehBloqueioOmie({ bloqueio: true, message: 'x' })).toBe(true);
    expect(ehBloqueioOmie(new Error('Omie API: ERROR: API bloqueada por consumo indevido. Tente novamente em 300 segundos.'))).toBe(true);
    expect(ehBloqueioOmie(new Error('Omie nao retornou o PDF'))).toBe(false);
  });
  it('omie fora (rede)', () => {
    expect(ehOmieFora(new Error('fetch failed'))).toBe(true);
    expect(ehOmieFora({ message: 'x', cause: { code: 'ECONNRESET' } })).toBe(true);
    expect(ehOmieFora(new Error("Unexpected token '<', \"<html>\" is not valid JSON"))).toBe(true);
    expect(ehOmieFora(new Error('Omie nao retornou o PDF da NFS-e'))).toBe(false);
  });
  it('não concluída', () => {
    expect(ehNaoConcluida({ faultstring: 'ERROR: NF nao cadastrada' })).toBe(true);
    expect(ehNaoConcluida(new Error('qualquer'))).toBe(false);
  });
});

describe('busca livre', () => {
  it('chave, CNPJ, número e nome', () => {
    expect(filtroBusca('35261044552685000154550030005156881813887116')).toBe('chave_nfe.ilike.*35261044552685000154550030005156881813887116*');
    expect(filtroBusca('44552685000154')).toBe('parte_doc.ilike.*44552685000154*,chave_nfe.ilike.*44552685000154*');
    expect(filtroBusca('001114')).toBe('numero.eq.1114,parte_doc.ilike.*001114*');
    expect(filtroBusca('Mabraco, ltda (sp)')).toBe('parte_nome.ilike.*Mabraco  ltda  sp *');
    expect(filtroBusca('  ')).toBeNull();
  });
  it('percent', () => {
    expect(percent(0, 0)).toBe('0%');
    expect(percent(1, 3)).toBe('33%');
  });
});
