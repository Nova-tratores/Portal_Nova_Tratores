# Painel de notas (NF-e / NFS-e) + Central de erros da Omie — plano

> Escrito em 19/11/2026. **1ª entrega CONSTRUÍDA no mesmo dia (só ver) — ver §0.** O resto do texto é o plano original.

## 0. O que foi feito (19/11/2026)

- **Tela** `/financeiro/notas` com abas Chrome **Notas · Problemas (N) · Envios ao Omie (N)** (`?aba=problemas|envios`),
  `components/financeiro/notas/PainelNotas.tsx` (embrulha o `NotasFiscais` de sempre). Aba Notas ganhou a faixa
  **hoje / mês** por tipo (NFS-e, NF-e peças, máquinas (inclui mista), outras, entrada; canceladas à parte).
  Celular: lista vira cartões < 768 px, alvos de 40 px, sem rolagem lateral (conferido 390/768/1366 numa página de teste).
- **Regras puras** `lib/notas/painel.ts` (21 testes com os casos reais: OS-0704 "E0240 CEP", OS-0190, devolução 840225,
  `faturar_desconhecido` da OS-0908); **leitura** `lib/notas/painel-server.ts` (só banco; cada fonte falha sozinha → aviso);
  **rota** `GET /api/financeiro/notas/painel?aba=totais|problemas|envios&conta=&dias=`.
- **Problemas** = OS com `faturamento_status` de falha (aguardando > 30 min, trava `faturando` > 10 min), remessas e
  devoluções em garantia que falharam / não faturaram / sem NF, reversões de recebimento falhadas ou esperando relançar,
  notas sem PDF/XML com ≥ 3 tentativas (UMA linha por empresa com a contagem).
- **Envios ao Omie** = `audit_log` (`*_erro`, `*_falhou`, `*_recusado`, `*_desconhecido`, `erro_envio_omie`,
  `localizacao/erro_gravar`; `erro_envio` = e-mail do boleto, fica FORA) + `cron_runs` com erro (agrupados por robô+motivo:
  102 linhas viraram 7). Falha de OS/PPV que hoje já está certa aparece como **"Resolvida depois"** (nos últimos 30 dias,
  36 falhas eram isso — quase todas `faturar_desconhecido` de OS cuja NFS-e saiu minutos depois). Cartão "Porta da Omie" só para Dev (memória do processo web).
- **Buracos fechados:** recusa do PPV (`api/ppv/pedidos/faturar`) e do Pedido de Máquinas (enviar/faturar, 422) agora
  gravam `audit_log` (`ppv/faturar_erro|faturar_desconhecido`, `pedidos-maquinas/enviar_erro|faturar_erro`).
- **Permissão** `financeiro:notas-problemas` (EXPLÍCITA; catálogo do Admin). ⚠️ `sql/financeiro-notas-problemas.sql`
  dá à função Financeiro — sem ele só Admin/Dev veem as duas abas.
- **Em aberto:** NF-e REJEITADA de pedido (a Omie não expõe pelo `ListarNF`; sondar quando houver um caso real);
  contadores da porta persistidos; ações (fase 2); a visão logada não foi aberta (o token de login de teste foi negado na sessão).
> Leia junto: `CLAUDE.md` (regras do projeto, celular obrigatório, padrão de telas em `docs/padrao-telas.md`).

## 1. O pedido

O usuário quer ver, num lugar só:

1. **Painel de notas "igual ao da Omie"**: cada NF-e e NFS-e com a situação (autorizada, rejeitada,
   aguardando, cancelada) e o motivo da rejeição; totais do dia e do mês; **notas presas** (pedido,
   OS ou remessa faturados que não viraram nota, ou cuja nota não voltou).
2. **Central de erros da Omie**: tudo o que falhou ao enviar/gravar na Omie (pessoas e robôs), com
   motivo, quem fez, quando e link para o caso.

Hoje isso está espalhado (ver §3). Não existe tela única.

## 2. Decisões do usuário (19/11/2026)

| Pergunta | Resposta |
|---|---|
| O que quer ter | Situação de cada nota · Totais do dia/mês · Notas presas · Ações na nota (reenviar, cancelar, e-mail, PDF/XML) |
| Uma tela ou duas | **Uma tela só**: abas **Notas · Problemas · Envios ao Omie** dentro de **Financeiro › Notas fiscais** (`/financeiro/notas`), que já guarda PDF/XML de todas as notas |
| Ações | **Só ver na 1ª entrega.** A tela mostra e leva para a OS / PPV / remessa / garantia certa. Reenviar/cancelar fica para depois, com permissão EXPLÍCITA e confirmação |

## 3. O que já existe (não refazer)

