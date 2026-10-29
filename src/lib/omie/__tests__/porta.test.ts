import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  omie, comPrioridade, comRobosPausados, robosPausados, estadoPorta, bloqueioRestanteMs, LIMITES, _reiniciarPorta,
  OmieBloqueioError, OmieChaveRecusadaError, OmieIncertoError, OmieFaultError,
  ehGravacao, ehChaveRecusada, rotuloCanonico, segundosDoBloqueio, segundosParaAguardar, corpoAscii,
  _definirCoordenacao, limitePadrao,
} from '../porta';
import type { FonteCoordenacao, BloqueioExterno } from '../coordenacao';

const NOVA = { appKey: 'chave-nova', appSecret: 's', rotulo: 'NOVA' };
const CASTRO = { appKey: 'chave-castro', appSecret: 's', rotulo: 'CASTRO' };
const RAPIDO = { maxEsperaMs: 1 };

type Resposta = Record<string, unknown> | Error;
let respostas: Resposta[] = [];
let chamadas: Array<{ call: string; body: string }> = [];

function json(r: Record<string, unknown>) {
  return { status: 200, text: async () => JSON.stringify(r) } as unknown as Response;
}

beforeEach(() => {
  _reiniciarPorta();
  Object.assign(LIMITES, { gapMetodoMs: 0, gapChaveMs: 0, gapGlobalMs: 0, maxSimultaneasChave: 4, pausaChaveRecusadaMs: 300_000 });
  respostas = [];
  chamadas = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const body = String(init.body);
    chamadas.push({ call: JSON.parse(body).call, body });
    const r = respostas.shift() ?? { ok: true };
    if (r instanceof Error) throw r;
    return json(r);
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('classificação', () => {
  it('junta os nomes da empresa em NOVA/CASTRO', () => {
    expect(rotuloCanonico('Castro Peças')).toBe('CASTRO');
    expect(rotuloCanonico('Castro Pecas')).toBe('CASTRO');
    expect(rotuloCanonico('Nova Tratores')).toBe('NOVA');
    expect(rotuloCanonico('NOVA')).toBe('NOVA');
  });
  it('reconhece gravação pelo nome do método', () => {
    expect(ehGravacao('IncluirPedido')).toBe(true);
    expect(ehGravacao('FaturarOS')).toBe(true);
    expect(ehGravacao('ListarProdutos')).toBe(false);
    expect(ehGravacao('ValidarOS')).toBe(false);
  });
  it('chave recusada não confunde com chave de NF-e', () => {
    expect(ehChaveRecusada('A chave de acesso está inválida ou o aplicativo está suspenso [#06 NDAy]')).toBe(true);
    expect(ehChaveRecusada('Chave de acesso da NF-e inválida')).toBe(false);
  });
  it('lê o tempo do bloqueio', () => {
    expect(segundosDoBloqueio('API bloqueada por consumo indevido. Tente novamente em 1795 segundos.')).toBe(1795);
    expect(segundosDoBloqueio('bloqueada por 30 minutos')).toBe(1800);
    expect(segundosDoBloqueio('consumo indevido')).toBe(1800);
  });
  it('lê o "aguarde N segundos" do consumo redundante', () => {
    expect(segundosParaAguardar('ERROR: Consumo redundante detectado. Aguarde 5 segundos para tentar novamente (REDUNDANT).')).toBe(5);
    expect(segundosParaAguardar('Too many requests')).toBe(0);
  });
  it('corpo sai 100% ASCII', () => {
    const c = corpoAscii({ d: 'peça' });
    expect(c).toBe('{"d":"pe\\u00e7a"}');
    expect(JSON.parse(c).d).toBe('peça');
  });
});

describe('omie()', () => {
  it('devolve a resposta e manda o corpo escapado', async () => {
    respostas = [{ produto: 1 }];
    const r = await omie(NOVA, '/geral/produtos/', 'ConsultarProduto', { descricao: 'Peça' });
    expect(r).toEqual({ produto: 1 });
    expect(chamadas[0].body).toContain('Pe\\u00e7a');
  });

  it('erro de negócio vira OmieFaultError, ou volta no JSON com lancarFault:false', async () => {
    respostas = [{ faultstring: 'ERROR: Não existem registros' }, { faultstring: 'ERROR: Não existem registros' }];
    await expect(omie(NOVA, '/x/', 'ListarNF', {})).rejects.toBeInstanceOf(OmieFaultError);
    const r = await omie<{ faultstring?: string }>(NOVA, '/x/', 'ListarNF', {}, { lancarFault: false });
    expect(r.faultstring).toMatch(/registros/);
  });

  it('transitório esgotado vira erro mesmo com lancarFault:false', async () => {
    respostas = [{ faultstring: 'Too many requests' }, { faultstring: 'Too many requests' }];
    await expect(omie(NOVA, '/x/', 'ListarProdutos', {}, { tentativas: 1, maxEsperaMs: 1, lancarFault: false })).rejects.toBeInstanceOf(OmieFaultError);
    expect(chamadas).toHaveLength(2);
  });

  it('erro no formato REST também é erro', async () => {
    respostas = [{ status: 'error', message: 'Method not exists' }];
    await expect(omie(NOVA, '/x/', 'CancelarPedido', {})).rejects.toThrow(/Method not exists/);
  });

  it('bloqueio arma o disjuntor: próxima chamada falha sem tocar a Omie', async () => {
    respostas = [{ faultstring: 'API bloqueada por consumo indevido. Tente novamente em 600 segundos.' }];
    await expect(omie(NOVA, '/x/', 'ListarProdutos', {})).rejects.toBeInstanceOf(OmieBloqueioError);
    expect(bloqueioRestanteMs(NOVA.appKey, 'ListarProdutos')).toBeGreaterThan(600_000);
    await expect(omie(NOVA, '/x/', 'ListarProdutos', {})).rejects.toBeInstanceOf(OmieBloqueioError);
    expect(chamadas).toHaveLength(1);
    // outro método e outra chave seguem livres
    await omie(NOVA, '/x/', 'ListarClientes', {});
    await omie(CASTRO, '/x/', 'ListarProdutos', {});
    expect(chamadas).toHaveLength(3);
  });

  it('chave recusada para a CHAVE inteira, não só o método', async () => {
    respostas = [{ faultstring: 'A chave de acesso está inválida ou o aplicativo está suspenso [#x]' }];
    const e = await omie(NOVA, '/x/', 'ListarProdutos', {}).catch((x) => x);
    expect(e).toBeInstanceOf(OmieChaveRecusadaError);
    expect(e.bloqueio).toBe(true);
    await expect(omie(NOVA, '/x/', 'ConsultarCliente', {})).rejects.toBeInstanceOf(OmieBloqueioError);
    expect(chamadas).toHaveLength(1);
    await omie(CASTRO, '/x/', 'ConsultarCliente', {});
    expect(chamadas).toHaveLength(2);
  });

  it('freio: 4 erros seguidos do mesmo método pausam o método antes da Omie travar', async () => {
    Object.assign(LIMITES, { freioErros: 4, freioPausaMs: 90_000 });
    respostas = Array(4).fill({ faultstring: 'ERROR: Pedido não cadastrado para o Código de Integração [PV-1]' });
    for (let i = 0; i < 4; i++) await expect(omie(CASTRO, '/x/', 'ConsultarPedido', {})).rejects.toThrow(/não cadastrado/);
    await expect(omie(CASTRO, '/x/', 'ConsultarPedido', {})).rejects.toBeInstanceOf(OmieBloqueioError);
    expect(chamadas).toHaveLength(4);
    await omie(CASTRO, '/x/', 'ConsultarCliente', {}); // outro método segue livre
    expect(chamadas).toHaveLength(5);
  });

  it('freio: um acerto no meio zera a contagem e fim de lista não conta', async () => {
    Object.assign(LIMITES, { freioErros: 3, freioPausaMs: 90_000 });
    const erro = { faultstring: 'ERROR: Pedido não cadastrado' };
    respostas = [erro, erro, { ok: 1 }, erro, erro, { faultstring: 'ERROR: Não existem registros para a página [2]!' }, { ok: 1 }];
    for (let i = 0; i < 7; i++) await omie(CASTRO, '/x/', 'ConsultarPedido', {}).catch(() => {});
    expect(chamadas).toHaveLength(7);
  });

  it('leitura repete em falha de rede e em engasgo da Omie', async () => {
    respostas = [new TypeError('fetch failed'), { faultstring: 'SOAP-ERROR: Broken response from Application Server (BG)' }, { ok: 1 }];
    const r = await omie(NOVA, '/x/', 'ListarPedidos', {}, RAPIDO);
    expect(r).toEqual({ ok: 1 });
    expect(chamadas).toHaveLength(3);
  });

  it('leitura desiste depois das tentativas', async () => {
    respostas = [new TypeError('fetch failed'), new TypeError('fetch failed'), new TypeError('fetch failed')];
    await expect(omie(NOVA, '/x/', 'ListarPedidos', {}, RAPIDO)).rejects.toThrow('fetch failed');
    expect(chamadas).toHaveLength(3);
  });

  it('gravação com falha de rede NÃO repete: estado desconhecido', async () => {
    respostas = [new TypeError('fetch failed'), { ok: 1 }];
    await expect(omie(NOVA, '/x/', 'FaturarPedidoVenda', {}, RAPIDO)).rejects.toBeInstanceOf(OmieIncertoError);
    expect(chamadas).toHaveLength(1);
  });

  it('gravação com engasgo da Omie NÃO repete', async () => {
    respostas = [{ faultstring: 'SOAP-ERROR: Broken response from Application Server' }, { ok: 1 }];
    await expect(omie(NOVA, '/x/', 'IncluirOS', {}, RAPIDO)).rejects.toBeInstanceOf(OmieIncertoError);
    expect(chamadas).toHaveLength(1);
  });

  it('gravação repete no limite de velocidade (recusado antes de processar)', async () => {
    respostas = [{ faultstring: 'Too many requests' }, { ok: 1 }];
    const r = await omie(NOVA, '/x/', 'AlterarPedidoVenda', {}, RAPIDO);
    expect(r).toEqual({ ok: 1 });
    expect(chamadas).toHaveLength(2);
  });

  it('consumo redundante em gravação NÃO repete: pode ter sido processada', async () => {
    respostas = [{ faultstring: 'ERROR: Consumo redundante detectado. Aguarde 5 segundos (REDUNDANT).' }, { ok: 1 }];
    await expect(omie(NOVA, '/x/', 'FaturarOS', {}, RAPIDO)).rejects.toBeInstanceOf(OmieIncertoError);
    expect(chamadas).toHaveLength(1);
  });

  it('consumo redundante em leitura repete', async () => {
    respostas = [{ faultstring: 'ERROR: Consumo redundante detectado. Aguarde 0 segundos (REDUNDANT).' }, { ok: 1 }];
    await omie(NOVA, '/x/', 'ConsultarOS', {}, RAPIDO);
    expect(chamadas).toHaveLength(2);
  });

  it('gravação repete quando a conexão nem abriu', async () => {
    respostas = [Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }), { ok: 1 }];
    await omie(NOVA, '/x/', 'IncluirPedido', {}, RAPIDO);
    expect(chamadas).toHaveLength(2);
  });

  it('HTTP 429 repete até em gravação (a Omie recusou antes de processar)', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => (++n === 1
      ? ({ status: 429, text: async () => 'Too Many Requests' } as unknown as Response)
      : json({ ok: 1 }))));
    const r = await omie(NOVA, '/x/', 'IncluirOS', {}, RAPIDO);
    expect(r).toEqual({ ok: 1 });
    expect(n).toBe(2);
  });

  it('timeout em gravação vira estado desconhecido', async () => {
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => new Promise((_r, rej) => {
      init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })));
    const e = await omie(NOVA, '/x/', 'FaturarOS', {}, { timeoutMs: 20 }).catch((x) => x);
    expect(e).toBeInstanceOf(OmieIncertoError);
    expect(e.message).toMatch(/sem resposta/);
  });
});

