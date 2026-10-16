# Análise completa do Portal e ideias de evolução

> **Data:** 14/10/2026 · **Base:** GitHub `main`, commit `1d315db3` (~2.000 arquivos, ~330 mil linhas, ~780 rotas de API, ~40 módulos).
> Números de uso e volume: consultas **somente leitura** ao banco de produção. O monitor de uso existe desde 07/10, então os acessos cobrem 8 dias.
> Versão em PDF com o mesmo conteúdo: `Downloads/Portal_Nova_Tratores_Analise_e_Ideias.pdf`.

**Etiquetas de tamanho:** 🔴 Urgente · 🟢 Rápida (dias) · 🟡 Média (semanas) · 🔵 Grande (projeto)

---

## Resumo executivo

O portal já é grande e sofisticado. O desafio agora não é construir mais telas, e sim **ligar o que já existe**, fechar buracos sérios e fazer as pessoas usarem o que está pronto.

| # | Achado | Por que importa |
|---|---|---|
| 1 | **APIs abertas sem login** | A lista de clientes (com CNPJ) e as OS podem ser lidas, criadas e alteradas sem login. É risco de LGPD. |
| 2 | **A OS não sabe de qual máquina é** | Modelo, chassi e horímetro ficam em texto livre. São 6 cadastros de máquina sem chave comum. |
| 3 | **O cliente quase nunca é avisado** | Nada sai automaticamente. O Tratorilson não consegue consultar o status da OS. |
| 4 | **1.069 oportunidades paradas** | O cockpit está pronto, mas só 5 ligações foram registradas. |
| 5 | **km e horímetro mal capturados** | 38% das OS estão com km = 0. Só 247 de 429 relatórios têm horímetro válido. |
| 6 | **Reembolso da Mahindra não conciliado** | O valor é calculado e nunca vira conta a receber. |
| 7 | **Ativos valiosos sem uso** | Base agro (34 mil imóveis), 20 mil notas fiscais, QR da garantia, 38 artigos do KMS, POPs. |
| 8 | **Faltam indicadores de concessionária** | Não há margem por OS, eficiência do técnico, taxa de retorno nem absorção. |

**A ideia que destrava quase todas as outras:** uma **ficha única da máquina** (por chassi), ligada a toda OS, peça, orçamento, garantia e atendimento, com o horímetro registrado em cada visita.

---

## 1. Segurança: o que resolver primeiro

Confirmado no código:
- `src/middleware.ts` só corrige um link antigo de etiqueta (`/P/`) e não verifica login.
- `GET /api/clientes` devolve a base inteira de clientes (~2,9 MB) sem login.
- `GET/POST /api/pos/ordens`, `PATCH /api/pos/ordens/[id]` e `/[id]/fase` funcionam sem login. O `userName` do log vem do corpo do pedido, então a autoria pode ser falsificada.

