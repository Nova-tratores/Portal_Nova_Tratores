import { describe, it, expect } from 'vitest';
import { migrationFaltou } from '../erros';

describe('migrationFaltou', () => {
  it('reconhece tabela inexistente', () => {
    expect(migrationFaltou({ code: '42P01', message: 'relation "mkt_x" does not exist' })).toBe(true);
    expect(migrationFaltou({ code: 'PGRST205', message: 'Could not find the table' })).toBe(true);
  });

  it('reconhece coluna inexistente', () => {
    expect(migrationFaltou({ code: '42703', message: 'column "foo" does not exist' })).toBe(true);
    expect(migrationFaltou({ code: 'PGRST204', message: "Could not find the 'foo' column of 'mkt_midias' in the schema cache" })).toBe(true);
  });

  // O bug que motivou este arquivo: a pessoa tentou anexar uma imagem, o insert
  // bateu num NOT NULL, e a tela mandou ela rodar uma migration já aplicada.
  it('NÃO confunde violação de not-null com tabela ausente', () => {
    const naoNulo = {
      code: '23502',
      message: 'null value in column "ordem" of relation "mkt_midias" violates not-null constraint',
    };
    expect(migrationFaltou(naoNulo)).toBe(false);
  });

  it('NÃO confunde os outros erros de dado com migration', () => {
    expect(migrationFaltou({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false);
    expect(migrationFaltou({ code: '23503', message: 'insert on table "x" violates foreign key constraint' })).toBe(false);
    expect(migrationFaltou({ code: '23514', message: 'new row for relation "mkt_custos" violates check constraint' })).toBe(false);
  });

  it('aguenta entrada esquisita sem lançar', () => {
    expect(migrationFaltou(null)).toBe(false);
    expect(migrationFaltou(undefined)).toBe(false);
    expect(migrationFaltou('texto solto')).toBe(false);
    expect(migrationFaltou(new Error('falha de rede'))).toBe(false);
  });
});