describe('fila e prioridade', () => {
  it('pessoa passa na frente de pesado que chegou antes', async () => {
    LIMITES.gapChaveMs = 30;
    const ordem: string[] = [];
    const pesados = comPrioridade('pesado', () =>
      [1, 2, 3].map((i) => omie(NOVA, '/x/', 'ListarProdutos', { p: i }).then(() => ordem.push(`pesado${i}`))));
    await new Promise((r) => setTimeout(r, 5)); // o 1º pesado já saiu
    const pessoa = omie(NOVA, '/x/', 'ConsultarCliente', {}).then(() => ordem.push('pessoa'));
    await Promise.all([...pesados, pessoa]);
    expect(ordem[0]).toBe('pesado1');
    expect(ordem[1]).toBe('pessoa');
  });

  it('prioridade do contexto vale para chamadas em segundo plano', async () => {
    await comPrioridade('rapido', async () => {
      await new Promise((r) => setTimeout(r, 1));
      await omie(NOVA, '/x/', 'ListarNF', {});
    });
    const linha = estadoPorta().ultimoMinuto.find((l) => l.metodo === 'ListarNF');
    expect(linha?.prioridade).toBe('rapido');
    expect(linha?.ok).toBe(1);
  });

  it('respeita o intervalo mínimo por método', async () => {
    LIMITES.gapMetodoMs = 40;
    const t0 = Date.now();
    await Promise.all([1, 2, 3].map(() => omie(NOVA, '/x/', 'ListarProdutos', {})));
    expect(Date.now() - t0).toBeGreaterThanOrEqual(75);
  });

  it('limita chamadas simultâneas por chave', async () => {
    LIMITES.maxSimultaneasChave = 2;
    let emVoo = 0, pico = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      emVoo++; pico = Math.max(pico, emVoo);
      await new Promise((r) => setTimeout(r, 15));
      emVoo--;
      return json({ ok: 1 });
    }));
    await Promise.all([1, 2, 3, 4, 5].map((i) => omie(NOVA, '/x/', `Listar${i}`, {})));
    expect(pico).toBe(2);
  });

  it('painel mostra bloqueios ativos', async () => {
    respostas = [{ faultstring: 'API bloqueada por consumo indevido. 100 segundos' }];
    await omie(CASTRO, '/x/', 'ListarProdutos', {}).catch(() => {});
    const b = estadoPorta().bloqueios;
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ conta: 'CASTRO', metodo: 'ListarProdutos' });
  });
});

