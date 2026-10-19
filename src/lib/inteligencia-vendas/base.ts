// =============================================================================
// INTELIGÊNCIA DE VENDAS — monta a ficha única de cada cliente cruzando as
// fontes do portal. Lib PURA: o servidor lê as tabelas e passa tudo aqui.
//
// Identidade = CPF/CNPJ só dígitos (o mesmo cliente tem um cod_cli na NOVA e
// outro na CASTRO). Sem documento, a chave é o código Omie da loja.
//
// Fontes e como ligam:
//   cadastro Omie (NOVA+CASTRO) ........ base de tudo
//   vendas_itens ....................... conta_omie + codigo_cliente
//   portal_nt_clientes_os .............. empresa + cod_cli
//   tratores (controle de revisões) .... SÓ pelo nome (não tem documento)
//   propostas (Formulario) ............. documento, senão nome
//   CRM dos vendedores (PRINCIPAL) ..... documento, senão id_omie (NOVA)
//   visitas do CRM ..................... propriedade_id → PRINCIPAL
// =============================================================================
import { avaliarCliente } from './regras';
import { chaveCidade, cidadeNorm, dataISO, diasEntre, docNorm, somarDias, textoNorm } from './normalizar';
import type {
  ClienteIV, FonteCadastro, FonteCnpj, FonteOS, FontePropriedade, FonteProposta, FonteTrator,
  FonteVendaItem, FonteVisita, MaquinaComprada,
} from './tipos';

export const PROPOSTA_VENDIDA = 'Concluida-Vendido';
export const PROPOSTA_PERDIDA = 'Concluida- Não vendido.';

const FAMILIAS_TRATOR = new Set(['trator novo', 'trator seminovo', 'trator usado']);
/** Famílias que não são máquina do cliente (contábil, kits, lixo de cadastro). */
const FAMILIAS_FORA = new Set(['pecas', 'ativo imobilizado', 'inativo', 'requisicao', 'kit revisao', 'cabine', 'servicos', 'servico']);

export function tipoDaFamilia(familia: unknown): MaquinaComprada['tipo'] | null {
  const f = textoNorm(familia);
  if (!f || FAMILIAS_FORA.has(f)) return null;
  if (FAMILIAS_TRATOR.has(f) || f.startsWith('trator')) return 'trator';
  if (f.includes('atv') || f.includes('utv')) return 'outro';
  return 'implemento';
}

/** 'Nova Tratores' | 'NOVA' → 'NOVA'; 'Castro Pecas' | 'Castro Peças' | 'CASTRO' → 'CASTRO'. */
export function lojaDe(empresa: unknown): string {
  const e = textoNorm(empresa);
  if (e.startsWith('castro')) return 'CASTRO';
  if (e.startsWith('nova')) return 'NOVA';
  return String(empresa ?? '').toUpperCase();
}

const MARCAS = [
  ['massey', 'Massey Ferguson'], ['john deere', 'John Deere'], ['new holland', 'New Holland'], ['valtra', 'Valtra'],
  ['ford', 'Ford'], ['case', 'Case'], ['yanmar', 'Yanmar'], ['agrale', 'Agrale'], ['kubota', 'Kubota'],
  ['tramontini', 'Tramontini'], ['solis', 'Solis'], ['ls tractor', 'LS'], ['ls ', 'LS'], ['mf ', 'Massey Ferguson'],
] as const;

/** Marcas de trator que NÃO são Mahindra citadas num texto de OS. */
export function marcasCitadas(texto: unknown): string[] {
  const t = ` ${textoNorm(texto)} `;
  const out = new Set<string>();
  for (const [chave, nome] of MARCAS) if (t.includes(` ${chave}`)) out.add(nome);
  return [...out];
}

/** Horímetro escrito na OS ("HORIMETRO 175H", "HORAS 601", "HOR: 3200"). null se não há. */
export function horimetroDoTexto(texto: unknown): number | null {
  const t = String(texto ?? '').toUpperCase();
  let melhor: number | null = null;
  const re = /HOR[IÍ]?(?:METRO)?S?\s*[:.\-]?\s*(\d{1,3}(?:\.\d{3})|\d{2,5})\s*(?:H\b|HS\b|HRS?\b)?/g;
  for (const m of t.matchAll(re)) {
    const n = Number(m[1].replace('.', ''));
    if (n >= 10 && n <= 30000 && (melhor == null || n > melhor)) melhor = n;
  }
  return melhor;
}

