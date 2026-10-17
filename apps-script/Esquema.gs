// Mesmo esquema de app/core/schema.js (um teste garante que os dois batem).
var ESQUEMA = {
  contas: ['id', 'nome', 'dono', 'grupo', 'saldo_inicial', 'data_saldo_inicial', 'cor', 'ativa'],
  categorias: ['id', 'nome', 'tipo', 'origem_padrao', 'ativa'],
  lancamentos: [
    'id', 'data', 'tipo', 'valor', 'descricao', 'conta_id', 'conta_destino_id', 'categoria_id', 'origem', 'canal',
    'id_externo', 'foto_id', 'grupo_id', 'previsto_id', 'criado_por', 'criado_em', 'editado_em'
  ],
  previstos: [
    'id', 'descricao', 'natureza', 'tipo', 'valor', 'conta_id', 'conta_destino_id', 'categoria_id', 'origem', 'recorrencia',
    'a_cada', 'mes_ancora', 'dia_inicio', 'dia_fim', 'dia_semana', 'data_unica', 'inicio', 'parcelas_total',
    'parcela_no_inicio', 'confianca', 'renovacao', 'pessoa', 'ativo'
  ],
  baixas: ['id', 'previsto_id', 'ref', 'status', 'lancamento_id', 'nova_data', 'criado_em'],
  config: ['id', 'valor'],
  itens: ['id', 'data', 'mercado', 'descricao', 'quantidade', 'unidade', 'valor', 'preco_unitario', 'origem', 'lancamento_id', 'grupo_id', 'criado_em', 'categoria_id',
    'produto', 'marca', 'tamanho', 'tamanho_unidade'],
  insumos: ['id', 'nome', 'tipo', 'marca', 'qtd_embalagem', 'unidade', 'preco_embalagem', 'data_preco', 'produto', 'ativo'],
  receitas: ['id', 'nome', 'rendimento', 'validade_dias', 'preco_venda', 'preco_sugerido', 'custo_ref', 'ingredientes', 'ativo', 'preco_ifood', 'tempo_preparo', 'markup', 'tipo', 'sabor_id', 'porcao'],
  estoque: ['id', 'data', 'receita_id', 'tipo', 'quantidade', 'custo_unitario', 'preco_unitario', 'validade', 'lancamento_id', 'obs', 'criado_em', 'canal', 'taxa_unitaria', 'custo_fixo_unitario']
};

// Nome da aba na planilha para cada tabela.
var ABAS = {
  contas: 'Contas',
  categorias: 'Categorias',
  lancamentos: 'Lançamentos',
  previstos: 'Previstos',
  baixas: 'Baixas',
  config: 'Config',
  itens: 'Itens',
  insumos: 'Ingredientes',
  receitas: 'Receitas',
  estoque: 'Estoque',
  sessoes: 'Sessões'
};

var COLUNAS_SESSOES = ['token', 'email', 'aparelho', 'criada_em', 'ultimo_uso'];

var NUMERICAS = { quantidade: 1, tamanho: 1, qtd_embalagem: 1, preco_embalagem: 1, rendimento: 1, validade_dias: 1, preco_venda: 1, preco_sugerido: 1, custo_ref: 1, custo_unitario: 1, preco_ifood: 1, taxa_unitaria: 1, tempo_preparo: 1, markup: 1, custo_fixo_unitario: 1, preco_unitario: 1, valor: 1, saldo_inicial: 1, a_cada: 1, mes_ancora: 1, dia_inicio: 1, dia_fim: 1, dia_semana: 1, parcelas_total: 1, parcela_no_inicio: 1 };
var BOOLEANAS = { ativa: 1, ativo: 1, renovacao: 1 };