describe('gravação uma de cada vez (orientação do suporte Omie, 21/10/2026)', () => {
  it('duas gravações na mesma chave não ficam em voo juntas; leitura segue em paralelo', async () => {
    Object.assign(LIMITES, { maxGravacoesChave: 1 });
    let emVoo = 0, maxGrav = 0
    const liberar: Array<() => void> = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const call = JSON.parse(String(init.body)).call as string
      if (call.startsWith('Alterar')) {
        emVoo++; maxGrav = Math.max(maxGrav, emVoo)
        await new Promise<void>((ok) => liberar.push(ok))
        emVoo--
      }
      return json({ ok: true })
    }))
    const a = omie(NOVA, '/x/', 'AlterarOS', { n: 1 }, RAPIDO)
    const b = omie(NOVA, '/x/', 'AlterarPedidoVenda', { n: 2 }, RAPIDO)
    const leitura = omie(NOVA, '/x/', 'ConsultarOS', { n: 3 }, RAPIDO)
    await leitura // a leitura não espera as gravações
    await vi.waitFor(() => expect(liberar.length).toBe(1))
    liberar.shift()!()
    await vi.waitFor(() => expect(liberar.length).toBe(1))
    liberar.shift()!()
    await Promise.all([a, b])
    expect(maxGrav).toBe(1)
  })
})

