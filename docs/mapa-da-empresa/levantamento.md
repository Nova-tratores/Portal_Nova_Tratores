# Mapa da empresa — levantamento (lido do código em 23/11/2026)

Base para o fluxograma visual. Cada área: passos → decisões (com TODAS as saídas) → passagens → dinheiro → furos.
Legenda: ↩ = volta/retrabalho · ⚠ = furo · 💰 = dinheiro.

---

## 1. VENDA DE MÁQUINA

**Passos:** Lead → qualificação (manual) → cadastro cliente/máquina → Proposta → PDF → negociação/crédito → desfecho → (estoque ou fábrica) → Pedido de Máquina (PVM) → Omie → faturamento (hoje direto no Omie) → comissão/margem → Entrega Técnica → Pós-vendas (30/60/90 dias, revisões).

**Origem do lead:** feira (/lead) · app de vendas externo · Inteligência de Vendas (prospecção, indicação, perdidas 3m–2a) · recompra (RFM).

**Decisões:**
- Lead: novo → em_contato → qualificado → virou proposta → ganho | perdido | descartado.
- Tipo de máquina: trator | implemento | autopropelido.
- Pagamento: à vista | parcelado | financiado | misto. Crédito: FINAME, Moderfrota, Pronaf, Pronamp, Inovagro, CDC, Consórcio.
- Proposta: Enviar Proposta → Aguardando cliente → Aguardando banco → Vendido | Não vendido.
- Não vendido → motivo (11): Preço, Concorrente (obriga qual), Prazo, Crédito negado, Crédito parcial, Desistiu, Sumiu, Condição pagto, Especificação, Adiou, Outro. ↩ volta como oportunidade "reabordar" após 3 meses.
- Tem estoque? Sim → pedido direto. Não → Pedido à fábrica → Solicitação de Compras.
- SC: Diretoria (aprova qtd | ↩ devolve vendedor) → Financeiro (aprova | ↩ reprova p/ Diretoria) → Comprador (emite PC | ↩ devolve Financeiro). Cancelar em qualquer etapa.
- Fábrica: solicitada → recebida → pedido feito (auto com PC) → máquina recebida → aguardando fatura fábrica → faturado.
- Máquina atrasou (ETA)? mostra "atrasada N dias".
- Pedido pronto p/ Omie? bloqueia sem CPF/CNPJ, vendedor, itens com preço, parcelas = total, datas.
- Cancelar pedido: exige motivo; faturado → cancelar NF no Omie.
- Margem: CMC/Venda <0,80 vermelho · 0,80–0,89 amarelo · ≥0,90 verde.
- Entrega técnica registrada na Mahindra? Sim → prazos contam dela. Não → contam da NF.

**💰** Proposta (valor, pagamento) · custo fábrica + frete · pedido (itens, desconto, parcelas) · comissão = venda × %; margem loja = venda − comissão − (CMC + extras + desconto); pago dia 20 do mês seguinte · custo mensal do vendedor · metas · custo de marketing (ROI).

**⚠ Furos:** lead→proposta manual · proposta muda de fase sem validação · faturamento de máquina fora do portal · venda de máquina NÃO vira card de cobrança no Financeiro · alçada de desconto/comissão só existe no CRM demo · tabelas planejadas sem tela (etapas do crédito, anexos, itens da proposta) · proposta não guarda chassi.

---

## 2. PÓS-VENDAS (OS / Oficina)

**Passos:** Pedido de atendimento (SAT, telefone/WhatsApp, ligação de feedback) → Abertura OS (Orçamento) → aprovação cliente → agendamento → execução → relatório do técnico (app NT_Mecanicos) → Tratorilson preenche → Enviar Omie → Cobrando Cliente → Faturamento → Concluída → pós-fechamento (garantia, cheque revisão Mahindra, ligação de satisfação, oportunidades, resserviço, comissão técnico).

**Decisões:**
- Tipo: Manutenção | Revisão | Entrega Técnica | Inspeção Pré-Entrega. Interna ou externa.
- Cliente aprovou orçamento? Sim → Aprovado (reserva peças) | Não → fica/Cancelada | desmarcou → ↩ volta.
- Peça disponível? Não → "Aguardando peças (em transporte)" (manual). Estoque ≤2 → só alerta.
- Precisa diagnóstico? → "Realizando Diagnóstico".
- Prazo acabou sem relatório? → robô: "Aguardando ordem Técnico" + métrica de atraso.
- Técnico concluiu? Final → Relatório Concluído | Anexo → Relatório Atualizado | Paliativo → Preenchido Paliativo.
- É garantia? Sim → "Preenchido Garantia" (sub-fluxo 2b) | Não → Enviar Omie.
- Texto completo? Não → bloqueia envio.
- Envio deu certo? Sim → Cobrando Cliente | Erro → fica em Enviar Omie.
- Interna? Sim → recibo, peças como remessa, sem financeiro | Não → NFS-e + conta a receber.
- Pode faturar? trava: sem Omie, já faturada, garantia sem montadora, trava 10min, previsão≠hoje, sem projeto, localização, CEP.
- Forma de pagto: 30 | 30/60 | 30/60/90 | 30/60/90/120 | à vista.
- Omie confirmou? Sim → faturada | Recusou → para | Sem resposta → "desconhecido" (conferência) | "Fantasma" (disse que faturou e não faturou) → ↩ volta Cobrando Cliente.
- NFS-e: autorizada | rejeitada (↩ corrigir e reenviar) | aguardando | cancelada.
- OS + todos PPVs faturados? Sim → Concluída | Não → espera.
- Cancelar? faturada → "Corrigir nota" (↩ duplica OS) | não faturada → cancela no Omie com motivo.
- Resserviço? ↩ nova OS. Motivos: mal feito, peça mal montada, faltou item, diagnóstico errado, vazamento, outro.

