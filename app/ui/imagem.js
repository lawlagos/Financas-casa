// Reduz a foto/print antes de enviar: no máximo 1600 px no lado maior, em JPEG.
const MAX = 1600;

export async function prepararImagem(arquivo) {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise((ok, erro) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => erro(new Error('Não deu para abrir essa imagem. Tente um print ou foto em JPG ou PNG.'));
      i.src = url;
    });
    const escala = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    return { imagem: dataUrl.split(',')[1], mime: 'image/jpeg', previa: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}
