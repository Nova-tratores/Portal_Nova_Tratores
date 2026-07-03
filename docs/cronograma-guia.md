# Cronograma — Guia de uso

> Módulo de **gestão de projetos com Gantt** do Portal Nova Tratores: dependências,
> **caminho crítico**, calendários de recurso, baseline, detecção de conflito e
> **manutenção recorrente**. Este guia é prático (como usar) e traz os **casos de uso
> indicados para a operação** + um **backlog de melhorias**.
>
> Rota: menu **Serviços ▸ Cronograma** (`/cronograma`). Contexto técnico do módulo em
> `src/lib/cronograma/README.md` e `docs/contexto-ia.md`.

---

## 1. O que é / quando usar

Use o **Cronograma** quando um trabalho tem **várias etapas que dependem umas das outras**
e você precisa saber **quando termina** e **o que não pode atrasar** (caminho crítico).

Não confunda com:
- **`/tarefas`** — lista de to-dos simples (título, prazo, responsável). Sem dependências
  nem cálculo de datas. Use para pendências soltas.
- **`/revisoes`** — controle de revisões por horímetro de cada trator. O Cronograma
  **não substitui** as Revisões; ele **planeja a execução** (e pode gerar manutenções
  recorrentes que conversam com esse domínio).

Cada projeto é de um **tipo**: **obra interna** ou **OS de máquina** — o mesmo motor
atende os dois.

---

## 2. Casos de uso indicados para a Nova Tratores

1. **OS de máquina complexa (revisão/reforma de trator).** Modele a OS como um projeto:
   `diagnóstico → pedir peças → executar → testar → entregar`. O **caminho crítico** mostra
   a data de entrega e quais etapas não podem escorregar. (Futuro: vincular à Ordem de
   Serviço real — ver backlog.)
2. **Plano de manutenção preventiva por horímetro.** Para o trator de um cliente, crie uma
   **recorrência por horímetro** (ex.: a cada 250h). O sistema gera as próximas manutenções
   já posicionadas no calendário, usando a média de horas/dia da máquina.
3. **Obra interna na concessionária.** Reformas de galpão, showroom, pátio — com **recursos**
   e **calendários** reais (ex.: "pintor só sábado") e **aviso de conflito** quando alguém
   fica sobrecarregado.
4. **PDI / pré-entrega de tratores novos.** Um checklist padronizado de inspeção como projeto,
   com etapas sequenciais e responsáveis. (Futuro: virar template reutilizável.)
5. **Agenda coordenada de técnicos.** Use recursos + calendários + a detecção de conflito
   para não colocar o mesmo técnico em dois serviços no mesmo dia útil.

---

## 3. Uso correto — passo a passo

### 3.0 Acesso
Precisa ser **admin** ou ter a permissão de módulo **`cronograma`** (definida em
Administração → `portal_permissoes`). Sem isso, o item não aparece no menu.

O módulo tem 3 abas no topo: **Projetos · Calendários · Recursos**.

### 3.1 Antes do primeiro projeto: Calendários e Recursos
Faça uma vez (depois é só reutilizar):

**Calendários** (aba Calendários) — definem os **dias úteis**:
1. **Novo calendário** → dê um nome.
2. Marque os **chips** de dias da semana (Seg…Dom). Exemplos:
   - Comercial = Seg–Sex.
   - "Pintor" = só **Sáb**.
3. Ajuste **horas por dia**.
4. **Exceções**: adicione **feriados** (tipo *Folga* = remove o dia) ou **dias extras**
   (tipo *Extra* = adiciona um dia fora do padrão).
5. **Salvar** — se algum projeto ativo usar esse calendário, ele **recalcula** automaticamente.

**Recursos** (aba Recursos) — pessoas/equipes/máquinas que executam as tarefas:
1. **Novo recurso** → tipo (**pessoa/equipe/máquina**).
2. Para pessoa, você pode **vincular a um usuário** do portal (reaproveita nome do cadastro).
3. Escolha o **calendário** do recurso (é ele que define os dias úteis das tarefas desse recurso).

### 3.2 Criar o projeto
Aba **Projetos** → **Novo Projeto**:
- **Nome**, **Tipo** (obra interna / OS de máquina), **Início**, **Calendário padrão**.
- Ao criar, você cai direto na **timeline** do projeto.

### 3.3 Montar as tarefas
Na timeline, **Nova tarefa** (ou clique numa barra para editar). No drawer:
- **Nome**, **Descrição**, **Duração (em dias ÚTEIS)**, **Prioridade**, **Recurso**, **Restrição**.
- **Restrições** disponíveis: *ASAP* (o quanto antes), *não iniciar antes de*, *não iniciar
  depois de*, *data fixa*.
- Campos do **motor** (só leitura): início/fim calculados, **folga**, **crítica**, status.

### 3.4 Ligar dependências
No drawer da tarefa, seção **Predecessoras** → escolha a tarefa anterior, o **tipo** e o **lag**:
- **FS** (Fim→Início): a sucessora começa depois que a predecessora termina. *É o mais comum.*
- **SS** (Início→Início), **FF** (Fim→Fim), **SF** (Início→Fim) para casos especiais.
- **Lag** (dias úteis, pode ser negativo) = folga/antecipação entre as duas.
- Dependência que criaria **ciclo** é **recusada** com mensagem clara.

