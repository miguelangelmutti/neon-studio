import { cargarFuente, textoAGrupos, svgADiseno, construirModelo, restarFormas, unirFormas } from './geometria.js';
import { puntoEnRecorrido, iniciosDeTiras, formasOrificios } from './orificios.js';
import { bordeCercano, pegarAlBorde, orejita, orejitaEn, anchoEfectivo } from './anclajes.js';
import { Visor } from './escena.js';
import { calcularUniones, previaUnion, distanciaASegmento } from './uniones.js';
import { capasDeImpresion, resumenImpresion, generarStl, descargar, nombreArchivo } from './exportar.js';
import { planificarCortes, capasDePieza } from './cortes.js';
import { zipSync } from 'three/addons/libs/fflate.module.js';

// La cama de la impresora se recuerda en este navegador (no es parte del diseño)
const CLAVE_CAMA = 'neonStudio.cama';
function camaGuardada() {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE_CAMA));
    if (c && c.x >= 50 && c.y >= 50) return c;
  } catch { /* sin almacenamiento disponible */ }
  return { x: 256, y: 256 };
}
function guardarCama() {
  try { localStorage.setItem(CLAVE_CAMA, JSON.stringify({ x: estado.camaX, y: estado.camaY })); } catch { /* idem */ }
}

// Tipografías de Google Fonts (OFL / Apache 2.0); licencias en fonts/licencia-*.txt
// Primero las manuscritas (neón clásico), después las de bloque.
const FUENTES = [
  'Pacifico', 'Lobster', 'Yellowtail', 'Satisfy', 'Kaushan Script', 'Courgette', 'Sacramento',
  'Great Vibes', 'Neonderthaw', 'Righteous', 'Comfortaa', 'Bebas Neue', 'Russo One', 'Archivo Black',
  'Lilita One', 'Titan One', 'Passion One', 'Bungee', 'Luckiest Guy', 'Black Ops One',
  'Rubik Mono One', 'Rum Raisin',
].map(nombre => ({ nombre, archivo: `${nombre.replace(/ /g, '')}.ttf` }));

// Medidas comerciales de neón flex (ancho × alto). La ranura lleva 0,2 mm de holgura.
const PRESETS_NEON = {
  '6x12': { anchoCanal: 6.2, altoNeon: 12 },
  '8x16': { anchoCanal: 8.2, altoNeon: 16 },
  '10x20': { anchoCanal: 10.2, altoNeon: 20 },
};
const presetDe = e => Object.keys(PRESETS_NEON)
  .find(k => PRESETS_NEON[k].anchoCanal === e.anchoCanal && PRESETS_NEON[k].altoNeon === e.altoNeon) ?? 'personalizado';

let mostrarNeon = true;

const estado = {
  origen: 'texto',
  texto: 'Neón',
  fuente: 'Pacifico',
  alineacion: 'centro',
  interlineado: 1.1,
  modo: 'contorno',
  cortar: true,
  ancho: 600,
  colorBase: '#ffffff',
  aristas: true,
  svg: null,
  svgNombre: '',
  // Canal (mm)
  anchoCanal: 6.2,   // ancho de la ranura donde entra el neón
  altoNeon: 12,      // alto de la tira de neón (sólo para la vista previa)
  pared: 2,          // grosor de cada pared lateral
  piso: 2,           // grosor del fondo
  alturaCanal: 6,    // alto de las paredes sobre el fondo
  // Uniones (las editadas a mano se guardan normalizadas: mm / ancho del cartel)
  unir: true,
  anchoUnion: 4,
  alturaUnion: 'completa',
  unionesQuitadas: [],
  unionesExtra: [],
  // Orificios para los cables (centros normalizados: mm / ancho del cartel)
  diametroOrificio: 5,
  orificios: [],
  // Orejitas de anclaje: [x, y, nx, ny] = punto del borde normalizado y normal hacia afuera
  formaAnclaje: 'semi',
  alturaAnclaje: 'base',
  diametroAnclaje: 5,
  anchoAnclaje: 14,
  anclajes: [],
};

// Cortes por tamaño de cama
const camaInicial = camaGuardada();
Object.assign(estado, { cortarCama: true, camaX: camaInicial.x, camaY: camaInicial.y, holgura: 0.2 });
let verSeparadas = false;

let seccion = 'diseno';
let editarUniones = true;
let colocarOrificios = true;
let colocarAnclajes = true;

const $ = id => document.getElementById(id);
const ui = {
  texto: $('in-texto'),
  btnFuente: $('btn-fuente'),
  listaFuentes: $('lista-fuentes'),
  alineacion: $('in-alineacion'),
  interlineado: $('in-interlineado'),
  outInterlineado: $('out-interlineado'),
  modo: $('in-modo'),
  ayudaModo: $('ayuda-modo'),
  cortar: $('in-cortar'),
  anchoRango: $('in-ancho-rango'),
  ancho: $('in-ancho'),
  colorBase: $('in-color-base'),
  aristas: $('in-aristas'),
  grupoTexto: $('grupo-texto'),
  grupoSvg: $('grupo-svg'),
  zonaSvg: $('zona-svg'),
  inSvg: $('in-svg'),
  svgNombre: $('svg-nombre'),
  medidas: $('medidas'),
  aviso: $('aviso'),
  deshacer: $('btn-deshacer'),
  rehacer: $('btn-rehacer'),
  unir: $('in-unir'),
  anchoUnion: $('in-ancho-union'),
  outAnchoUnion: $('out-ancho-union'),
  alturaUnion: $('in-altura-union'),
  editarUniones: $('in-editar-uniones'),
  resumenUniones: $('resumen-uniones'),
  restaurarUniones: $('btn-restaurar-uniones'),
  controlesUnion: $('controles-union'),
  presetNeon: $('in-preset-neon'),
  medidasCanal: [...document.querySelectorAll('[data-medida]')],
  corteCanal: $('corte-canal'),
  resumenCanal: $('resumen-canal'),
  nombreArchivo: $('in-nombre-archivo'),
  resumenExportar: $('resumen-exportar'),
  descargarStl: $('btn-descargar-stl'),
  estadoExportar: $('estado-exportar'),
  cortarCama: $('in-cortar-cama'),
  controlesCortes: $('controles-cortes'),
  impresora: $('in-impresora'),
  camaX: $('in-cama-x'),
  camaY: $('in-cama-y'),
  holgura: $('in-holgura'),
  outHolgura: $('out-holgura'),
  separadas: $('in-separadas'),
  resumenCortes: $('resumen-cortes'),
  colocarOrificios: $('in-colocar-orificios'),
  diametroOrificio: $('in-diametro-orificio'),
  outDiametroOrificio: $('out-diametro-orificio'),
  avisoDiametro: $('aviso-diametro'),
  orificiosInicio: $('btn-orificios-inicio'),
  quitarOrificios: $('btn-quitar-orificios'),
  resumenOrificios: $('resumen-orificios'),
  colocarAnclajes: $('in-colocar-anclajes'),
  formaAnclaje: $('in-forma-anclaje'),
  alturaAnclaje: $('in-altura-anclaje'),
  diametroAnclaje: $('in-diametro-anclaje'),
  outDiametroAnclaje: $('out-diametro-anclaje'),
  anchoAnclaje: $('in-ancho-anclaje'),
  outAnchoAnclaje: $('out-ancho-anclaje'),
  avisoAnchoAnclaje: $('aviso-ancho-anclaje'),
  resumenAnclajes: $('resumen-anclajes'),
  quitarAnclajes: $('btn-quitar-anclajes'),
};

