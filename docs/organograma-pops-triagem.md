# Triagem: tarefas do organograma → POPs (proposta de 29/10/2026)

Fonte: as 92 tarefas de `org_tarefas` (81 da rotina do Pós-vendas, 11 da planilha do Mariano).
Números = ordem da tarefa na lista (pos-vendas `P#`, Mariano `M#`).

**Regra:** no portal um POP é executado por UMA pessoa, do começo ao fim, numa execução só (os passos
não têm responsável próprio e ainda não há ramificação). Então: **um POP por momento de execução**,
agrupados pelo processo. Tarefas que são etapas da mesma pessoa em sequência viram um POP só; o mesmo
processo feito por pessoas diferentes em dias diferentes vira vários POPs.

Prioridade: **A** = prazo ou dinheiro em jogo · **B** = muitos passos / gente nova erra · **R** = rotina
recorrente (vira execução automática pela recorrência do POP) · **C** = pode esperar.

## Processo: Ciclo da OS (Pós-vendas)

| # | POP proposto | Quem executa | Tarefas cobertas | Partir de | Prior. |
|---|---|---|---|---|---|
| 1 | Abrir OS (entrada na oficina, saída do técnico, revisão) — inclui o orçamento e o pedido de venda da revisão | Auxiliar Adm 1 | P1 Abrir O.S · P47 OS quando trator entra · P48 OS de revisão · P25 Orçamento de revisão · P7 Pedido de venda da revisão | MOD-OFI-002 | A |
| 2 | Entrega técnica e inspeção pré-entrega | Auxiliar Adm 2 | P46 OS de entrega técnica · P49 OS de pré-entrega | MOD-OFI-001 | B |
| 3 | Atualizar e fechar a OS | Auxiliar Adm 1 | P51 Atualizar OS com o talão · P3 Fechar O.S | — | A |
| 4 | Reembolso da revisão (cheque + e-mail à Mahindra) | Auxiliar Adm 1 | P8 Enviar cheque de revisão · P77 E-mail de pagamento 50 h/900 h e pré-entrega | — | A |
| 5 | Pós-venda ao cliente (3 e 10 dias depois) | Estagiário | P27 Satisfação 3 dias depois · P57 Mensagem 10 dias depois · P81 Coletar feedbacks | cockpit de atendimento | B |

## Processo: Chegada de máquina

| # | POP proposto | Quem executa | Tarefas cobertas | Partir de | Prior. |
|---|---|---|---|---|---|
| 6 | Receber trator/implemento e enviar o PDI à Mahindra (até 3 dias) | Gerente Pós-Vendas / Auxiliar Adm 2 | P15 Receber tratores e implementos · P5 Enviar PDI | MOD-PEC-001 (adaptar) | A |
| 7 | Pasta do trator | Auxiliar Adm 1 / Gerente / Estagiário | P12 Montar pasta do trator · P11 Organização de pastas | — | C |

## Processo: Garantia Mahindra

| # | POP proposto | Quem executa | Tarefas cobertas | Partir de | Prior. |
|---|---|---|---|---|---|
| 8 | Garantia: abrir, montar, enviar (até 2 dias) e fechar | Auxiliar Adm 2 | P6 Enviar SG · P34 Solicitação de garantia · P52 Abertura · P53 Montagem · P54 Envio · P55 Fechamento | — | A |

## Processo: Financeiro da oficina

| # | POP proposto | Quem executa | Tarefas cobertas | Partir de | Prior. |
|---|---|---|---|---|---|
| 9 | Faturamento errado: devolver NF e cancelar boleto | Auxiliar Adm 1/2 (pede o cancelamento ao Financeiro) | P14 Devolver NF · P13 Cancelar boleto | — | A |
| 10 | Reembolsos da fábrica no mês (dia 01) | ⚠ Financeiro × Auxiliar Adm 1 | P59 Cobrar pagamento de revisões · P78 NF de garantias recebidas | — | A |
| 11 | Fechamento do mês da oficina | Gerente Pós-Vendas (+ Auxiliar Adm 1) | P70 Folgas do mês · P71 Relatório de comissão · P72 Relatório de faturamento | — | R |

## Processo: Rotina diária e estrutura

