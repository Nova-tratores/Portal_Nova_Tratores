# Módulo Marketing & Eventos

> Subsistema do Portal Nova Tratores para registrar feiras, dias de campo, ações
> de loja, patrocínios e demais investimentos de marketing — com o custo, o apoio
> de fábrica, os leads e o retorno de cada um.
>
> Rotas `/marketing` (módulo) e `/lead` (captura no estande).
> Última atualização: 09/09/2026.

---

## 1. Por que existe

A informação de uma feira morava na cabeça de quem foi. Quando essa pessoa saía
da empresa, sumia junto: quanto custou, quem apareceu, o que a fábrica exigiu em
troca do apoio.

O caso que originou o módulo é o **IRRIGASHOW 2026**: apoio de R$ 20.000 da
Mahindra, relatório de contrapartida pendente e o responsável fora da empresa.
Sem esse relatório a verba fica parada.

Três coisas o módulo resolve:

1. **Cobrar a fábrica.** Verba co-op tem prazo, contrapartida e processo
   documental. Nada no portal tratava disso.
2. **Saber quanto custou.** Reunir num lugar o que foi gasto, seja digitado ou
   vindo de uma requisição já lançada.
3. **Saber se valeu.** Ligar leads e propostas ao evento e comparar com o custo.

---

## 2. Conceito central: ação de marketing

A entidade não é "evento", é **ação de marketing**. Feira é um dos tipos.

| Tipo | Uso |
|---|---|
| `feira` | IRRIGASHOW, Agrishow |
| `dia_de_campo` | Demonstração em propriedade |
| `acao_loja` | Campanha no balcão |
| `patrocinio` | Apoio a rodeio, festa, associação |
| `midia` | Rádio, outdoor, publicidade |
| `brinde` | Lote de brindes do ano |
| `outro` | O que não couber acima |

Isso é deliberado: gasto de marketing que **não** é evento (uma campanha de
rádio, um lote de bonés) cabe no mesmo módulo, com o mesmo cálculo de retorno.
Uma entidade só chamada "evento" obrigaria a criar um segundo módulo depois.

Situações da ação: `planejada`, `aprovada`, `em_andamento`, `realizada`,
`cancelada`.

---

## 3. Modelo de dados

13 tabelas, todas com prefixo `mkt_`. Duas migrations, ambas aplicadas.

### `sql/marketing-acoes.sql` — aplicada em 04/09/2026

| Tabela | Papel |
|---|---|
| `mkt_acoes` | A ação. Centro de tudo |
| `mkt_apoios` | Verba de fábrica, um por apoiador |
| `mkt_custos` | Despesas, digitadas ou vinculadas a documento |
| `mkt_leads` | Contatos capturados no estande |
| `mkt_acao_propostas` | Liga proposta do Comercial à ação (N:N, com peso) |
| `mkt_equipe` | Quem foi e por quantos dias |
| `mkt_itens` | Máquinas e implementos expostos ou vendidos |
| `mkt_realizadas` | Planejado contra realizado; também as contrapartidas |
| `mkt_concorrentes` | Quem mais estava lá |
| `mkt_midias` | Fotos, posts, clipping |
| `mkt_avaliacoes` | Avaliação pós-evento, uma por avaliador |

### `sql/marketing-questionario.sql` — aplicada em 09/09/2026

| Tabela | Papel |
|---|---|
| `mkt_questionario_links` | Link único de preenchimento |
| `mkt_questionario_respostas` | As 26 respostas, em JSONB |

Acrescenta também 7 colunas de destino da importação:
`mkt_acoes.{dias_participacao, publico_total_evento, stand_descricao}` e
`mkt_avaliacoes.{perfil_publico, produtos_mais_interesse, percepcao_marca, justificativa}`.

### Segurança

**RLS ligada, zero policy, em todas as 13 tabelas.** A chave anônima não lê nem
escreve nada. Todo acesso passa por `/api/marketing/*` (ou `/api/q/*`) com
service role, e a rota confere a permissão.

> ⚠️ Consequência prática: um `supabase.from('mkt_*').select()` no navegador
> devolve `[]` **sem erro**. Se uma tela do módulo vier vazia sem explicação, é
> quase sempre alguém lendo direto em vez de passar pela rota.

---

## 4. Decisões estruturais

As quatro que mais importam quando alguém for mexer.

### 4.1 Nada é escrito no módulo Comercial

O vínculo proposta ↔ ação mora em `mkt_acao_propostas`, uma tabela de ligação.

