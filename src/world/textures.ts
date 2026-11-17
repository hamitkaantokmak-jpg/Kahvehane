/** Kanvas tabanlı prosedürel dokular (telif sorunu yok, ek dosya yok). */
import * as THREE from 'three';

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

export function floorTexture(): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    const s = 64;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 ? '#c98b57' : '#e7c193';
      g.fillRect(x * s, y * s, s, s);
      g.strokeStyle = 'rgba(80,40,10,0.35)';
      g.lineWidth = 2;
      g.strokeRect(x * s + 1, y * s + 1, s - 2, s - 2);
    }
  }, [9, 7]);
}

export function wallpaperTexture(): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#f4d7a1';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#e9bf7c';
    for (let i = 0; i < 128; i += 32) g.fillRect(i, 0, 10, 128);
    g.fillStyle = '#d98f4e';
    for (let y = 16; y < 128; y += 32) for (let x = 21; x < 128; x += 32) {
      g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill();
    }
  }, [10, 2]);
}

export function signTexture(text: string, sub = '', bg = '#fff3d6', fg = '#7a1f0e', w = 512, h = 192): THREE.CanvasTexture {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = fg;
    g.lineWidth = 10;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = 64;
    g.font = `bold ${size}px "Trebuchet MS", sans-serif`;
    while (g.measureText(text).width > w - 50 && size > 18) { size -= 4; g.font = `bold ${size}px "Trebuchet MS", sans-serif`; }
    g.fillText(text, w / 2, sub ? h * 0.4 : h / 2);
    if (sub) {
      let s2 = 30;
      g.font = `italic ${s2}px Georgia, serif`;
      while (g.measureText(sub).width > w - 40 && s2 > 12) { s2 -= 2; g.font = `italic ${s2}px Georgia, serif`; }
      g.fillText(sub, w / 2, h * 0.75);
    }
  });
}

export function calendarTexture(): THREE.CanvasTexture {
  return canvasTex(256, 360, (g) => {
    g.fillStyle = '#fffaf0'; g.fillRect(0, 0, 256, 360);
    g.fillStyle = '#c62828'; g.fillRect(0, 0, 256, 70);
    g.fillStyle = '#fff'; g.font = 'bold 34px Georgia'; g.textAlign = 'center';
    g.fillText('KASIM', 128, 48);
    g.fillStyle = '#222'; g.font = 'bold 150px Georgia';
    g.fillText('17', 128, 215);
    g.font = '24px Georgia'; g.fillText('Pazartesi', 128, 260);
    g.font = 'italic 17px Georgia'; g.fillStyle = '#555';
    g.fillText('"Çay demlenir, hayat', 128, 300); g.fillText('acele etmez."', 128, 322);
  });
}

export function posterTexture(): THREE.CanvasTexture {
  return canvasTex(256, 340, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 340);
    grd.addColorStop(0, '#ffcf5a'); grd.addColorStop(1, '#ff7a45');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 340);
    g.fillStyle = '#5b1a00'; g.textAlign = 'center';
    g.font = 'bold 30px "Trebuchet MS"'; g.fillText('MAHALLE', 128, 50);
    g.fillText('OKEY TURNUVASI', 128, 88);
    // okey taşı çizimi
    g.fillStyle = '#fff8e6'; g.fillRect(88, 120, 80, 110);
    g.strokeStyle = '#5b1a00'; g.lineWidth = 4; g.strokeRect(88, 120, 80, 110);
    g.fillStyle = '#d62828'; g.font = 'bold 64px Georgia'; g.fillText('7', 128, 200);
    g.fillStyle = '#5b1a00'; g.font = 'bold 20px "Trebuchet MS"';
    g.fillText('Ödül: 1 Kilo Lokum', 128, 275);
    g.font = 'italic 16px Georgia'; g.fillText('(Rıza Dayı katılamaz)', 128, 305);
  });
}

/** Animasyonlu TV ekranı: kanal değiştirilebilir. */
export class TvScreen {
  canvas = document.createElement('canvas');
  texture: THREE.CanvasTexture;
  channel = 0;
  private g: CanvasRenderingContext2D;
  private t = 0;
  static CHANNELS = ['MAÇ', 'HABERLER', 'YEMEK', 'KARIŞIK'];
  constructor() {
    this.canvas.width = 256; this.canvas.height = 192;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.draw();
  }
  nextChannel() { this.channel = (this.channel + 1) % TvScreen.CHANNELS.length; }
  update(dt: number) {
    this.t += dt;
    if (Math.floor(this.t * 8) !== Math.floor((this.t - dt) * 8)) { this.draw(); this.texture.needsUpdate = true; }
  }
  private draw() {
    const g = this.g; const t = this.t;
    const W = 256, H = 192;
    if (this.channel === 0) {
      g.fillStyle = '#2f9e44'; g.fillRect(0, 0, W, H);
      g.strokeStyle = '#e9ffe9'; g.lineWidth = 3;
      g.strokeRect(10, 10, W - 20, H - 20); g.beginPath(); g.moveTo(W / 2, 10); g.lineTo(W / 2, H - 10); g.stroke();
      g.beginPath(); g.arc(W / 2, H / 2, 25, 0, Math.PI * 2); g.stroke();
      const bx = W / 2 + Math.sin(t * 1.7) * 90, by = H / 2 + Math.cos(t * 2.3) * 60;
      g.fillStyle = '#fff'; g.beginPath(); g.arc(bx, by, 6, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 6; i++) {
        g.fillStyle = i % 2 ? '#ffd43b' : '#e03131';
        g.fillRect(W / 2 + Math.sin(t * 1.3 + i) * 100, H / 2 + Math.cos(t + i * 2) * 65, 8, 12);
      }
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 0, 120, 22);
      g.fillStyle = '#fff'; g.font = 'bold 15px sans-serif'; g.fillText('MHL 1 - 1 SPR', 8, 16);
    } else if (this.channel === 1) {
      g.fillStyle = '#1c3d7a'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#f4c27a'; g.beginPath(); g.arc(128, 90, 34, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#333'; g.fillRect(90, 124, 76, 60);
      g.fillStyle = '#222'; g.fillRect(112, 100 + Math.abs(Math.sin(t * 10)) * 4, 32, 4);
      g.fillStyle = '#c92a2a'; g.fillRect(0, 150, W, 42);
      g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif';
      const msg = 'SON DAKİKA: Mahallede çay fiyatına zam yok!  •  Rıza Dayı yine okeyde kazandığını iddia ediyor  •  ';
      g.fillText(msg + msg, -((t * 60) % 600), 175);
    } else if (this.channel === 2) {
      g.fillStyle = '#ffe8cc'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#868e96'; g.beginPath(); g.ellipse(128, 120, 80, 30, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e8590c'; g.beginPath(); g.ellipse(128, 112, 66, 20, 0, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(100 + i * 14, 80 - ((t * 30 + i * 12) % 50), 5, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#5c2d00'; g.font = 'bold 18px Georgia'; g.fillText('Menemen Saati', 70, 30);
    } else {
      const img = g.createImageData(W, H);
      for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
      g.putImageData(img, 0, 0);
    }
  }
}
