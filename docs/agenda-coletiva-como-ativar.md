# Agenda coletiva e nova Lousa — o que fazer para funcionar

> Código no `main` desde 15/10/2026 (commit `62c47315`). O deploy do Railway sai sozinho do `main`.
> Este guia é o passo a passo para deixar tudo funcionando em produção (portal.novatratores.com).

## Resumo rápido

| # | O que fazer | Obrigatório? | Tempo |
|---|---|---|---|
| 1 | Rodar a migration `sql/agenda-coletiva.sql` no Supabase | **Sim** | 2 min |
| 2 | Conferir se o deploy terminou | Sim | 1 min |
| 3 | Conferir o setor (função) de cada pessoa | Recomendado | 5 min |
| 4 | Conferir quem está marcado como técnico | Recomendado | 3 min |
| 5 | Dar o módulo **Lousa** para quem lança a agenda dos técnicos | Se precisar | 2 min |
| 6 | Fazer o teste rápido | Recomendado | 5 min |
| 7 | Avisar a equipe | Opcional | — |

---

## 1. Rodar a migration (obrigatório)

Sem ela a agenda abre e mostra reuniões, sala, prazos de tickets, OS e Lousa, **mas criar compromisso dá erro** e aparece uma faixa amarela pedindo a migration.

1. Abra o Supabase do portal → **SQL Editor** → **New query**.
2. Copie e cole o conteúdo inteiro de [`sql/agenda-coletiva.sql`](../sql/agenda-coletiva.sql).
3. Clique em **Run**. Deve terminar com "Success. No rows returned".

Ela é segura para rodar mais de uma vez (só cria o que falta) e **não mexe em nenhuma tabela existente**. Cria:
- `agenda_eventos`: os compromissos criados na agenda;
- `agenda_participantes`: os convidados e as respostas (sim, não, talvez).

**Para conferir**, rode no SQL Editor:

```sql
select count(*) as eventos from agenda_eventos;
select count(*) as convidados from agenda_participantes;
```

As duas devem devolver `0` (sem erro). Erro "relation does not exist" quer dizer que a migration não rodou.

> Não precisa de novo deploy depois da migration: basta recarregar a página.

## 2. Conferir o deploy

1. No Railway, veja se o deploy do commit `feat(agenda): agenda coletiva estilo Google Agenda…` ficou **Success**.
2. Abra https://portal.novatratores.com/agenda. Deve aparecer o calendário com "Agenda" no topo.

Se aparecer a página antiga ou um erro 404, o deploy ainda não terminou: espere uns minutos e recarregue com Ctrl+F5.

## 3. Conferir o setor de cada pessoa

A lateral da agenda agrupa as pessoas por setor, e o setor vem da **função** do cadastro (`financeiro_usu.funcao`):

| Função no cadastro | Aparece em |
|---|---|
| Comercial / Vendas | Comercial |
| Pós Vendas / Pós-Vendas | Pós-Vendas |
| Peças | Peças |
| Financeiro | Financeiro |
| T.I. / TI | T.I. |
| Diretor… | Diretoria |
| Técnico (ou marcado como técnico no Admin) | Técnicos |
| Vazia | Outros |
| Qualquer coisa com "teste" | **Não aparece** (contas de teste) |
| Outra palavra (ex.: Marketing) | Um setor com esse nome |

**Situação em 15/10/2026:** só o **Lucas** está sem função e por isso cai em "Outros".

**Como acertar:** o Admin só define a função na hora de criar o usuário. Para mudar a de alguém que já existe, rode no SQL Editor (troque o nome e a função):

```sql
update financeiro_usu set funcao = 'Peças' where nome = 'Lucas';
```

Quem estiver **inativo** no cadastro não aparece na agenda.

## 4. Conferir quem é técnico

Entra em "Técnicos" quem está com **Técnico** no seletor do app dos mecânicos, na lista de usuários do **Admin** (o seletor ao lado da categoria: "Sem acesso / Técnico / Observador"). É o mesmo cadastro que o app dos mecânicos usa.

A agenda dos técnicos é montada sozinha a partir de:
- **OS do POS**: aparece no técnico 1 e no técnico 2 da OS, nos **dias de execução** (ou na previsão de execução, se os dias não estiverem marcados). OS cancelada não aparece; OS já concluída aparece mais clara.
- **Lousa**: os lançamentos (serviço, oficina, faltou, feriado, saída antecipada). Manhã = 8h–12h, tarde = 13h–18h, dia todo = 8h–18h.

O técnico da OS é reconhecido pelo nome (sem diferença de maiúscula ou acento). Se alguma OS não aparecer, o nome digitado na OS é diferente do cadastro.

## 5. Permissões

| Quem | O que pode |
|---|---|
| Todo usuário logado | Ver a agenda de todos, criar os próprios compromissos e convidar qualquer pessoa |
| Quem criou o compromisso (ou admin) | Editar, mover, excluir |
| Convidado | Responder Sim / Não / Talvez |
| Quem tem o módulo **Lousa** (ou admin) | Lançar, editar e arrastar na Lousa |

