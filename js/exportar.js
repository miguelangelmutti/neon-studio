// Exportación a STL: el canal + las uniones como UNA malla cerrada y manifold, en mm y con Z hacia arriba.
// El sólido es un escalón de dos niveles:
//   fondo   = piso ∪ uniones                       (de z = 0 a z = piso)
//   paredes = paredes ∪ uniones de altura completa (de z = piso a z = piso + alturaCanal), paredes ⊂ fondo
// Caras: base del fondo (abajo), escalón = fondo − paredes (arriba, en z = piso), tapa de las paredes,
// y los laterales de cada contorno. Las aristas coinciden exactamente porque todo sale de Clipper
// (coordenadas enteras) conservando los vértices colineales.
import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { unirFormas, restarFormas, areaFormas, largoRecorridos } from './geometria.js';

const DENSIDAD_PLA = 1.24;   // g/cm³

/**
 * @param modelo  resultado de construirModelo()
 * @param uniones lista de uniones (con .poligono) de calcularUniones()
 * @param op { piso, alturaCanal, alturaUnion: 'completa'|'base', orificios: formas que atraviesan todo,
 *             extraFondo / extraParedes: formas que se suman a cada capa (p. ej. orejitas de anclaje) }
 */
export function capasDeImpresion(modelo, uniones, { piso, alturaCanal, alturaUnion, orificios = [], extraFondo = [], extraParedes = [] }) {
  const formasUnion = uniones.map(u => ({ exterior: u.poligono, agujeros: [] }));
  let fondo = unirFormas(modelo.formasPiso, formasUnion, extraFondo);
  let paredes = unirFormas(modelo.formasParedes, alturaUnion === 'completa' ? formasUnion : [], extraParedes);
  if (orificios.length) {
    fondo = restarFormas(fondo, orificios);
    paredes = restarFormas(paredes, orificios);
  }
  return { fondo, paredes, piso, alto: piso + alturaCanal };
}

export function resumenImpresion(modelo, capas) {
  const volumenMm3 = areaFormas(capas.fondo) * capas.piso + areaFormas(capas.paredes) * (capas.alto - capas.piso);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of capas.fondo) for (const [x, y] of f.exterior) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return {
    ancho: maxX - minX,
    largo: maxY - minY,
    alto: capas.alto,
    volumenCm3: volumenMm3 / 1000,
    gramos: (volumenMm3 / 1000) * DENSIDAD_PLA,
    metrosNeon: largoRecorridos(modelo.neones) / 1000,
  };
}

const areaFirmada = a => {
  let s = 0;
  for (let i = 0, j = a.length - 1; i < a.length; j = i++) s += (a[j][0] - a[i][0]) * (a[j][1] + a[i][1]);
  return s / 2;   // > 0 = antihorario (y hacia arriba)
};
const orientada = (anillo, antihorario) => ((areaFirmada(anillo) > 0) === antihorario ? anillo : anillo.slice().reverse());

