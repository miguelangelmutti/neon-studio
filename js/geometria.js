// Geometría 2D del cartel: texto/SVG → polígonos (mm) → recorrido del neón + base.
// Todo el cálculo booleano se hace con Clipper en enteros (mm × ESCALA).
import opentype from 'opentype';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

const C = window.ClipperLib;
const ESCALA = 1000;          // 1 mm = 1000 unidades de Clipper
const TAM_FUENTE = 100;       // tamaño de trabajo en unidades de fuente (se reescala después)
const PASOS_CURVA = 10;       // segmentos por curva bezier al aplanar

// ---------- Fuentes ----------
const cacheFuentes = new Map();
export async function cargarFuente(url) {
  if (!cacheFuentes.has(url)) {
    cacheFuentes.set(url, fetch(url)
      .then(r => { if (!r.ok) throw new Error(`No se pudo cargar ${url}`); return r.arrayBuffer(); })
      .then(buf => opentype.parse(buf)));
  }
  return cacheFuentes.get(url);
}

// Comandos de path de opentype (y hacia abajo) → anillos [[x,y], ...] con y hacia arriba
function comandosAAnillos(comandos) {
  const anillos = [];
  let actual = null, cx = 0, cy = 0;
  const cerrar = () => { if (actual && actual.length > 2) anillos.push(actual); actual = null; };
  const empezar = () => { if (!actual) actual = [[cx, -cy]]; };
  for (const c of comandos) {
    switch (c.type) {
      case 'M':
        cerrar(); cx = c.x; cy = c.y; actual = [[cx, -cy]];
        break;
      case 'L':
        empezar(); cx = c.x; cy = c.y; actual.push([cx, -cy]);
        break;
      case 'Q':
        empezar();
        for (let i = 1; i <= PASOS_CURVA; i++) {
          const t = i / PASOS_CURVA, u = 1 - t;
          actual.push([u * u * cx + 2 * u * t * c.x1 + t * t * c.x,
                     -(u * u * cy + 2 * u * t * c.y1 + t * t * c.y)]);
        }
        cx = c.x; cy = c.y;
        break;
      case 'C':
        empezar();
        for (let i = 1; i <= PASOS_CURVA; i++) {
          const t = i / PASOS_CURVA, u = 1 - t;
          const a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
          actual.push([a * cx + b * c.x1 + d * c.x2 + e * c.x,
                     -(a * cy + b * c.y1 + d * c.y2 + e * c.y)]);
        }
        cx = c.x; cy = c.y;
        break;
      case 'Z':
        cerrar();
        break;
    }
  }
  cerrar();
  return anillos;
}

// Texto (multilínea) → grupos de anillos, un grupo por glifo
export function textoAGrupos(fuente, texto, { alineacion = 'centro', interlineado = 1.1 } = {}) {
  const lineas = texto.split('\n');
  const anchos = lineas.map(l => fuente.getAdvanceWidth(l, TAM_FUENTE));
  const maxAncho = Math.max(0, ...anchos);
  const grupos = [];
  lineas.forEach((linea, i) => {
    const x = alineacion === 'izquierda' ? 0
      : alineacion === 'derecha' ? maxAncho - anchos[i]
      : (maxAncho - anchos[i]) / 2;
    const y = i * TAM_FUENTE * interlineado;
    for (const p of fuente.getPaths(linea, x, y, TAM_FUENTE)) {
      const anillos = comandosAAnillos(p.commands);
      if (anillos.length) grupos.push(anillos);
    }
  });
  return grupos;
}

// SVG (texto del archivo) → grupos de anillos, un grupo por forma rellena
export function svgAGrupos(textoSvg) {
  const datos = new SVGLoader().parse(textoSvg);
  const conRelleno = datos.paths.filter(p => {
    const f = p.userData?.style?.fill;
    return f && f !== 'none' && f !== 'transparent';
  });
  const grupos = [];
  for (const path of (conRelleno.length ? conRelleno : datos.paths)) {
    for (const forma of SVGLoader.createShapes(path)) {
      const { shape, holes } = forma.extractPoints(PASOS_CURVA);
      const anillos = [shape, ...holes]
        .filter(a => a.length > 2)
        .map(a => a.map(v => [v.x, -v.y]));   // SVG tiene y hacia abajo
      if (anillos.length) grupos.push(anillos);
    }
  }
  return grupos;
}

// ---------- Clipper helpers ----------
const aClipper = anillo => anillo.map(([x, y]) => ({ X: Math.round(x * ESCALA), Y: Math.round(y * ESCALA) }));
const aMm = camino => camino.map(p => [p.X / ESCALA, p.Y / ESCALA]);