- A agenda **não pede módulo**: fica no menu **Geral → Agenda** e na dashboard para todo mundo.
- A aba "Agenda" na barra da Central de Trabalho só aparece para quem tem a Central (tickets, tarefas ou cronograma).
- Para alguém lançar na Lousa: **Admin → usuário → módulo "Lousa Virtual"**.

**Privacidade:** os compromissos da agenda são vistos por todos (não existe "privado"). Reuniões e tickets marcados como privados nos módulos deles continuam privados: quem não participa vê só "Reunião (privada)" no horário ocupado.

## 6. Teste rápido (5 minutos)

Depois da migration, com seu usuário:

- [ ] Abrir **/agenda**: aparecem os setores na lateral e as reuniões e OS da semana.
- [ ] Arrastar na grade de 9h a 10h em algum dia → escrever "Teste agenda" → **Salvar**. O cartão aparece.
- [ ] Arrastar o cartão para outro horário. Ele fica no lugar novo depois de recarregar.
- [ ] Abrir o cartão → lápis → convidar outra pessoa → Salvar. A pessoa recebe no **sino** "… te convidou".
- [ ] Com a outra pessoa: abrir pelo sino → responder **Sim**. Você recebe "… vai".
- [ ] Trocar a vista para **Pessoas** (tecla **E**): uma coluna por pessoa.
- [ ] Abrir **/lousa**: abre no calendário dos técnicos. Clicar num horário → lançar um "Oficina" → aparece. Excluir em seguida.
- [ ] Botão **Quadro clássico** na Lousa: o quadro antigo continua lá.
- [ ] Excluir o "Teste agenda" (abrir → lixeira).

## 7. Avisar a equipe (texto pronto)

> Pessoal, o portal ganhou uma **Agenda** (menu Geral → Agenda), no estilo do Google Agenda. Lá aparece a agenda de todo mundo, separada por setor: reuniões, reservas da sala, prazos dos tickets e a agenda dos técnicos (OS e Lousa). Para marcar algo, é só clicar ou arrastar no horário; dá para convidar colegas, e eles respondem se vão. Na lateral, marquem quem querem ver.

---

## Como usar (resumo)

- **Vistas:** Dia (D), Semana (W), Mês (M), Programação (A), Pessoas lado a lado (E). Hoje = T; próximo/anterior = J/K; criar = C; pesquisar = /.
- **Criar:** clicar ou arrastar num horário vazio. "Mais opções" tem dia inteiro, repetição, convidados (com "+ setor inteiro"), local, descrição e cor.
- **Mexer:** arrastar muda o horário; puxar a borda de baixo muda a duração. Na vista Pessoas, clicar na coluna de alguém já convida a pessoa.
- **Lateral:** marcar/desmarcar pessoas ou um setor inteiro; "só" mostra só aquela pessoa; "Outras agendas" liga/desliga reuniões, sala, prazos, OS, Lousa.
- **Repetição:** um compromisso que se repete não pode ser arrastado. Para mudar, edite (vale para a série inteira). Na lixeira dá para apagar "Este evento" ou "Todos os eventos".

## Se algo der errado

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Faixa amarela "Os compromissos da agenda ainda não foram ativados…" | Migration não rodou | Passo 1 |
| "Não deu para carregar: OS dos técnicos" (ou outra fonte) | Erro naquela tabela; o resto segue funcionando | Ver os logs do Railway (`[agenda] fonte os`) |
| Pessoa aparece em "Outros" | Função vazia | Passo 3 |
| Pessoa não aparece na agenda | Inativa, ou função com "teste" | Conferir o cadastro |
| OS não aparece no técnico | Nome do técnico na OS diferente do cadastro, ou OS sem previsão/dias de execução | Corrigir a OS no POS |
| Não consigo lançar na Lousa ("Sem permissão") | Falta o módulo Lousa | Passo 5 |
| Não consigo editar um compromisso | Só quem criou (ou admin) edita | Pedir para quem criou |

## Pendências conhecidas (para depois)

- **A rota antiga da Lousa (`/api/pos/lousa`) não exige login.** Já era assim antes; a Lousa nova usa a mesma rota. Vale proteger.
- **A Lousa não recebia lançamento desde 03/07/2026.** A agenda real dos técnicos está nas OS, por isso elas entram sozinhas.
- **Não há como reservar a sala a partir da agenda.** O campo "Local" é texto livre; reservar continua em **/salas**. As reservas aparecem na agenda.
- **Arquivos técnicos:** `src/components/agenda/`, `src/lib/agenda/` (regras com 21 testes), `src/app/api/agenda/`, `sql/agenda-coletiva.sql`. Detalhes no `CLAUDE.md` (seção "Agenda coletiva estilo Google Agenda").
