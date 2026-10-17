// Colunas de cada aba da planilha. Compartilhado com o Apps Script (copiado para apps-script/Schema.gs pelo teste).
export const SCHEMA = {
  contas: ['id', 'nome', 'dono', 'grupo', 'saldo_inicial', 'data_saldo_inicial', 'cor', 'ativa'],
  categorias: ['id', 'nome', 'tipo', 'origem_padrao', 'ativa'],
  lancamentos: [
    'id', 'data', 'tipo', 'valor', 'descricao', 'conta_id', 'conta_destino_id', 'categoria_id', 'origem', 'canal',
    'id_externo', 'foto_id', 'grupo_id', 'previsto_id', 'criado_por', 'criado_em', 'editado_em',
  ],
  previstos: [
    'id', 'descricao', 'natureza', 'tipo', 'valor', 'conta_id', 'conta_destino_id', 'categoria_id', 'origem', 'recorrencia',
    'a_cada', 'mes_ancora', 'dia_inicio', 'dia_fim', 'dia_semana', 'data_unica', 'inicio', 'parcelas_total',
    'parcela_no_inicio', 'confianca', 'renovacao', 'pessoa', 'ativo',
  ],
  baixas: ['id', 'previsto_id', 'ref', 'status', 'lancamento_id', 'nova_data', 'criado_em'],
  config: ['id', 'valor'],
  itens: ['id', 'data', 'mercado', 'descricao', 'quantidade', 'unidade', 'valor', 'preco_unitario', 'origem', 'lancamento_id', 'grupo_id', 'criado_em', 'categoria_id',
    'produto', 'marca', 'tamanho', 'tamanho_unidade'],
  insumos: ['id', 'nome', 'tipo', 'marca', 'qtd_embalagem', 'unidade', 'preco_embalagem', 'data_preco', 'produto', 'ativo'],
  receitas: ['id', 'nome', 'rendimento', 'validade_dias', 'preco_venda', 'preco_sugerido', 'custo_ref', 'ingredientes', 'ativo', 'preco_ifood', 'tempo_preparo', 'markup', 'tipo', 'sabor_id', 'porcao', 'estoque_minimo'],
  estoque: ['id', 'data', 'receita_id', 'tipo', 'quantidade', 'custo_unitario', 'preco_unitario', 'validade', 'lancamento_id', 'obs', 'criado_em', 'canal', 'taxa_unitaria', 'custo_fixo_unitario'],
  lista: ['id', 'nome', 'quantidade', 'unidade', 'origem', 'preco_estimado', 'preco_pago', 'comprado', 'texto', 'criado_em', 'criado_por', 'comprado_em'],
  estoque_insumos: ['id', 'data', 'insumo_id', 'tipo', 'quantidade', 'origem', 'ref', 'obs', 'criado_em'],
};

export const TABELAS = Object.keys(SCHEMA);

export const ORIGENS = ['Casa', 'Pudim', 'Hotmart', 'Outros', 'Salario', 'Consultoria', 'YouTube'];
// "Hotmart" é o id interno do negócio do marido; na tela aparece como Empresa.
export const ORIGEM_LABEL = { Casa: 'Casa', Pudim: 'Pudim', Hotmart: 'Empresa', Outros: 'Outros', Salario: 'Salário', Consultoria: 'Consultoria', YouTube: 'YouTube' };
// Grupos oferecidos ao criar uma categoria, por tipo.
export const GRUPOS_CATEGORIA = { saida: ['Casa', 'Pudim', 'Hotmart', 'Outros'], entrada: ['Salario', 'Consultoria', 'YouTube', 'Hotmart', 'Pudim', 'Outros'] };

export function uid(prefix = '') {
  const rnd = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  return prefix ? `${prefix}-${rnd}` : rnd;
}
