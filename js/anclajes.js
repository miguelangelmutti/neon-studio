// Orejitas de anclaje: lengüetas con un orificio, pegadas al borde del cartel, para atornillarlo o colgarlo.
// Cada una se guarda como un punto del borde y la normal hacia afuera del material (mm).
import { circulo } from './orificios.js';

const SOLAPE = 1;          // cuánto se mete la orejita en el material del cartel
const MATERIAL_MIN = 2;    // material mínimo alrededor del orificio

// Ancho real: se agranda si el orificio no entra con MATERIAL_MIN alrededor
export const anchoEfectivo = (ancho, diametro) => Math.max(ancho, diametro + 2 * MATERIAL_MIN);

// Distancia del borde al centro del orificio
const alcance = (ancho, diametro) => anchoEfectivo(ancho, diametro) / 2 + 1;

function dentro(formas, [x, y]) {
  let n = 0;
  for (const f of formas) for (const a of [f.exterior, ...f.agujeros]) {
    for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
      if ((a[i][1] > y) !== (a[j][1] > y) && x < ((a[j][0] - a[i][0]) * (y - a[i][1])) / (a[j][1] - a[i][1]) + a[i][0]) n++;
    }
  }
  return n % 2 === 1;
}

/**
 * Punto del borde del material más cercano a p, con la normal que apunta hacia afuera.
 * Devuelve null si p está sobre el material o a más de `maxDist` del borde.
 */
export function bordeCercano(formas, p, maxDist) {
  if (dentro(formas, p)) return null;
  const borde = pegarAlBorde(formas, p);
  return borde && borde.dist <= maxDist ? borde : null;
}

// Punto del borde más cercano a p (esté donde esté p) con su normal hacia afuera: { punto, normal, dist }.
// Sirve para volver a pegar una orejita guardada cuando el diseño cambia.
export function pegarAlBorde(formas, p) {
  let mejor = null;
  for (const f of formas) for (const a of [f.exterior, ...f.agujeros]) {
    for (let i = 0; i < a.length; i++) {
      const u = a[i], v = a[(i + 1) % a.length];
      const dx = v[0] - u[0], dy = v[1] - u[1], l2 = dx * dx + dy * dy;
      if (!l2) continue;
      const t = Math.max(0, Math.min(1, ((p[0] - u[0]) * dx + (p[1] - u[1]) * dy) / l2));
      const q = [u[0] + dx * t, u[1] + dy * t];
      const dist = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (!mejor || dist < mejor.dist) mejor = { punto: q, dist, dx, dy };
    }
  }
  if (!mejor) return null;
  // Normal del tramo, del lado de afuera del material
  const l = Math.hypot(mejor.dx, mejor.dy);
  let n = [-mejor.dy / l, mejor.dx / l];
  const prueba = [mejor.punto[0] + n[0] * 0.3, mejor.punto[1] + n[1] * 0.3];
  if (dentro(formas, prueba)) n = [-n[0], -n[1]];
  return { punto: mejor.punto, normal: n, dist: mejor.dist };
}

/**
 * Forma de una orejita y su orificio.
 * @param a { punto, normal } en mm
 * @param op { forma: 'semi'|'recta', ancho, diametro }
 */
export function orejita({ punto: [px, py], normal: [nx, ny] }, { forma, ancho, diametro }) {
  const w = anchoEfectivo(ancho, diametro), r = w / 2, c = alcance(ancho, diametro);
  const tx = -ny, ty = nx;
  const en = (a, b) => [px + nx * a + tx * b, py + ny * a + ty * b];   // a: hacia afuera, b: a lo largo del borde
  let exterior;
  if (forma === 'recta') {
    exterior = [en(-SOLAPE, -r), en(c + r, -r), en(c + r, r), en(-SOLAPE, r)];
  } else {
    const arco = [];
    for (let i = 0; i <= 24; i++) {
      const ang = -Math.PI / 2 + (i / 24) * Math.PI;   // de -t a +t pasando por la normal
      arco.push(en(c + r * Math.cos(ang), r * Math.sin(ang)));
    }
    exterior = [en(-SOLAPE, -r), ...arco, en(-SOLAPE, r)];
  }
  return { forma: { exterior, agujeros: [] }, orificio: { exterior: circulo(en(c, 0), diametro), agujeros: [] } };
}

// La orejita bajo el puntero, si hay: índice o -1
export function orejitaEn(anclajes, p, op) {
  const w = anchoEfectivo(op.ancho, op.diametro), c = alcance(op.ancho, op.diametro);
  return anclajes.findIndex(({ punto: [px, py], normal: [nx, ny] }) => {
    const a = (p[0] - px) * nx + (p[1] - py) * ny;          // a lo largo de la normal
    const b = Math.abs((p[0] - px) * -ny + (p[1] - py) * nx);
    return a > -2 && a < c + w / 2 + 1 && b < w / 2 + 1;
  });
}