const visor = new Visor($('lienzo'));

// ---------- Estado → controles ----------
function pintarControles() {
  ui.texto.value = estado.texto;
  ui.btnFuente.textContent = estado.fuente;
  ui.btnFuente.style.fontFamily = `'${estado.fuente}'`;
  for (const li of ui.listaFuentes.children) li.setAttribute('aria-selected', li.dataset.fuente === estado.fuente);
  ui.alineacion.value = estado.alineacion;
  ui.interlineado.value = estado.interlineado;
  ui.outInterlineado.textContent = Number(estado.interlineado).toFixed(2);
  ui.modo.value = estado.modo;
  ui.ayudaModo.textContent = estado.modo === 'centro'
    ? 'Ideal para tipografías manuscritas o de trazo fino.'
    : 'Ideal para letras gruesas o de bloque.';
  ui.cortar.checked = estado.cortar;
  ui.cortar.disabled = estado.modo === 'centro';   // en "Centro" no hay bordes que unir
  ui.cortar.closest('.check').style.opacity = ui.cortar.disabled ? 0.45 : '';
  ui.anchoRango.value = estado.ancho;
  ui.ancho.value = estado.ancho;
  ui.colorBase.value = estado.colorBase;
  ui.aristas.checked = estado.aristas;
  for (const b of document.querySelectorAll('[data-origen]')) b.setAttribute('aria-selected', b.dataset.origen === estado.origen);
  ui.grupoTexto.hidden = estado.origen !== 'texto';
  ui.grupoSvg.hidden = estado.origen !== 'svg';
  ui.svgNombre.textContent = estado.svgNombre || 'Formas con relleno o trazos';
  ui.unir.checked = estado.unir;
  ui.controlesUnion.disabled = !estado.unir;
  ui.anchoUnion.value = estado.anchoUnion;
  ui.outAnchoUnion.textContent = `${estado.anchoUnion} mm`;
  ui.alturaUnion.value = estado.alturaUnion;
  ui.editarUniones.checked = editarUniones;
  ui.restaurarUniones.disabled = !estado.unionesQuitadas.length && !estado.unionesExtra.length;
  ui.presetNeon.value = presetDe(estado);
  for (const r of ui.medidasCanal) {
    r.value = estado[r.dataset.medida];
    r.closest('.campo').querySelector('output').textContent = `${mm(estado[r.dataset.medida])} mm`;
  }
  pintarCanal();
  ui.cortarCama.checked = estado.cortarCama;
  ui.controlesCortes.disabled = !estado.cortarCama;
  const impresora = `${estado.camaX}x${estado.camaY}`;
  ui.impresora.value = [...ui.impresora.options].some(o => o.value === impresora) ? impresora : 'personalizada';
  ui.camaX.value = estado.camaX;
  ui.camaY.value = estado.camaY;
  ui.holgura.value = estado.holgura;
  ui.outHolgura.textContent = `${mm(estado.holgura)} mm`;
  ui.separadas.checked = verSeparadas;
  ui.colocarOrificios.checked = colocarOrificios;
  ui.diametroOrificio.value = estado.diametroOrificio;
  ui.outDiametroOrificio.textContent = `${mm(estado.diametroOrificio)} mm`;
  ui.avisoDiametro.textContent = estado.diametroOrificio > estado.anchoCanal
    ? `Es más ancho que la ranura (${mm(estado.anchoCanal)} mm): el orificio también corta las paredes.`
    : '';
  const n = estado.orificios.length;
  ui.resumenOrificios.textContent = n ? `${n} orificio${n === 1 ? '' : 's'}` : 'Sin orificios';
  ui.quitarOrificios.disabled = !n;
  ui.colocarAnclajes.checked = colocarAnclajes;
  ui.formaAnclaje.value = estado.formaAnclaje;
  ui.alturaAnclaje.value = estado.alturaAnclaje;
  ui.diametroAnclaje.value = estado.diametroAnclaje;
  ui.outDiametroAnclaje.textContent = `Ø ${mm(estado.diametroAnclaje)} mm`;
  ui.anchoAnclaje.value = estado.anchoAnclaje;
  ui.outAnchoAnclaje.textContent = `${mm(estado.anchoAnclaje)} mm`;
  const anchoReal = anchoEfectivo(estado.anchoAnclaje, estado.diametroAnclaje);
  ui.avisoAnchoAnclaje.textContent = anchoReal > estado.anchoAnclaje
    ? `Para que el orificio quede con 2 mm de material alrededor, las orejitas miden ${mm(anchoReal)} mm.`
    : '';
  const na = estado.anclajes.length;
  ui.resumenAnclajes.textContent = na ? `${na} orejita${na === 1 ? '' : 's'}` : 'Sin orejitas';
  ui.quitarAnclajes.disabled = !na;
}

