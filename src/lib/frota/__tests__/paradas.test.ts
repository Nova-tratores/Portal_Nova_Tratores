import { describe, it, expect } from 'vitest';
import { classificarParada, raioPropriedadeM, type Contexto, type ParadaBruta } from '../paradas';

// Loja da Nova Tratores (as constantes reais do rastreamento)
const LOJA = { lat: -23.2085, lng: -49.371 };

const ctxVazio: Contexto = { geocercas: [], visitas: [], abastecimentos: [] };
const geoLoja = {
  id: 'g-loja', latitude: LOJA.lat, longitude: LOJA.lng, raio_m: 200,
  classe: 'loja', nome: 'Nova Tratores',
};
const geoCliente = {
  id: 'g-cli', latitude: -23.30, longitude: -49.40, raio_m: 500,
  classe: 'cliente', nome: 'CLIENTE ANTIGONE', cliente_id: 'cnpj-1',
};

const parada = (over: Partial<ParadaBruta> = {}): ParadaBruta => ({
  lat: LOJA.lat, lng: LOJA.lng,
  inicio: '2026-07-01T13:00:00.000Z', // 10:00 em Brasília (quarta-feira)
  fim: '2026-07-01T13:30:00.000Z',
  duracao_min: 30,
  ...over,
});

describe('classificarParada', () => {
  it('dentro da geocerca da loja -> loja, não atípica', () => {
    const c = classificarParada(parada(), { ...ctxVazio, geocercas: [geoLoja, geoCliente] });
    expect(c.classe).toBe('loja');
    expect(c.atipica).toBe(false);
    expect(c.geocerca_id).toBe('g-loja');
  });

  it('na geocerca do cliente -> cliente, carrega o cliente_id', () => {
    const c = classificarParada(
      parada({ lat: -23.3001, lng: -49.4001 }),
      { ...ctxVazio, geocercas: [geoLoja, geoCliente] },
    );
    expect(c.classe).toBe('cliente');
    expect(c.cliente_id).toBe('cnpj-1');
  });

  it('longe de tudo mas perto de uma VISITA do dia -> absolvida', () => {
    const c = classificarParada(
      parada({ lat: -23.5, lng: -49.6 }),
      { ...ctxVazio, geocercas: [geoLoja], visitas: [{ lat: -23.505, lng: -49.605 }] },
    );
    expect(c.classe).toBe('visita');
    expect(c.atipica).toBe(false);
  });

  it('abastecimento da placa DENTRO da janela de horário -> absolvida', () => {
    const c = classificarParada(
      parada({ lat: -23.5, lng: -49.6 }),
      { ...ctxVazio, abastecimentos: [{ data_transacao: '2026-07-01T13:10:00.000Z' }] },
    );
    expect(c.classe).toBe('abastecimento');
  });

  it('abastecimento FORA da janela não absolve', () => {
    const c = classificarParada(
      parada({ lat: -23.5, lng: -49.6 }),
      { ...ctxVazio, abastecimentos: [{ data_transacao: '2026-07-01T16:00:00.000Z' }] },
    );
    expect(c.classe).toBe('fora_geocerca');
    expect(c.atipica).toBe(true);
  });

  it('ninguém absolveu -> atípica, com severidade por duração', () => {
    const curta = classificarParada(parada({ lat: -23.5, lng: -49.6, duracao_min: 8 }), ctxVazio);
    const media = classificarParada(parada({ lat: -23.5, lng: -49.6, duracao_min: 30 }), ctxVazio);
    const longa = classificarParada(parada({ lat: -23.5, lng: -49.6, duracao_min: 95 }), ctxVazio);
    expect(curta.nivel).toBe('baixa');
    expect(media.nivel).toBe('media');
    expect(longa.nivel).toBe('alta');
    expect(longa.atipica).toBe(true);
  });

  it('fora de horário (madrugada de Brasília) e fim de semana são sinalizados', () => {
    // 2026-07-05 é domingo; 04:00 Brasília = 07:00Z
    const c = classificarParada(
      parada({ lat: -23.5, lng: -49.6, inicio: '2026-07-05T07:00:00.000Z', fim: null }),
      ctxVazio,
    );
    expect(c.fora_horario).toBe(true);
    expect(c.fim_de_semana).toBe(true);
  });

  it('raio mínimo de 100m protege contra erro de GPS em geocerca pequena', () => {
    const geoMinuscula = { ...geoLoja, raio_m: 10 }; // 10m no cadastro
    // ~60m de distância do centro
    const c = classificarParada(
      parada({ lat: LOJA.lat + 0.0005, lng: LOJA.lng }),
      { ...ctxVazio, geocercas: [geoMinuscula] },
    );
    expect(c.classe).toBe('loja'); // absorvida pelo raio mínimo
  });

  it('propriedade de cliente do portal absolve como cliente_portal e SEM geocerca_id', () => {
    const propriedade = {
      id: 'cli-78920', latitude: -23.3985, longitude: -49.7452, raio_m: 800,
      classe: 'cliente', nome: 'Faz 3 S', cliente_id: 'cli-78920',
      origem: 'propriedade' as const,
    };
    const c = classificarParada(
      parada({ lat: -23.3990, lng: -49.7455 }),
      { ...ctxVazio, geocercas: [propriedade] },
    );
    expect(c.classe).toBe('cliente_portal');
    expect(c.atipica).toBe(false);
    expect(c.geocerca_id).toBeNull(); // FK aponta pra frota_geocercas — propriedade não entra
    expect(c.destino_nome).toBe('Faz 3 S');
    expect(c.cliente_id).toBe('cli-78920');
  });
});

describe('raioPropriedadeM', () => {
  it('deriva o raio da área (círculo equivalente + 20%)', () => {
    // 100 ha = 1 km² -> r = 564m * 1.2 ≈ 677m
    expect(raioPropriedadeM(100)).toBe(677);
  });
  it('sem área -> 500m; piso 300m; teto 3km', () => {
    expect(raioPropriedadeM(null)).toBe(500);
    expect(raioPropriedadeM(0)).toBe(500);
    expect(raioPropriedadeM(1)).toBe(300);     // 1 ha -> 68m, sobe pro piso
    expect(raioPropriedadeM(10_000)).toBe(3000); // 10 mil ha, capado
  });
});
