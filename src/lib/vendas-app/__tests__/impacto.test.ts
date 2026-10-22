// Impacto real: serviço do Pós-Vendas concluído para cliente depois da visita.
import { describe, it, expect } from 'vitest';
import { impactoDoVendedor, valorBR } from '../impacto';

describe('impacto do vendedor', () => {
  const clientes = [{ id: 1, nome: 'Antônio', documento: '123.456.789-01' }, { id: 2, nome: 'Sem doc', documento: '' }];
  const visitas = [{ propriedade_id: 1, data_visita: '2026-09-10T10:00:00Z' }, { propriedade_id: 2, data_visita: '2026-09-10T10:00:00Z' }];
  const os = (id: string, data: string, status = 'Concluída', valor = '1800') => ({
    Id_Ordem: id, Cnpj_Cliente: '12345678901', Status: status, Valor_Total: valor, Data: data, Tipo_Servico: 'Revisão', Revisao: '300h',
  });

  it('conta só OS concluída depois da primeira visita', () => {
    const r = impactoDoVendedor(visitas, clientes, [
      os('OS-1', '2026-10-01'),
      os('OS-2', '2026-09-01'), // antes da visita
      os('OS-3', '2026-10-05', 'Cancelada'),
      os('OS-4', '2026-10-06', 'Cobrando Cliente', '1.250,50'),
    ]);
    expect(r.itens.map((x) => x.os)).toEqual(['OS-4', 'OS-1']);
    expect(r.total).toBe(3050.5);
    expect(r.clientes).toBe(1);
    expect(r.itens[1].servico).toBe('Revisão · revisão 300h');
  });

  it('lê valor em formato brasileiro e americano', () => {
    expect(valorBR('1.234,56')).toBe(1234.56);
    expect(valorBR('1234.56')).toBe(1234.56);
    expect(valorBR('')).toBe(0);
  });
});