Não é preciosismo. A view `v_formulario`, que a tela `/propostas` lê, foi criada
com `SELECT f.*`, e o Postgres expande o `*` no momento da criação. **Uma coluna
nova em `"Formulario"` não apareceria na view** — a alternativa "óbvia" quebraria
o módulo Comercial em silêncio.

O vínculo tem `peso` (0 a 1) porque atribuição comercial honesta não é binária: a
proposta que nasceu na feira e fechou depois de uma ação de loja não pode contar
inteira nas duas.

### 4.2 Custos híbridos, com valor congelado

Cada custo é digitado à mão **ou** aponta para um documento que já existe no
portal, pelo par `vinculo_tipo` + `vinculo_ref`:

| `vinculo_tipo` | Aponta para |
|---|---|
| `requisicao` | `"Requisicao".id` |
| `finan_pagar` | `finan_pagar.id` |
| `nota_entrada` | `notas_entrada.ncod_nf` |

Sem chave estrangeira, de propósito: os ids das três origens são heterogêneos e
chave estrangeira polimórfica não existe em Postgres. É o mesmo idioma de
`sql/opa-vinculo-veiculo.sql`. A coluna `origem` é **gerada** a partir de
`vinculo_tipo`, então não há como ficar inconsistente.

**`valor` é snapshot autoritário.** O botão "Conferir com a origem" apenas relê o
documento e grava em `valor_fonte`, para a tela mostrar divergência. O total
**nunca** muda sozinho — se mudasse, o retorno de uma feira encerrada mudaria
quando alguém editasse uma requisição antiga meses depois.

O botão "Buscar documentos" usa o **Projeto do Omie** da ação
(`mkt_acoes.projeto_codigo`) como centro de custo, porque requisição e conta a
pagar já gravam projeto. Sem projeto, cai no plano B: documentos da janela do
evento, com 30 dias de folga de cada lado.

### 4.3 Retorno em biblioteca pura, não em view SQL

`src/lib/marketing/roi.ts` e `custos.ts` não tocam banco. Motivos:

- O SQL deste projeto roda à mão e o código sai do `main` sozinho. Uma view fica
  defasada em produção enquanto o código já mudou.
- As origens são sujas. `"Formulario".Valor_Total` e `"Requisicao".valor_despeza`
  são **texto em formato BR e US misturados**. Somar isso em SQL exigiria
  reescrever o parser em plpgsql, criando duas implementações divergentes.
- As regras de atribuição vão mudar. Mudar aqui é um push; em view é uma ida
  manual ao SQL Editor de produção, sem revisão e sem teste.

**Regra de ouro:** denominador zero devolve `null` e a tela mostra travessão.
Nunca `Infinity`, nunca `NaN`.

### 4.4 Nome de pessoa é sempre snapshot

Toda referência a gente grava `usuario_id` **sem chave estrangeira** mais o
`nome` por extenso. A pessoa pode sair da empresa e o histórico continua legível.
A tela cruza com `financeiro_usu.ativo` e mostra "responsável não está mais ativo
— reatribuir".

Esse é literalmente o requisito que valida o caso IRRIGASHOW.

---

## 5. Telas

| Rota | O que faz |
|---|---|
| `/marketing` | Lista das ações, com alerta de contrapartida vencendo e de responsável inativo |
| `/marketing/[id]` | Ficha da ação, com 13 abas |
| `/marketing/apoios` | Carteira de apoio de fábrica, o que venceu primeiro no topo |
| `/marketing/custos` | Investimento consolidado, por categoria e por ação |
| `/marketing/leads` | Fila de leads de todas as ações |
| `/marketing/resultados` | Ações lado a lado: custo, apoio, funil e retorno |
| `/lead` | Captura no estande, pelo celular, módulo à parte |
| `/q/[token]` | Questionário pós-evento, **sem login** |

Abas da ficha: Resumo, Apoio de fábrica, Investimento, Leads, Propostas, Equipe,
Itens expostos, Ações realizadas, Concorrentes, Mídia, Avaliação, Questionário e
Relatório.

### Apoio de fábrica

O item de maior valor do módulo, e o que não tinha equivalente no portal. Máquina
de estados própria:

```
pleiteado → aprovado → documentado → faturado → recebido
                    ↘ recusado / cancelado
```

Guarda o processo (número, tipo de documento NF/ND/OC, data de emissão, forma e
data do crédito) e a contrapartida (o que foi acordado, prazo, situação do
relatório).

**Aprovado não abate o custo. Só o recebido abata.** É a diferença entre o que a
fábrica prometeu e o que entrou na conta.

### Captura de lead no estande