// Centros de los orificios en mm y sus formas (círculos que atraviesan todo el canal)
// Se vuelven a pegar al centro del canal más cercano del modelo actual, así siguen unidos
// aunque cambie el diseño (otro texto, tipografía o medidas del canal).
const centrosOrificios = modelo => estado.orificios.map(([x, y]) => {
  const p = [x * estado.ancho, y * estado.ancho];
  return puntoEnRecorrido(modelo.neones, p)?.punto ?? p;
});
const formasDeOrificios = modelo => formasOrificios(centrosOrificios(modelo), estado.diametroOrificio);

// Orejitas de anclaje en mm, vueltas a pegar al borde más cercano del modelo actual
const anclajesMm = modelo => estado.anclajes.map(([x, y, nx, ny]) => {
  const p = [x * estado.ancho, y * estado.ancho];
  const borde = pegarAlBorde(modelo.formasPiso, p);
  if (!borde) return { punto: p, normal: [nx, ny] };
  // Si sigue sobre el borde (el diseño no cambió), se respeta la normal guardada
  return borde.dist < 0.01 ? { punto: borde.punto, normal: [nx, ny] } : borde;
});
const opAnclaje = () => ({ forma: estado.formaAnclaje, ancho: estado.anchoAnclaje, diametro: estado.diametroAnclaje });
const altoAnclaje = () => (estado.alturaAnclaje === 'completa' ? estado.piso + estado.alturaCanal : estado.piso);

// Lo que se suma y se resta al canal: orejitas (al fondo y, si van a toda la altura, a las paredes,
// sin tapar ranuras de neón) y todos los agujeros (orificios para cables y de las orejitas)
function extrasDe(modelo) {
  const orejas = anclajesMm(modelo).map(a => orejita(a, opAnclaje()));
  const orejitas = orejas.map(o => o.forma);
  let extraParedes = [];
  if (orejitas.length && estado.alturaAnclaje === 'completa') {
    modelo.ranura ??= restarFormas(modelo.formasPiso, modelo.formasParedes);
    extraParedes = restarFormas(orejitas, modelo.ranura);
  }
  return { agujeros: [...formasDeOrificios(modelo), ...orejas.map(o => o.orificio)], extraFondo: orejitas, extraParedes };
}

const mm = v => Number(v).toLocaleString('es-AR', { maximumFractionDigits: 1 });

// Corte transversal del canal (SVG) + medidas totales y avisos
function pintarCanal() {
  const { anchoCanal: r, altoNeon: n, pared: p, piso: f, alturaCanal: h } = estado;
  const W = r + 2 * p, H = f + h, alto = Math.max(H, f + n);
  const s = Math.min(170 / W, 120 / alto);
  const x0 = (260 - W * s) / 2, y0 = 150;              // y0 = base del canal en el SVG
  const X = v => (x0 + v * s).toFixed(1), Y = v => (y0 - v * s).toFixed(1);
  const u = [[0, 0], [W, 0], [W, H], [W - p, H], [W - p, f], [p, f], [p, H], [0, H]];
  const radio = Math.min((r - 0.2) * s / 2, 8);
  ui.corteCanal.innerHTML = `
    <rect class="neon" x="${X(p + 0.1)}" y="${Y(f + n)}" width="${((r - 0.2) * s).toFixed(1)}" height="${(n * s).toFixed(1)}" rx="${radio.toFixed(1)}"/>
    <path class="u" d="M${u.map(([a, b]) => `${X(a)},${Y(b)}`).join(' L')} Z"/>
    <line class="cota" x1="${X(0)}" y1="${y0 + 12}" x2="${X(W)}" y2="${y0 + 12}"/>
    <text x="${X(W / 2)}" y="${y0 + 26}">${mm(W)} mm</text>
    <line class="cota" x1="${(x0 + W * s + 12).toFixed(1)}" y1="${Y(0)}" x2="${(x0 + W * s + 12).toFixed(1)}" y2="${Y(H)}"/>
    <text x="${(x0 + W * s + 16).toFixed(1)}" y="${(y0 - H * s / 2 + 4).toFixed(1)}" text-anchor="start">${mm(H)}</text>
    <text class="tenue" x="${X(W / 2)}" y="${(Number(Y(f + n)) - 6).toFixed(1)}">neón ${mm(r - 0.2)} × ${mm(n)}</text>`;

  const avisos = [];
  if (p < 1.2) avisos.push('Paredes de menos de 1,2 mm pueden quedar frágiles (con boquilla de 0,4 mm son menos de 3 vueltas de perímetro).');
  if (f < 1) avisos.push('Un fondo de menos de 1 mm puede romperse al despegarlo de la cama.');
  if (h < n / 4) avisos.push('Las paredes sujetan poco al neón: conviene pegarlo con silicona.');
  ui.resumenCanal.innerHTML = `
    <span>Ancho total del canal: <b>${mm(W)} mm</b></span>
    <span>Alto impreso: <b>${mm(H)} mm</b> · el neón sobresale <b>${mm(Math.max(0, f + n - H))} mm</b></span>
    ${avisos.map(a => `<span class="alerta">${a}</span>`).join('')}`;
}

function pintarResumenUniones() {
  if (!actual) { ui.resumenUniones.textContent = ''; return; }
  const { uniones, piezas, sueltas } = actual.uniones;
  const n = uniones.length;
  let txt = `${piezas.length} pieza${piezas.length === 1 ? '' : 's'} · ${n} ${n === 1 ? 'unión' : 'uniones'}`;
  if (sueltas > 1) txt += ` · quedan ${sueltas} partes separadas`;
  ui.resumenUniones.textContent = txt;
  ui.resumenUniones.classList.toggle('alerta', sueltas > 1);
}

// ---------- Generación del modelo ----------
let generacion = 0;
let ultimoEncuadre = null;
let actual = null;   // { modelo, uniones } del último render
const cacheModelo = { clave: null, modelo: null };