describe('robôs parados durante o faturamento (José, 21/10/2026)', () => {
  it('chamada de robô espera o faturamento terminar; a de pessoa passa', async () => {
    const ordem: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      ordem.push(JSON.parse(String(init.body)).call as string)
      return json({ ok: true })
    }))
    let soltar!: () => void
    const faturando = comRobosPausados('teste', async () => {
      await omie(NOVA, '/x/', 'ConsultarOS', { n: 1 }, RAPIDO)
      await new Promise<void>((ok) => { soltar = ok })
      await omie(NOVA, '/x/', 'FaturarOS', { n: 1 }, RAPIDO)
    })
    await vi.waitFor(() => expect(ordem).toContain('ConsultarOS'))
    expect(robosPausados()).toBe(true)
    const robo = comPrioridade('pesado', () => omie(NOVA, '/x/', 'ListarOS', { n: 2 }, RAPIDO))
    const pessoa = omie(NOVA, '/x/', 'ListarClientes', { n: 3 }, RAPIDO)
    await pessoa
    await new Promise((r) => setTimeout(r, 50))
    expect(ordem).not.toContain('ListarOS') // o robô está parado
    soltar()
    await faturando
    await robo
    expect(robosPausados()).toBe(false)
    expect(ordem.indexOf('ListarOS')).toBeGreaterThan(ordem.indexOf('FaturarOS'))
  })
})