// Evita "uniones en T": si un vértice de cualquier capa cae sobre una arista de otra
// (p. ej. donde una unión baja cruza la pared exterior), se inserta en esa arista.
function soldarVertices(grupos0) {
  // Tolerancias por encima de la limpieza de geometria.js (0,01 mm) para que todo cierre igual
  const CELDA = 3, EPS = 0.012, FUSION = 0.012;
  const clave = p => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;

  // 1) Unificar vértices a menos de FUSION mm (Clipper redondea al micrón y deja casi-duplicados)
  const rejilla = new Map();
  const canonico = p => {
    const gx = Math.floor(p[0] / FUSION), gy = Math.floor(p[1] / FUSION);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      for (const c of rejilla.get(`${gx + ox},${gy + oy}`) ?? []) {
        if (Math.hypot(c[0] - p[0], c[1] - p[1]) < FUSION) return c;
      }
    }
    const k = `${gx},${gy}`;
    if (!rejilla.has(k)) rejilla.set(k, []);
    rejilla.get(k).push(p);
    return p;
  };
  const limpiar = anillo => {
    const r = [];
    for (const p of anillo.map(canonico)) if (r[r.length - 1] !== p) r.push(p);
    while (r.length > 1 && r[0] === r[r.length - 1]) r.pop();
    return r;
  };
  const grupos = grupos0.map(formas => formas
    .map(f => ({ exterior: limpiar(f.exterior), agujeros: f.agujeros.map(limpiar).filter(a => a.length > 2) }))
    .filter(f => f.exterior.length > 2));

  // 2) Insertar en cada arista los vértices (de cualquier capa) que caen sobre ella
  const celdas = new Map();
  const vistos = new Set();
  for (const formas of grupos) for (const f of formas) for (const anillo of [f.exterior, ...f.agujeros]) {
    for (const p of anillo) {
      const k = clave(p);
      if (vistos.has(k)) continue;
      vistos.add(k);
      const c = `${Math.floor(p[0] / CELDA)},${Math.floor(p[1] / CELDA)}`;
      if (!celdas.has(c)) celdas.set(c, []);
      celdas.get(c).push(p);
    }
  }
  const insertar = anillo => {
    const r = [];
    for (let i = 0; i < anillo.length; i++) {
      const p = anillo[i], q = anillo[(i + 1) % anillo.length];
      r.push(p);
      const dx = q[0] - p[0], dy = q[1] - p[1], l2 = dx * dx + dy * dy, l = Math.sqrt(l2);
      if (l < 1e-9) continue;
      const kp = clave(p), kq = clave(q);
      const enArista = new Map();
      const pasos = Math.ceil(l / (CELDA / 2));
      const revisadas = new Set();
      for (let s = 0; s <= pasos; s++) {
        const cx = Math.floor((p[0] + dx * s / pasos) / CELDA), cy = Math.floor((p[1] + dy * s / pasos) / CELDA);
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
          const c = `${cx + ox},${cy + oy}`;
          if (revisadas.has(c)) continue;
          revisadas.add(c);
          for (const v of celdas.get(c) ?? []) {
            const k = clave(v);
            if (k === kp || k === kq) continue;
            if (Math.hypot(v[0] - p[0], v[1] - p[1]) < FUSION || Math.hypot(v[0] - q[0], v[1] - q[1]) < FUSION) continue;
            const t = ((v[0] - p[0]) * dx + (v[1] - p[1]) * dy) / l2;
            if (t <= 1e-9 || t >= 1 - 1e-9) continue;
            if (Math.abs((v[0] - p[0]) * dy - (v[1] - p[1]) * dx) / l < EPS) enArista.set(k, { t, v });
          }
        }
      }
      [...enArista.values()].sort((a, b) => a.t - b.t).forEach(({ v }) => r.push(v));
    }
    return r;
  };
  return grupos.map(formas => formas.map(f => ({ exterior: insertar(f.exterior), agujeros: f.agujeros.map(insertar) })));
}

// Acumula triángulos (x, y, z planos) para armar sólidos a partir de formas 2D.
// `corrimiento` (mm): los vértices alineados (p. ej. los bordes de varios huecos sobre la línea de
// base de las letras) confunden al triangulador, que descarta puntos y une huecos distintos. Con
// corrimiento > 0 se triangula con los puntos corridos al azar (determinístico) esa distancia y la
// cara se arma con los exactos. En otros casos (puntos que se tocan) es mejor sin corrimiento.
function constructor(corrimiento = 0) {
  const pos = [];
  const tri = (a, b, c) => pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);

  // Cara horizontal a altura z; normal hacia arriba o hacia abajo
  const cara = (formas, z, haciaArriba) => {
    for (const f of formas) {
      const ext = orientada(f.exterior, true);
      const agujeros = f.agujeros.map(a => orientada(a, false));
      const puntos = [ext, ...agujeros].flat();
      let n = 0;
      const corrido = ([x, y]) => {
        const r = Math.sin(++n * 12.9898) * 43758.5453, s = Math.sin(n * 78.233) * 12543.123;
        return new THREE.Vector2(x + (r - Math.floor(r) - 0.5) * corrimiento, y + (s - Math.floor(s) - 0.5) * corrimiento);
      };
      const caras = THREE.ShapeUtils.triangulateShape(ext.map(corrido), agujeros.map(a => a.map(corrido)));
      // Todos los triángulos salen con el mismo giro: se decide una vez para toda la cara
      let suma = 0;
      for (const [i, j, k] of caras) {
        const [a, b, c] = [puntos[i], puntos[j], puntos[k]];
        suma += (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      }
      const invertir = (suma > 0) !== haciaArriba;
      for (const [i, j, k] of caras) {
        const [a, p, q] = [puntos[i], ...(invertir ? [puntos[k], puntos[j]] : [puntos[j], puntos[k]])];
        tri([a[0], a[1], z], [p[0], p[1], z], [q[0], q[1], z]);
      }
    }
  };

  // Laterales de cada contorno entre z0 y z1, con la normal hacia afuera del sólido
  const laterales = (formas, z0, z1) => {
    for (const f of formas) {
      for (const anillo of [orientada(f.exterior, true), ...f.agujeros.map(a => orientada(a, false))]) {
        for (let i = 0; i < anillo.length; i++) {
          const p = anillo[i], q = anillo[(i + 1) % anillo.length];
          tri([p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1]);
          tri([p[0], p[1], z0], [q[0], q[1], z1], [p[0], p[1], z1]);
        }
      }
    }
  };

  const prisma = (formas, z0, z1) => {
    cara(formas, z0, false);
    laterales(formas, z0, z1);
    cara(formas, z1, true);
  };

  return { pos, cara, laterales, prisma };
}