// Sólo estos campos cambian la geometría del canal; el resto (uniones, color) la reutiliza
const claveDiseno = () => JSON.stringify([estado.origen, estado.texto, estado.fuente, estado.alineacion,
  estado.interlineado, estado.modo, estado.cortar, estado.ancho, estado.anchoCanal, estado.pared,
  estado.origen === 'svg' ? estado.svg : null]);

function avisar(msg) {
  ui.aviso.hidden = !msg;
  ui.aviso.textContent = msg || '';
}

async function regenerar() {
  const id = ++generacion;
  try {
    let grupos = [], trazos = [];
    if (estado.origen === 'texto') {
      if (estado.texto.trim()) {
        const f = FUENTES.find(x => x.nombre === estado.fuente) ?? FUENTES[0];
        const fuente = await cargarFuente(`fonts/${f.archivo}`);
        if (id !== generacion) return;
        grupos = textoAGrupos(fuente, estado.texto, { alineacion: estado.alineacion, interlineado: estado.interlineado });
      }
    } else if (estado.svg) {
      ({ grupos, trazos } = svgADiseno(estado.svg));
    }

    if (!grupos.length && !trazos.length) {
      visor.actualizar(null, {});
      actual = null;
      pintarResumenUniones();
      ui.medidas.hidden = true;
      avisar(estado.origen === 'texto' ? 'Escribí un texto para empezar' : 'Subí un SVG para empezar');
      return;
    }

    const clave = claveDiseno();
    if (cacheModelo.clave !== clave) {
      cacheModelo.modelo = construirModelo(grupos, {
        anchoMm: estado.ancho,
        modo: estado.modo,
        cortarSuperposiciones: estado.cortar,
        anchoNeon: estado.anchoCanal,
        pared: estado.pared,
        trazos,
      });
      cacheModelo.clave = clave;
    }
    const modelo = cacheModelo.modelo;
    const uniones = calcularUniones(modelo.formasPiso, {
      activa: estado.unir,
      ancho: estado.anchoUnion,
      pared: estado.pared,
      escala: estado.ancho,
      quitadas: estado.unionesQuitadas,
      extra: estado.unionesExtra,
    });
    if (id !== generacion) return;
    actual = { modelo, uniones };

    // Reencuadrar sólo si el tamaño del cartel cambió bastante
    const ajustarCamara = !ultimoEncuadre
      || Math.abs(modelo.ancho - ultimoEncuadre.ancho) / ultimoEncuadre.ancho > 0.25
      || Math.abs(modelo.alto - ultimoEncuadre.alto) / ultimoEncuadre.alto > 0.25;
    if (ajustarCamara) ultimoEncuadre = { ancho: modelo.ancho, alto: modelo.alto };

    // Si el cartel se corta, se ven las piezas con sus encastres (salvo al editar uniones u orificios,
    // que necesitan respuesta inmediata). En Cortes el plan se calcula ya; en el resto se espera a que
    // el diseño quede quieto, porque en carteles grandes tarda más de un segundo.
    let plan = null;
    if (estado.cortarCama && !['uniones', 'orificios', 'anclajes'].includes(seccion)) {
      if (seccion === 'cortes' || seccion === 'exportar' || planVigente()) plan = planActual();
      else programarPlan(id);
    }
    if (plan && plan.piezas.length > 1) {
      const enCortes = seccion === 'cortes';
      const separacion = enCortes && verSeparadas ? 30 : 0;
      visor.actualizarPiezas(plan, {
        colorBase: estado.colorBase,
        aristas: estado.aristas,
        piso: estado.piso,
        alto: estado.piso + estado.alturaCanal,
        separacion,
        alternar: enCortes,
        mostrarNeon: mostrarNeon && !enCortes,
        formasNeon: modelo.formasNeon,
        altoNeon: estado.altoNeon,
        ancho: modelo.ancho + separacion * (plan.columnas - 1),
        alto2d: modelo.alto + separacion * (plan.filas - 1),
        ajustarCamara,
      });
    } else {
      // Las orejitas se suman al canal; los orificios atraviesan el fondo, las paredes y las uniones
      const extras = extrasDe(modelo);
      const recortar = formas => (extras.agujeros.length ? restarFormas(formas, extras.agujeros) : formas);
      const sumar = (formas, extra) => (extra.length ? unirFormas(formas, extra) : formas);
      visor.actualizar({
        ...modelo,
        formasPiso: recortar(sumar(modelo.formasPiso, extras.extraFondo)),
        formasParedes: recortar(sumar(modelo.formasParedes, extras.extraParedes)),
      }, {
        colorBase: estado.colorBase,
        aristas: estado.aristas,
        mostrarNeon: mostrarNeon && seccion !== 'orificios',
        altoNeon: estado.altoNeon,
        piso: estado.piso,
        profundidad: estado.alturaCanal,
        uniones: uniones.uniones.map(u => ({ ...u, formas: recortar([{ exterior: u.poligono, agujeros: [] }]) })),
        altoUnion: estado.alturaUnion === 'base' ? estado.piso : estado.piso + estado.alturaCanal,
        ajustarCamara,
      });
      if (seccion === 'orificios') visor.marcarOrificios(centrosOrificios(modelo), estado.diametroOrificio, estado.piso + estado.alturaCanal);
    }
    pintarResumenUniones();
    if (seccion === 'cortes') pintarCortes();
    if (seccion === 'exportar') pintarExportar();
    const cm = mm => (mm / 10).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const tam = visor.tamanoImpreso ?? modelo;   // incluye orejitas y encastres
    ui.medidas.textContent = `${cm(tam.ancho)} × ${cm(tam.alto)} cm`;
    ui.medidas.hidden = false;
    avisar(modelo.neones.length ? '' : 'No se pudo trazar el neón con este diseño');
  } catch (e) {
    console.error(e);
    if (id === generacion) avisar(`Error: ${e.message}`);
  }
}

let temporizador = null;
function programarRegeneracion(inmediato = false) {
  clearTimeout(temporizador);
  temporizador = setTimeout(regenerar, inmediato ? 0 : 120);
}