// "Banco" falso compartilhado pelos dois processos (web × worker, 22/10/2026).
function bancoFalso() {
  const vagas = new Map<string, { dono: string; ate: number }>()
  const bloqueios = new Map<string, BloqueioExterno>()
  const fonte: FonteCoordenacao = {
    async pegarVaga(chave, dono, ms) {
      const v = vagas.get(chave)
      if (v && v.ate > Date.now() && v.dono !== dono) return false
      vagas.set(chave, { dono, ate: Date.now() + ms })
      return true
    },
    async soltarVaga(chave, dono) {
      if (vagas.get(chave)?.dono === dono) vagas.delete(chave)
    },
    async lerBloqueios() {
      return [...bloqueios.values()].filter((b) => b.ate > Date.now())
    },
    async gravarBloqueio(chave, metodo, ate, motivo) {
      bloqueios.set(`${chave}|${metodo}`, { chave, metodo, ate, motivo, criadoEm: Date.now() })
    },
    async liberarBloqueio(chave, metodo) {
      bloqueios.delete(`${chave}|${metodo}`)
    },
  }
  return { fonte, vagas, bloqueios }
}

describe('coordenação entre web e worker pelo banco (22/10/2026)', () => {
  it('web (pessoas) com o ritmo cheio; worker na metade (IPs diferentes, 26/10/2026)', () => {
    expect(limitePadrao('tudo')).toMatchObject({ gapMetodoMs: 300, maxSimultaneasChave: 4 })
    expect(limitePadrao('web')).toEqual(limitePadrao('tudo'))
    const worker = limitePadrao('worker')
    expect(worker).toMatchObject({ gapMetodoMs: 500, maxSimultaneasChave: 2 })
    expect(60_000 / worker.gapMetodoMs).toBeLessThanOrEqual(120) // metade dos 240/min por método
  })

  it('gravação espera a vaga que o outro processo segura; leitura não espera', async () => {
    const banco = bancoFalso()
    _definirCoordenacao(banco.fonte)
    // o "worker" está gravando: a vaga da chave NOVA está ocupada por outro dono
    const { createHash } = await import('node:crypto')
    const id = createHash('sha256').update('chave-nova').digest('hex').slice(0, 12)
    banco.vagas.set(id, { dono: 'worker-outro', ate: Date.now() + 60_000 })

    chamadas = []
    const gravar = omie(NOVA, '/x/', 'AlterarCliente', { a: 1 }, RAPIDO)
    await omie(NOVA, '/x/', 'ConsultarCliente', { a: 1 }, RAPIDO)
    await new Promise((r) => setTimeout(r, 300))
    expect(chamadas.map((c) => c.call)).toEqual(['ConsultarCliente']) // a gravação espera
    expect(estadoPorta().coordenacao.esperandoVaga).toBe(1)

    banco.vagas.delete(id) // o worker terminou
    await gravar
    expect(chamadas.map((c) => c.call)).toEqual(['ConsultarCliente', 'AlterarCliente'])
    expect(banco.vagas.size).toBe(0) // soltou a vaga depois de gravar
  })

  it('banco fora não trava a Omie: grava com a vaga local e mostra o erro no painel', async () => {
    const banco = bancoFalso()
    _definirCoordenacao({ ...banco.fonte, pegarVaga: async () => { throw new Error('banco caiu') } })
    await omie(NOVA, '/x/', 'IncluirCliente', { a: 1 }, RAPIDO)
    expect(chamadas.map((c) => c.call)).toEqual(['IncluirCliente'])
    expect(estadoPorta().coordenacao.ultimoErro?.msg).toMatch(/banco caiu/)
  })

  it('bloqueio visto por um processo vale para o outro', async () => {
    const banco = bancoFalso()
    _definirCoordenacao(banco.fonte)
    respostas = [{ faultstring: 'API bloqueada por consumo indevido. Tente novamente em 600 segundos.' }]
    await expect(omie(NOVA, '/x/', 'ListarPedidos', {}, RAPIDO)).rejects.toBeInstanceOf(OmieBloqueioError)
    await vi.waitFor(() => expect(banco.bloqueios.size).toBe(1)) // foi para o banco

    // "o outro processo": porta zerada, mesmo banco
    _reiniciarPorta()
    Object.assign(LIMITES, { gapMetodoMs: 0, gapChaveMs: 0, gapGlobalMs: 0 })
    _definirCoordenacao(banco.fonte)
    chamadas = []
    // o robô espera a leitura do banco antes de chamar: falha sem tocar a Omie
    await expect(comPrioridade('pesado', () => omie(NOVA, '/x/', 'ListarPedidos', {}, RAPIDO))).rejects.toBeInstanceOf(OmieBloqueioError)
    expect(chamadas).toHaveLength(0)
    expect(bloqueioRestanteMs('chave-nova', 'ListarPedidos')).toBeGreaterThan(500_000)
  })

  it('chamada que volta a dar certo desfaz o bloqueio no banco', async () => {
    const banco = bancoFalso()
    _definirCoordenacao(banco.fonte)
    respostas = [{ faultstring: 'API bloqueada por consumo indevido. Tente novamente em 60 segundos.' }]
    await expect(omie(NOVA, '/x/', 'ListarPedidos', {}, RAPIDO)).rejects.toBeInstanceOf(OmieBloqueioError)
    await vi.waitFor(() => expect(banco.bloqueios.size).toBe(1))
    const real = Date.now
    const relogio = vi.spyOn(Date, 'now').mockImplementation(() => real() + 120_000) // 2 min depois
    try {
      await omie(NOVA, '/x/', 'ListarPedidos', {}, RAPIDO) // o bloqueio venceu e a Omie respondeu
      await vi.waitFor(() => expect(banco.bloqueios.size).toBe(0))
    } finally {
      relogio.mockRestore()
    }
  })
})
