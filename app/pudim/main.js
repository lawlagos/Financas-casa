// Pudins: estoque, vendas (PDV), receitas, ingredientes e compras do pudim. Mesma planilha e login do Finanças.
import { montarApp } from '../ui/shell.js';
import { definirApp } from '../ui/apps.js';
import { TelaPudim } from '../ui/telas/pudim.js';
import { TelaPdv } from '../ui/telas/pdv.js';
import { TelaCompras } from '../ui/telas/compras.js';
import { TelaLista } from '../ui/telas/lista.js';
import { NavPudins, TelaAjustesPudim } from '../ui/telas/pudim-app.js';

definirApp('pudim');

montarApp({
  titulo: 'Pudins',
  inicio: '/inicio',
  Nav: NavPudins,
  sw: '../sw.js',
  telas: {
    '/inicio': TelaPudim,
    '/pudim': TelaPudim,
    '/pudim/vender': TelaPdv,
    '/pudim/compras': TelaCompras,
    '/lista': TelaLista,
    '/ajustes': TelaAjustesPudim,
  },
});