// ---------- Historial (deshacer / rehacer) ----------
const historial = { pasado: [], futuro: [], ultimo: JSON.stringify(estado), temporizador: null };

function registrarCambio() {
  clearTimeout(historial.temporizador);
  historial.temporizador = setTimeout(() => {
    const actual = JSON.stringify(estado);
    if (actual === historial.ultimo) return;
    historial.pasado.push(historial.ultimo);
    if (historial.pasado.length > 100) historial.pasado.shift();
    historial.futuro = [];
    historial.ultimo = actual;
    pintarHistorial();
  }, 400);
}

function moverHistorial(direccion) {
  clearTimeout(historial.temporizador);
  if (JSON.stringify(estado) !== historial.ultimo) {   // cambio pendiente sin registrar
    historial.pasado.push(historial.ultimo);
    historial.futuro = [];
    historial.ultimo = JSON.stringify(estado);
  }
  const [desde, hacia] = direccion === 'atras' ? [historial.pasado, historial.futuro] : [historial.futuro, historial.pasado];
  if (!desde.length) return pintarHistorial();
  hacia.push(historial.ultimo);
  historial.ultimo = desde.pop();
  Object.assign(estado, JSON.parse(historial.ultimo));
  pintarControles();
  pintarHistorial();
  programarRegeneracion(true);
}

function pintarHistorial() {
  ui.deshacer.disabled = !historial.pasado.length;
  ui.rehacer.disabled = !historial.futuro.length;
}

function cambiar(parcial, { repintar = true } = {}) {
  Object.assign(estado, parcial);
  if (repintar) pintarControles();
  programarRegeneracion();
  registrarCambio();
}

// ---------- Eventos ----------
ui.texto.addEventListener('input', () => cambiar({ texto: ui.texto.value }, { repintar: false }));
ui.alineacion.addEventListener('change', () => cambiar({ alineacion: ui.alineacion.value }));
ui.interlineado.addEventListener('input', () => cambiar({ interlineado: Number(ui.interlineado.value) }));
ui.modo.addEventListener('change', () => cambiar({ modo: ui.modo.value }));
ui.cortar.addEventListener('change', () => cambiar({ cortar: ui.cortar.checked }));
ui.anchoRango.addEventListener('input', () => cambiar({ ancho: Number(ui.anchoRango.value) }));
ui.ancho.addEventListener('change', () => {
  const v = Math.min(2000, Math.max(50, Math.round(Number(ui.ancho.value) || estado.ancho)));
  cambiar({ ancho: v });
});
ui.colorBase.addEventListener('input', () => cambiar({ colorBase: ui.colorBase.value }));
ui.aristas.addEventListener('change', () => cambiar({ aristas: ui.aristas.checked }));
ui.unir.addEventListener('change', () => cambiar({ unir: ui.unir.checked }));
ui.anchoUnion.addEventListener('input', () => cambiar({ anchoUnion: Number(ui.anchoUnion.value) }));
ui.alturaUnion.addEventListener('change', () => cambiar({ alturaUnion: ui.alturaUnion.value }));
ui.editarUniones.addEventListener('change', () => { editarUniones = ui.editarUniones.checked; limpiarHover(); });
ui.restaurarUniones.addEventListener('click', () => cambiar({ unionesQuitadas: [], unionesExtra: [] }));

ui.presetNeon.addEventListener('change', () => {
  const p = PRESETS_NEON[ui.presetNeon.value];
  if (p) cambiar({ ...p });
});
for (const r of ui.medidasCanal) {
  r.addEventListener('input', () => cambiar({ [r.dataset.medida]: Number(r.value) }));
}

// ---------- Exportar ----------
let nombreEditado = false;
const capasActuales = () => {
  const { agujeros, extraFondo, extraParedes } = extrasDe(actual.modelo);
  return capasDeImpresion(actual.modelo, actual.uniones.uniones, {
    piso: estado.piso, alturaCanal: estado.alturaCanal, alturaUnion: estado.alturaUnion,
    orificios: agujeros, extraFondo, extraParedes,
  });
};

// Plan de cortes del render actual (se recalcula sólo si cambia el modelo o la configuración)
const cachePlan = { modelo: null, clave: null, plan: null };
const clavePlan = () => JSON.stringify([estado.camaX, estado.camaY, estado.holgura, estado.piso, estado.alturaCanal,
  estado.alturaUnion, actual.uniones.uniones.map(u => u.poligono), estado.orificios, estado.diametroOrificio,
  estado.anclajes, estado.formaAnclaje, estado.alturaAnclaje, estado.diametroAnclaje, estado.anchoAnclaje]);
const planVigente = () => cachePlan.modelo === actual.modelo && cachePlan.clave === clavePlan();
function planActual() {
  if (!planVigente()) {
    const capas = capasActuales();
    cachePlan.plan = { ...planificarCortes(capas, { camaX: estado.camaX, camaY: estado.camaY, holgura: estado.holgura }), capas };
    cachePlan.modelo = actual.modelo;
    cachePlan.clave = clavePlan();
  }
  return cachePlan.plan;
}

// Calcula el plan cuando el diseño lleva un rato sin cambios y vuelve a dibujar con los encastres
let temporizadorPlan = null;
function programarPlan(id) {
  clearTimeout(temporizadorPlan);
  temporizadorPlan = setTimeout(() => {
    if (id !== generacion || !actual) return;
    planActual();
    programarRegeneracion(true);
  }, 400);
}
const enPiezas = () => actual && estado.cortarCama && planActual().piezas.length > 1;

