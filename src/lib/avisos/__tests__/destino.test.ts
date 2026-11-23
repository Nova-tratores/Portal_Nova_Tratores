import { describe, it, expect } from 'vitest';
import {
  lerDestino, montarDestino, rotuloDestino, vaiParaMecanicos,
  gestoresDoSetor, destinatarios, setoresQueGere, podeVerAviso, type PermUsuario, type LinhaOrg,
} from '../destino';

// Organograma de exemplo: Zé gere Ana (Peças); Lari (Pós) gere Téc; Dou (Comercial) gere Lari e Zé.
const perms: PermUsuario[] = [
  { user_id: 'ze', categoria: 'Peças' },
  { user_id: 'ana', categoria: 'Peças' },
  { user_id: 'lari', categoria: 'Pós Vendas' },
  { user_id: 'tec', categoria: 'Pós Vendas', mecanico_role: 'tecnico' },
  { user_id: 'dou', categoria: 'Comercial' },
  { user_id: 'fin', categoria: 'Financeiro' },
];
const org: LinhaOrg[] = [
  { pessoa_chave: 'u:ana', gestor_chave: 'u:ze' },
  { pessoa_chave: 'u:tec', gestor_chave: 'u:lari' },
  { pessoa_chave: 'u:lari', gestor_chave: 'u:dou' },
  { pessoa_chave: 'u:ze', gestor_chave: 'u:dou' },
  { pessoa_chave: 'u:fin', gestor_chave: 'u:dou' },
  { pessoa_chave: 'rh:x', gestor_chave: 'u:fin', fora: true },
];

describe('destino dos avisos', () => {
  it('lê e monta o texto gravado', () => {
    expect(lerDestino('Peças')).toEqual({ setor: 'Peças', soGestor: false });
    expect(lerDestino('gestores')).toEqual({ setor: 'todos', soGestor: true });
    expect(lerDestino('gestores:Pós Vendas')).toEqual({ setor: 'Pós Vendas', soGestor: true });
    expect(lerDestino(null)).toEqual({ setor: 'todos', soGestor: false });
    expect(montarDestino('todos', true)).toBe('gestores');
    expect(montarDestino('Peças', true)).toBe('gestores:Peças');
    expect(montarDestino('Peças', false)).toBe('Peças');
    expect(rotuloDestino('gestores')).toBe('Gestores de cada departamento');
    expect(rotuloDestino('gestores:Pós Vendas')).toBe('Gestor de Pós-Vendas');
  });

  it('só gestor nunca vai para o app dos mecânicos', () => {
    expect(vaiParaMecanicos('todos')).toBe(true);
    expect(vaiParaMecanicos('tecnicos')).toBe(true);
    expect(vaiParaMecanicos('gestores')).toBe(false);
    expect(vaiParaMecanicos('gestores:tecnicos')).toBe(false);
  });

  it('gestor do setor = quem é do setor e gere alguém; senão o chefe das pessoas do setor', () => {
    expect(gestoresDoSetor('Peças', perms, org)).toEqual(['ze']);
    expect(gestoresDoSetor('Pós Vendas', perms, org)).toEqual(['lari']);
    expect(gestoresDoSetor('Comercial', perms, org)).toEqual(['dou']);
    // Financeiro: a fin só gere alguém "fora" do organograma → vale o chefe dela
    expect(gestoresDoSetor('Financeiro', perms, org)).toEqual(['dou']);
    expect(gestoresDoSetor('tecnicos', perms, org)).toEqual(['lari']);
    expect(gestoresDoSetor('T.I.', perms, org)).toEqual([]);
  });

  it('destinatários', () => {
    expect(destinatarios('gestores', perms, org).sort()).toEqual(['dou', 'lari', 'ze']);
    expect(destinatarios('gestores:Peças', perms, org)).toEqual(['ze']);
    expect(destinatarios('Peças', perms, org).sort()).toEqual(['ana', 'ze']);
    expect(destinatarios('tecnicos', perms, org)).toEqual(['tec']);
  });

  it('quem vê', () => {
    const base = { isAdmin: false, categoria: 'Peças', mecanicoRole: null };
    const ze = { ...base, userId: 'ze', setoresQueGere: setoresQueGere('ze', perms, org) };
    const ana = { ...base, userId: 'ana', setoresQueGere: setoresQueGere('ana', perms, org) };
    expect(ze.setoresQueGere).toEqual(['Peças']);
    expect(podeVerAviso({ destino: 'gestores' }, ze)).toBe(true);
    expect(podeVerAviso({ destino: 'gestores:Peças' }, ze)).toBe(true);
    expect(podeVerAviso({ destino: 'gestores:Comercial' }, ze)).toBe(false);
    expect(podeVerAviso({ destino: 'gestores' }, ana)).toBe(false);
    expect(podeVerAviso({ destino: 'gestores', criado_por: 'ana' }, ana)).toBe(true);
    expect(podeVerAviso({ destino: 'Peças' }, ana)).toBe(true);
    expect(podeVerAviso({ destino: 'Comercial' }, ana)).toBe(false);
    expect(podeVerAviso({ destino: 'gestores' }, { ...ana, isAdmin: true })).toBe(true);
  });
});