// preservar = conservar vértices colineales (para que las caras del STL compartan aristas exactas)
function unir(caminos, preservar = false) {
  const cpr = new C.Clipper();
  cpr.PreserveCollinear = preservar;
  cpr.AddPaths(caminos, C.PolyType.ptSubject, true);
  const arbol = new C.PolyTree();
  cpr.Execute(C.ClipType.ctUnion, arbol, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return arbol;
}

// Franja de ancho 2·mm alrededor de cada recorrido de neón (cerrado u abierto), ya unida
function franja(neones, mm) {
  const co = new C.ClipperOffset(2, 0.1 * ESCALA);
  for (const n of neones) {
    co.AddPath(aClipper(n.puntos), C.JoinType.jtRound, n.cerrado ? C.EndType.etClosedLine : C.EndType.etOpenRound);
  }
  const arbol = new C.PolyTree();
  co.Execute(arbol, mm * ESCALA);
  return arbol;
}

function restar(a, b, preservar = false) {
  const cpr = new C.Clipper();
  cpr.PreserveCollinear = preservar;
  cpr.AddPaths(a, C.PolyType.ptSubject, true);
  cpr.AddPaths(b, C.PolyType.ptClip, true);
  const arbol = new C.PolyTree();
  cpr.Execute(C.ClipType.ctDifference, arbol, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return arbol;
}

// PolyTree → [{ exterior, agujeros }] en mm
function arbolAFormas(arbol) {
  const formas = [];
  const visitar = nodo => {
    for (const ext of nodo.Childs()) {
      const forma = { exterior: aMm(ext.Contour()), agujeros: [] };
      for (const ag of ext.Childs()) {
        forma.agujeros.push(aMm(ag.Contour()));
        visitar(ag);
      }
      formas.push(forma);
    }
  };
  visitar(arbol);
  return formas;
}

const caminosDeArbol = arbol => C.Clipper.PolyTreeToPaths(arbol);

function areaMm2(anillo) {
  let a = 0;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    a += (anillo[j][0] + anillo[i][0]) * (anillo[j][1] - anillo[i][1]);
  }
  return Math.abs(a / 2);
}

function largo(puntos, cerrado) {
  let l = 0;
  for (let i = 1; i < puntos.length; i++) l += Math.hypot(puntos[i][0] - puntos[i - 1][0], puntos[i][1] - puntos[i - 1][1]);
  if (cerrado && puntos.length > 1) {
    const a = puntos[0], b = puntos[puntos.length - 1];
    l += Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
  return l;
}

// ---------- Simplificación y suavizado de polilíneas ----------
export function rdp(puntos, tol) {
  if (puntos.length < 3) return puntos;
  const marcar = new Uint8Array(puntos.length);
  marcar[0] = marcar[puntos.length - 1] = 1;
  const pila = [[0, puntos.length - 1]];
  while (pila.length) {
    const [i0, i1] = pila.pop();
    const [ax, ay] = puntos[i0], [bx, by] = puntos[i1];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let maxD = -1, idx = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const [px, py] = puntos[i];
      let d;
      if (l2 === 0) d = Math.hypot(px - ax, py - ay);
      else d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / Math.sqrt(l2);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol) { marcar[idx] = 1; pila.push([i0, idx], [idx, i1]); }
  }
  return puntos.filter((_, i) => marcar[i]);
}

function chaikin(puntos, cerrado, iteraciones = 2) {
  let p = puntos;
  for (let k = 0; k < iteraciones; k++) {
    if (p.length < 3) return p;
    const r = cerrado ? [] : [p[0]];
    const n = cerrado ? p.length : p.length - 1;
    for (let i = 0; i < n; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      r.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      r.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    if (!cerrado) r.push(p[p.length - 1]);
    p = r;
  }
  return p;
}

// ---------- Modo "Centro": esqueleto de las letras ----------
function adelgazarZhangSuen(img, W, H) {
  const borrar = [];
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (let paso = 0; paso < 2; paso++) {
      borrar.length = 0;
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (!img[i]) continue;
          const p2 = img[i - W], p3 = img[i - W + 1], p4 = img[i + 1], p5 = img[i + W + 1];
          const p6 = img[i + W], p7 = img[i + W - 1], p8 = img[i - 1], p9 = img[i - W - 1];
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const a = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6)
                  + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
          if (a !== 1) continue;
          if (paso === 0 ? (p2 && p4 && p6) || (p4 && p6 && p8) : (p2 && p4 && p8) || (p2 && p6 && p8)) continue;
          borrar.push(i);
        }
      }
      if (borrar.length) cambio = true;
      for (const i of borrar) img[i] = 0;
    }
  }
}