// Una sola malla con escalón: base del fondo, laterales del fondo, escalón, laterales y tapa de paredes
function mallaEscalonada({ fondo: fondo0, paredes: paredes0, piso, alto }, corrimiento) {
  const [fondo, paredes, escalon] = soldarVertices([fondo0, paredes0, restarFormas(fondo0, paredes0)]);
  const m = constructor(corrimiento);
  m.cara(fondo, 0, false);
  m.laterales(fondo, 0, piso);
  m.cara(escalon, piso, true);
  m.laterales(paredes, piso, alto);
  m.cara(paredes, alto, true);
  return m.pos;
}

// Alternativa: dos cuerpos cerrados (fondo y paredes) que se solapan; el slicer los une al laminar
function mallaDosCuerpos({ fondo, paredes, piso, alto }, corrimiento) {
  const m = constructor(corrimiento);
  // Sin soldar: cada cuerpo usa sus propios contornos, así que sus aristas ya coinciden
  m.prisma(fondo, 0, piso);
  m.prisma(paredes, piso - Math.min(1, piso / 2), alto);
  return m.pos;
}

// Malla cerrada y bien orientada: cada arista dirigida a→b aparece una sola vez y su opuesta b→a también
function esManifold(pos) {
  const clave = i => `${Math.round(pos[i] * 1000)},${Math.round(pos[i + 1] * 1000)},${Math.round(pos[i + 2] * 1000)}`;
  const aristas = new Set();
  for (let t = 0; t < pos.length; t += 9) {
    const v = [clave(t), clave(t + 3), clave(t + 6)];
    for (let k = 0; k < 3; k++) {
      const e = `${v[k]}>${v[(k + 1) % 3]}`;
      if (aristas.has(e)) return false;
      aristas.add(e);
    }
  }
  for (const e of aristas) {
    const [a, b] = e.split('>');
    if (!aristas.has(`${b}>${a}`)) return false;
  }
  return true;
}

/**
 * Devuelve el STL binario (apoyado en z = 0, centrado en el origen).
 * Intenta una sola malla manifold; si la validación encuentra defectos, exporta dos cuerpos cerrados.
 * Cada variante se prueba sin y con corrimiento al triangular y se usa la primera que valida.
 */
export function generarStl(capas) {
  const intentos = [
    [mallaEscalonada, 0, 1], [mallaEscalonada, 1e-6, 1],
    [mallaDosCuerpos, 0, 2], [mallaDosCuerpos, 1e-6, 2],
  ];
  let pos, cuerpos;
  for (const [malla, corrimiento, n] of intentos) {
    pos = malla(capas, corrimiento);
    cuerpos = n;
    if (esManifold(pos)) break;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const datos = new STLExporter().parse(new THREE.Mesh(geo), { binary: true });
  geo.dispose();
  const bytes = new Uint8Array(datos.buffer, datos.byteOffset, datos.byteLength);
  return { blob: new Blob([bytes], { type: 'model/stl' }), bytes, triangulos: pos.length / 9, cuerpos, valido: esManifold(pos) };
}

export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// "Feliz Cumpleaños" → "neon-feliz-cumpleanos"
export function nombreArchivo(base) {
  const slug = base.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\.svg$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `neon-${slug || 'cartel'}`;
}
