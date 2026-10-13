// Cria os modelos fiscais iniciais da NFS-e a partir do levantamento das últimas
// 1000 OS faturadas (13/10/2026, scripts/pos-levantamento-fiscal.ts) e das
// decisões do José. Idempotente: atualiza o modelo de mesmo nome.
// Uso: npx tsx scripts/pos-modelos-fiscais-seed.ts [--gravar]
process.loadEnvFile('.env.local');

const GRAVAR = process.argv.includes('--gravar');

// Padrão = o que 128 dos ~140 itens usaram desde 01/09/2026 (ex.: OS 5346, 5342, 5340)
const PADRAO = {
  cNbs: '1.2001.50.00', cCodServLC116: '14.01', cCodServMun: '140101', cTribServ: '01',
  nAliqISS: 3, cRetemISS: 'N',
  cRetemPIS: 'N', cRetemCOFINS: 'N', cRetemCSLL: 'N', cRetemIRRF: 'N', cRetemINSS: 'N',
  cCST: '000', cClassTrib: '000001', cIndOPer: '030103',
  nAliqIbsUf: 0.1, nAliqIbsMun: 0, nAliqCbs: 0.9,
};
const PREF = { ...PADRAO, cIndOPer: '050101' }; // órgão público: indicador das últimas OS de Piraju (5250, 5214)

const MODELOS = [
  { nome: 'Padrão', padrao: true, descricao: 'Clientes em geral — o que a Omie usou em 128 de ~140 itens desde 09/2026', campos: PADRAO, clientes: [] as Array<[string, string]> },
  { nome: 'Prefeitura — retém ISS', padrao: false, descricao: 'Órgão público que retém o ISS (Piraju: OS 5250, 5076, 5075, 5074…)', campos: { ...PREF, cRetemISS: 'S' },
    clientes: [['46223699000150', 'MUNICIPIO DE PIRAJU']] as Array<[string, string]> },
  { nome: 'Prefeitura — retém IR 1,5%', padrao: false, descricao: 'Órgão público que retém IR 1,5% (Iaras: OS 5109)', campos: { ...PREF, cRetemIRRF: 'S', nAliqIRRF: 1.5 },
    clientes: [['57263949000100', 'MUNICIPIO DE IARAS']] as Array<[string, string]> },
  { nome: 'Prefeitura — sem retenção', padrao: false, descricao: 'Órgão público sem retenções (Ipaussu, Esp. Santo do Turvo, Riversul, Fartura)', campos: PREF,
    clientes: [
      ['44563583000134', 'MUNICIPIO DE IPAUSSU'], ['57264509000169', 'MUNICIPIO DE ESPIRITO SANTO DO TURVO'],
      ['46634416000162', 'MUNICIPIO DE RIVERSUL'], ['46223707000168', 'PREFEITURA MUNICIPAL DE FARTURA'],
    ] as Array<[string, string]> },
];

(async () => {
  const { validarCampos } = await import('../src/lib/pos/modelo-fiscal');
  const { listarModelos, salvarModelo, vincularCliente } = await import('../src/lib/pos/modelos-fiscais-db');
  const existentes = await listarModelos();
  for (const m of MODELOS) {
    const v = validarCampos(m.campos);
    if (v.erros.length) { console.log(`✖ ${m.nome}: ${v.erros.join(' ')}`); continue; }
    const atual = existentes.find((e) => e.nome.toLowerCase() === m.nome.toLowerCase());
    console.log(`${GRAVAR ? '✔' : '(simulação)'} ${atual ? 'atualiza' : 'cria'} "${m.nome}" — ${Object.keys(v.campos).length} campos; ${m.clientes.length} cliente(s)`);
    if (!GRAVAR) continue;
    const r = await salvarModelo({ id: atual?.id || null, nome: m.nome, descricao: m.descricao, campos: v.campos, padrao: m.padrao }, 'levantamento 13/10/2026');
    if (!r.ok) { console.log('  erro:', r.erros.join(' ')); continue; }
    for (const [doc, nome] of m.clientes) {
      const e = await vincularCliente(doc, r.modelo.id, nome, 'levantamento 13/10/2026');
      console.log(`  ${e ? '✖' : '→'} ${nome}${e ? ` (${e})` : ''}`);
    }
  }
})();
