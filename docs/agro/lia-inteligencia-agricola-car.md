# LIA — Avaliação de Legítimo Interesse (LGPD)
## Módulo "Inteligência Agrícola por CAR" — Nova Tratores

> Rascunho da Fase 0 (25/09/2026). Uma página, para ser revisada e assinada pela direção.
> Base legal pretendida: **legítimo interesse** (LGPD, art. 7º, IX e art. 10).

### 1. Finalidade
Priorizar a prospecção comercial de máquinas agrícolas na área de atuação da concessionária, estimando para cada imóvel rural (CAR) a cultura principal, a área cultivada e a existência de crédito rural recente. O resultado é uma lista de prospecção interna, usada pela equipe de vendas e pelo cockpit de atendimento do portal.

### 2. Dados tratados e origem
| Dado | Fonte | Natureza |
|---|---|---|
| Polígono e código do imóvel rural (CAR), área, módulos fiscais, status | SICAR (base pública federal) | Dado do imóvel; o código do CAR pode ser associado a uma pessoa física |
| Uso do solo por safra (classes de cultura) | MapBiomas (público, licença CC-BY) | Dado ambiental, não pessoal |
| Operações de crédito rural: valor, finalidade, produto, área financiada, ano, glebas (coordenadas) | Microdados SICOR / Banco Central (público, já anonimizado: sem nome, CPF ou CNPJ do mutuário) | Dado de operação; a gleba georreferenciada pode ser associada a um imóvel |
| Produção agrícola municipal | IBGE PAM (público) | Agregado, não pessoal |
| Vínculo CAR ↔ cliente da Nova (código Omie) | Interno, informado manualmente pelo vendedor | Dado pessoal do cliente (já tratado sob a relação comercial existente) |
| Localização das visitas presenciais dos vendedores (GPS, data, vendedor, cliente visitado) | Interno, app CRM da Nova (`visitas`) | Dado operacional já coletado pela empresa; usado só para SUGERIR o vínculo CAR↔cliente, que um humano confirma |
| Validação de cultura ("cultura confirmada / errada") | Interno, informado pelo vendedor | Observação de campo |

**Não são tratados:** nome, CPF/CNPJ ou contato do titular do CAR obtidos de fontes públicas; renda; dados sensíveis. O módulo **não identifica automaticamente o dono do CAR**. O contato só acontece com clientes já cadastrados na Nova ou por prospecção convencional.

### 3. Necessidade e proporcionalidade
- Os dados públicos usados são divulgados pelos próprios órgãos com finalidade de transparência e planejamento. O tratamento aqui é estatístico e agregado por imóvel, sem enriquecimento com dados de pessoa física.
- Alternativa menos invasiva considerada: usar só o agregado por município (IBGE/SICOR agregado). Descartada como única fonte porque não permite priorizar imóveis, que é a finalidade do módulo. O agregado municipal continua sendo o fallback caso as glebas não sejam utilizáveis (portão da Fase 0).
- Retenção: histórico de 3 a 5 safras/anos de crédito, o mínimo para detectar tendência. Execuções antigas do pipeline são descartadas quando substituídas.

### 4. Balanceamento com os direitos do titular
- Expectativa razoável: o produtor que registrou o CAR e contratou crédito rural sabe que esses dados são públicos. O uso é para oferta comercial de bens ligados à própria atividade dele, sem decisão automatizada que lhe negue algo.
- Risco de impacto: baixo. Não há perfilamento sensível, não há venda ou repasse de dados, não há exposição externa.
- Salvaguardas: acesso restrito por papel no portal (permissão própria do módulo), leitura via views, escrita humana só por RPC auditada, nível de confiança sempre visível (evita decisões com base em dado incerto), **proibição de exportar dado de pessoa física para fora da empresa**, registro de quem consultou/exportou (audit_log).

### 5. Quem acessa e por quanto tempo
- Acesso: equipe comercial e gestão, conforme permissão no Admin do portal. Manutenção técnica: responsável pelo portal.
- Retenção dos dados derivados: enquanto o módulo estiver em uso; reprocessamento anual substitui a versão anterior. Vínculos e validações seguem o ciclo de vida do cadastro do cliente.

### 6. Direitos do titular e canal
Pedidos de acesso, correção ou oposição são atendidos pelo canal de atendimento da Nova Tratores e registrados no portal. Em caso de oposição, o CAR é marcado como "não contatar" (mesmo mecanismo já usado no módulo de Feedbacks & CRM).

### 7. Decisão
| Campo | Preenchimento |
|---|---|
| Responsável pelo tratamento | Nova Tratores Máquinas Agrícolas Ltda. |
| Encarregado (DPO) | *(a definir)* |
| Avaliação | *(aprovado / aprovado com ressalvas / reprovado)* |
| Data e assinatura | |
