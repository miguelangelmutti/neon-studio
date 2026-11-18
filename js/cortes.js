// Corte por tamaño de cama: divide el cartel en columnas y filas que entren en la impresora,
// ubicando cada corte donde cruza menos material, con un encastre cola de milano en cada cruce
// (macho en la pieza de la izquierda / de arriba, hembra con holgura en la vecina).
import { unirFormas, restarFormas, intersectarFormas, desplazarFormas, trasladarFormas, recortarAnillos } from './geometria.js';

const MARGEN = 5;          // mm libres por lado en la cama (falda / brim)
const PROF_MAX = 7;        // mm, lo máximo que sobresale un macho
const CRUCE_MIN = 2.5;     // mm, cruces más cortos (roces) no llevan encastre

const rect = (x0, y0, x1, y1) => ({ exterior: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], agujeros: [] });
const limitar = (v, a, b) => Math.min(b, Math.max(a, v));

export function cajaDe(formas) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of formas) for (const [x, y] of f.exterior) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, ancho: maxX - minX, alto: maxY - minY };
}

// Tramos donde la recta (x = c si eje 'x', y = c si eje 'y') atraviesa material: [[desde, hasta], ...]
function cruces(formas, eje, c) {
  const [i, j] = eje === 'x' ? [0, 1] : [1, 0];
  const t = [];
  for (const f of formas) for (const a of [f.exterior, ...f.agujeros]) {
    for (let k = 0; k < a.length; k++) {
      const p = a[k], q = a[(k + 1) % a.length];
      if ((p[i] > c) !== (q[i] > c)) t.push(p[j] + (c - p[i]) / (q[i] - p[i]) * (q[j] - p[j]));
    }
  }
  t.sort((a, b) => a - b);
  const tramos = [];
  for (let k = 0; k + 1 < t.length; k += 2) tramos.push([t[k], t[k + 1]]);
  return tramos;
}

// Posiciones de corte a lo largo de un eje. `sentido` = +1 recorre de menor a mayor (columnas),
// -1 de mayor a menor (filas, de arriba hacia abajo). La pieza "anterior" lleva los machos.
function elegirCortes(formas, eje, min, max, util, sentido) {
  const largo = max - min;
  if (largo <= util) return [];
  const paso = util - PROF_MAX;     // una pieza con machos no puede ocupar toda la cama
  let n = 2;
  while ((n - 1) * paso + util < largo) n++;
  const inicio = sentido > 0 ? min : max;
  const cortes = [];
  let previo = 0;                   // distancia recorrida desde `inicio`
  for (let k = 1; k < n; k++) {
    const hasta = previo + paso;
    const desde = Math.max(previo + 15, largo - ((n - k - 1) * paso + util));
    const ideal = (k * largo) / n;
    let mejor = hasta, mejorCosto = Infinity;
    for (let d = desde; d <= hasta; d += 0.5) {
      const c = inicio + sentido * d + 1e-4;
      let costo = 0.05 * Math.abs(d - ideal);
      for (const [a, b] of cruces(formas, eje, c)) costo += (b - a) + (b - a < CRUCE_MIN ? 40 : 0);
      if (costo < mejorCosto) { mejorCosto = costo; mejor = d; }
    }
    cortes.push(inicio + sentido * mejor + 1e-4);
    previo = mejor;
  }
  return cortes;
}

// Cola de milano en cada cruce del corte. `sentido` indica hacia dónde sobresale el macho.
function colasDeMilano(formas, eje, c, sentido) {
  return cruces(formas, eje, c).filter(([a, b]) => b - a >= CRUCE_MIN).map(([a, b]) => {
    const L = b - a, m = (a + b) / 2;
    const base = limitar(0.5 * L, 2.5, 10);            // ancho sobre la línea de corte
    const punta = Math.max(base, Math.min(base * 1.45, L * 0.9));   // más ancho en la punta: traba
    const prof = limitar(0.8 * base, 3, PROF_MAX);
    const e = 0.5;                                     // se mete un poco en la pieza propia
    const puntos = eje === 'x'
      ? [[c - sentido * e, m - base / 2], [c + sentido * prof, m - punta / 2], [c + sentido * prof, m + punta / 2], [c - sentido * e, m + base / 2]]
      : [[m - base / 2, c - sentido * e], [m - punta / 2, c + sentido * prof], [m + punta / 2, c + sentido * prof], [m + base / 2, c - sentido * e]];
    return { centro: m, forma: { exterior: puntos, agujeros: [] } };
  });
}

