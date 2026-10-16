# Worker de robôs no Railway (serviço separado) — guia de criação

Objetivo: tirar os robôs (agendador interno, syncs, vigias) do processo que atende
o portal, para que **deploy de tela não mate sync** e para que o horário dos
robôs não dependa do GitHub Actions.

Medido em 15/10/2026: 52 deploys no dia, 17 rodadas de robô interrompidas,
~20 crons diários do GitHub não dispararam.

## Como funciona

- Mesmo repositório, mesma imagem (Nixpacks, `npm start`). O que muda é a
  variável **`PAPEL`**, lida em `src/instrumentation.ts`:
  - `tudo` (padrão, sem a variável): web + robôs no mesmo processo — é o estado
    atual, nada muda enquanto você não criar o worker;
  - `web`: só atende requisições. Nenhum agendador ou `setInterval` de robô sobe,
    nem a limpeza de rodadas órfãs (que marcaria as rodadas do worker como
    "interrompida" a cada deploy do web);
  - `worker`: só robôs. Roda `next start` normal numa porta própria, porque as
    tarefas `rota-interna` do agendador chamam `http://127.0.0.1:PORT/api/...`.
- Os flushes do monitor de uso e da sombra de permissões rodam nos dois: o buffer
  vive no processo que recebeu a requisição.
- O worker **não precisa de domínio público**. Ninguém acessa ele de fora.

## Passo a passo (painel do Railway)

Pré-requisito: o commit com o gate `PAPEL` já em produção (ver `CLAUDE.md`,
"Variáveis de ambiente"). Sem ele, o serviço novo rodaria os robôs em dobro.

1. **Projeto → "+ New" → "GitHub Repo"** → escolher `Nova-tratores/Portal_Nova_Tratores`,
   branch `main`. Nome sugerido: `portal-worker`.
2. **Variables**: copiar TODAS as variáveis do serviço web (há o botão "Raw Editor"
   nos dois lados: copiar de um, colar no outro). Depois acrescentar/ajustar:
   - `PAPEL=worker`
   - `PORT=3001` (qualquer porta livre; só é usada internamente)
   - manter `NODE_ENV=production` (o Nixpacks já define) — os robôs só sobem em produção.
   Não precisa de `RAILWAY_PUBLIC_DOMAIN`; não gerar domínio para este serviço.
3. **Settings → Deploy**:
   - Start command: deixar o padrão (`npm start`).
   - **Healthcheck path**: `/login` (ou vazio). Timeout 300 s.
   - **Restart policy**: On failure.
   - **Replicas**: 1 (robôs não podem escalar; `instrumentation.ts` avisa isso).
4. **Settings → Source → Watch paths** (é o que evita reiniciar o worker a cada
   push de tela). Uma linha por padrão:
   ```
   src/lib/**
   src/app/api/**/cron/**
   src/instrumentation.ts
   package.json
   package-lock.json
   next.config.ts
   ```
   Push que não toca nesses caminhos não redeploya o worker.
5. **No serviço web** (o atual), no MESMO momento em que o worker subir:
   - `Variables` → acrescentar `PAPEL=web` e salvar (isso redeploya o web).
   Entre o worker ficar "Active" e o web redeployar com `PAPEL=web` há alguns
   minutos de robôs em dobro; é tolerável (as tarefas têm trava por job em
   `cron_runs`), mas quanto mais perto, melhor.
6. **Conferir**:
   - Logs do worker: deve aparecer `papel do processo: worker` e, logo depois,
     `[agendador] ...` assumindo as tarefas.
   - Logs do web: `papel do processo: web (robôs ficam com o worker)` e NENHUMA
     linha de agendador/robô.
   - Tela `/agendamentos` → aba Hoje: as rodadas continuam chegando (vêm do worker).
   - `cron_runs`: nenhuma rodada "interrompida" quando o web redeployar.

## Tela /agendamentos com o worker

- **Pausar / Retomar / Mudar horário / Marcar** gravam na tabela `agendamentos`; o
  worker relê a tabela a cada laço (30 s), então valem em até meio minuto.
- **Rodar agora**, com `PAPEL=web`, não executa no processo web: marca uma
  execução "uma vez" para dali a 5 s e o worker a pega no laço seguinte. Em
  `cron_runs` ela aparece como `marcado` (não `botao`).
- O painel "Omie agora" e "rodando agora" mostram o estado do processo que
  respondeu à requisição (o web); o histórico e a aba Hoje vêm do banco e
  continuam completos.

## Depois (etapa 3 do plano da fila da Omie)

Com o worker estável, migrar os crons diários do GitHub para linhas da tabela
`agendamentos` (tarefa `rota-interna` apontando para a rota de cada workflow),
começando pelos que o GitHub deixou de disparar em 15/10. Manter o workflow do
GitHub 30 dias como reserva e depois apagar.

## Voltar atrás

Apagar o serviço worker e remover `PAPEL=web` do serviço web (ou pôr `PAPEL=tudo`).
O portal volta a rodar os robôs no próprio processo, como antes.

## Custos e limites

- Railway cobra o uso de CPU/RAM do segundo processo (ordem de US$ 5–10/mês no
  volume atual dos robôs). Builds só quando os watch paths casam.
- Um deploy do PRÓPRIO worker ainda interrompe o que estiver rodando nele; o
  agendador marca "interrompida" e retoma na subida seguinte. Jobs muito longos
  (backfill de CMC, ~45 min) continuam candidatos a serem fatiados.