function pintarCortes() {
  if (!actual) { ui.resumenCortes.innerHTML = ''; return; }
  const plan = planActual();
  if (plan.piezas.length <= 1) {
    ui.resumenCortes.innerHTML = `<span>El cartel entra entero en la cama de ${estado.camaX} × ${estado.camaY} mm: no hace falta cortarlo.</span>`;
    return;
  }
  const n = plan.piezas.length;
  const noCaben = plan.piezas.filter(p => !p.cabe);
  ui.resumenCortes.innerHTML = `
    <span><b>${n} piezas</b> · ${plan.columnas} columna${plan.columnas === 1 ? '' : 's'} × ${plan.filas} fila${plan.filas === 1 ? '' : 's'}</span>
    <ul class="lista-piezas">${plan.piezas.map(p => `<li class="${p.cabe ? '' : 'mal'}">
      ${p.id.toUpperCase()}: ${Math.round(p.caja.ancho)} × ${Math.round(p.caja.alto)} mm${p.cabe ? '' : ' ⚠'}</li>`).join('')}</ul>
    ${noCaben.length ? `<span class="alerta">${noCaben.length} pieza(s) no entran en la cama.</span>` : ''}
    <small class="ayuda-chica">C = columna, F = fila (de izquierda a derecha y de arriba hacia abajo).</small>`;
}

function pintarExportar() {
  if (!nombreEditado) ui.nombreArchivo.value = nombreArchivo(estado.origen === 'svg' ? estado.svgNombre : estado.texto);
  ui.descargarStl.disabled = !actual;
  if (!actual) { ui.resumenExportar.innerHTML = '<span>No hay nada para exportar todavía.</span>'; return; }
  const r = resumenImpresion(actual.modelo, capasActuales());
  const piezas = enPiezas() ? planActual().piezas.length : 1;
  ui.descargarStl.textContent = piezas > 1 ? `Descargar ZIP (${piezas} piezas)` : 'Descargar STL';
  const avisos = [];
  if (actual.uniones.sueltas > 1) avisos.push(`El cartel sale en ${actual.uniones.sueltas} partes separadas (revisá Uniones).`);
  if (piezas === 1 && (Math.max(r.ancho, r.largo) > Math.max(estado.camaX, estado.camaY)
      || Math.min(r.ancho, r.largo) > Math.min(estado.camaX, estado.camaY))) {
    avisos.push(`No entra en la cama de ${estado.camaX} × ${estado.camaY} mm: activá "Dividir en piezas" en Cortes.`);
  }
  ui.resumenExportar.innerHTML = `
    <span>Medidas: <b>${mm(r.ancho)} × ${mm(r.largo)} × ${mm(r.alto)} mm</b></span>
    ${piezas > 1 ? `<span>Se divide en <b>${piezas} piezas</b> con encastres (ver Cortes)</span>` : ''}
    <span>Volumen: <b>${mm(r.volumenCm3)} cm³</b> · filamento ≈ <b>${Math.round(r.gramos)} g</b> de PLA</span>
    <span>Neón necesario: <b>${r.metrosNeon.toLocaleString('es-AR', { maximumFractionDigits: 2 })} m</b>
      <small>(conviene comprar un 10 % más)</small></span>
    ${avisos.map(a => `<span class="alerta">${a}</span>`).join('')}`;
}

ui.nombreArchivo.addEventListener('input', () => { nombreEditado = ui.nombreArchivo.value.trim() !== ''; });
ui.descargarStl.addEventListener('click', () => {
  if (!actual) return;
  ui.descargarStl.disabled = true;
  ui.estadoExportar.textContent = 'Generando…';
  // Dejar que se pinte el "Generando…" antes del trabajo pesado
  setTimeout(() => {
    try {
      const base = ui.nombreArchivo.value.trim().replace(/\.(stl|zip)$/i, '') || 'neon';
      if (enPiezas()) {
        const plan = planActual();
        const archivos = {};
        let dosCuerpos = 0;
        for (const p of plan.piezas) {
          const r = generarStl(capasDePieza(p, plan.capas));
          archivos[`${base}_${p.id}.stl`] = r.bytes;
          if (r.cuerpos === 2) dosCuerpos++;
        }
        const zip = zipSync(archivos, { level: 6 });
        descargar(new Blob([zip], { type: 'application/zip' }), `${base}.zip`);
        ui.estadoExportar.textContent = `Listo: ${base}.zip · ${plan.piezas.length} piezas · ${(zip.length / 1048576).toFixed(1)} MB`
          + (dosCuerpos ? ` · ${dosCuerpos} pieza(s) en dos cuerpos que el slicer une al laminar` : ' · cada pieza es una malla cerrada');
      } else {
        const { blob, triangulos, cuerpos } = generarStl(capasActuales());
        descargar(blob, `${base}.stl`);
        ui.estadoExportar.textContent = `Listo: ${base}.stl · ${(blob.size / 1048576).toFixed(1)} MB · `
          + `${triangulos.toLocaleString('es-AR')} triángulos · `
          + (cuerpos === 1 ? 'una sola malla cerrada' : 'dos cuerpos cerrados (fondo y paredes) que el slicer une al laminar');
      }
    } catch (e) {
      console.error(e);
      ui.estadoExportar.textContent = `No se pudo exportar: ${e.message}`;
    } finally {
      ui.descargarStl.disabled = false;
    }
  }, 30);
});

// Orificios
ui.colocarOrificios.addEventListener('change', () => { colocarOrificios = ui.colocarOrificios.checked; limpiarHover(); });
ui.diametroOrificio.addEventListener('input', () => cambiar({ diametroOrificio: Number(ui.diametroOrificio.value) }));
ui.quitarOrificios.addEventListener('click', () => cambiar({ orificios: [] }));
ui.orificiosInicio.addEventListener('click', () => {
  if (!actual) return;
  // Sin repetir donde ya hay un orificio
  const centros = centrosOrificios(actual.modelo);
  const nuevos = iniciosDeTiras(actual.modelo.neones)
    .filter(p => !centros.some(c => Math.hypot(c[0] - p[0], c[1] - p[1]) < estado.diametroOrificio))
    .map(([x, y]) => [x / estado.ancho, y / estado.ancho]);
  cambiar({ orificios: [...estado.orificios, ...nuevos] });
});

