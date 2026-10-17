// Escolha de categoria com criação rápida ("＋ Nova categoria…") sem sair da tela.
import { useState } from '../vendor/hooks.module.js';
import { html } from './html.js';
import { Segmento, Campo } from './componentes.js';
import { useStore, salvar, toast } from '../data/store.js';
import { GRUPOS_CATEGORIA } from '../core/schema.js';
import { origemLabel } from './derivados.js';

const NOVA = '__nova';

// Formulário curto: nome + grupo. Chama onCriada(categoria) depois de salvar.
export function NovaCategoria({ tipo = 'saida', onCriada, onCancelar, nomeInicial = '' }) {
  const grupos = GRUPOS_CATEGORIA[tipo] || GRUPOS_CATEGORIA.saida;
  const [nome, setNome] = useState(nomeInicial);
  const [grupo, setGrupo] = useState(grupos[0]);
  const [salvando, setSalvando] = useState(false);
  const criar = async () => {
    if (!nome.trim()) return;
    setSalvando(true);
    try {
      const c = await salvar('categorias', { nome: nome.trim(), tipo, origem_padrao: grupo, ativa: true });
      toast(`Categoria ${c.nome} criada em ${origemLabel(grupo)}`);
      onCriada(c);
    } catch {
      setSalvando(false);
    }
  };
  return html`<div class="painel painel-pad" style="margin-top:8px;border-color:var(--caramel)">
    <${Campo} rotulo="Nome da nova categoria">
      <input id="nova-categoria-nome" value=${nome} placeholder="Ex.: Construção, Limpeza, Pet" onInput=${(e) => setNome(e.target.value)}
        onKeyDown=${(e) => e.key === 'Enter' && criar()} ref=${(el) => el && !nome && el.focus()} />
    <//>
    <div class="campo"><span>Grupo</span>
      <${Segmento} rotulo="Grupo da categoria" valor=${grupo} onChange=${setGrupo} opcoes=${grupos.map((g) => [g, origemLabel(g)])} />
      <div class="ajuda">O grupo decide o dízimo: Pudim e Empresa entram no lucro da semana; Casa e Outros, não.</div>
    </div>
    <div class="acoes" style="margin-top:12px;justify-content:flex-end">
      <button type="button" class="btn btn-sec btn-mini" onClick=${onCancelar}>Cancelar</button>
      <button type="button" class="btn btn-pri btn-mini" disabled=${!nome.trim() || salvando} onClick=${criar}>Criar categoria</button>
    </div>
  </div>`;
}

// <select> de categoria com a opção de criar uma nova. onChange(id, categoria).
export function SeletorCategoria({ tipo, valor, onChange, rotulo = 'Categoria' }) {
  const s = useStore();
  const [criando, setCriando] = useState(false);
  const cats = s.tables.categorias.filter((c) => c.tipo === tipo && c.ativa !== false);
  return html`<div>
    <${Campo} rotulo=${rotulo}>
      <select aria-label=${rotulo} value=${criando ? NOVA : valor || ''} onChange=${(e) => {
        if (e.target.value === NOVA) return setCriando(true);
        setCriando(false);
        onChange(e.target.value, cats.find((c) => c.id === e.target.value));
      }}>
        <option value="">Sem categoria</option>
        ${cats.map((c) => html`<option value=${c.id}>${c.nome}</option>`)}
        <option value=${NOVA}>＋ Nova categoria…</option>
      </select>
    <//>
    ${criando && html`<${NovaCategoria} tipo=${tipo} onCancelar=${() => setCriando(false)} onCriada=${(c) => { setCriando(false); onChange(c.id, c); }} />`}
  </div>`;
}