// Vecinos de un píxel del esqueleto. Las diagonales sólo cuentan si no hay un
// vecino ortogonal que ya las conecte (evita falsos cruces en las "escaleras").
function vecinos(img, W, i) {
  const r = [];
  const n = img[i - W], s = img[i + W], e = img[i + 1], o = img[i - 1];
  if (n) r.push(i - W);
  if (s) r.push(i + W);
  if (e) r.push(i + 1);
  if (o) r.push(i - 1);
  if (img[i - W + 1] && !n && !e) r.push(i - W + 1);
  if (img[i - W - 1] && !n && !o) r.push(i - W - 1);
  if (img[i + W + 1] && !s && !e) r.push(i + W + 1);
  if (img[i + W - 1] && !s && !o) r.push(i + W - 1);
  return r;
}

// Recorre el esqueleto y devuelve tramos [{ px:[índices], a, b }] entre nodos (a/b = -1 si es un lazo)
function trazarEsqueleto(img, W, H) {
  const grado = new Map();
  for (let i = 0; i < W * H; i++) if (img[i]) grado.set(i, vecinos(img, W, i));
  const esNodo = i => grado.get(i).length !== 2;
  const visitado = new Set();
  const tramosNodoNodo = new Set();
  const tramos = [];

  const caminar = (desde, primero) => {
    const px = [desde];
    let prev = desde, act = primero;
    while (true) {
      px.push(act);
      if (esNodo(act) || act === desde) break;
      visitado.add(act);
      const sig = grado.get(act).find(v => v !== prev && (!visitado.has(v) || esNodo(v) || v === desde));
      if (sig === undefined) break;
      prev = act; act = sig;
    }
    return px;
  };

  for (const [i, vs] of grado) {
    if (!esNodo(i)) continue;
    for (const v of vs) {
      if (esNodo(v)) {
        const k = i < v ? `${i}-${v}` : `${v}-${i}`;
        if (tramosNodoNodo.has(k)) continue;
        tramosNodoNodo.add(k);
        tramos.push({ px: [i, v], a: i, b: v });
      } else if (!visitado.has(v)) {
        const px = caminar(i, v);
        tramos.push({ px, a: i, b: px[px.length - 1] });
      }
    }
    if (vs.length === 0) tramos.push({ px: [i], a: i, b: i });
  }
  // Lazos cerrados sin nodos (ej.: la "o" en algunas tipografías)
  for (const [i] of grado) {
    if (visitado.has(i) || esNodo(i)) continue;
    visitado.add(i);
    const px = caminar(i, grado.get(i)[0]);
    tramos.push({ px, a: -1, b: -1, lazo: true });
  }
  return tramos;
}

// Une tramos que comparten un nodo en el que sólo se tocan dos extremos
function fusionarTramos(tramos) {
  let fusion = true;
  while (fusion) {
    fusion = false;
    const extremos = new Map();
    tramos.forEach((t, k) => {
      if (t.lazo || t.a === t.b) return;
      for (const n of [t.a, t.b]) {
        if (!extremos.has(n)) extremos.set(n, []);
        extremos.get(n).push(k);
      }
    });
    for (const [n, ks] of extremos) {
      if (ks.length !== 2 || ks[0] === ks[1]) continue;
      let [t1, t2] = [tramos[ks[0]], tramos[ks[1]]];
      const p1 = t1.b === n ? t1.px : t1.px.slice().reverse();
      const p2 = t2.a === n ? t2.px : t2.px.slice().reverse();
      const otro1 = t1.b === n ? t1.a : t1.b;
      const otro2 = t2.a === n ? t2.b : t2.a;
      const unido = { px: p1.concat(p2.slice(1)), a: otro1, b: otro2 };
      if (otro1 === otro2) { unido.lazo = true; unido.a = unido.b = -1; }
      tramos = tramos.filter((_, k) => k !== ks[0] && k !== ks[1]);
      tramos.push(unido);
      fusion = true;
      break;
    }
  }
  return tramos;
}