`/lead` é módulo satélite: quem só anota contato não precisa do módulo grande.
Três regras vieram do campo, não do desenho:

- **Só o texto é obrigatório.** Quem está de pé numa feira escreve "quer trator
  75cv, volta amanhã" e segue.
- **Fila offline em `localStorage`.** Sinal de feira cai. Se o envio falhar, o
  lead fica guardado no aparelho e sai sozinho quando a rede voltar. Perder um
  lead por falta de sinal é o pior resultado possível.
- **Duplicata avisa, nunca bloqueia.** Três vendedores anotam o mesmo visitante.

Deep-link `/lead?acao=<uuid>` vira o QR do banner do estande.

---

## 6. Questionário pós-evento (`/q/<token>`)

Para quando a memória do evento está com quem não abre o portal.

- **O token é a credencial.** 32 bytes aleatórios, gerado no Node com
  `randomBytes(32).toString('base64url')`. Não no Postgres, porque
  `encode(...,'base64url')` só existe a partir do PG 18.
- **O respondente não fala com o banco.** Tudo passa por `/api/q/<token>`, que
  valida no servidor. A rota aceita **só** as chaves `q01`..`q26`, com teto de
  tamanho por resposta.
- **Autosave** 1,5 s após a última tecla, mandando apenas os campos mexidos, com
  **merge campo a campo**: dois aparelhos no mesmo link não apagam o campo um do
  outro. A fonte da verdade é o banco, nunca `localStorage`.
- **Piso de 1 segundo** entre gravações no servidor. O cliente reenfileira no 429.
- **"Enviar" não trava a edição.** Quem fecha é um admin, para a pessoa poder
  lembrar de algo no dia seguinte.

Os ids `q01`..`q26` são **fixos**. Renumerar quebraria a leitura de tudo que já
foi respondido.

### Importação para a ficha

Nunca sobrescreve calado. `preverImportacao` monta o que **faria**, marca onde já
existe conteúdo, e substituir exige confirmação. Quando não dá para ler um número
numa resposta livre (`extrairNumero`), o texto inteiro vai para as observações em
vez de a importação inventar valor.

`q25` cai em `justificativa`; o enum `repetir` continua escolha humana.

---

## 7. Relatório de contrapartida (PDF)

O entregável que destrava a verba. Oito seções fixas:

1. Identificação do evento
2. Apoio recebido, com processo e documento
3. Contrapartidas acordadas contra realizadas
4. Participação da Nova Tratores
5. Resultados gerados
6. Investimento e retorno
7. Aprendizados
8. Registro fotográfico, até 6 fotos

Fecha com uma caixa vermelha listando o que ficou sem registro.

**Campo vazio sai "Não registrado" e nunca some em silêncio.** A distinção que
precisa de teste: `dinheiro(0)` dá `R$ 0,00`, mas `dinheiro(null)` dá "Não
registrado". Zero é um valor legítimo; ausência não é. Trocar isso é mentir no
relatório para a fábrica.

A tela mostra a lista de pendências **antes** de deixar enviar. Foto com endereço
quebrado imprime a URL como texto e não derruba o documento.

> **Limitação atual:** o relatório está amarrado a um apoio de fábrica. Ação sem
> apoio cadastrado não gera PDF. Faz sentido para prestar contas à Mahindra, mas
> não serve para uma ação paga inteiramente pela empresa.

---

## 8. Estrutura de arquivos

```
sql/
  marketing-acoes.sql              11 tabelas, RLS
  marketing-questionario.sql       2 tabelas + 7 colunas de destino

src/lib/marketing/
  tipos.ts                  constantes e tipos (espelham os CHECK do banco)
  roi.ts        ⚙ pura      cálculo de retorno
  custos.ts     ⚙ pura      parse BR/US, rateio, totais
  contrapartida.ts ⚙ pura   estrutura do relatório e "Não registrado"
  questionario.ts  ⚙ pura   26 perguntas e mapa de importação
  pdf-contrapartida.ts      desenho do PDF (pdfkit, sem banco nem e-mail)
  relatorio-contrapartida.ts  junta banco + PDF + e-mail
  apoios-vencendo.ts        aviso semanal
  db.ts / questionario-db.ts  acesso ao banco (service role)
  rota.ts / crud.ts / server.ts  casca das rotas e gates
  __tests__/                78 testes

src/components/marketing/   ui, Modal, AcaoForm, MarketingNav, abas/
src/app/(portal)/marketing/ telas do módulo
src/app/(portal)/lead/      captura no celular
src/app/q/[token]/          questionário público
src/app/api/marketing/      23 rotas
src/app/api/q/[token]/      2 rotas públicas
.github/workflows/marketing-apoios-vencendo.yml
```

