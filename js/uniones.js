// Uniones entre piezas sueltas del canal (letras, interiores de la D, la A, etc.)
// Automáticas: árbol de expansión mínima sobre la distancia más corta entre piezas.
// Manuales: el usuario quita automáticas o agrega nuevas haciendo click en un hueco.
import { rdp } from './geometria.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const medio = u => [(u.a[0] + u.b[0]) / 2, (u.a[1] + u.b[1]) / 2];

function proyectar(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return [a[0] + t * dx, a[1] + t * dy];
}

export const distanciaASegmento = (p, a, b) => dist(p, proyectar(p, a, b));

// Cada pieza = una forma del piso del canal (contorno exterior + agujeros), simplificada
export function prepararPiezas(formasPiso) {
  return formasPiso.map(f => {
    const anillos = [f.exterior, ...f.agujeros].map(a => rdp(a.concat([a[0]]), 0.2).slice(0, -1));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of f.exterior) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return { anillos, minX, minY, maxX, maxY };
  });
}

function masCercano(pieza, p) {
  let punto = null, d = Infinity;
  for (const a of pieza.anillos) {
    for (let i = 0; i < a.length; i++) {
      const q = proyectar(p, a[i], a[(i + 1) % a.length]);
      const dq = dist(p, q);
      if (dq < d) { d = dq; punto = q; }
    }
  }
  return { punto, d };
}

function dentro(pieza, [x, y]) {
  if (x < pieza.minX || x > pieza.maxX || y < pieza.minY || y > pieza.maxY) return false;
  let adentro = false;
  for (const a of pieza.anillos) {
    for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
      const [xi, yi] = a[i], [xj, yj] = a[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) adentro = !adentro;
    }
  }
  return adentro;
}

// Par de puntos más cercanos entre dos piezas (vértice contra segmento, en ambos sentidos)
function entrePiezas(A, B) {
  let mejor = { d: Infinity };
  for (const [P, Q, invertir] of [[A, B, false], [B, A, true]]) {
    for (const anillo of P.anillos) {
      for (const p of anillo) {
        const r = masCercano(Q, p);
        if (r.d < mejor.d) mejor = invertir ? { d: r.d, a: r.punto, b: p } : { d: r.d, a: p, b: r.punto };
      }
    }
  }
  return mejor;
}

const separacionCajas = (A, B) => Math.hypot(
  Math.max(0, A.minX - B.maxX, B.minX - A.maxX),
  Math.max(0, A.minY - B.maxY, B.minY - A.maxY));

function conjuntos(n) {
  const padre = [...Array(n).keys()];
  const raiz = i => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
  return { raiz, unir: (i, j) => { const a = raiz(i), b = raiz(j); if (a === b) return false; padre[a] = b; return true; } };
}

function unionesAutomaticas(piezas) {
  const n = piezas.length;
  if (n < 2) return [];
  const candidatas = new Map();
  const evaluar = (i, j) => {
    const k = i < j ? `${i}-${j}` : `${j}-${i}`;
    if (!candidatas.has(k)) candidatas.set(k, { i, j, ...entrePiezas(piezas[i], piezas[j]) });
  };
  // Para no medir todos contra todos: cada pieza sólo contra sus vecinas más cercanas por caja
  for (let i = 0; i < n; i++) {
    const vecinas = [...Array(n).keys()].filter(j => j !== i)
      .sort((a, b) => separacionCajas(piezas[i], piezas[a]) - separacionCajas(piezas[i], piezas[b]))
      .slice(0, 4);
    for (const j of vecinas) evaluar(i, j);
  }
  const kruskal = () => {
    const cj = conjuntos(n);
    const elegidas = [...candidatas.values()].sort((x, y) => x.d - y.d).filter(c => cj.unir(c.i, c.j));
    return { elegidas, cj };
  };
  let { elegidas, cj } = kruskal();
  if (elegidas.length < n - 1) {
    // Quedaron grupos aislados: medir todos los pares entre grupos distintos
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (cj.raiz(i) !== cj.raiz(j)) evaluar(i, j);
    ({ elegidas } = kruskal());
  }
  return elegidas.filter(c => c.d > 0.05);
}

/**
 * Unión que pasa cerca del punto p (para agregarla con el mouse):
 * conecta las dos piezas más cercanas a p por sus puntos más cercanos a p.
 */
export function unionPorPunto(piezas, p, alcance = 120) {
  if (piezas.length < 2 || piezas.some(pz => dentro(pz, p))) return null;
  const r = piezas.map((pz, i) => ({ i, ...masCercano(pz, p) })).sort((x, y) => x.d - y.d);
  if (r[1].d > alcance) return null;
  const u = { i: r[0].i, j: r[1].i, a: r[0].punto, b: r[1].punto };
  return dist(u.a, u.b) > 0.05 ? u : null;
}

// Rectángulo de la unión, metido un poco dentro de la pared de cada pieza (sin invadir la ranura)
function poligonoUnion(u, ancho, extension) {
  const l = dist(u.a, u.b);
  const dx = (u.b[0] - u.a[0]) / l, dy = (u.b[1] - u.a[1]) / l;
  const a = [u.a[0] - dx * extension, u.a[1] - dy * extension];
  const b = [u.b[0] + dx * extension, u.b[1] + dy * extension];
  const px = -dy * ancho / 2, py = dx * ancho / 2;
  return [[a[0] + px, a[1] + py], [b[0] + px, b[1] + py], [b[0] - px, b[1] - py], [a[0] - px, a[1] - py]];
}

/**
 * @param op { activa, ancho, pared, escala, quitadas:[[x,y]], extra:[[x,y]] }
 *   quitadas/extra van normalizadas (mm / escala) para sobrevivir a cambios de tamaño
 * @returns { piezas, uniones:[{a,b,i,j,tipo,poligono,ref}], sueltas }
 */
export function calcularUniones(formasPiso, op) {
  const { activa = true, ancho = 4, pared = 2, escala = 1, quitadas = [], extra = [] } = op;
  const piezas = prepararPiezas(formasPiso);
  let uniones = [];
  if (activa) {
    const tolerancia = Math.max(4, ancho);
    for (const u of unionesAutomaticas(piezas)) {
      const m = medio(u);
      const q = quitadas.find(([x, y]) => dist(m, [x * escala, y * escala]) < tolerancia);
      if (!q) uniones.push({ ...u, tipo: 'auto', ref: [m[0] / escala, m[1] / escala] });
    }
    for (const e of extra) {
      const u = unionPorPunto(piezas, [e[0] * escala, e[1] * escala]);
      if (!u) continue;
      const repetida = uniones.some(v => ((v.i === u.i && v.j === u.j) || (v.i === u.j && v.j === u.i))
        && dist(medio(v), medio(u)) < ancho * 2);
      if (!repetida) uniones.push({ ...u, tipo: 'extra', ref: e });
    }
  }
  for (const u of uniones) u.poligono = poligonoUnion(u, ancho, pared * 0.6);

  const cj = conjuntos(piezas.length);
  for (const u of uniones) cj.unir(u.i, u.j);
  const sueltas = new Set(piezas.map((_, i) => cj.raiz(i))).size;
  return { piezas, uniones, sueltas };
}

export function previaUnion(piezas, p, ancho, pared) {
  const u = unionPorPunto(piezas, p);
  if (u) u.poligono = poligonoUnion(u, ancho, pared * 0.6);
  return u;
}
