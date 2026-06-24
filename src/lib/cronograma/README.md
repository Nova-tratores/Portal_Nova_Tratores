# Módulo Cronograma (Gantt + Caminho Crítico)

Gestão de projetos com Gantt visual, dependências, **caminho crítico (CPM)**,
replanejamento automático e **calendários de recurso** ("o pintor só trabalha
quarta"). Um projeto = obra interna **ou** OS de máquina (`projetos.tipo`), com o
**mesmo motor** nos dois domínios.

Plano completo: `Projeto Projetos/` (00-README + fase-0..5) e
`~/.claude/plans/merry-baking-sparrow.md`.

## Arquitetura (decisões)

- **Banco:** schema dedicado `cronograma` (não `public`). Acesso **global** —
  qualquer usuário autenticado lê/escreve (RLS `auth.role() = 'authenticated'`); o
  gate por usuário é na UI via `portal_permissoes` (módulo `'cronograma'`).
- **Recálculo autoritativo:** Next.js **API Route** `/api/cronograma/recalcular`
  (não Edge Function), reusando o **mesmo** motor TS deste diretório.
- **Motor:** `src/lib/cronograma/motor/` — TS puro, sem React/Supabase/Node. Roda no
  cliente (preview otimista) e no servidor (autoritativo). Coberto por Vitest.
- **Verdade é o servidor:** o cliente prevê com o motor; a API Route grava `*_calc`;
  o Realtime reconcilia os demais usuários.

## ⚠️ Passo manual obrigatório (uma vez)

O projeto só expunha o schema `public` ao Data API. Para o PostgREST/supabase-js
enxergar o schema `cronograma`:

1. Rodar `sql/create-cronograma.sql` (cria schema, tabelas, RLS, **grants** e seed).
2. **Supabase ▸ Settings ▸ API ▸ Exposed schemas** → adicionar `cronograma`
   (ou env `PGRST_DB_SCHEMAS=public,storage,cronograma`).
3. No front, acessar via `supabase.schema('cronograma').from('tarefas')` /
   `.schema('cronograma').rpc('cron_...')`.

Sem o passo 2 o front recebe 404/"schema must be one of the following".

Rollback: `sql/drop-cronograma.sql` (`drop schema cronograma cascade`).

## Motor — contrato

```ts
import { calcular } from '@/lib/cronograma/motor';
const saida = calcular(entrada); // EntradaMotor → SaidaMotor
// saida.tarefas[]: { id, inicioCalc, fimCalc, folgaDias, eCritica }
// saida.fimProjeto, saida.erros[] ('ciclo' | 'restricao_violada')
```

- Datas são strings ISO `YYYY-MM-DD` (dias úteis; sem hora/fuso, tudo UTC).
- Convenção **inclusiva**: tarefa de 1 dia começa e termina no mesmo dia; FS lag 0 →
  sucessora começa no próximo dia útil.
- Calendário aplicável: o do recurso da tarefa (`recursoId → calendarioId`); se não
  houver, o calendário padrão do projeto.
- Em ciclo, `erros` traz os ids e `tarefas` volta vazio (o chamador **não** grava).

Testes: `npm test` (`src/lib/cronograma/motor/__tests__/`).

## Status de implementação

- [x] **Fase 0** — schema, RLS, grants, seed (`sql/create-cronograma.sql`).
      Reuso do módulo `/tarefas`: `recursos.ref_externa → financeiro_usu.id`
      (pessoas), e colunas `descricao`/`prioridade` em `cronograma.tarefas`.
- [x] **Fase 1** — motor TS + testes (8 casos obrigatórios verdes).
- [x] **Fase 2** — RPCs `cron_*` (`sql/create-cronograma-rpcs.sql`) +
      API Route `/api/cronograma/recalcular` + `supabase-server.ts`.
      ✅ Verificado end-to-end: schema exposto (`pgrst.db_schemas` inclui
      `cronograma`), projeto linear A→B→C recalculado pelo endpoint e
      `inicio_calc/fim_calc/e_critica` + `data_fim_calc` gravados no banco.
- [x] **Fase 3 (código)** — UI Gantt com **frappe-gantt (MIT)**, não SVAR
      (SVAR era GPLv3). Rota `/cronograma` (lista + criar) e `/cronograma/[id]`
      (timeline). `queries.ts`, `adaptador.ts` (`paraFrappe`/`montarEntradaMotor`),
      `GanttView`, `TarefaDrawer`, item de menu (grupo Serviços). Preview otimista
      com o motor + recálculo via API Route. CSS vendorizado.
      ⚠️ Realtime `postgres_changes` em schema não-`public` derrubava a conexão
      Realtime compartilhada (quebrava o chat) → removido; frescor via reload pós-
      mutação + `useRefreshOnFocus`. Live multiusuário fica p/ Broadcast/client dedicado.
      Falta: confirmar fluxo logado no browser; tema dark do Gantt; permissão
      `cronograma` em `portal_permissoes` para não-admins.
- [x] **Fase 4 (código)** — telas de **Calendários** (chips dias-semana, horas,
      exceções) e **Recursos** (pessoa/equipe/máquina + calendário + vínculo a
      `financeiro_usu`), sub-nav no módulo, **alocações** no drawer, e **detecção
      de conflito** (`conflitos.ts` + painel + contorno laranja nas barras).
      Salvar calendário recalcula projetos afetados. Testes: 4 casos de conflito.
      Falta: validar logado (só-quartas ponta-a-ponta, feriado empurra, >100%).
- [x] **Fase 5 (código)** — baseline (`sql/create-cronograma-baseline.sql`:
      `cron_salvar_baseline`/`cron_remover_baseline`), painel **Análise**
      (`AnalisePanel`): caminho crítico, desvio vs baseline, curva plano×real
      (Recharts), export CSV/JSON; **excluir tarefa** no drawer. Crítico já em
      vermelho nas barras. Falta: aplicar SQL + validar logado.
- [x] **Fase 6 (código)** — recorrência de manutenção
      (`sql/create-cronograma-recorrencia.sql`: tabela `recorrencias` +
      `tarefas.recorrencia_id/ocorrencia_seq` + `cron_gerar_ocorrencias`),
      painel `RecorrenciasPanel` (intervalo/horímetro → gera ocorrências,
      idempotente). Horímetro usa média h/dia (ideia de revisoes/utils).
      Falta: aplicar SQL (+ `notify pgrst, 'reload schema'`) + validar logado.