### 2b. GARANTIA
- Nasce: app técnico | gatilho do relatório | varredura 14 dias | manual. Máx 1 ativa por OS.
- aberta → em_análise ↔ B.O. técnico (↩ falta info).
- Cabe garantia? Não → recusa interna (pode reabrir) | Sim → enviar à fábrica (exige montadora + checklist).
- Fábrica pediu info? → info_pendente ↩.
- Duas etapas (retorno de peças)? só serviço → aguardando serviço | nenhuma peça aprovada → rejeitada + cobra cliente | parcial/total → aguardando serviço → ressarcimento.
- Finalizar: aprovação por item (peças, M.O., deslocamento). O que a fábrica não pagou → cobrança ao cliente.
- Devolver peças? Sim → 30 dias | Não → guarda 90 dias.
- Cobrança cliente: não aplicável | não cobrar (cortesia) | pendente | cobrada | paga | baixada prejuízo.
- Reembolso: OS "Reembolso de garantia" contra a montadora (DRVG Mahindra / SG Kuhn).

### 2c. FEEDBACK / CRM
- Entra no CRM automático? fora se: não faturada, ≤R$1, cortesia/interna, fora D+3–D+15, ligado nos últimos 30 dias, "não contatar".
- Desfecho: não atendeu (+30d / escolhe data) | serviço agendado | vendeu | recusou (motivo) | retornar (data) | número errado (pendência cadastral).
- Nota ≤6 / insatisfeito → alerta gerente. Humor ≤2 → retorno +90d, "cliente sensível".
- Revisão Mahindra faturada sem cheque enviado → pendência.

**💰** horas (R$193/h) + km (R$2,80) + peças + requisições cobradas + extras − descontos · alimentação · garantia (pago pela fábrica, a receber, prejuízo) · comissão técnico (% horas ou fixo 150/250/400/500; não paga garantia da loja, reserviço, retrabalho).

**⚠ Furos:** fases da OS aceitam qualquer pulo · "aguardando peças" manual, sem ligação com a compra · ligação de feedback "serviço agendado" não cria OS · SAT concluído não cria OS · guia de 15/09 desatualizado · OS interna passa por "Cobrando Cliente" para faturar com recibo (código morto removido em 23/11; ideia futura: fase própria "Aguardando recibo").

---

## 3. PEÇAS / ESTOQUE / COMPRAS

**Centro:** PPV (pedido de peças) — serve balcão, oficina (OS) e remessa (garantia/interna).

**Passos:** origem (tela PPV, orçamento, catálogo, Tratorilson, QR) → itens → vínculo OS → reserva (Orçamento Aprovado) → saída física por QR (retirada → liberada) → abate pelo relatório do técnico → Omie (Pedido de Venda ou Remessa) → faturamento → Concluída.

**Decisões:**
- Cliente ativo no Omie? Não → bloqueia.
- Tipo: Pedido (venda) | Remessa.
- Motivo saída: Venda Balcão | Orçamento Cliente | Técnico sem OS | Técnico com OS.
- Tem OS? Sim → herda categoria/projeto/parcelas/fase | Não → fase própria.
- OS de revisão? categoria 1.01.94 | senão 1.01.99.
- Remessa ou venda? Remessa se tipo Remessa ou OS interna.
- É garantia? Sim → CFOP 5.949/6.949, regras fiscais próprias | Não → 5.910.
- NOVA ou CASTRO? produtos exclusivos das duas → bloqueia (separar) | só existe na outra → vai pela outra.
- Omie = portal antes de faturar? divergente → 409 (aceitar diferenças).
- Faturou? confirmado → Concluída | sem resposta → pendente | recusou → erro.
- Unidade retirada: libera | ↩ recusa (volta estoque).
- Peça usada (relatório)? Sim → aplicada | Não → ↩ devolução → estoque.
- Faturou sem liberar? → alerta.

**Sem estoque → 3 caminhos separados (nenhum automático):**
- B1 Requisição: criação → cotação → ≥R$200 autorização Diretor (autoriza | recusa | ↩ valor +10% pede de novo) → NF+valor+fornecedor → financeiro (auto) → conta a pagar → Omie.
- B2 Sugestão de compra: alvo = 45 dias de demanda + mínimo; alertas já_era | crítico | atenção | ok | não comprar → pedido_compra (não vai ao Omie, PDF) → recebimento manual.
- B3 Solicitação de Compras (alçadas, igual à de máquinas); PC digitado à mão.

