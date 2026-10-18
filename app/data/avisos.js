// Avisos no celular (notificação de verdade, como de app). No iPhone só funciona com o app na tela de início (iOS 16.4+).
import { chamarServidor, urlServidor } from './store.js';

export const suportaAvisos = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const instalado = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
export const ehIphone = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);

const bytesDaChave = (b64) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function inscricaoAtual() {
  if (!suportaAvisos()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

// O service worker precisa do endereço da planilha para buscar o texto do aviso.
async function guardarServidorParaOAviso() {
  const url = urlServidor();
  if (url && 'caches' in window) await (await caches.open('fc-config')).put('api-url', new Response(url));
}

export async function estadoAvisos() {
  const sub = await inscricaoAtual().catch(() => null);
  const r = await chamarServidor('avisos', { endpoint: sub?.endpoint || '' });
  return { ...r, permissao: typeof Notification !== 'undefined' ? Notification.permission : 'default', inscritoAqui: !!(sub && r.inscrito) };
}

export async function ativarAvisos() {
  if (!suportaAvisos()) throw new Error(ehIphone() ? 'Abra o app pelo ícone na tela de início (no Safari: Compartilhar > Adicionar à Tela de Início). iOS 16.4 ou mais novo.' : 'Este navegador não recebe avisos.');
  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') throw new Error('As notificações foram bloqueadas. Libere em Ajustes do iPhone > Notificações > Finanças da Casa.');
  const { chavePublica } = await chamarServidor('avisos', {});
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesDaChave(chavePublica) });
  await guardarServidorParaOAviso();
  return chamarServidor('inscreverAviso', { endpoint: sub.endpoint });
}

export async function desativarAvisos() {
  const sub = await inscricaoAtual();
  if (sub) {
    await chamarServidor('desinscreverAviso', { endpoint: sub.endpoint });
    await sub.unsubscribe().catch(() => {});
  }
}

export async function testarAvisos() {
  await guardarServidorParaOAviso();
  return chamarServidor('testarAviso', {});
}