**Tela de notas** — `/financeiro/notas` (`components/financeiro/notas/NotasFiscais.tsx`, consulta única
`lib/notas/consulta-server.ts`, regras `lib/notas/filtros-relatorios.ts` e `lib/notas/cache-regras.ts`):
lista paginada, filtros no cabeçalho, total dos filtros por tipo, relatórios (Excel/PDF/CSV), PDF/XML
guardados no bucket privado `notas-fiscais`. Permissões `financeiro:notas`, `financeiro:notas-xml`,
`financeiro:notas-relatorios` (explícita), entrada só com Recebimentos (`podeVerEntrada`).
Base: tabela `notas_fiscais_docs` (uma linha por nota: `conta_omie`, `tipo` entrada|saida_produto|saida_servico,
`numero`, `serie`, `chave_nfe`, `data_emissao`, `parte_nome/doc/cod`, `valor`, `cancelada`, `categoria`,
`pedido_num`, `os_num`, `maquina`, `pdf_path`, `xml_path`, fila `tentativas/ultimo_erro`).
⚠️ Só tem nota **autorizada ou cancelada**: vem do `ListarNF` (NF-e) e do `ListarNFSEs` (NFS-e) via
`portal_nt_notas_saida` (sync em `lib/ajustes/notas-sync.ts`) e `notas_entrada`. **Nota rejeitada ou
aguardando não está lá.**

**Onde cada falha mora hoje** (fontes da aba Problemas / Envios ao Omie):

| Fonte | Onde | O que tem |
|---|---|---|
| NFS-e da OS (faturada pelo portal) | `Ordem_Servico.faturamento_status` (`nfse_aguardando` · `nfse_autorizada` · `nfse_rejeitada` · `nfse_cancelada` · `desconhecido`) + mensagem | regras `lib/pos/faturamento-regras.ts`, servidor `lib/pos/faturamento.ts` (reconcilia a cada 10 min; `StatusOS.cStatusRps` 003 = rejeitada, 004 = ok; reenvio de rejeitada já existe em `faturamento.ts` ~765). Avisa o sino e `avisarTI` |
| NF-e do PPV (pedido de peças) | `pedidos.faturado_omie_em`, `nf_numero`, `logs_ppv` | recusa da Omie vem no CORPO do `/produtos/pedidovendafat/` com `cCodStatus != "0"` (`lib/ppv/omie-status.ts`), sem faultstring. Leitura do pedido: `ConsultarPedido` (`lib/ppv/omie.ts`) — cuidado: 10 "não cadastrado" seguidos travam o ConsultarPedido por 30 min |
| Remessa do PPV / OS | `StatusRemessa` (`ListaNfe[].cStatusNFe`, `faturada`, `cancelada`) em `statusRemessaPPV` (`lib/ppv/omie.ts`) | `faturarRemessaPPVSemPausa`, `pendenciasFiscaisRemessa` |
| Remessas (módulo `/remessas`) | `remessas_emissoes` (status/erro de cada emissão) | `lib/remessas/omie.ts`, `lib/remessas/server.ts` |
| Devolução em garantia | `garantia_retornos` (`status` criando/criada/faturada/falhou/cancelada, `erro`, `nf_numero`) | `lib/garantias/retorno-remessa-server.ts`; 1º caso real 19/11 (NF 840225 Marchesan) falhou por falta de `cCodItInt`, corrigido em `e0b20791` |
| Reversão de recebimento com pagamento | `recebimento_reversoes` (`status`, `erro`) | `lib/estoque/reversao-server.ts` |
| Pedidos de máquinas | `pedidos_maquinas` + `_logs` (trava `faturando_desde`) | `lib/pedidos-maquinas/omie.ts` (faturar desligado por padrão) |
| Ações de pessoas que gravam na Omie | `audit_log` (ex.: `reverter_recebimento_recusado`, `devolucao_garantia_falhou`, `ajuste-estoque`, `remessa_<acao>`) | nem toda falha tem nome de falha na ação: olhar `detalhes.ok/erro` |
| Robôs (syncs, preços, saldos, notas) | `cron_runs` (job, início, fim, ok/erro, mensagem) | tela `/agendamentos` já mostra a última rodada |
| Contadores da porta da Omie | `estadoPorta()` em `lib/omie/porta.ts` (memória do processo: chamadas, erros, bloqueios, por conta/método) | só `GET /api/omie/porta`, só Dev, **sem tela**. Em memória: zera a cada deploy e o worker tem o dele |
| Cache de PDF/XML | `notas_fiscais_docs.ultimo_erro`, `tentativas` | nota que a Omie não devolveu documento |

## 4. O que a API da Omie dá (sondado 19/11/2026, só leitura, conta NOVA)

- `/produtos/nfconsultar/` **`ListarNF`** funciona (11.655 notas) — só nota emitida (entrada concluída / saída autorizada).
- `/servicos/nfse/` **`ListarNFSEs`** funciona (2.023 NFS-e; `Cabecalho` com número, código de verificação,
  ambiente, emissor/destinatário). **Falta conferir** os campos de status/rejeição na resposta completa.
