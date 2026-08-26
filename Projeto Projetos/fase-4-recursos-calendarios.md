# Fase 4 — Recursos, calendários e conflitos

**Objetivo:** dar ao usuário controle sobre disponibilidade. É aqui que a regra
"o pintor só trabalha quarta" vira algo configurável na tela, e onde o sistema
**avisa** quando um recurso está sobrecarregado.

**Pré-requisitos:** Fases 0–3 aprovadas. O motor já respeita calendário de recurso
(Fase 1); aqui construímos a UI e a detecção de conflito.

---

## Telas

### 1. Calendários
CRUD de `cronograma.calendarios`:
- Seleção dos dias úteis da semana (chips seg–dom). "Só quartas" = só o chip
  quarta marcado.
- Horas por dia.
- Exceções (`calendario_excecoes`): adicionar feriados (`folga`) e dias extras
  (`extra`) num mini-calendário.

> Ao salvar um calendário usado por recursos de projetos ativos, disparar o
> recálculo desses projetos (a disponibilidade mudou).

### 2. Recursos
CRUD de `cronograma.recursos`: nome, tipo (pessoa/equipe/máquina), calendário
vinculado, `ref_externa` (liga a funcionário/máquina do sistema atual quando fizer
sentido).

### 3. Alocação
Na tarefa (drawer da Fase 3), permitir alocar 1+ recursos com `percentual`. O
recurso principal define o calendário usado pelo motor; alocações adicionais
contam para a detecção de conflito.

---

## Detecção de conflito (NÃO auto-nivelamento)

Calcular e exibir, **sem alterar datas automaticamente**:
- Para cada recurso, varrer as tarefas calculadas que se sobrepõem no tempo.
- Se a soma de `percentual` num mesmo dia útil passar de 100% → marcar conflito.
- Mostrar numa visão "carga por recurso" (lista ou faixa por dia) destacando os
  dias em vermelho, e um aviso na tarefa envolvida.

> Resolver o conflito (mover tarefa, trocar recurso, dividir) é decisão do usuário.
> Auto-nivelamento fica como evolução futura — deixe um TODO claro no código.

---

## Interação com o motor
Nada muda no contrato do Motor TS. Esta fase só:
- alimenta o motor com calendários/exceções corretos (já suportado);
- roda uma função separada `detectarConflitos(saidaMotor, alocacoes)` no cliente
  e/ou na Edge Function para a visão de carga.

---

## Gate de revisão — Fase 4

- [ ] Criar calendário "só quartas" e vinculá-lo ao recurso pintor.
- [ ] Tarefa de 3 dias do pintor termina três quartas depois (caso real de ponta
      a ponta, agora pela UI).
- [ ] Adicionar um feriado empurra as tarefas que o cruzam.
- [ ] Salvar calendário recalcula os projetos afetados.
- [ ] Dois trabalhos no mesmo recurso/dia acima de 100% aparecem como conflito —
      sem mover nada sozinho.

**Pare aqui e peça revisão antes da Fase 5.**