Outros pontos:
- **Rotas sem helper de autenticação:** ~420 de ~780 (contagem automática). As maiores concentrações são estoque 85, ajustes 70, DRE 58, POS 35 e garantias 34.
- **Disparo de sincronizações sem segredo:** `POST /api/clientes/sync` e `/api/dre-financeiro/sync/all` podem ser chamadas por qualquer um, com risco de bloqueio da chave Omie.
- **Token padrão do Tratorilson no código:** `TOKEN_PADRAO = "tratorilson-nt-6049"`.
- **Fallback silencioso de chave:** 183 arquivos usam `SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Tabelas sem RLS gravadas pelo navegador:** `req_cotacao` e `portal_nt_projetos_PRINCIPAL`.
- **Outras rotas sem login:** `/api/financeiro/notificar`, `/api/lembretes`, `/api/observacoes` e `/api/mecanicos`.

**S1 🔴 Portão único de login (~1 semana)**
- Middleware que nega `/api/*` sem sessão, com allowlist para assinar, cheque, garantia, `/q`, webhooks e crons com segredo.
- Depois, `protegerRota` por módulo.
- Junto: tirar o token padrão, criar um cliente de servidor único que falha se faltar a service role, tirar o usuário do log sempre da sessão e aplicar uma política mínima `authenticated` nas tabelas abertas.

---

## 2. Como a OS funciona hoje

**Volume:** 835 OS (~100/mês), sendo 588 concluídas, **177 canceladas (21%)** e 628 de manutenção.

**Fluxo:**
1. **Abertura:** POS, orçamento, PPV, Tratorilson interno ou retirada de peça. A OS nasce em "Orçamento".
2. **Planejamento:** técnico, data, estimativa ORS e PPV automático na revisão. O técnico recebe push.
3. **Campo:** pelo app externo (`Ordem_Servico_Tecnicos`): horas, km, horímetro, 17 fotos, peças e assinaturas.
4. **Pós-campo (a cada 10 min):** `processarLoteRelatorios` atualiza horas, km e valor, e a IA reescreve o serviço realizado.
5. **Omie:** envio manual (só admin), e a OS vai para "Cobrando Cliente".
6. **Cobrança:** `[id]/cobrar` manda pelo NovaZap valor, PDFs, `/assinar/<token>` e forma de pagamento.
7. **Faturamento:** NFS-e pela Omie. O faturamento pelo portal está pronto e **desligado** (`POS_FATURAR`).
8. **Pós-OS:** vigia de revisões, cheque Mahindra, lembretes e cockpit.

**Fases:** são 18. Hoje **6 estão com zero OS** (Orçamento Aprovado, Relatório Atualizado, Executada, Executada aguardando comercial, Aguardando outros, Enviado Para Omie). Os logs ainda usam fases que não existem mais, e `fase.ts:65` trata uma fase "Aguardando Cliente" que não existe.

---

## 3. Problemas encontrados na OS

- **km:** a estimativa ORS calcula a rota, mas não preenche `Qtd_KM`. Desde abril, **38% das OS têm km = 0** (só 3% são de oficina). Em 30 de 321 OS, o km do técnico difere em mais de 5 km da OS (OS-0253: 25 × 175; OS-0251: 0,3 × 300).
- **Três preços de km:** POS R$ 3,60 · Orçamentos R$ 2,80 (`lib/orcamentos/servicos.ts`) · Garantias R$ 2,80 (`lib/garantias/constants.ts`).
- **Horímetro:** só 247 de 429 relatórios têm valor numérico. O horímetro de manutenção não alimenta `calcularPrevisao`.
- **Duas automações de fase:** `autoMoveByDate` roda dentro do GET da lista, e o cron `auto-fase` tem outra regra. As duas movem uma OS ainda em "Orçamento" para "Execução" só porque a data chegou.
- **OS travadas:** 25 em "Aguardando ordem Técnico" (a mais antiga há 198 dias) e 24 em "Preenchido Garantia" (mediana de 61 dias). `verificar-atrasos` não tem chamador nem login, compara a fase sem acento e só olha atrasos de 1 a 5 dias.
- **Cancelamentos:** 25 sem motivo, ~10 duplicadas e 9 de teste. Não há aviso de OS duplicada, e o id é gerado como max+1 (risco de corrida).
- **Assinatura em dobro:** o `AssCliente` do app é ignorado pela cobrança e pela impressão.
- **Mensagem de cobrança fixa:** diz "orçamento das revisões" até nas OS de manutenção.
- **Regra de revisão só no robô:** a regra de mão de obra está em `api/assistente/novazap/route.ts`. A OS de revisão nasce com o PPV **vazio**.
- **Orçamento → OS perde dados:** força o tipo "Manutenção" e deixa o projeto e o chassi em branco.
- **Agenda em 4 lugares:** campos da OS, `agenda_tecnico`, `agenda_visao` e lousa. O 2º técnico fica sem agenda, e a ordem das visitas é a de inserção.
- **"Último vence" ao salvar:** já apagou relatório (OS-0418).
- **Campos vazios desde abril:** `Previsao_Faturamento` em 44% e `Data_Fim_Servico` em 24%. A OS não tem campo de **origem**.

---

## 4. Ideias para a Ordem de Serviço

### Rápidas 🟢
- **4.1 km da rota + preço único:** preencher `Qtd_KM` com a distância da estimativa e fazer orçamentos e garantias lerem `getConfigPOS`.
- **4.2 Cancelamento com motivo de lista + aviso de duplicada:** id da OS gerado por sequência no banco.
- **4.3 Cobrança por tipo de OS + aproveitar o `AssCliente`:** o cliente não assina de novo.
- **4.4 Fila "relatório faltando":** lembrete diário ao técnico por `mecanico_notificacoes`/push. Corrigir ou apagar o `verificar-atrasos`.
- **4.5 Uma automação de fase só:** remover a do GET, não executar sem aprovação e esconder as 6 fases sem uso.
- **4.6 Checagem de `updated_at` no PATCH:** devolve 409 quando o formulário está desatualizado.

### Médias 🟡
- **4.7 Campos estruturados:** `chassi`, `horimetro` (validado) e `origem`. Cada leitura vai para um histórico por chassi.
- **4.8 Plano de revisão e tempo-padrão por modelo:** tabela única com escopo, kit, horas e cortesia, usada pelo robô, pelo orçamento e pela OS. A OS de revisão já nasce com o kit.
- **4.9 SLA por fase:** usa o `dataFase` de `logs_ppo`, com card vermelho e painel de garantias paradas.
- **4.10 Agenda única + roteiro do dia por proximidade:** usa `clientes_coordenadas` e ORS.
- **4.11 Conferência humana de km e horas divergentes:** usa `PropostaAtualizacao.antes`. Ligar `/api/pos/cron/gravar-gps` e mostrar km real × km do técnico × km cobrado.

### Grandes 🔵
- **4.12 Margem real por OS:** NFS-e + peças − (custo-hora × horas + km real × custo/km da frota + alimentação + requisições + CMC). Ranking por técnico, cidade e tipo.
- **4.13 Retrabalho por chassi:** aviso quando há OS do mesmo sistema há menos de 90 dias, mais um indicador por técnico.
- **4.14 Áudio do técnico vira relatório:** reaproveita o `transcreverAudio` do NovaZap. Depende do repositório `ntmecanicos`.
- **4.15 Checklist por modelo com fotos antes/depois:** fotos no Storage, em vez de base64 na linha.
- **4.16 Kit de peças sugerido para manutenção:** minerar `PecasInfo` + PPV por modelo e motivo.

---

## 5. Comunicação com o cliente e interna

| Momento | Hoje |
|---|---|
| OS aberta/agendada | ❌ nada |
| Técnico a caminho | ❌ nada (GPS sem cron, `tecnico_viagens` vazia) |
| Peça chegou | ❌ nada (a alocação só avisa o Danilo) |
| Orçamento para aprovar | ⚠️ manual, sem envio |
| Concluído/cobrança | ⚠️ 1 clique "Cobrar" (único envio do POS pela API do NovaZap) |
| Nota/boleto | ⚠️ e-mail automático; WhatsApp só por `wa.me`, sem registro |
| Próxima revisão / satisfação | ⚠️ viram tarefas de ligação |

**O caso mais comum:** o cliente pergunta "e o meu trator?" e o Tratorilson não tem ferramenta de OS, PPV ou boleto. Ele cai em `[PERGUNTAR_EQUIPE]` e fica em silêncio.

**Problemas:**
- 4 cadastros de contato soltos.
- Dois mundos de envio (API × `wa.me`).
- O atendente do NovaZap não vê a OS.
- Toda troca de fase notifica **todos os admins**.
- `DESTINATARIOS_PECAS` fixo no código.
- Técnico ↔ loja em mão única.

**Ideias:**
- 🟢 **5.1 Ferramenta `status_os` no Tratorilson** (alto impacto): mostra valores e boleto só para contato vinculado ao CNPJ.
- 🟢 **5.2 Todo envio pelo NovaZap:** assinatura, cheque e boleto pela rota da cobrança; `wa.me` fica como reserva.
- 🟢 **5.3 Sino limpo:** só o responsável é avisado, e só nas fases-chave.
- 🟢 **5.4 OS na ficha do contato do NovaZap:** via `/api/clientes/info-pasta`.
- 🟡 **5.5 Linha do tempo automática no WhatsApp:** gancho em `aplicarMudancaFase`, com opt-in, horário de atendimento e anti-spam.
- 🟡 **5.6 Link público `/os/<token>` com "Aprovar orçamento":** no molde de `/g/[id]`, `/assinar` e `/cheque`.
- 🟡 **5.7 "Peça chegou" avisa a OS:** pelo motor de alocação.
- 🟡 **5.8 Lembrete de revisão e pesquisa pós-OS no WhatsApp.**
- 🟡 **5.9 Resumo diário para o gerente:** pelo agendador interno.
- 🔵 **5.10 Técnico a caminho com hora estimada.**
- 🔵 **5.11 Conversa interna na OS com @menções:** usando o motor de Tickets e `tickets_vinculos`.
- 🔵 **5.12 Contato único da OS:** tabela `os_contatos`, com o NovaZap como fonte da verdade.

---

## 6. A máquina no centro: integração dos módulos

**Seis cadastros de máquina:**
- `tratores` (310, cadastro manual);
- `portal_nt_projetos_PRINCIPAL` (nome "MARCA MODELO CHASSI");
- `portal_nt_projetos_chassis` (o sync não é chamado);
- `produtos`;
- CRM `maquinas` (vazia);
- `maquinas_localizacao`.

O histórico do cockpit junta ~13 fontes com `ilike '%final7%'`. Existem dois históricos de máquina paralelos.

**🐞 Bug:** `revisao_emails.chassis_final` usa os **4 últimos caracteres** do chassi. É usado em `api/revisoes/route.ts:55`, `vigia-revisoes.ts`, `checarIrregularidade.ts` e `cheque-db.ts`. Dois tratores com o mesmo final herdam a revisão um do outro e o vigia fica calado.

**Outros pontos:**
- A garantia usa heurísticas para achar o chassi, e `.maybeSingle()` em `Ordem_Servico_Tecnicos` devolve nulo quando há rascunhos.
- **O reembolso da Mahindra não vira conta a receber.** A OS de garantia vai com `cNaoGerarFinanceiro='S'`, sem conciliação.
- A venda do trator é registrada à mão na revisão de 50 h.
- A reserva de peças só serve de alerta. `revisoes45d` na sugestão de compra é **sempre 0**.
- O vínculo OS↔PPV fica em dois lugares (CSV `ID_PPV` e `pedidos.Id_Os`).
- A SAT não vira OS.

**Ideias:**
- 🟢 **6.1 Correções baratas:**
  - chassi completo em `revisao_emails`;
  - relatório *enviado* mais recente na garantia;
  - orçamento → OS levando tipo, projeto e chassi;
  - OS de revisão já com o kit;
  - botão "Abrir OS" na SAT.
- 🟡 **6.2 Horímetro de qualquer OS atualiza o trator:** tabela `trator_leituras`; `calcularPrevisao` passa a usar a última leitura.
- 🟡 **6.3 Reembolso da Mahindra como conta a receber conciliada:** aprovado × recebido, com o atraso da fábrica.
- 🟡 **6.4 Estoque real (estoque − reservas) na OS:** usa `lib/ppv/estoque-reserva.ts`.
- 🔵 **6.5 Ficha única da máquina:** tabela `maquina` com chassi normalizado UNIQUE e FK `maquina_id` em OS, PPV, orçamento, requisição, garantia, cheque e feedback. Backfill com o casador de `maquina-db.ts`. **É a base de tudo.**
- 🔵 **6.6 Venda do trator cria a máquina e agenda a 50 h.**
- 🔵 **6.7 Previsão de compra de peças pelas revisões a vencer:** preenche `revisoes45d`.

---

## 7. O que está sendo desperdiçado

**Uso (8 dias):**
- 13 de 29 usuários entraram.
- 56% dos acessos vêm de 3 contas de T.I./Dev.
- 7 técnicos só têm `painel-mecanicos` e nunca entram.
- **Mais usados:** opa 295, dashboard 262, pos 233, financeiro 163, requisições 107, estoque 99, tickets 98.
- **Quase mortos:** dashboard-agro 2 (7 pessoas têm acesso), marketing 2, mecânicos 2, conhecimento 3, orçamentos 4, gestão de vendas 5, pops 8, vendas-modelo 1.

**Construído e parado:**

| O quê | Situação | Falta |
|---|---|---|
| Cockpit de oportunidades | **1.069 abertas, 5 ligações** | Gente ligando, com meta |
| Faturar OS pelo portal | Desligado | Migration `pos-faturamento.sql`, piloto e `POS_FATURAR` |
| Tratorilson no WhatsApp | Modo teste | Liberar o fluxo de revisão para todos |
| Base agro | 0 vínculos, **139 sugestões pendentes**, regras vazias | 1–2 h do comercial + LIA assinado |
| KMS | 38 rascunhos, 1 publicado | Aprovação |
| POPs | 26 POPs, 0 execuções | Agendar 2–3 reais |
| War Room | 0 decisões, fora do menu | Usar ou aposentar |
| `revisao_lembretes` | Vazia, sem cron | Agendar |
| `tecnico_viagens` / GPS | Vazia, sem cron | Ligar ou substituir pela frota |
| `sync-chassis` | Sem chamador | Agendar |
| Telas órfãs | cronograma/projeto, `/crm` demo, `/meu-painel`, `/agenda-tecnicos` | Apagar ou religar |
| `painel-mecanicos` | ~6.400 linhas, sem uso | Aposentar |
| `portal_logs` | 5.310 linhas aposentadas | Dropar |

**Dado não aproveitado:**
- **Base agro:** 34.029 imóveis em 45 municípios e 9.748 operações SICOR. Serve para prospecção de trator, implemento e peças.
- **QR da garantia:** 24 sessões por semana, sem divulgação. É o embrião de um portal do cliente.
- **Notas fiscais em cache:** 20.589 PDFs + XML. Dá para montar o histórico de peças por cliente e sugerir recompra.
- **`frota_dias`:** 4.326 dias. As 140 "paradas atípicas" por semana são o carro em casa, por falta de geocerca.
- **`audit_log`:** 22.010 linhas, que dão o tempo de ciclo dos processos.
- **Visitas do CRM:** 251, das quais 151 caem num CAR.
- **Perguntas ao Tratorilson:** podem virar o FAQ real.

**Apostas maiores:**
1. **Máquina de revisões:** horímetro → lembretes → cockpit com meta → **planos de manutenção pré-pagos** (50/300/600 h).
2. **Ciclo de vida da máquina:** score de troca (idade + horímetro + gasto em OS + perfil agro), com lista por vendedor e proposta pré-preenchida. Primeiro passo: regra **R9**.
3. **Base agro → prospecção:** LIA, regras, 139 sugestões e 30 imóveis "alta" por vendedor.
4. **Página da garantia → portal do cliente:** próxima revisão, cheque/assinatura e botão "agendar / pedir peça".
5. **Tratorilson vendedor de revisão e peças:** liberar o fluxo de revisão com trava humana.
6. **Frota → custo real por técnico e por OS:** geocercas + cruzamento com as OS.
7. **Arrumação de adoção:** com 30 dias de uso, decidir o que forçar e o que aposentar.

---

## 8. Gestão e indicadores

**O que existe:**
- Histórico de faturamento de peças e serviço.
- `DashboardOS` (valor do portal, não da nota: OS-0777 mostra R$ 300 no portal × R$ 812 na NFS-e).
- `/api/mecanicos`, com resumo da oficina mensal e sem custo fixo.
- DRE com margem por família (o filtro de departamento existe e não é usado).
- War Room sem nenhum indicador de pós-vendas.
- ABC/giro/sugestão de compra e oportunidades R1–R8.

**O que falta** (os dados já existem):
- margem por OS, técnico, cliente e região;
- eficiência do técnico (falta a jornada);
- absorção;
- taxa de retorno;
- tempo por fase;
- fill rate;
- comercial usando o histórico de OS.

**Obstáculo:** o técnico é identificado pelo **nome** (`nomesBatem`), não por um id.

**Ideias:**
- 🟢 **8.1** Pós-vendas na War Room.
- 🟢 **8.2** Taxa de retorno, tempo por fase, corte por cidade e divergência portal × NFS-e no `DashboardOS`.
- 🟢 **8.3** Regra **R9 "candidato a trator novo"**.
- 🟡 **8.4** Cadastro do técnico com id e jornada, que permite medir eficiência e produtividade.
- 🟡 **8.5** Absorção mensal (lucro bruto de peças + serviço ÷ custo fixo), com meta de 100%.
- 🟡 **8.6** Fill rate de peças.
- 🟡 **8.7** Relatório semanal de faturamento por e-mail (etapa 2).

---

## 9. Saúde técnica

| Prio. | Risco | Correção |
|---|---|---|
| P0 | APIs sem login | Middleware + `protegerRota` (~1 semana) |
| P0 | 79 tabelas lidas e 49 componentes escrevendo direto do navegador; algumas sem RLS | Advisor de segurança, política mínima e escritas por rota (2–3 semanas) |
| P1 | Fallback de chave em 183 arquivos, 207 `createClient` | Cliente de servidor único que falha sem a service role (2–3 dias) |
| P1 | 306 SQLs manuais sem versionamento, ~20 "aplicar/conferir" | Supabase CLI ou tabela `schema_versions` |
| P1 | Agendamento em 3 sistemas (52 workflows do GitHub atrasam horas; jobs internos duplicam com mais de 1 instância) | Agendador interno com lock no banco (~2 semanas) |
| P2 | Sem CI (125 arquivos de teste) | Workflow com vitest, tsc e build (1 dia) |
| P2 | Sem observabilidade, `.catch(() => {})` | Sentry + alerta de cron que falhou |
| P2 | Performance (`/api/clientes` 2,9 MB; kanban inteiro; GET com efeito colateral; fotos base64) | Paginação, nada de escrita em GET, fotos no Storage |
| P2 | Identidade dos dados (técnico por nome, datas em texto, "Castro Pecas" × "Peças") | Views canônicas |
| P3 | JS legado (114 arquivos, 44,5 mil linhas, DRE) e 1.748 `any` | Migrar quando mexer |

> **Correção no CLAUDE.md:** `sql/notas-fiscais-cache.sql` aparece como "⚠️ APLICAR", mas **já está aplicada** (`notas_fiscais_docs` tem 20.997 notas, 20.589 com PDF).

---

## 10. Roteiro sugerido

1. **Fechar a porta (1–2 sem.):** S1, token, cliente único, RLS mínimo, CI.
2. **Consertar o que custa dinheiro (2 sem.):** 6.1, 4.1, 4.3, 4.2, 4.4, 4.5, 4.6.
3. **Cliente informado (2–3 sem.):** 5.1, 5.2, 5.3, 5.4, 5.9.
4. **Fundação: máquina e horímetro (1–2 meses):** 6.5, 4.7, 6.2, 4.8, 6.6, 8.4.
5. **Experiência do cliente (1–2 meses):** 5.6, 5.5, 5.7, 5.8 e Aposta 4.
6. **Gestão e crescimento (contínuo):** 4.12, 8.5, 6.3, 6.7, Aposta 2 (R9) e Aposta 1 (planos pré-pagos).

**Em paralelo, sem código:**
- uma pessoa na fila de 1.069 oportunidades;
- LIA do agro, regras e 139 sugestões;
- aprovar os 38 artigos do KMS;
- agendar 2–3 POPs;
- geocercas das casas dos técnicos;
- revisão de uso dos módulos no fim de outubro.

---

### Arquivos-chave citados
- **POS:** `src/app/api/pos/ordens/route.ts` · `src/app/api/pos/ordens/[id]/route.ts` · `src/app/api/pos/ordens/[id]/cobrar/route.ts` · `src/app/api/pos/ordens/auto-fase/route.ts` · `src/lib/pos/fase.ts` · `src/lib/pos/atualizar-relatorio.ts` · `src/components/pos/OSDrawer.tsx` · `src/app/api/pos/estimativa/route.ts` · `src/lib/pos/emails-pecas.ts`
- **Tratorilson e NovaZap:** `src/app/api/assistente/novazap/route.ts` · `src/lib/assistente/retorno-cliente.ts` · `src/lib/chatwoot/cliente.ts`
- **Revisões e máquina:** `src/lib/revisoes/utils.ts` · `src/lib/pos/vigia-revisoes.ts` · `src/lib/feedbacks/atendimento/maquina-db.ts` · `src/lib/feedbacks/oportunidades/r1-revisao.ts`
- **Peças e estoque:** `src/lib/estoque/sugestao-compra/motor.ts` · `src/lib/ppv/estoque-reserva.ts`
- **Outros:** `src/app/api/painel-mecanicos/verificar-atrasos/route.ts` · `src/app/g/[id]/page.tsx` · `src/middleware.ts` · `src/instrumentation.ts`
