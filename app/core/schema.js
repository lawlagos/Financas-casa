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
};

export const TABELAS = Object.keys(SCHEMA);

export const ORIGENS = ['Casa', 'Pudim', 'Hotmart', 'Salario', 'Consultoria', 'YouTube'];
export const ORIGEM_LABEL = { Casa: 'Casa', Pudim: 'Pudim', Hotmart: 'Hotmart', Salario: 'Salário', Consultoria: 'Consultoria', YouTube: 'YouTube' };

export function uid(prefix = '') {
  const rnd = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  return prefix ? `${prefix}-${rnd}` : rnd;
}
