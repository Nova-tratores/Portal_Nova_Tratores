# Fase 3 — UI Gantt (SVAR + preview otimista)

**Objetivo:** a tela. Renderizar a timeline com `SVAR React Gantt` (core MIT),
permitir arrastar para criar dependências, e dar **preview instantâneo** usando o
mesmo Motor TS da Fase 1 enquanto a Edge Function confirma no fundo.

**Pré-requisitos:** Fases 0–2 aprovadas.

---

## Setup

1. Instalar `wx-react-gantt` (SVAR React Gantt, core MIT). Confirmar compat. com a
   versão de React do app e o setup SSR do Next.js usado no repo.
2. Importar o Motor TS (`packages/motor-cronograma`) no front.
3. Tema: aplicar o dark theme do app (charcoal quente já usado no showroom). Usar
   as CSS vars do SVAR para casar cores; não deixar o tema default.

## Mapeamento de dados

Escrever um adaptador `paraSvar(tarefas, dependencias)` e o inverso:

- `tarefas` → tasks do SVAR: `{ id, text: nome, start: inicio_calc, end: fim_calc,
  progress: progresso/100, type: tarefa|marco|resumo, parent: parent_id }`.
- `dependencias` → links do SVAR: `{ source: predecessora, target: sucessora,
  type: FS|SS|FF|SF }`.
- Barras com `e_critica=true` recebem destaque (cor/again na Fase 5; aqui só marcar).

## Interações → servidor

| Ação no Gantt | Chamada |
|---|---|
| Arrastar de uma barra a outra (criar link) | `cron_criar_dependencia` |
| Remover link | `cron_remover_dependencia` |
| Editar duração / mover barra | `cron_atualizar_tarefa` |
| Editar progresso / concluir | `cron_registrar_progresso` |
| Criar/editar tarefa (drawer) | `cron_criar_tarefa` / `cron_atualizar_tarefa` |

## Preview otimista (o detalhe que faz parecer rápido)

Ao arrastar/editar, **antes** de chamar a RPC:
1. Montar `EntradaMotor` com o estado local + a mudança.
2. Rodar `calcular()` no cliente e atualizar as barras na hora (preview).
3. Disparar a RPC + Edge Function.
4. Quando o Realtime devolver a verdade, reconciliar: se divergir do preview,
   animar para as datas oficiais (a verdade é sempre o servidor).
5. Se a RPC falhar (ex.: ciclo), reverter o preview e mostrar o erro.

## Telas (mínimo)

1. **Lista de projetos** — filtro por `tipo` (obra interna / OS de máquina) e status.
2. **Timeline (Gantt)** — a tela principal. Toolbar com zoom (dia/semana/mês),
   toggle "mostrar caminho crítico" (visual completo na Fase 5).
3. **Drawer de tarefa** — nome, duração, recurso, restrição, predecessoras,
   progresso, datas reais. Mostra a folga e se é crítica (read-only, vêm do motor).

## Acessibilidade / mobile
O app é usado também no celular. Garantir que a lista e o drawer funcionem em tela
estreita; o Gantt em si pode exigir scroll horizontal (ok) mas a edição via drawer
deve ser totalmente utilizável no mobile.

---

## Gate de revisão — Fase 3

- [ ] Timeline renderiza tarefas e dependências reais do projeto.
- [ ] Arrastar para criar dependência persiste via RPC e dispara recálculo.
- [ ] Preview otimista move as barras na hora; Realtime reconcilia depois.
- [ ] Tentar criar dependência cíclica mostra erro e reverte o preview.
- [ ] Drawer de tarefa cria/edita e o Gantt reflete após o recálculo.
- [ ] Tema dark do app aplicado (não o default do SVAR).

**Pare aqui e peça revisão antes da Fase 4.**
