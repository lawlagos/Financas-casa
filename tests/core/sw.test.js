// O service worker: quando chega um aviso, busca o texto na planilha (pelo hash do endpoint) e mostra a notificação.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';

function carregarSw({ endpoint = 'https://web.push.apple.com/abc', api = 'https://script.google.com/macros/s/x/exec', resposta, falhar = false } = {}) {
  const ouvintes = {};
  const mostradas = [];
  const buscas = [];
  const self = {
    addEventListener: (t, fn) => (ouvintes[t] = fn),
    registration: {
      scope: 'https://lawlagos.github.io/Financas-casa/',
      pushManager: { getSubscription: async () => (endpoint ? { endpoint } : null) },
      showNotification: async (titulo, opcoes) => mostradas.push({ titulo, ...opcoes }),
    },
    clients: { matchAll: async () => [], openWindow: async (u) => mostradas.push({ abriu: u }) },
  };
  const caches = { open: async () => ({ match: async (k) => (k === 'api-url' && api ? { text: async () => api } : undefined), put: async () => {} }), keys: async () => [] };
  const fetch = async (url) => {
    buscas.push(url);
    if (falhar) throw new Error('sem internet');
    return { json: async () => resposta };
  };
  vm.runInNewContext(readFileSync(new URL('../../app/sw.js', import.meta.url), 'utf8'), { self, caches, fetch, crypto: webcrypto, TextEncoder, URL, location: { origin: 'x' } });
  const disparar = async (tipo, ev) => {
    let p;
    ouvintes[tipo]({ ...ev, waitUntil: (x) => (p = x) });
    await p;
  };
  return { disparar, mostradas, buscas };
}

test('aviso que chega: busca o texto pelo id do celular e mostra a notificação', async () => {
  const resposta = { titulo: 'Finanças da Casa', texto: '2 tarefas da casa pendentes', url: '#/tarefas' };
  const sw = carregarSw({ resposta });
  await sw.disparar('push', {});
  const id = createHash('sha256').update('https://web.push.apple.com/abc').digest('hex').slice(0, 32);
  assert.deepEqual(sw.buscas, [`https://script.google.com/macros/s/x/exec?aviso=${id}`]);
  assert.equal(sw.mostradas[0].titulo, 'Finanças da Casa');
  assert.equal(sw.mostradas[0].body, '2 tarefas da casa pendentes');
  assert.equal(sw.mostradas[0].data.url, '#/tarefas');
  // tocar na notificação abre o app na tela certa
  await sw.disparar('notificationclick', { notification: { close() {}, data: { url: '#/tarefas' } } });
  assert.equal(sw.mostradas[1].abriu, 'https://lawlagos.github.io/Financas-casa/#/tarefas');
});

test('sem internet, o aviso aparece mesmo assim (texto padrão)', async () => {
  const sw = carregarSw({ falhar: true });
  await sw.disparar('push', {});
  assert.equal(sw.mostradas[0].body, 'Abra o app para ver.');
});