### 3.5 Alocar recursos (opcional, para carga/conflito)
No drawer, seção **Alocações**: adicione 1+ recursos com **% de alocação**. O recurso
principal da tarefa já conta como 100% na detecção de conflito.

### 3.6 Recalcular e ler o resultado
Clique **Recalcular** (barra de cima). O motor grava as datas oficiais e o caminho crítico:
- Barras em **vermelho** = **caminho crítico** (folga zero — atrasar aqui atrasa o projeto).
- Contorno **laranja** = recurso em **conflito** (veja o painel de carga abaixo do Gantt).
- O cabeçalho mostra **fim previsto** e quantas tarefas são críticas.
- **Arrastar** uma barra (mover/redimensionar) faz um **preview instantâneo** e já recalcula.

### 3.7 Registrar execução (progresso e bloqueio)
No drawer, seção **Progresso & execução**: informe **%**, **início real** e **fim real**.
- Regra estilo Plane: uma tarefa só vai para *em andamento/concluída* se as predecessoras
  **FS** estiverem concluídas; senão fica **bloqueada** (com aviso).
- Datas reais **ancoram** a tarefa e o recálculo empurra as sucessoras (é assim que o
  atraso se propaga automaticamente).

### 3.8 Análise (baseline, plano×real, export)
Botão **Análise** (barra de cima):
- **Caminho crítico**: fim do projeto + lista das tarefas críticas.
- **Baseline**: *Salvar baseline* tira uma foto do plano atual; depois selecione uma baseline
  para ver o **desvio por tarefa** (+Nd atraso / −Nd adianto).
- **Progresso planejado × realizado**: curva-S.
- **Exportar**: CSV ou JSON (tarefas + datas + dependências).

### 3.9 Manutenção recorrente
Botão **Recorrências** → **Nova**:
- **Base**: *Intervalo (dias)* ou *Horímetro (horas)*.
- **A cada** (30 dias, ou 250h), **Duração**, **Recurso**, **Âncora** (data da última
  manutenção) e **Horizonte** (meses).
- **Gerar ocorrências** cria tarefas `Nome #1, #2, …` já espaçadas. Para **horímetro**,
  informe a **média de horas/dia** (converte "a cada 250h" em dias).
- É **idempotente**: clicar *Gerar* de novo só cria o que faltava até o horizonte (não duplica).

---

## 4. Boas práticas & erros comuns

- **Duração é em dias ÚTEIS do calendário do recurso**, não dias corridos. Ex.: recurso
  "só sábado" → uma tarefa de 3 dias cai em 3 sábados.
- **Recalcule** depois de mudanças em massa (criar várias tarefas/dependências). O preview
  otimista cobre o arrasto pontual; o botão **Recalcular** garante a verdade do servidor.
- **Conflito de recurso é só aviso** — o sistema **não move nada** sozinho. A resolução
  (mover tarefa, trocar recurso, dividir) é sua.
- Restrições **"não iniciar depois de"** e **"data fixa"** que forem violadas viram **erro
  visível** — o sistema não empurra silenciosamente.
- Excluir uma tarefa que é **predecessora** remove as dependências ligadas (há confirmação).
- Trocar o calendário de um recurso/projeto muda a disponibilidade → **recalcule** os projetos
  afetados (a tela de Calendários faz isso ao salvar).

---

## 5. Limitações atuais (transparência)

- **Tema do Gantt é claro** mesmo no modo escuro do portal (cosmético; no backlog).
- **Sem atualização ao vivo entre usuários** (o Realtime foi removido por quebrar o chat).
  Recarrega ao focar a aba e após suas próprias ações; para ver mudança de outra pessoa,
  recarregue.
- **Sem alerta/flag de "atrasada"** — o motor **reagenda**, mas não sinaliza atraso vs. plano
  (use a **baseline** para ver desvio).
- **Sem auto-nivelamento** de recursos (só detecção de conflito).
- **Recorrência por horímetro pede a média h/dia manualmente** (ainda não puxa do trator).

---

## 6. Melhorias sugeridas (backlog — priorizar sob demanda)

**Ganhos rápidos**
- Tema **dark** do Gantt (casar com o tema do portal).
- **Flag visual "atrasada"** (hoje > fim previsto e não concluída).
- **Vincular a Ordem de Serviço** (`os_ref`) ao criar projeto de OS de máquina.
- **Auto-preencher média h/dia** na recorrência por horímetro (puxar do trator, reusando a
  lógica de `/revisoes`).

**Médio**
- **Subtarefas / tarefas-resumo** na UI (o motor já agrega).
- **Editar** tipo/lag de uma dependência existente.
- **Baseline visível no Gantt** (barra/marcador, não só tabela).
- **Alertas de atraso** via notificações do portal quando uma crítica estoura a folga.
- **Cron** para gerar ocorrências recorrentes automaticamente (rolar o horizonte).

**Maior (evolução)**
- **Tempo real multiusuário** via Supabase Broadcast (sem quebrar o chat).
- **Auto-nivelamento** de recursos.
- **Templates de cronograma** por tipo de OS (manutenção/PDI prontos).
- **Worker de recálculo** (`pg_notify`) para projetos grandes.
- **Permissão granular** (ver × editar) e **export PDF/PNG** da timeline.

> Para pedir uma melhoria, é só citar o item — dá para fazer uma a uma ou em lote.
