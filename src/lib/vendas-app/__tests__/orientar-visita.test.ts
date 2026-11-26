import { describe, expect, it } from 'vitest';
import { esquemaOrientacao, limparOrientacao, montarEntrada, validarVisita } from '../orientar-visita';
import { dentroDoLimite } from '../orientar-visita-server';

describe('orientar-visita', () => {
  it('valida o pedido', () => {
    expect(validarVisita(null)).toBeTruthy();
    expect(validarVisita({ resumo: 'oi' })).toMatch(/resumo/);
    expect(validarVisita({ resumo: 'Conversei com o dono sobre a trincha' })).toBeNull();
  });

  it('entrada leva o que já foi preenchido e a visita marcada como dado', () => {
    const e = montarEntrada({
      resumo: 'Conversei com dona Tereza. Vamos conversar.', proximosPassos: 'Sem retorno: ,', tipo: 'presencial',
      cliente: 'Sítio Boa Vista', cidade: 'Fartura', pessoas: [{ nome: 'Tereza', cargo: 'PROPRIETARIO' }],
      culturas: [], maquinas: [], negocio: null, nota: 45, faltam: ['cultura', 'máquina', 'retorno'],
    });
    expect(e).toContain('Pessoas marcadas na visita: Tereza (PROPRIETARIO)');
    expect(e).toContain('Culturas cadastradas da propriedade: nenhuma');
    expect(e).toContain('Nota do app: 45% — falta: cultura, máquina, retorno');
    expect(e).toMatch(/<visita>[\s\S]*Vamos conversar[\s\S]*<\/visita>/);
  });

  it('esquema fecha os campos', () => {
    expect((esquemaOrientacao() as any).properties.dicas.items.properties.campo.enum).toContain('proximos_passos');
  });

  it('limpa: campo desconhecido vira resumo, repetida e curta saem, máximo 4', () => {
    const r = limparOrientacao({
      comentario: ' Bom começo, faltou o principal: o que ele planta. ',
      dicas: [
        { campo: 'culturas', dica: 'O resumo não diz o que ele planta.', pergunta: 'Quantos hectares de goiaba?' },
        { campo: 'xpto', dica: 'Conte qual trator ele usa hoje.', pergunta: 'Qual trator e de que ano?' },
        { campo: 'culturas', dica: 'o resumo não diz o que ele planta.', pergunta: '' },
        { campo: 'retorno', dica: 'curta', pergunta: '' },
        { campo: 'proximos_passos', dica: '"Vamos conversar" não diz o que fazer.', pergunta: 'O que você vai mandar e até quando?' },
        { campo: 'retorno', dica: 'Marque a data em que ele pediu para voltar.', pergunta: '' },
        { campo: 'negocio', dica: 'Ele pediu orçamento: abra o negócio.', pergunta: '' },
      ],
    });
    expect(r.comentario).toBe('Bom começo, faltou o principal: o que ele planta.');
    expect(r.dicas.map((d) => d.campo)).toEqual(['culturas', 'resumo', 'proximos_passos', 'retorno']);
    expect(limparOrientacao('lixo')).toEqual({ comentario: '', dicas: [] });
  });

  it('freio por pessoa', () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(dentroDoLimite('y', t + i, 3)).toBe(true);
    expect(dentroDoLimite('y', t + 10, 3)).toBe(false);
  });
});