function recorridoCentro(formas, limites, anchoNeon) {
  const ancho = limites.maxX - limites.minX, alto = limites.maxY - limites.minY;
  const mmPorPx = Math.max(Math.max(ancho, alto) / 1400, 0.2);
  const pad = 3;
  const W = Math.ceil(ancho / mmPorPx) + pad * 2, H = Math.ceil(alto / mmPorPx) + pad * 2;
  const lienzo = new OffscreenCanvas(W, H);
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  const aPx = ([x, y]) => [(x - limites.minX) / mmPorPx + pad, (limites.maxY - y) / mmPorPx + pad];
  ctx.fillStyle = '#fff';
  const trazo = new Path2D();
  for (const f of formas) {
    for (const anillo of [f.exterior, ...f.agujeros]) {
      anillo.forEach((p, i) => { const [x, y] = aPx(p); i ? trazo.lineTo(x, y) : trazo.moveTo(x, y); });
      trazo.closePath();
    }
  }
  ctx.fill(trazo, 'evenodd');
  const datos = ctx.getImageData(0, 0, W, H).data;
  const img = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) img[i] = datos[i * 4 + 3] > 127 ? 1 : 0;

  adelgazarZhangSuen(img, W, H);
  let tramos = trazarEsqueleto(img, W, H);

  // Poda de "pelos": ramas cortas que terminan en punta y salen de un cruce
  const umbral = Math.max(anchoNeon * 1.2, 4) / mmPorPx;
  const gradoNodo = new Map();
  for (const t of tramos) for (const n of [t.a, t.b]) gradoNodo.set(n, (gradoNodo.get(n) || 0) + 1);
  tramos = tramos.filter(t => {
    if (t.lazo) return true;
    const puntaA = gradoNodo.get(t.a) === 1, puntaB = gradoNodo.get(t.b) === 1;
    if (puntaA && puntaB) return t.px.length > 2;          // tramo suelto (ej.: punto de la i)
    if (puntaA || puntaB) return t.px.length > umbral;
    return true;
  });
  tramos = fusionarTramos(tramos);

  const aMmPx = i => [(i % W - pad) * mmPorPx + limites.minX, limites.maxY - (Math.floor(i / W) - pad) * mmPorPx];
  return tramos.map(t => {
    const cerrado = !!t.lazo;
    let pts = t.px.map(aMmPx);
    if (cerrado && pts.length > 1) pts.pop();
    pts = rdp(pts, mmPorPx * 0.9);
    pts = chaikin(pts, cerrado, 2);
    return { puntos: pts, cerrado };
  }).filter(n => largo(n.puntos, n.cerrado) > anchoNeon);
}

// ---------- Construcción del modelo completo ----------
/**
 * El cuerpo del cartel es un canal en U que sigue el recorrido del neón:
 * un piso del ancho del canal y dos paredes que dejan una ranura para el neón.
 * @param grupos  anillos por glifo/forma (unidades arbitrarias, y hacia arriba)
 * @param opciones { anchoMm, modo: 'contorno'|'centro', cortarSuperposiciones, anchoNeon, pared }
 * @returns { formasPiso, formasParedes, neones:[{puntos,cerrado}], ancho, alto } en mm, centrado en el origen
 */
export function construirModelo(grupos, opciones) {
  const { anchoMm = 600, modo = 'contorno', cortarSuperposiciones = true, anchoNeon = 6, pared = 2 } = opciones;
  const semiCanal = anchoNeon / 2 + pared;
  if (!grupos.length) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const g of grupos) for (const a of g) for (const [x, y] of a) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const s = anchoMm / (maxX - minX || 1);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const caminosGrupo = grupos.map(g => g.map(a => aClipper(a.map(([x, y]) => [(x - cx) * s, (y - cy) * s]))));

  // Letras unidas (o cada glifo por separado si no se cortan las superposiciones)
  const arbolTexto = unir(caminosGrupo.flat());
  const formasTexto = arbolAFormas(arbolTexto);
  const formasRecorrido = cortarSuperposiciones ? formasTexto : caminosGrupo.flatMap(g => arbolAFormas(unir(g)));

  const limites = { minX: (minX - cx) * s, maxX: (maxX - cx) * s, minY: (minY - cy) * s, maxY: (maxY - cy) * s };

  let neones;
  if (modo === 'centro') {
    neones = recorridoCentro(formasTexto, limites, anchoNeon);
  } else {
    // El neón sigue el borde de la letra y el canal se centra sobre él: la letra queda
    // hueca, delineada por dentro y por fuera, aunque sus trazos sean finos.
    neones = formasRecorrido
      .flatMap(f => [f.exterior, ...f.agujeros])
      .filter(a => largo(a, true) > anchoNeon * 2.5 && areaMm2(a) > anchoNeon * anchoNeon * 0.5)
      .map(a => ({ puntos: rdp(a.concat([a[0]]), 0.05).slice(0, -1), cerrado: true }));
  }

  // Canal: piso = franja exterior; paredes = franja exterior menos la ranura del neón
  const arbolExterior = franja(neones, semiCanal);
  const formasPiso = arbolAFormas(arbolExterior);
  const formasParedes = arbolAFormas(restar(caminosDeArbol(arbolExterior), caminosDeArbol(franja(neones, anchoNeon / 2))));
  // Cuerpo del neón (sólo para la vista): la ranura con 0,1 mm de holgura por lado
  const formasNeon = arbolAFormas(franja(neones, Math.max(anchoNeon / 2 - 0.1, 0.5)));

  let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity;
  for (const f of formasPiso) for (const [x, y] of f.exterior) {
    if (x < bMinX) bMinX = x; if (x > bMaxX) bMaxX = x;
    if (y < bMinY) bMinY = y; if (y > bMaxY) bMaxY = y;
  }
  return { formasTexto, formasPiso, formasParedes, formasNeon, neones, ancho: bMaxX - bMinX, alto: bMaxY - bMinY };
}