// Anclajes
ui.colocarAnclajes.addEventListener('change', () => { colocarAnclajes = ui.colocarAnclajes.checked; limpiarHover(); });
ui.formaAnclaje.addEventListener('change', () => cambiar({ formaAnclaje: ui.formaAnclaje.value }));
ui.alturaAnclaje.addEventListener('change', () => cambiar({ alturaAnclaje: ui.alturaAnclaje.value }));
ui.diametroAnclaje.addEventListener('input', () => cambiar({ diametroAnclaje: Number(ui.diametroAnclaje.value) }));
ui.anchoAnclaje.addEventListener('input', () => cambiar({ anchoAnclaje: Number(ui.anchoAnclaje.value) }));
ui.quitarAnclajes.addEventListener('click', () => cambiar({ anclajes: [] }));

// Cortes
ui.cortarCama.addEventListener('change', () => cambiar({ cortarCama: ui.cortarCama.checked }));
ui.impresora.addEventListener('change', () => {
  const [x, y] = ui.impresora.value.split('x').map(Number);
  if (x && y) { cambiar({ camaX: x, camaY: y }); guardarCama(); }
});
for (const [input, eje] of [[ui.camaX, 'camaX'], [ui.camaY, 'camaY']]) {
  input.addEventListener('change', () => {
    const v = Math.min(2000, Math.max(50, Math.round(Number(input.value) || estado[eje])));
    cambiar({ [eje]: v });
    guardarCama();
  });
}
ui.holgura.addEventListener('input', () => cambiar({ holgura: Number(ui.holgura.value) }));
ui.separadas.addEventListener('change', () => {
  verSeparadas = ui.separadas.checked;
  ultimoEncuadre = null;   // reencuadrar para que entren todas las piezas
  programarRegeneracion(true);
});

// Navegación entre secciones
for (const b of document.querySelectorAll('.seccion[data-seccion]')) {
  b.addEventListener('click', () => {
    seccion = b.dataset.seccion;
    for (const o of document.querySelectorAll('.seccion[data-seccion]')) o.classList.toggle('activa', o === b);
    for (const p of document.querySelectorAll('.panel')) p.hidden = p.id !== `panel-${seccion}`;
    limpiarHover();
    programarRegeneracion(true);   // Cortes muestra las piezas; el resto, el cartel entero
  });
}

// ---------- Edición de uniones con el mouse ----------
// Con el panel Uniones abierto: sobre una unión se pone roja (click = quitar);
// en un hueco entre piezas aparece en verde la nueva (click = agregar). Arrastrar sigue girando.
const lienzo = $('lienzo');
let hover = null;   // { tipo: 'quitar', union } | { tipo: 'agregar', punto }
let cuadroPendiente = false;
let ultimoPuntero = null;

function limpiarHover() {
  hover = null;
  visor.resaltarUnion(-1);
  visor.mostrarPrevia(null);
  visor.mostrarMarcador(null);
  lienzo.style.cursor = '';
}

// Con el panel Orificios: sobre un orificio el marcador se pone rojo (click = quitar); si no,
// se pega al centro del canal más cercano en verde (click = agregar)
function hoverOrificios() {
  if (!colocarOrificios || !actual || !ultimoPuntero) return limpiarHover();
  const p = visor.puntoEnPiso(ultimoPuntero);
  if (!p) return limpiarHover();
  const d = estado.diametroOrificio, alto = estado.piso + estado.alturaCanal;
  const centros = centrosOrificios(actual.modelo);
  const cerca = puntoEnRecorrido(actual.modelo.neones, p);
  const enCanal = cerca && cerca.dist <= estado.anchoCanal / 2 + estado.pared + 6;
  // Sobre un orificio: el puntero o el punto del canal al que se pegaría el marcador
  const k = centros.findIndex(c => Math.hypot(c[0] - p[0], c[1] - p[1]) < d / 2 + 1
    || (enCanal && Math.hypot(c[0] - cerca.punto[0], c[1] - cerca.punto[1]) < d / 2 + 1));
  if (k >= 0) {
    hover = { tipo: 'quitarOrificio', indice: k };
    visor.mostrarMarcador(centros[k], d + 0.6, alto, true);
    lienzo.style.cursor = 'pointer';
    return;
  }
  if (!enCanal) return limpiarHover();
  hover = { tipo: 'agregarOrificio', punto: cerca.punto };
  visor.mostrarMarcador(cerca.punto, d, alto, false);
  lienzo.style.cursor = 'copy';
}

// Con el panel Anclajes: sobre una orejita se ve en rojo (click = quitar); cerca del borde, por fuera
// del material, aparece en verde pegada al borde más cercano (click = agregar)
function hoverAnclajes() {
  if (!colocarAnclajes || !actual || !ultimoPuntero) return limpiarHover();
  const p = visor.puntoEnPiso(ultimoPuntero);
  if (!p) return limpiarHover();
  const op = opAnclaje(), lista = anclajesMm(actual.modelo), alto = altoAnclaje();
  const k = orejitaEn(lista, p, op);
  if (k >= 0) {
    const o = orejita(lista[k], op);
    hover = { tipo: 'quitarAnclaje', indice: k };
    visor.mostrarPrevia(o.forma.exterior, { alto, quitar: true, agujero: o.orificio.exterior });
    lienzo.style.cursor = 'pointer';
    return;
  }
  const borde = bordeCercano(actual.modelo.formasPiso, p, anchoEfectivo(op.ancho, op.diametro) + 10);
  if (!borde) return limpiarHover();
  const o = orejita(borde, op);
  hover = { tipo: 'agregarAnclaje', anclaje: borde };
  visor.mostrarPrevia(o.forma.exterior, { alto, agujero: o.orificio.exterior });
  lienzo.style.cursor = 'copy';
}

function actualizarHover() {
  cuadroPendiente = false;
  if (seccion === 'orificios') return hoverOrificios();
  if (seccion === 'anclajes') return hoverAnclajes();
  if (seccion !== 'uniones' || !editarUniones || !estado.unir || !actual || !ultimoPuntero) return limpiarHover();
  const p = visor.puntoEnPiso(ultimoPuntero);
  if (!p) return limpiarHover();
  const { uniones, piezas } = actual.uniones;
  const k = uniones.findIndex(u => distanciaASegmento(p, u.a, u.b) < estado.anchoUnion / 2 + 2);
  if (k >= 0) {
    hover = { tipo: 'quitar', union: uniones[k] };
    visor.resaltarUnion(k);
    visor.mostrarPrevia(null);
    lienzo.style.cursor = 'pointer';
    return;
  }
  visor.resaltarUnion(-1);
  const nueva = previaUnion(piezas, p, estado.anchoUnion, estado.pared);
  hover = nueva ? { tipo: 'agregar', punto: p } : null;
  visor.mostrarPrevia(nueva?.poligono);
  lienzo.style.cursor = nueva ? 'copy' : '';
}

