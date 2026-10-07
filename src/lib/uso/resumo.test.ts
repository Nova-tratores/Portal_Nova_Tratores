import { describe, it, expect } from 'vitest';
import { resumirUso } from './resumo';

const agora = new Date('2026-10-07T15:00:00Z');
const usuarios = [
  { id: 'u1', nome: 'Henri Irneh', funcao: 'Pós-Vendas', ativo: true },
  { id: 'u2', nome: 'Larissa Garcia', funcao: 'Peças', ativo: true },
  { id: 'u3', nome: 'Sem Uso', funcao: 'Comercial', ativo: true },
];

describe('resumirUso', () => {
  const r = resumirUso({
    de: '2026-10-05', ate: '2026-10-07', agora, usuarios, incluirSemUso: true,
    paginas: [
      { user_id: 'u1', rota: '/pos', dia: '2026-10-06', acessos: 5, ultimo_em: '2026-10-06T12:00:00Z' },
      { user_id: 'u1', rota: '/estoque/notas-entrada', dia: '2026-10-07', acessos: 2, ultimo_em: '2026-10-07T14:58:00Z' },
      { user_id: 'u2', rota: '/pos', dia: '2026-10-07', acessos: 1, ultimo_em: '2026-10-07T09:00:00Z' },
    ],
    api: [
      { user_id: 'u1', rota: '/api/pos/ordens', dia: '2026-10-07', chamadas: 10, ultimo_em: '2026-10-07T14:58:00Z' },
      { user_id: 'u1', rota: '/api/notificacoes', dia: '2026-10-07', chamadas: 400, ultimo_em: '2026-10-07T14:58:00Z' },
    ],
    presenca: [
      { user_id: 'u1', rota: '/estoque/notas-entrada', ultimo_em: '2026-10-07T14:58:00Z' },
      { user_id: 'u2', rota: '/pos', ultimo_em: '2026-10-07T09:00:00Z' },
    ],
  });

  it('totais e ranking por usuário', () => {
    expect(r.totais).toEqual({ acessos: 8, usuarios: 2, paginas: 2, chamadasApi: 10, chamadasAuto: 400 });
    expect(r.porUsuario.map((u) => u.nome)).toEqual(['Henri Irneh', 'Larissa Garcia', 'Sem Uso']);
    const h = r.porUsuario[0];
    expect(h.acessos).toBe(7); expect(h.paginas).toBe(2); expect(h.diasAtivos).toBe(2);
    expect(h.chamadasApi).toBe(10); expect(h.chamadasAuto).toBe(400);
    expect(h.rotaTop).toBe('/pos'); expect(h.inativoHaDias).toBe(0);
  });
  it('usuário ativo sem uso aparece com zero e sem último acesso', () => {
    const s = r.porUsuario.find((u) => u.user_id === 'u3')!;
    expect(s.acessos).toBe(0); expect(s.ultimoAcesso).toBeNull(); expect(s.inativoHaDias).toBeNull();
  });
  it('por página / módulo / dia', () => {
    expect(r.porPagina[0]).toMatchObject({ rota: '/pos', acessos: 6, usuarios: 2, modulo: 'pos' });
    expect(r.porModulo.map((m) => m.modulo)).toEqual(['pos', 'estoque']);
    expect(r.porDia.map((d) => d.acessos)).toEqual([0, 5, 3]);
  });
  it('API separa automáticas e online usa 5 min', () => {
    expect(r.apiPorRota[0]).toMatchObject({ rota: '/api/notificacoes', automatica: true });
    expect(r.online.map((o) => o.nome)).toEqual(['Henri Irneh']);
    expect(r.online[0].minutos).toBe(2);
  });
});
