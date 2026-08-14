-- ============================================================================
-- Tabelas de códigos fiscais para os dropdowns do "Item de Orçamento" (PPV).
--  - cfop:          importado do Omie (ListarCFOP, 676 registros) por script.
--  - codigo_fiscal: listas nacionais fixas (SEFAZ) — CST ICMS, Origem,
--                   Modalidade BC, CST IPI, Enquadramento IPI, CST PIS/COFINS.
-- Rodar no Supabase (idempotente). Depois eu rodo a importação dos CFOPs.
-- ============================================================================

create table if not exists cfop (
  codigo    text primary key,
  descricao text,
  tipo      text            -- 'E' entrada / 'S' saída
);

create table if not exists codigo_fiscal (
  tipo      text not null,  -- origem_icms|cst_icms|mod_bc_icms|cst_ipi|enq_ipi|cst_pis|cst_cofins
  codigo    text not null,
  descricao text,
  ordem     int,
  primary key (tipo, codigo)
);

insert into codigo_fiscal (tipo, codigo, descricao, ordem) values
-- Origem da Mercadoria
('origem_icms','0','Nacional, exceto as indicadas nos códigos 3 a 5, 6 e 7',0),
('origem_icms','1','Estrangeira - Importação direta, exceto a indicada no código 6',1),
('origem_icms','2','Estrangeira - Adquirida no mercado interno, exceto a indicada no código 7',2),
('origem_icms','3','Nacional, mercadoria ou bem com Conteúdo de Importação superior a 40% e inferior ou igual a 70%',3),
('origem_icms','4','Nacional, produção conforme processos produtivos básicos (Dec.-Lei 288/67 e afins)',4),
('origem_icms','5','Nacional, mercadoria ou bem com Conteúdo de Importação inferior ou igual a 40%',5),
('origem_icms','6','Estrangeira - Importação direta, sem similar nacional, constante em lista CAMEX e gás natural',6),
('origem_icms','7','Estrangeira - Adquirida no mercado interno, sem similar nacional, lista CAMEX e gás natural',7),
('origem_icms','8','Nacional, mercadoria ou bem com Conteúdo de Importação superior a 70%',8),
-- CST ICMS
('cst_icms','00','Tributada integralmente',0),
('cst_icms','10','Tributada e com cobrança do ICMS por substituição tributária',10),
('cst_icms','20','Com redução de base de cálculo',20),
('cst_icms','30','Isenta/não tributada e com cobrança do ICMS por substituição tributária',30),
('cst_icms','40','Isenta',40),
('cst_icms','41','Não tributada',41),
('cst_icms','50','Suspensão',50),
('cst_icms','51','Diferimento',51),
('cst_icms','60','ICMS cobrado anteriormente por substituição tributária',60),
('cst_icms','70','Com redução de base de cálculo e cobrança do ICMS por substituição tributária',70),
('cst_icms','90','Outras',90),
-- Modalidade Base de Cálculo ICMS
('mod_bc_icms','0','Margem Valor Agregado (%)',0),
('mod_bc_icms','1','Pauta (Valor)',1),
('mod_bc_icms','2','Preço Tabelado Máx. (valor)',2),
('mod_bc_icms','3','Valor da Operação',3),
-- CST IPI
('cst_ipi','00','Entrada com recuperação de crédito',0),
('cst_ipi','01','Entrada tributável com alíquota zero',1),
('cst_ipi','02','Entrada isenta',2),
('cst_ipi','03','Entrada não-tributada',3),
('cst_ipi','04','Entrada imune',4),
('cst_ipi','05','Entrada com suspensão',5),
('cst_ipi','49','Outras entradas',49),
('cst_ipi','50','Saída tributada',50),
('cst_ipi','51','Saída tributável com alíquota zero',51),
('cst_ipi','52','Saída isenta',52),
('cst_ipi','53','Saída não-tributada',53),
('cst_ipi','54','Saída imune',54),
('cst_ipi','55','Saída com suspensão',55),
('cst_ipi','99','Outras saídas',99),
-- Enquadramento Legal do IPI (mais usado; a tabela completa pode ser importada depois)
('enq_ipi','999','Tributação normal do IPI',999),
-- CST PIS
('cst_pis','01','Operação Tributável com Alíquota Básica',1),
('cst_pis','02','Operação Tributável com Alíquota Diferenciada',2),
('cst_pis','03','Operação Tributável com Alíquota por Unidade de Medida de Produto',3),
('cst_pis','04','Operação Tributável Monofásica - Revenda a Alíquota Zero',4),
('cst_pis','05','Operação Tributável por Substituição Tributária',5),
('cst_pis','06','Operação Tributável a Alíquota Zero',6),
('cst_pis','07','Operação Isenta da Contribuição',7),
('cst_pis','08','Operação sem Incidência da Contribuição',8),
('cst_pis','09','Operação com Suspensão da Contribuição',9),
('cst_pis','49','Outras Operações de Saída',49),
('cst_pis','99','Outras Operações',99),
-- CST COFINS
('cst_cofins','01','Operação Tributável com Alíquota Básica',1),
('cst_cofins','02','Operação Tributável com Alíquota Diferenciada',2),
('cst_cofins','03','Operação Tributável com Alíquota por Unidade de Medida de Produto',3),
('cst_cofins','04','Operação Tributável Monofásica - Revenda a Alíquota Zero',4),
('cst_cofins','05','Operação Tributável por Substituição Tributária',5),
('cst_cofins','06','Operação Tributável a Alíquota Zero',6),
('cst_cofins','07','Operação Isenta da Contribuição',7),
('cst_cofins','08','Operação sem Incidência da Contribuição',8),
('cst_cofins','09','Operação com Suspensão da Contribuição',9),
('cst_cofins','49','Outras Operações de Saída',49),
('cst_cofins','99','Outras Operações',99)
on conflict (tipo, codigo) do nothing;
