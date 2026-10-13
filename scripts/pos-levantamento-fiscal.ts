/* eslint-disable @typescript-eslint/no-explicit-any -- script avulso de leitura da Omie */
// Levantamento SÓ DE LEITURA dos impostos usados nas últimas OS faturadas com NFS-e
// (mesma lógica do botão "Levantar na Omie" de /pos/modelos-fiscais), com as
// PREFEITURAS / órgãos públicos separadas. Nada é gravado na Omie nem no banco.
// Uso: npx tsx scripts/pos-levantamento-fiscal.ts [limite=1000]
process.loadEnvFile('.env.local');
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { agruparCombinacoes, dataOmieParaISO, maisRecentes, type OSLevantada, type ClienteInfo } from '../src/lib/pos/levantamento-fiscal';
import { CAMPOS_FISCAIS, mostrarValor, rotuloCampo } from '../src/lib/pos/modelo-fiscal';

const LIMITE = Number(process.argv[2] || 1000);
const KEY = process.env.OMIE_APP_KEY || process.env.OMIE_APP_KEY_NOVA;
const SECRET = process.env.OMIE_APP_SECRET || process.env.OMIE_APP_SECRET_NOVA;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function omie(call: string, param: Record<string, unknown>, t = 0): Promise<any> {
  const r = await fetch('https://app.omie.com.br/api/v1/servicos/os/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ call, app_key: KEY, app_secret: SECRET, param: [param] }),
  });
  const j = await r.json().catch(() => ({}));
  const f = String(j?.faultstring || '');
  if ((r.status === 429 || /redundant|aguarde/i.test(f)) && t < 3) { await espera(20000); return omie(call, param, t + 1); }
  if (f) throw new Error(f);
  return j;
}

// órgão público: nome ou CNPJ de natureza pública não dá pra ler daqui → pelo nome
const PUBLICO = /PREFEIT|MUNIC[IÍ]PIO|C[AÂ]MARA MUNICIPAL|SECRETARIA|FUNDO MUNICIPAL|SERVI[CÇ]O AUT[OÔ]NOMO|SAAE|AUTARQUIA|CONS[OÓ]RCIO INTERMUNICIPAL|GOVERNO|ESTADO DE /i;