| # | POP proposto | Quem executa | Tarefas cobertas | Partir de | Prior. |
|---|---|---|---|---|---|
| 12 | Abertura do dia da oficina (agenda, lousa, quadros, distribuição) | Auxiliar Adm 1 | P28 Agenda da oficina · P10 Lousa · P2 Quadros brancos · P21 Distribuição de serviço · P32 Distribuição dos serviços · P4 Conferir relatório de status (automático) | MOD-ADM-001 (adaptar) | R |
| 13 | Limpeza (pátio, lavador, oficina, banheiro, cozinha) | Valdir | P17 · P18 · P19 · P44 · P45 (P44/P45 estão sem responsável na planilha) | — | R |
| 14 | Organização do pátio (a cada 15 dias) | Todos os mecânicos | P16 | — | R |

## Processo: Caminhão e frota

| # | POP proposto | Quem executa | Tarefas cobertas | Partir de | Prior. |
|---|---|---|---|---|---|
| 15 | Viagem do caminhão (buscar/entregar máquina, munck) | Motorista | P41 Buscar · P42 Entregar · P43 Operar munck | MOD-FRO-001 | B |
| 16 | Frota: combustível, manutenção e deslocamento do caminhão | Auxiliar Adm 2 (+ Adm 1) | P67 Controle de deslocamento (semanal) · P20 Manutenção e combustível · P56 Financeiro combustível | — | R |

## Processo: Produtos (Mariano)

| # | POP proposto | Quem executa | Tarefas cobertas | Partir de | Prior. |
|---|---|---|---|---|---|
| 17 | Entrada de produtos (com cadastro quando é produto novo) | Mariano | M4 Entrada de produtos · M5 Cadastro no sistema | MOD-PEC-001 | B |
| 18 | Saída de produtos | Mariano | M6 | MOD-FIS-001 | B |
| 19 | Inventário rotativo | Mariano | M7 | MOD-PEC-002 | R |
| 20 | Pedido na fábrica | Mariano | M11 (o fluxo pedido fábrica → SC → PC já existe nos Tickets) | — | C |
| 21 | Conferência de NF de fornecedor | Gerente Pós-Vendas | P79 | MOD-PEC-001 | C |

**Total: 21 POPs cobrindo 55 das 92 tarefas** (prioridade A: 7 · B: 5 · R: 6 · C: 3).

## Não viram POP (37 tarefas)

| Por quê | Tarefas |
|---|---|
| Hábito/postura, não procedimento (melhor como regra da equipe) | P24 Relacionamento com cliente · P31 Apresentação visual · P68 Contato proativo · P39 Contato entre funcionários e clientes · P26 Oferta de serviços |
| Rotina sem passos definidos | P9 / P50 Verificar e-mail · P22 Acompanhar os serviços · P29 Receber solicitação de manutenção · P23 Orçamento de peças · P69 Auditoria |
| O sistema já é o procedimento | P73 Gerar requisições · P74 Atualizar requisições (módulo Requisições) · P30 Cobrança · P33 Recebimento dos clientes (cobrança da OS) · P63 Produtos sem família (robô do estoque) |
| Já automatizado | P60 · P61 · P62 relatórios semanais · P76 Sistema automático de relatório · P75 Backup |
| Relacionamento com fornecedor / gestão de pessoas (caso a caso) | P35 · P36 · P37 · P38 · P40 Avaliação dos funcionários · P66 Uniformes e EPI · P80 Boleto de terceirizados · P58 Ofertas de combustível |
| Sob demanda, sem rotina | P64 Solicitação de serviço · P65 Serviços de terceiros |
| Atividades do Mariano que são contato, não procedimento | M1 Atender vendedores · M2 Conversar com clientes · M3 Conversar com o DLL · M8 Contrato com clientes · M9 Correios · M10 Cartório |

## Decisões para aprovar

1. **POP 10** mistura funções (Financeiro cobra as revisões; Auxiliar Adm 1 emite a NF das garantias). Separar em dois ou passar tudo para um só?
2. **POP 5 × cockpit de atendimento:** o pós-venda ao cliente já tem tela (Feedbacks → Atendimento). O POP descreve o roteiro e o cockpit registra; ok assim?
3. **POP 1** junta três variações de abertura (entrada, saída do técnico, revisão) porque os passos são quase iguais; entrega técnica e pré-entrega ficam no POP 2 (passos bem diferentes).
4. **Limpeza do banheiro e da cozinha** (P44/P45) não têm responsável na planilha — o POP 13 assume Valdir.
5. **Ordem de criação sugerida:** primeiro os 7 de prioridade A (1, 3, 4, 6, 8, 9, 10), depois as rotinas R (que passam a nascer sozinhas todo dia/mês).
6. **Donos e aprovadores dos POPs por área** precisam ser definidos antes de publicar (hoje nenhuma área tem).