lienzo.addEventListener('pointermove', e => {
  ultimoPuntero = { clientX: e.clientX, clientY: e.clientY };
  if (e.buttons) return;   // arrastrando: se está girando la vista
  if (!cuadroPendiente) { cuadroPendiente = true; requestAnimationFrame(actualizarHover); }
});
lienzo.addEventListener('pointerleave', () => { ultimoPuntero = null; limpiarHover(); });

let inicioClick = null;
lienzo.addEventListener('pointerdown', e => { inicioClick = e.button === 0 ? { x: e.clientX, y: e.clientY } : null; });
lienzo.addEventListener('pointerup', e => {
  const fueClick = inicioClick && Math.hypot(e.clientX - inicioClick.x, e.clientY - inicioClick.y) < 5;
  inicioClick = null;
  if (!fueClick || !hover) return;
  if (hover.tipo === 'quitarAnclaje') {
    cambiar({ anclajes: estado.anclajes.filter((_, i) => i !== hover.indice) });
  } else if (hover.tipo === 'agregarAnclaje') {
    const { punto: [x, y], normal: [nx, ny] } = hover.anclaje;
    cambiar({ anclajes: [...estado.anclajes, [x / estado.ancho, y / estado.ancho, nx, ny]] });
  } else if (hover.tipo === 'quitarOrificio') {
    cambiar({ orificios: estado.orificios.filter((_, i) => i !== hover.indice) });
  } else if (hover.tipo === 'agregarOrificio') {
    const [x, y] = hover.punto;
    cambiar({ orificios: [...estado.orificios, [x / estado.ancho, y / estado.ancho]] });
  } else if (hover.tipo === 'quitar') {
    const u = hover.union;
    if (u.tipo === 'extra') cambiar({ unionesExtra: estado.unionesExtra.filter(r => r !== u.ref) });
    else cambiar({ unionesQuitadas: [...estado.unionesQuitadas, u.ref] });
  } else {
    const [x, y] = hover.punto;
    cambiar({ unionesExtra: [...estado.unionesExtra, [x / estado.ancho, y / estado.ancho]] });
  }
  limpiarHover();
});

for (const b of document.querySelectorAll('[data-origen]')) {
  b.addEventListener('click', () => { ultimoEncuadre = null; cambiar({ origen: b.dataset.origen }); });
}

// Selector de tipografía con vista previa
for (const f of FUENTES) {
  const li = document.createElement('li');
  li.role = 'option';
  li.dataset.fuente = f.nombre;
  li.textContent = f.nombre;
  li.style.fontFamily = `'${f.nombre}'`;
  li.addEventListener('click', () => { cerrarFuentes(); cambiar({ fuente: f.nombre }); ui.btnFuente.focus(); });
  ui.listaFuentes.append(li);
}
function cerrarFuentes() {
  ui.listaFuentes.hidden = true;
  ui.btnFuente.setAttribute('aria-expanded', 'false');
}
ui.btnFuente.addEventListener('click', () => {
  const abrir = ui.listaFuentes.hidden;
  ui.listaFuentes.hidden = !abrir;
  ui.btnFuente.setAttribute('aria-expanded', String(abrir));
  if (abrir) ui.listaFuentes.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
});
ui.btnFuente.addEventListener('keydown', e => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const i = FUENTES.findIndex(f => f.nombre === estado.fuente);
  const sig = FUENTES[(i + (e.key === 'ArrowDown' ? 1 : -1) + FUENTES.length) % FUENTES.length];
  cambiar({ fuente: sig.nombre });
});
document.addEventListener('click', e => { if (!e.target.closest('.selector-fuente')) cerrarFuentes(); });

// SVG: botón o arrastrar y soltar
async function leerSvg(archivo) {
  if (!archivo) return;
  const texto = await archivo.text();
  ultimoEncuadre = null;
  cambiar({ svg: texto, svgNombre: archivo.name, origen: 'svg' });
}
ui.inSvg.addEventListener('change', () => leerSvg(ui.inSvg.files[0]));
ui.zonaSvg.addEventListener('dragover', e => { e.preventDefault(); ui.zonaSvg.classList.add('encima'); });
ui.zonaSvg.addEventListener('dragleave', () => ui.zonaSvg.classList.remove('encima'));
ui.zonaSvg.addEventListener('drop', e => {
  e.preventDefault();
  ui.zonaSvg.classList.remove('encima');
  leerSvg(e.dataTransfer.files[0]);
});

ui.deshacer.addEventListener('click', () => moverHistorial('atras'));
ui.rehacer.addEventListener('click', () => moverHistorial('adelante'));
$('btn-neon').addEventListener('click', e => {
  mostrarNeon = !mostrarNeon;
  e.currentTarget.setAttribute('aria-pressed', String(mostrarNeon));
  e.currentTarget.title = mostrarNeon ? 'Ocultar neón' : 'Mostrar neón';
  programarRegeneracion(true);
});
$('btn-cotas').addEventListener('click', e => {
  const visible = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', String(visible));
  e.currentTarget.title = visible ? 'Ocultar medidas' : 'Mostrar medidas';
  visor.mostrarCotas(visible);
});
$('btn-encuadrar').addEventListener('click', () => visor.encuadrar());
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') cerrarFuentes();
  if (!(e.ctrlKey || e.metaKey) || e.target === ui.texto) return;   // en el textarea, Ctrl+Z es el del navegador
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); moverHistorial('atras'); }
  else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); moverHistorial('adelante'); }
});

pintarControles();
pintarHistorial();
regenerar();