- **Não existem**: `/produtos/dfedocs/ListarDocumentos`, `/produtos/pedidovendafat/StatusPedido`,
  `/produtos/notafiscalutil/ListarNfe`. Não há um "painel de NF-e" pronto na API.
- `/produtos/dfedocs/ObterNfe` e `/produtos/notafiscalutil/GetUrlDanfe` já usados para PDF/XML.
- **A descobrir antes de construir** (sondar só lendo): onde a NF-e REJEITADA de um pedido aparece
  (provável: `ConsultarPedido` → etapa/infoCadastro + algum campo de mensagem da SEFAZ; ou `StatusPedido`
  em outro endpoint). Achar 1 pedido real com nota rejeitada (perguntar ao usuário um número) e ler tudo.

## 5. Proposta

**Tela:** `/financeiro/notas` ganha abas Chrome (padrão-telas, sem título ao lado das abas, "Como ler esta tela"):

1. **Notas** (a tela de hoje) + coluna/selo **Situação** e faixa de **totais do dia e do mês** por empresa,
   tipo (NF-e peças/máquinas, NFS-e, remessa) e situação. Autorizada/cancelada vêm de `notas_fiscais_docs`;
   rejeitada/aguardando vêm da aba Problemas (não são notas ainda).
2. **Problemas** = notas presas e rejeitadas, uma lista só, mais recente primeiro:
   - OS com `faturamento_status` `nfse_rejeitada` / `nfse_aguardando` há mais de X min / `desconhecido`;
   - PPV faturado sem NF-e (`faturado_omie_em` sem `nf_numero` depois de X min) ou recusado;
   - remessas (PPV, módulo Remessas, devolução em garantia) criadas e não faturadas, ou faturadas sem NF;
   - nota sem PDF/XML depois de N tentativas (`notas_fiscais_docs.ultimo_erro`).
   Cada linha: empresa, tipo, nº do documento de origem (OS/PPV/remessa), cliente, valor, desde quando,
   motivo (texto da SEFAZ/prefeitura/Omie), quem fez, link "Abrir" para a tela do caso.
3. **Envios ao Omie** = central de erros: falhas de gravação (pessoas, via `audit_log` + tabelas de §3) e
   dos robôs (`cron_runs` com erro), com filtro por empresa, tipo, período e "só hoje". Contadores da porta
   (`estadoPorta`) num cartão pequeno, só para Dev.

**Servidor:** uma função que junta as fontes em linhas normalizadas
`{ id, origem, empresa, tipo, documento, cliente, valor, situacao, motivo, quem, quando, link }`
— regras puras (classificar situação, "presa há quanto", motivo legível) em `lib/notas/painel.ts` com testes;
leitura em `lib/notas/painel-server.ts` (paginando de 1000; nunca chamar a Omie por linha na abertura da tela
— ler só o banco; a Omie só sob demanda em "Conferir agora" de UMA linha).
Rota `GET /api/financeiro/notas/painel?aba=problemas|envios&...` com `protegerRota`.

**Permissões:** ver Notas = `financeiro:notas` (já existe). Problemas e Envios ao Omie: nova chave
**`financeiro:notas-problemas`** (explícita, como as outras abas do Financeiro — ver `lib/permissoes/explicitas.ts`
e `areasFinanceiro.ts`; o teste `permissoes/__tests__/financeiro-abas.test.ts` quebra se faltar).

**Avisos (depois):** contagem "N problemas hoje" no topo da aba e, opcional, sino para quem cuida.

**Fase 2 (não fazer agora):** ações na nota — reenviar NFS-e rejeitada (já existe a função na OS),
cancelar, reenviar e-mail, baixar PDF/XML — cada uma com permissão explícita e confirmação.

## 6. Ordem sugerida

1. Sondar a NF-e rejeitada (§4) e os campos de status do `ListarNFSEs`. Sem isso, a aba Problemas só cobre o
   que o portal já guarda.
2. Regras puras + testes (`lib/notas/painel.ts`).
3. Servidor + rota + permissão + SQL só se precisar de coluna nova (preferir ler o que existe).
4. Abas na tela, com celular (390/768 px: tabela rola dentro do cartão, alvos ≥ 40 px).
5. `npm run build` numa cópia limpa do `main` antes de subir; commitar só os próprios arquivos.

## 7. Como conferir

- Uma OS com NFS-e rejeitada (se não houver no banco, simular nos testes da regra) aparece em Problemas com o motivo.
- Um PPV faturado sem NF aparece como "nota não voltou".
- A tentativa de devolução da NF 840225 (falhou em 19/11) aparece em Envios ao Omie com o erro "Tag [nCodIt] e tag [cCodItInt] não informados!".
- Totais do dia batem com a contagem de `notas_fiscais_docs` do dia por empresa/tipo.