/** Modelo do trator/implemento a partir da descrição do item da venda. */
export function modeloDaDescricao(desc: unknown, tipo: MaquinaComprada['tipo']): string {
  const t = String(desc ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (tipo === 'trator') {
    // "JIVO 2025" é modelo, não ano.
    const jivo = t.match(/JIVO\s*(\d{3,4})/);
    if (jivo) return `JIVO ${jivo[1]}`;
    const m = t.match(/(?:MAHINDRA|TRATOR)(?:\s+(?:VEICULO|VEÍCULO|NOVO|SEMINOVO|USADO|MAHINDRA|TRATOR))*\s+(\d{3,5}[A-Z]{0,2})\b/);
    if (m && !/^(19|20)\d\d$/.test(m[1])) return m[1];
    const n = t.match(/\b(\d{3,5}[A-Z]{0,2})\b/);
    if (n && !/^(19|20)\d\d$/.test(n[1])) return n[1];
  }
  return t.split(' ').slice(0, 4).join(' ').slice(0, 40);
}

/** "6075 E CAB" | "6075E" → "6075E" (pra deduplicar a mesma máquina nas duas fontes). */
function modeloChave(m: string): string {
  return m.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6);
}

const valorBR = (s: unknown): number => {
  if (typeof s === 'number') return s;
  const t = String(s ?? '').trim();
  if (!t) return 0;
  const n = /,\d{1,2}$/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export interface Fontes {
  cadastro: FonteCadastro[];
  vendas: FonteVendaItem[];
  tratores: FonteTrator[];
  propostas: FonteProposta[];
  os: FonteOS[];
  propriedades: FontePropriedade[];
  visitas: FonteVisita[];
  vendedores: { id: number; nome: string }[];
  cnpjs: FonteCnpj[];
}

function vazio(chave: string, doc: string): ClienteIV {
  return {
    chave, doc, nome: '', cidade: '', chaveCidade: '', uf: '', telefone: '', lojas: [], codigos: [], inativo: true,
    maquinas: [], ultimoTrator: null, anosUltimoTrator: null, qtdTratores: 0, qtdImplementos: 0, valorMaquinas: 0,
    pecas12m: 0, pedidosPecas12m: 0, pecas12a24m: 0, pedidosPecas12a24m: 0, ultimaCompraPecas: '',
    os12m: 0, ultimaOS: '', marcasNaOficina: [], maiorHorimetro: null,
    propostasAbertas: 0, propostasGanhas: 0, propostasPerdidas: 0, ultimaProposta: '', ultimaPerdida: null, valorPropostasAbertas: 0,
    areaHa: null, local: null, culturas: [], ultimaVisita: '', visitas: 0, vendedor: '',
    cnae: '', cnaeDescricao: '', abertura: '', porte: '',
    oportunidades: [], score: 0,
  };
}

const maior = (a: string, b: string) => (b > a ? b : a);

/** O Omie devolve "&amp;" nos nomes. */
const semEntidade = (s: unknown) => String(s ?? '').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/g, "'").trim();
/** "() 11998539913" → "11998539913". */
const telefoneLimpo = (s: unknown) => String(s ?? '').replace(/\(\s*\)/g, '').trim();