(async () => {
  // OS com NFS-e = marcadas no cache os_nfse (o filtro cTipoFat da Omie não é confiável)
  const comNota = new Set<number>();
  for (let de = 0; ; de += 1000) {
    const { data } = await sb.from('os_nfse').select('ncod_os').eq('conta_omie', 'NOVA').eq('tem_nota', true).order('ncod_os').range(de, de + 999);
    for (const r of data || []) comNota.add(Number(r.ncod_os));
    if (!data || data.length < 1000) break;
  }
  // mais recentes primeiro (código desc); para quando juntar o limite de OS com NFS-e
  const todas: any[] = [];
  let pag = 1, tot = 1;
  do {
    const r = await omie('ListarOS', { pagina: pag, registros_por_pagina: 50, apenas_importado_api: 'N', filtrar_por_status: 'F', ordenar_por: 'CODIGO', ordem_decrescente: 'S' });
    tot = Math.min(Number(r.total_de_paginas || 1), 60);
    todas.push(...(r.osCadastro || []).filter((o: any) => comNota.has(Number(o?.Cabecalho?.nCodOS))));
    process.stdout.write(`
página ${pag}/${tot} (${todas.length} OS com NFS-e)`);
    pag++; if (pag <= tot && todas.length < LIMITE) await espera(800);
  } while (pag <= tot && todas.length < LIMITE);
  console.log();

  const oss: OSLevantada[] = maisRecentes(todas
    .filter((o) => o?.Cabecalho?.nCodOS && o?.InfoCadastro?.cCancelada !== 'S')
    .map((o) => ({ nCodOS: Number(o.Cabecalho.nCodOS), cNumOS: String(o.Cabecalho.cNumOS || '').replace(/^0+/, ''), dataFat: dataOmieParaISO(o.InfoCadastro?.dDtFat), codCli: Number(o.Cabecalho.nCodCli || 0), valor: Number(o.Cabecalho.nValorTotal || 0), itens: o.ServicosPrestados || [] })), LIMITE);

  const cods = [...new Set(oss.map((o) => o.codCli))];
  const clientes = new Map<number, ClienteInfo>();
  for (let i = 0; i < cods.length; i += 200) {
    const { data } = await sb.from('portal_nt_clientes_cadastro_omie').select('cod_cli, razao_social, nome_fantasia, cnpj_cpf').eq('empresa', 'Nova Tratores').in('cod_cli', cods.slice(i, i + 200));
    for (const c of data || []) clientes.set(Number(c.cod_cli), { nome: String(c.razao_social || c.nome_fantasia || ''), documento: String(c.cnpj_cpf || '').replace(/\D/g, '') });
  }
  const ehPublico = (cod: number) => PUBLICO.test(clientes.get(cod)?.nome || '') ;
  const geral = agruparCombinacoes(oss, clientes);
  const publicas = oss.filter((o) => ehPublico(o.codCli));
  const pub = agruparCombinacoes(publicas, clientes);

  const linhas: string[] = [];
  const out = (s = '') => { linhas.push(s); console.log(s); };
  out(`# Levantamento fiscal — ${geral.totalOS} OS faturadas com NFS-e (${geral.periodo?.de} a ${geral.periodo?.ate})`);
  out(`${geral.totalItens} itens · ${geral.combinacoes.length} combinações · ${publicas.length} OS de órgãos públicos (${new Set(publicas.map((o) => o.codCli)).size} clientes)`);
  out('\n## Valores por campo (todas as OS)');
  for (const c of CAMPOS_FISCAIS) {
    const v = geral.porCampo[c.chave]; if (!v) continue;
    out(`- ${c.rotulo}: ${v.slice(0, 5).map((x) => `${mostrarValor(c.chave, x.valor)} (${Math.round(x.qtdItens / geral.totalItens * 100)}%)`).join(' · ')}`);
  }
  const base = geral.combinacoes[0];
  const bloco = (titulo: string, res: typeof geral, n: number) => {
    out(`\n## ${titulo}`);
    res.combinacoes.slice(0, n).forEach((c, i) => {
      const difs = CAMPOS_FISCAIS.filter((f) => String(c.campos[f.chave] ?? '') !== String(base.campos[f.chave] ?? ''));
      out(`\n### ${i + 1}. ${c.qtdOS} OS · ${c.qtdItens} itens · ${c.clientes.length} clientes · R$ ${c.valor.toFixed(2)} · última ${c.ultimaFat}`);
      out(c === base ? `Campos: ${Object.entries(c.campos).map(([k, v]) => `${rotuloCampo(k)} ${mostrarValor(k, v)}`).join(' · ')}`
        : `Difere da mais comum em: ${difs.map((f) => `${f.rotulo} ${mostrarValor(f.chave, c.campos[f.chave] ?? null)} (comum: ${mostrarValor(f.chave, base.campos[f.chave] ?? null)})`).join(' · ') || '— (igual)'}`);
      out(`Clientes: ${c.clientes.slice(0, 8).map((cl) => `${cl.nome} (${cl.qtdOS})`).join(' · ')}${c.clientes.length > 8 ? ` · +${c.clientes.length - 8}` : ''}`);
      out(`OS ex.: ${c.exemplos.join(', ')}`);
    });
  };
  bloco('Combinações mais usadas (todas)', geral, 10);
  bloco('Órgãos públicos (prefeituras etc.)', pub, 10);
  writeFileSync(`${process.env.TEMP}/levantamento-fiscal.md`, linhas.join('\n'));
  writeFileSync(`${process.env.TEMP}/levantamento-fiscal.json`, JSON.stringify({ geral, publicas: pub }, null, 1));
  writeFileSync(`${process.env.TEMP}/levantamento-fiscal-os.json`, JSON.stringify(oss.map((o) => ({ ...o, cliente: clientes.get(o.codCli)?.nome || '', documento: clientes.get(o.codCli)?.documento || '', publico: ehPublico(o.codCli) }))));
})();