25 rotas de API, 8 telas, 78 testes no vitest.

---

## 9. Permissões

Dois módulos no Admin, grupo Comercial:

- **`marketing`** — o módulo inteiro.
- **`lead`** — só a tela de captura. Quem tem `marketing` também passa.

Ações granulares: as 5 telas mais `acoes:criar`, `acoes:editar`, `acoes:excluir`,
`apoios:editar`, `custos:editar`, `custos:vincular`, `leads:editar`,
`leads:vincular_cliente`, `propostas:vincular`, `midias:enviar`,
`avaliacao:responder` e `relatorio:enviar`.

**`relatorio:enviar` é separada de propósito:** é a única ação do módulo que manda
e-mail para fora da empresa. A checagem está na rota, não só no botão.

> ⚠️ Ao acrescentar card no dashboard: id que **não** estiver em `systemToModulo`
> (`src/app/(portal)/dashboard/page.tsx`) aparece para **todo mundo**, porque o
> filtro devolve `true` quando não acha o módulo.

---

## 10. Envio de e-mail

Duas chaves na tela Dev → Envios de e-mail (`/dev/envios-email`), semeadas
desligadas:

| Chave | O que manda |
|---|---|
| `marketing_contrapartida` | PDF do relatório, sob demanda, pela ficha |
| `marketing_apoios_vencendo` | Aviso semanal, segunda 07:20, cron no GitHub Actions |

Destinatários vivem no banco (`email_envios_config`), **nunca** em variável do
Railway. Todo disparo grava em `email_envios_log`.

---

## 11. Armadilhas conhecidas

1. **`v_formulario` é `SELECT f.*`.** Nunca adicionar coluna em `"Formulario"`
   por causa deste módulo.
2. **`"Requisicao".valor_despeza` é texto BR/US misto.** Jamais `SUM()` em SQL;
   sempre `parseValorMisto` de `custos.ts`. Em SQL cru a tabela leva aspas e R
   maiúsculo.
3. **`contas_pagar` não tem coluna de projeto** — ele vive dentro de `raw`
   (JSONB). As fontes de custo são `"Requisicao"`, `finan_pagar` e
   `notas_entrada`.
4. **`finan_pagar` usa `criado_em`**, não `created_at`. Ordenar pelo nome errado
   dá 400 silencioso e lista vazia.
5. **`cod_cli` não é único.** A chave real do cliente é o par `(cod_cli, empresa)`
   — o mesmo número existe em NOVA e CASTRO.
6. **Sem chave estrangeira para tabelas-espelho do Omie.** Um re-sync viraria
   falha de insert no meio da feira.
7. **RLS sem policy: o navegador lê `[]` sem erro.**
8. **O bucket `anexos` é público.** Foto de feira, sim. Documento com CPF, não.
9. **Inserção em lote pelo PostgREST** exige as mesmas chaves em todas as linhas,
   e completar com `null` atropela coluna `NOT NULL` que tem valor padrão. Em
   script de carga, inserir linha a linha.
10. **Modo escuro:** React serializa hex em rgb e `backgroundColor` vira
    `background-color`. Use `#fefefe` e `#111111`, que o dark não remapeia.

---

## 12. Estado em 09/09/2026

No ar, commits `42ee41b` e `406599a`. Ambas as migrations aplicadas.

**IRRIGASHOW 2026** cadastrado, com 3 pessoas na equipe, 9 itens, 8 concorrentes,
2 atividades, 1 avaliação, o apoio Mahindra de R$ 20.000 e 2 custos — um digitado
(R$ 28.000 de participação no espaço) e um puxado da requisição 6650 (R$ 278,82),
que é o vínculo híbrido funcionando na prática.

### Pendências conhecidas

| Item | Situação |
|---|---|
| Prazo da contrapartida Mahindra | Vazio. Sem ele o aviso semanal não tem data para cobrar |
| Responsável da ação | Não definido |
| Leads do IRRIGASHOW | Zero. Foram anotados em papel |
| Vendas do evento (R$ 357 mil) | Registradas como itens vendidos, mas não contam como receita: o retorno vem de propostas vinculadas |
| Equipe "Fernando" | Vinculado a Joaquim Fernando Leme por dedução. Confirmar |
| Equipe "José Ângelo" | Não existe no cadastro do portal |

### O que não existe

- Exportação em CSV de custos ou leads.
- PDF da comparação entre ações.
- Relatório de evento sem apoio de fábrica.
- Dashboard comparando edições do mesmo evento entre anos.