/**
 * @param capas { fondo, paredes, piso, alto } de capasDeImpresion()
 * @param op { camaX, camaY, holgura }
 * @returns { columnas, filas, cortesX, cortesY, piezas:[{ id, col, fila, fondo, paredes, juntas, caja, cabe }] }
 */
export function planificarCortes(capas, { camaX, camaY, holgura }) {
  const caja = cajaDe(capas.fondo);
  const utilX = camaX - 2 * MARGEN, utilY = camaY - 2 * MARGEN;
  const cortesX = elegirCortes(capas.fondo, 'x', caja.minX, caja.maxX, utilX, 1);
  const cortesY = elegirCortes(capas.fondo, 'y', caja.minY, caja.maxY, utilY, -1);

  const lejos = 1000 + Math.max(caja.ancho, caja.alto);
  const xs = [caja.minX - lejos, ...cortesX, caja.maxX + lejos];
  const ys = [caja.maxY + lejos, ...cortesY, caja.minY - lejos];   // de arriba hacia abajo

  const machosX = cortesX.map(c => colasDeMilano(capas.fondo, 'x', c, 1));    // macho a la derecha
  const machosY = cortesY.map(c => colasDeMilano(capas.fondo, 'y', c, -1));   // macho hacia abajo
  const enRango = (lista, a, b) => lista.filter(t => t.centro > Math.min(a, b) && t.centro < Math.max(a, b)).map(t => t.forma);

  const piezas = [];
  for (let fila = 0; fila < ys.length - 1; fila++) {
    for (let col = 0; col < xs.length - 1; col++) {
      const machos = [
        ...(col < cortesX.length ? enRango(machosX[col], ys[fila], ys[fila + 1]) : []),
        ...(fila < cortesY.length ? enRango(machosY[fila], xs[col], xs[col + 1]) : []),
      ];
      const hembras = [
        ...(col > 0 ? enRango(machosX[col - 1], ys[fila], ys[fila + 1]) : []),
        ...(fila > 0 ? enRango(machosY[fila - 1], xs[col], xs[col + 1]) : []),
      ];
      let region = unirFormas([rect(xs[col], ys[fila + 1], xs[col + 1], ys[fila])], machos);
      if (hembras.length) region = restarFormas(region, desplazarFormas(hembras, holgura));
      const fondo = intersectarFormas(capas.fondo, region);
      if (!fondo.length) continue;
      const paredes = intersectarFormas(capas.paredes, region);
      const c = cajaDe(fondo);
      const cabe = (c.ancho <= camaX && c.alto <= camaY) || (c.alto <= camaX && c.ancho <= camaY);
      // Juntas: el borde de la región (corte + encastres) sobre el material, en el fondo y en las paredes
      const borde = region.flatMap(f => [f.exterior, ...f.agujeros]);
      const juntas = { fondo: recortarAnillos(borde, fondo), paredes: recortarAnillos(borde, paredes) };
      piezas.push({ id: `c${col + 1}f${fila + 1}`, col, fila, fondo, paredes, juntas, caja: c, cabe });
    }
  }
  return { columnas: xs.length - 1, filas: ys.length - 1, cortesX, cortesY, piezas };
}

// Capas de una pieza centradas en el origen, listas para generarStl()
export function capasDePieza(pieza, capas) {
  const dx = -(pieza.caja.minX + pieza.caja.maxX) / 2, dy = -(pieza.caja.minY + pieza.caja.maxY) / 2;
  return {
    fondo: trasladarFormas(pieza.fondo, dx, dy),
    paredes: trasladarFormas(pieza.paredes, dx, dy),
    piso: capas.piso,
    alto: capas.alto,
  };
}