// ---------- Utilidades para exportar ----------
// Une varias listas de formas ({ exterior, agujeros } en mm) en una sola lista de formas
// Con NonZero, exteriores y agujeros deben tener orientaciones opuestas y consistentes
const orientar = (camino, positivo) => (C.Clipper.Orientation(camino) === positivo ? camino : camino.reverse());
const formasACaminos = formas => formas.flatMap(f => [
  orientar(aClipper(f.exterior), true),
  ...f.agujeros.map(a => orientar(aClipper(a), false)),
]);

// Quita vértices casi duplicados o casi colineales y piezas de área despreciable
function limpiarFormas(formas, distancia = 0.01, areaMin = 0.05) {
  const limpiar = a => aMm(C.Clipper.CleanPolygon(aClipper(a), distancia * ESCALA));
  const valido = a => a.length > 2 && areaMm2(a) > areaMin;
  return formas
    .map(f => ({ exterior: limpiar(f.exterior), agujeros: f.agujeros.map(limpiar).filter(valido) }))
    .filter(f => valido(f.exterior));
}

export function unirFormas(...listas) {
  return limpiarFormas(arbolAFormas(unir(formasACaminos(listas.flat()), true)));
}

export function restarFormas(a, b) {
  return limpiarFormas(arbolAFormas(restar(formasACaminos(a), formasACaminos(b), true)));
}

export const areaFormas = formas => formas.reduce(
  (s, f) => s + areaMm2(f.exterior) - f.agujeros.reduce((t, a) => t + areaMm2(a), 0), 0);

export const largoRecorridos = neones => neones.reduce((s, n) => s + largo(n.puntos, n.cerrado), 0);

export function intersectarFormas(formas, region) {
  const cpr = new C.Clipper();
  cpr.PreserveCollinear = true;
  cpr.AddPaths(formasACaminos(formas), C.PolyType.ptSubject, true);
  cpr.AddPaths(formasACaminos(region), C.PolyType.ptClip, true);
  const arbol = new C.PolyTree();
  cpr.Execute(C.ClipType.ctIntersection, arbol, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return limpiarFormas(arbolAFormas(arbol));
}

// Parte de los anillos (cerrados, en mm) que cae dentro de las formas, como líneas abiertas
export function recortarAnillos(anillos, formas) {
  const cpr = new C.Clipper();
  for (const a of anillos) cpr.AddPath(aClipper(a.concat([a[0]])), C.PolyType.ptSubject, false);
  cpr.AddPaths(formasACaminos(formas), C.PolyType.ptClip, true);
  const arbol = new C.PolyTree();
  cpr.Execute(C.ClipType.ctIntersection, arbol, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return C.Clipper.OpenPathsFromPolyTree(arbol).map(aMm);
}

// Agranda (mm > 0) o achica formas con esquinas a inglete (para la holgura de los encastres)
export function desplazarFormas(formas, mm) {
  return arbolAFormas(desplazarInglete(formasACaminos(formas), mm));
}

function desplazarInglete(caminos, mm) {
  const co = new C.ClipperOffset(3, 0.1 * ESCALA);
  co.AddPaths(caminos, C.JoinType.jtMiter, C.EndType.etClosedPolygon);
  const arbol = new C.PolyTree();
  co.Execute(arbol, mm * ESCALA);
  return arbol;
}

export const trasladarFormas = (formas, dx, dy) => formas.map(f => ({
  exterior: f.exterior.map(([x, y]) => [x + dx, y + dy]),
  agujeros: f.agujeros.map(a => a.map(([x, y]) => [x + dx, y + dy])),
}));