export function montarBase(f: Fontes, hoje: string): ClienteIV[] {
  const porChave = new Map<string, ClienteIV>();
  const porCodigo = new Map<string, ClienteIV>(); // 'NOVA:123'
  const porNome = new Map<string, ClienteIV | null>(); // null = nome ambíguo
  const porDoc = new Map<string, ClienteIV>();

  // ── 1. cadastro ───────────────────────────────────────────────────────────
  for (const c of f.cadastro) {
    const loja = lojaDe(c.empresa);
    const cod = String(c.cod_cli);
    const doc = docNorm(c.cnpj_cpf);
    const chave = doc || `cod:${loja}:${cod}`;
    let cli = porChave.get(chave);
    if (!cli) { cli = vazio(chave, doc); porChave.set(chave, cli); if (doc) porDoc.set(doc, cli); }
    cli.codigos.push({ empresa: loja, cod });
    if (!cli.lojas.includes(loja)) cli.lojas.push(loja);
    if (!cli.nome || loja === 'NOVA') cli.nome = semEntidade(c.razao_social || c.nome_fantasia || cli.nome);
    if (!cli.cidade && c.cidade) {
      cli.cidade = c.cidade;
      cli.chaveCidade = chaveCidade(c.cidade, c.estado || '');
      cli.uf = cidadeNorm(c.cidade, c.estado || '').uf || String(c.estado || '');
    }
    if (!cli.telefone && telefoneLimpo(c.telefone)) cli.telefone = telefoneLimpo(c.telefone);
    if (String(c.inativo || 'N').toUpperCase() !== 'S') cli.inativo = false;
    porCodigo.set(`${loja}:${cod}`, cli);
    for (const n of [c.razao_social, c.nome_fantasia]) {
      const k = textoNorm(semEntidade(n));
      if (k.length < 6) continue;
      const atual = porNome.get(k);
      if (atual === undefined) porNome.set(k, cli);
      else if (atual && atual !== cli) porNome.set(k, null);
    }
  }
  const acharNome = (n: unknown): ClienteIV | null => porNome.get(textoNorm(n)) || null;

  const d12 = somarDias(hoje, -365);
  const d24 = somarDias(hoje, -730);

  // ── 2. vendas (máquinas + peças) ─────────────────────────────────────────
  const pedidos12 = new Map<ClienteIV, Set<string>>();
  const pedidos24 = new Map<ClienteIV, Set<string>>();
  for (const v of f.vendas) {
    const cli = porCodigo.get(`${lojaDe(v.conta_omie)}:${v.codigo_cliente}`);
    if (!cli) continue;
    const data = dataISO(v.data_pedido);
    const valor = Number(v.valor_total) || 0;
    const fam = textoNorm(v.familia);
    if (fam === 'pecas' || !fam) {
      const ped = `${v.conta_omie}:${v.numero_pedido || data}`;
      if (data >= d12) {
        cli.pecas12m += valor;
        (pedidos12.get(cli) || pedidos12.set(cli, new Set()).get(cli)!).add(ped);
      } else if (data >= d24) {
        cli.pecas12a24m += valor;
        (pedidos24.get(cli) || pedidos24.set(cli, new Set()).get(cli)!).add(ped);
      }
      cli.ultimaCompraPecas = maior(cli.ultimaCompraPecas, data);
      continue;
    }
    const tipo = tipoDaFamilia(v.familia);
    if (!tipo || valor <= 0) continue;
    cli.maquinas.push({ tipo, familia: String(v.familia), modelo: modeloDaDescricao(v.descricao, tipo), data, valor, origem: 'omie' });
  }
  for (const [cli, s] of pedidos12) cli.pedidosPecas12m = s.size;
  for (const [cli, s] of pedidos24) cli.pedidosPecas12a24m = s.size;

  // ── 3. controle de revisões (tratores entregues, desde 2019) ─────────────
  for (const t of f.tratores) {
    const cli = acharNome(t.Cliente);
    const data = dataISO(t.Entrega);
    if (!cli || !data) continue;
    let modelo = String(t.Modelo || '').trim().replace(/\.0$/, '');
    if (modelo === '2025') modelo = 'JIVO 2025'; // o controle de revisões grava só o número
    const dup = cli.maquinas.some((m) => m.tipo === 'trator' && modeloChave(m.modelo).slice(0, 4) === modeloChave(modelo).slice(0, 4)
      && Math.abs(diasEntre(m.data, data) ?? 999) <= 180);
    if (!dup) cli.maquinas.push({ tipo: 'trator', familia: 'Trator (revisões)', modelo, data, valor: null, origem: 'revisoes' });
    if (!cli.vendedor && t.Vendedor) cli.vendedor = String(t.Vendedor).trim();
  }

  // ── 4. OS da oficina ─────────────────────────────────────────────────────
  for (const o of f.os) {
    if (o.cancelada) continue;
    const cli = porCodigo.get(`${lojaDe(o.empresa)}:${o.cod_cli}`);
    if (!cli) continue;
    const data = dataISO(o.data_inclusao);
    if (data >= d12) cli.os12m++;
    cli.ultimaOS = maior(cli.ultimaOS, data);
    for (const m of marcasCitadas(o.descricao)) if (!cli.marcasNaOficina.includes(m)) cli.marcasNaOficina.push(m);
    const h = horimetroDoTexto(o.descricao);
    if (h != null && (cli.maiorHorimetro == null || h > cli.maiorHorimetro)) cli.maiorHorimetro = h;
  }

  // ── 5. propostas ─────────────────────────────────────────────────────────
  for (const p of f.propostas) {
    if (p.status === 'Lixeira') continue;
    const doc = docNorm(p.cliente_doc_norm || p['Cpf/Cpnj']);
    const cli = (doc && porDoc.get(doc)) || acharNome(p.Cliente);
    if (!cli) continue;
    const data = dataISO(p.criado_em);
    cli.ultimaProposta = maior(cli.ultimaProposta, data);
    if (p.status === PROPOSTA_VENDIDA) cli.propostasGanhas++;
    else if (p.status === PROPOSTA_PERDIDA) {
      cli.propostasPerdidas++;
      const quando = dataISO(p.fechado_em || p.status_desde || p.criado_em);
      if (!cli.ultimaPerdida || quando > cli.ultimaPerdida.data) {
        cli.ultimaPerdida = { data: quando, modelo: String(p.Modelo || ''), marca: String(p.Marca || '') };
      }
    } else {
      cli.propostasAbertas++;
      cli.valorPropostasAbertas += valorBR(p.Valor_Total);
    }
    if (p.vendedor_nome) cli.vendedor = String(p.vendedor_nome);
  }

  // ── 6. CRM dos vendedores: área, culturas, visitas ───────────────────────
  const propCli = new Map<number, ClienteIV>();
  for (const p of f.propriedades) {
    const doc = docNorm(p.cnpj_cpf);
    const cli = (doc && porDoc.get(doc)) || (p.id_omie != null ? porCodigo.get(`NOVA:${p.id_omie}`) : undefined);
    if (!cli) continue;
    propCli.set(p.id, cli);
    const la = Number(p.latitude ?? p.lat), lo = Number(p.longitude ?? p.lng);
    if (!cli.local && la && lo && Math.abs(la) <= 90 && Math.abs(lo) <= 180) cli.local = [la, lo];
    if (p.area_hectares != null && Number(p.area_hectares) > 0) cli.areaHa = (cli.areaHa || 0) + Number(p.area_hectares);
    for (const c of p.culturas || []) if (c && !cli.culturas.includes(c)) cli.culturas.push(c);
  }
  const nomeVend = new Map(f.vendedores.map((v) => [v.id, v.nome]));
  for (const v of f.visitas) {
    const cli = v.propriedade_id != null ? propCli.get(v.propriedade_id) : undefined;
    if (!cli) continue;
    cli.visitas++;
    const data = dataISO(v.data_visita);
    if (data >= cli.ultimaVisita) {
      cli.ultimaVisita = data;
      const n = v.vendedor_id != null ? nomeVend.get(v.vendedor_id) : '';
      if (n && !/teste/i.test(n)) cli.vendedor = n;
    }
  }

  // ── 7. CNPJ (Receita, via BrasilAPI) ─────────────────────────────────────
  for (const c of f.cnpjs) {
    const cli = porDoc.get(docNorm(c.cnpj));
    if (!cli) continue;
    cli.cnae = String(c.cnae_codigo || '');
    cli.cnaeDescricao = String(c.cnae_descricao || '');
    cli.abertura = dataISO(c.data_inicio);
    cli.porte = String(c.porte || '');
  }

  // ── 8. resumo das máquinas + regras ──────────────────────────────────────
  const out: ClienteIV[] = [];
  for (const cli of porChave.values()) {
    if (/^(nova tratores|castro pecas)/.test(textoNorm(cli.nome))) continue; // a própria loja
    cli.maquinas.sort((a, b) => b.data.localeCompare(a.data));
    const tratores = cli.maquinas.filter((m) => m.tipo === 'trator');
    cli.qtdTratores = tratores.length;
    cli.qtdImplementos = cli.maquinas.filter((m) => m.tipo === 'implemento').length;
    cli.valorMaquinas = cli.maquinas.reduce((s, m) => s + (m.valor || 0), 0);
    cli.ultimoTrator = tratores[0] || null;
    const dias = cli.ultimoTrator ? diasEntre(cli.ultimoTrator.data, hoje) : null;
    cli.anosUltimoTrator = dias == null ? null : Math.floor(dias / 365.25);
    cli.oportunidades = avaliarCliente(cli, hoje);
    cli.score = Math.min(100, cli.oportunidades.reduce((s, o) => s + o.peso, 0));
    out.push(cli);
  }
  return out.sort((a, b) => b.score - a.score || b.pecas12m - a.pecas12m);
}

/** Cliente "conhecido" = teve algum movimento (compra, OS, proposta ou visita). */
export function temMovimento(c: ClienteIV): boolean {
  return c.maquinas.length > 0 || c.pecas12m + c.pecas12a24m > 0 || c.os12m > 0 || !!c.ultimaOS
    || c.propostasAbertas + c.propostasGanhas + c.propostasPerdidas > 0 || c.visitas > 0 || !!c.ultimaCompraPecas;
}
