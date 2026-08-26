# Fase 2 — Camada servidor (RPCs + Edge Function de recálculo)

**Objetivo:** as mutações passam por RPCs `SECURITY DEFINER` (com checagem de org
dentro), e o recálculo autoritativo roda numa Edge Function que **importa o Motor
TS da Fase 1**. O cliente nunca grava `*_calc` diretamente.

**Pré-requisitos:** Fases 0 e 1 aprovadas.

---

## Parte A — RPCs de mutação (no schema `cronograma`)

Todas com `security definer`, `set search_path = cronograma, public`, e a primeira
linha checando `cronograma.tem_acesso_org(...)` (senão `raise exception`).

- `cron_criar_projeto(p_org, p_nome, p_tipo, p_data_inicio, p_calendario_id, p_os_ref)`
- `cron_criar_tarefa(p_projeto_id, p_nome, p_duracao, p_recurso_id, p_parent_id, p_restricao, p_restricao_data)`
- `cron_atualizar_tarefa(p_tarefa_id, ...campos editáveis...)`
  - Editáveis: `nome, duracao_dias, recurso_id, restricao, restricao_data, ordem, parent_id`.
  - **Nunca** aceitar `*_calc`, `folga_dias`, `e_critica` como entrada.
- `cron_criar_dependencia(p_projeto_id, p_predecessora, p_sucessora, p_tipo, p_lag)`
  - **Antes de inserir, rejeitar se criar ciclo.** Faça a verificação em SQL com
    um CTE recursivo: a partir de `p_sucessora`, se alcançar `p_predecessora`,
    a aresta fecharia um ciclo → `raise exception`.
- `cron_remover_dependencia(p_id)`
- `cron_registrar_progresso(p_tarefa_id, p_progresso, p_inicio_real, p_fim_real)`
  - **Lógica de bloqueio (estilo Plane):** uma tarefa só pode ir para
    `em_andamento`/`concluida` se todas as predecessoras com `tipo='FS'`
    estiverem concluídas. Senão, o status vira/permanece `bloqueada` e a função
    retorna um aviso. Recalcular o status de bloqueio das sucessoras também.

Exemplo do CTE anti-ciclo:

```sql
-- dentro de cron_criar_dependencia, antes do insert:
if exists (
  with recursive alcanca as (
    select sucessora_id as nodo from cronograma.dependencias
      where predecessora_id = p_sucessora and projeto_id = p_projeto_id
    union
    select d.sucessora_id from cronograma.dependencias d
      join alcanca a on d.predecessora_id = a.nodo
      where d.projeto_id = p_projeto_id
  )
  select 1 from alcanca where nodo = p_predecessora
) then
  raise exception 'Dependência criaria um ciclo';
end if;
```

---

## Parte B — Edge Function `recalcular-cronograma`

Deno + TypeScript, importa o Motor TS da Fase 1 (mesmo código que o front usa).

Fluxo:
1. Recebe `{ projetoId }`. Autentica (service role internamente, mas valida que o
   chamador tem acesso à org do projeto).
2. Carrega do banco: tarefas, dependências, recursos, calendários + exceções do
   projeto. Monta o `EntradaMotor`.
3. Chama `calcular(entrada)`.
4. Se `erros` contém `ciclo` → não grava datas; retorna os erros.
5. Senão, numa única transação, faz `update` em `cronograma.tarefas` gravando
   `inicio_calc, fim_calc, folga_dias, e_critica`, e em `projetos.data_fim_calc`.
6. Retorna a `SaidaMotor` (o cliente usa para reconciliar o preview).

> **Como disparar o recálculo:** após cada RPC de mutação bem-sucedida, o cliente
> chama a Edge Function. Alternativa mais robusta (recomendada para projetos
> grandes ou sync via Omie): a RPC emite `pg_notify('recalcular', projeto_id)` e um
> worker no Railway escuta e chama a função — assim o recálculo é garantido mesmo
> sem o cliente. Comece pelo disparo direto; deixe o worker como Fase 2.5 se a
> carga justificar.

---

## Realtime
Habilitar Realtime nas tabelas `tarefas`, `dependencias` e `projetos` (filtrado por
projeto) para o cliente reconciliar quando o recálculo terminar.

---

## Gate de revisão — Fase 2

- [ ] Toda RPC checa acesso à org antes de qualquer escrita.
- [ ] Criar dependência que fecharia ciclo é rejeitada com mensagem clara.
- [ ] `cron_registrar_progresso` respeita o bloqueio por predecessora FS.
- [ ] A Edge Function importa **o mesmo** Motor TS da Fase 1 (sem duplicar lógica).
- [ ] Alterar a duração de uma tarefa → Edge Function recalcula → datas das
      sucessoras mudam no banco.
- [ ] `*_calc` nunca é gravado por caminho que não seja o recálculo autoritativo.

**Pare aqui e peça revisão antes da Fase 3.**
