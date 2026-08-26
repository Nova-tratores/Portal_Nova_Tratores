# Cronograma — Gantt + Caminho Crítico (Plane × GanttProject)

Módulo de gestão de projetos com Gantt visual, dependências, bloqueio de tarefas,
caminho crítico, **replanejamento automático** e **calendários de recurso**,
incorporado ao sistema existente (Supabase + Railway).

Este pacote são **prompt-files para Claude Code**, executados em ordem, com um
gate de revisão no fim de cada fase. Não pule fases: cada uma assume que a
anterior foi revisada e aprovada.

---

## Decisões já travadas (não reabrir sem motivo)

1. **Mesmo projeto Supabase**, em um schema dedicado: `cronograma`.
2. **Modelo único**: obra interna e OS de máquina convivem na mesma estrutura,
   diferenciadas por `projetos.tipo` (`obra_interna` | `os_maquina`). O motor é
   100% reaproveitado entre os dois.
3. **Renderizador**: `SVAR React Gantt` (core MIT). Cuida da timeline, do desenho
   visual das dependências e do drag/resize. Sem custo, sem lock-in.
4. **Motor de agendamento**: módulo TypeScript **próprio** (não a versão PRO de
   nenhuma lib). Roda nos dois lados:
   - no **cliente** → preview otimista enquanto o usuário arrasta;
   - na **Edge Function** → recálculo autoritativo, grava as datas de volta.
5. **Verdade absoluta é sempre o servidor.** O cliente prevê; a Edge Function
   confirma; o Supabase Realtime reconcilia os demais usuários.
6. Stack do app: Next.js/React, Supabase (RLS + RPCs `SECURITY DEFINER`), Railway.

> Por que motor próprio? Caminho crítico, auto-scheduling e calendário de recurso
> são justamente os recursos que as libs cobram (SVAR PRO, DHTMLX PRO, Bryntum) ou
> não têm em modo servidor. E num sistema multiusuário o cronograma precisa ser
> recalculado de forma consistente no backend de qualquer jeito. Logo: lib só pra
> renderizar, lógica é nossa.

---

## Fluxo de uma alteração

```
Gantt SVAR (cliente)
   │  arrasta/edita → preview com Motor TS (otimista)
   ▼
RPC SECURITY DEFINER          valida, grava mutação, detecta ciclo
   ▼
Edge Function "recalcular"    roda o MESMO Motor TS (CPM + calendário)
   ▼
Tabelas (schema cronograma)   grava datas calculadas + folga + crítica
   ▼
Realtime → volta pro cliente  reconcilia o preview com a verdade
```

---

## Mapa do modelo de dados (resumo)

| Tabela | Papel |
|---|---|
| `projetos` | Um projeto = obra interna OU OS de máquina (`tipo`). Liga opcionalmente a uma OS/máquina externa. |
| `tarefas` | Nós do grafo. Duração em dias úteis, datas planejadas/reais/calculadas, hierarquia (`parent_id`), restrição, folga, `e_critica`. |
| `dependencias` | Arestas do grafo: predecessora → sucessora, `tipo` (FS/SS/FF/SF), `lag`. |
| `recursos` | Pessoa, equipe ou máquina. Cada um aponta para um calendário. |
| `calendarios` | Dias úteis da semana, horas/dia. É aqui que mora "o pintor só trabalha quarta". |
| `calendario_excecoes` | Feriados, folgas e dias extras pontuais. |
| `alocacoes` | tarefa ↔ recurso (com % de alocação). |
| `baselines` / `baseline_tarefas` | Snapshot do plano para comparar plano × real. |

ERD completo e DDL na Fase 0.

---

## Ordem de execução

| Fase | Arquivo | Entrega | Gate |
|---|---|---|---|
| 0 | `fase-0-schema.md` | Schema, tabelas, enums, RLS, seed | Migration aplica limpo, RLS testada |
| 1 | `fase-1-motor-agendamento.md` | Motor TS isolado + testes | Casos de teste de CPM/calendário passam |
| 2 | `fase-2-servidor-rpcs.md` | RPCs + Edge Function de recálculo | Mutação dispara recálculo correto |
| 3 | `fase-3-ui-gantt.md` | Gantt SVAR + preview + telas | Drag de dependência persiste e recalcula |
| 4 | `fase-4-recursos-calendarios.md` | Calendários, recursos, conflitos | "Só quartas" empurra tarefas corretamente |
| 5 | `fase-5-baseline-critico-polish.md` | Baseline, crítico visual, export | Caminho crítico destacado, plano×real |

---

## Convenções

- Tudo no schema `cronograma`. Nada vaza para `public` sem necessidade.
- RPCs com prefixo `cron_` e `SECURITY DEFINER`, sempre com checagem de
  acesso à org **dentro** da função.
- IDs `uuid` (`gen_random_uuid()`), timestamps `timestamptz`.
- Texto em pt-BR; código e identificadores conforme convenção do repo atual.
- O Motor TS (Fase 1) é publicado como pacote/local module compartilhado e
  importado tanto pelo front (Fase 3) quanto pela Edge Function (Fase 2).