**Recebimento:** sync do Omie → classifica (máquinas | peças garantia | almoxarifado | peças) → dar entrada (↩ pode reverter) → preço de venda sugerido (peça ×2, máquina ×1,2, só sobe) → alocação (sem locação → pendência) → etiquetas.

**Remessas:** demonstração (30 dias, aviso 5 dias antes; vira venda | renova | devolve) · retorno fornecedor · garantia · OS · conserto.

**💰** preço (Omie, ×2 na entrada) · CMC (Omie) · margem real = preço − (CMC + custo de capital Selic) · conferência de preço (abaixo do custo, sem custo) · curva ABC/giro.

**⚠ Furos:** sem estoque não bloqueia nem abre compra · 3 caminhos de compra desconectados · pedido_compra e PC não vão ao Omie · PPV nasce "Aguardando" (fase que não existe na lista).

---

## 4. FINANCEIRO / CUSTOS

**Quem guarda o dinheiro:** Omie (NOVA e CASTRO). Portal cria cards, lança contas, copia de volta e move cards sozinho.

**Entradas de receita:**
- OS → NFS-e → card de cobrança (OS + peças juntas).
- Peças balcão → card de cobrança.
- Máquina → ⚠ sem card (só Omie/DRE).
- Garantia → NFS-e de reembolso contra a montadora; o que não pagou → cobra cliente (sem card).
- OS interna → recibo, sem card.
- Recibo avulso.

**Card nasce? (OS):** faturada? → não INTERNO? → depois de 18/06/2026? → tem NFS-e com PDF? → não duplicado? → peças vinculadas faturadas? → cria.

**Card a receber:**
- Forma: comprovante (Pix/cartão/cheque/dinheiro) → validar_pix | boleto → gerar_boleto.
- gerar_boleto → (boleto anexado) → enviar_cliente (Pós-Vendas) → enviado → aguardando_vencimento | sem_boleto | pago.
- Robô: recebido no Omie → pago → 7 dias → concluído. Venceu: atrasado no Omie → vencido | em aberto → fica | sem título (boleto 30d) → pago | sem comprovante → vencido.
- Vencido: pode recobrar? (tem boleto, não é Pix/cartão, ≤180 dias) → ticket de recobrança 2 dias úteis | >180 dias → "antigo, sem recobrança".
- E-mails: lembrete 0–5 dias antes; cobrança D+1 e D+7.
- Vigia: parado em gerar_boleto >1 dia útil, enviar >2, sem_boleto >7, vencido sem recobrança >3.

**Conta a pagar:** requisição → rascunho → checklist (NF, boleto, empresa, categoria, conta, parcelas = total, fornecedor) → validado | ↩ rascunho → enviado | erro. Sem código Omie → aguardando_omie (Pós-Vendas). Pago no Omie → concluído.

**Alçadas:** requisição ≥R$200 → Diretor/Dev/permissão · trava antiga >R$500 → Dev · comissão técnico → Diretor assina | ↩ devolve · SC → Diretoria → Financeiro → Comprador · ficha cadastral → Diretor.

**Estrutura de custo (DRE):** Receita bruta − Deduções (devoluções) − CMV (CMC × qtd) = Lucro Bruto; − Despesas fixas (Pessoal, Administrativas, Financeiras/Bancos, Vendas e Marketing, Impostos, Outras) = Resultado. Intercompany NOVA↔CASTRO separado. DRE gerencial por setor com rateio pela receita.
**Blocos do caixa:** Pessoas (folha, benefícios, comissões, viagens) · Contas do mês (fixas, impostos, bens, marketing) · Banco (empréstimos, antecipações, tarifas) · Compras (revenda, Mahindra, consumo, frete, terceiros, devolução).
**Frota:** combustível + manutenção + Rotaexata + multas + requisições → R$/km.
**Dívida cliente:** multa 2% + juros 1% a.m.
**War Room:** margem semanal, giro (≥2 tratores/semana), caixa, meta R$ 2 mi até 31/12/2026.

**⚠ Furos:** máquina e garantia sem card de cobrança · caixa 30/60/90 do War Room digitado à mão · DRE não filtra intercompany nas despesas · chamados de RH sem lugar definido.

---

## 5. CRUZAMENTOS (onde as áreas se encontram)
- **"É garantia?"** aparece em: OS (fase), peças (CFOP da remessa), recebimento (classificação), financeiro (reembolso + cobrança cliente), comissão (não paga).
- **NOVA ou CASTRO?** peças, contas a pagar, cobrança, DRE.
- **Omie** é o ponto final de tudo que vira dinheiro.
- **Venda → Pós-venda:** Entrega Técnica → revisões → feedback → oportunidade → nova venda (ciclo).
- **Solicitação de Compras** é a mesma cadeia para máquina e peça.
- **Retrabalhos (↩) mais caros:** resserviço, nota rejeitada/corrigida, faturamento fantasma, garantia recusada pela fábrica, SC devolvida.
