async function run() {
  const BASE = 'https://app.omie.com.br/api/v1';
  const KEY = process.env.OMIE_APP_KEY;
  const SECRET = process.env.OMIE_APP_SECRET;

  async function omieCall(endpoint, call, param) {
    const res = await fetch(BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call, app_key: KEY, app_secret: SECRET, param: [param] })
    });
    if (res.status === 429) {
      console.error('Rate limit, aguardando 60s...');
      await new Promise(r => setTimeout(r, 60000));
      return omieCall(endpoint, call, param);
    }
    return await res.json();
  }

  // 1. Buscar todas as OS de 2026
  let allOS = [];
  let page = 1;
  while (true) {
    const data = await omieCall('/servicos/os/', 'ListarOS', {
      pagina: page,
      registros_por_pagina: 50,
      filtrar_por_data_de: '01/01/2026',
      filtrar_por_data_ate: '31/12/2026'
    });
    if (data.faultstring) { console.error('Erro OS:', data.faultstring); break; }
    const registros = data.osCadastro || [];
    allOS = allOS.concat(registros);
    console.error('Pagina ' + page + '/' + data.total_de_paginas + ' (' + allOS.length + ' OS)');
    if (page >= data.total_de_paginas) break;
    page++;
    await new Promise(r => setTimeout(r, 400));
  }

  // 2. Agrupar por nCodCli
  const map = {};
  for (const os of allOS) {
    const codCli = os.Cabecalho.nCodCli;
    if (!map[codCli]) {
      map[codCli] = { codCli, qtd: 0 };
    }
    map[codCli].qtd++;
  }

  const clientes = Object.values(map).sort((a, b) => b.qtd - a.qtd);
  console.error('\nTotal OS: ' + allOS.length + ', Clientes unicos: ' + clientes.length);
  console.error('Buscando dados dos clientes...\n');

  // 3. Buscar dados dos clientes
  const results = [];
  for (let i = 0; i < clientes.length; i++) {
    const c = clientes[i];
    try {
      const cli = await omieCall('/geral/clientes/', 'ConsultarCliente', { codigo_cliente_omie: c.codCli });
      results.push({
        qtd: c.qtd,
        razao: cli.razao_social || cli.nome_fantasia || '',
        cnpj: cli.cnpj_cpf || '',
        endereco: (cli.endereco || '') + (cli.endereco_numero ? ', ' + cli.endereco_numero : ''),
        bairro: cli.bairro || '',
        cidade: cli.cidade || '',
        estado: cli.estado || ''
      });
      console.error('  Cliente ' + (i + 1) + '/' + clientes.length + ': ' + (cli.razao_social || cli.nome_fantasia || c.codCli));
    } catch (e) {
      results.push({ qtd: c.qtd, razao: 'Cod ' + c.codCli, cnpj: '', endereco: '', bairro: '', cidade: '', estado: '' });
      console.error('  Cliente ' + (i + 1) + '/' + clientes.length + ': ERRO - ' + e.message);
    }
    await new Promise(r => setTimeout(r, 350));
  }

  // 4. Imprimir resultado
  console.log('');
  console.log('RELATORIO OMIE - CLIENTES COM MAIS OS EM 2026');
  console.log('Total de OS: ' + allOS.length + ' | Clientes unicos: ' + results.length);
  console.log('='.repeat(80));
  console.log('');

  for (const c of results) {
    console.log(c.qtd + ' OS  |  ' + c.razao + '  |  ' + c.cnpj);
    const end = [c.endereco, c.bairro, c.cidade, c.estado].filter(Boolean).join(' - ');
    console.log('        ' + end);
    console.log('');
  }
}

run().catch(e => console.error(e));
