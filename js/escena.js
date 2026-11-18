// Visor 3D: arma el canal extruido y la tira de neón a partir del modelo 2D (mm).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export class Visor {
  constructor(contenedor) {
    this.contenedor = contenedor;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    contenedor.appendChild(this.renderer.domElement);

    this.escena = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.escena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const sol = new THREE.DirectionalLight(0xffffff, 1.2);
    sol.position.set(200, 600, 400);
    this.escena.add(sol, new THREE.AmbientLight(0xffffff, 0.25));

    this.camara = new THREE.PerspectiveCamera(40, 1, 1, 20000);
    this.camara.position.set(0, 500, 650);
    this.controles = new OrbitControls(this.camara, this.renderer.domElement);
    this.controles.enableDamping = true;
    this.controles.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

    // El modelo se arma en XY (z = altura) y se acuesta sobre el piso
    this.modelo = new THREE.Group();
    this.modelo.rotation.x = -Math.PI / 2;
    this.escena.add(this.modelo);

    this.grilla = null;
    this.tamGrilla = 0;
    this.mallasUnion = [];
    this.previa = null;
    this.matBase = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0 });
    this.matAristas = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
    this.matNeon = new THREE.MeshStandardMaterial({ color: 0xff3fa4, emissive: 0xff3fa4, emissiveIntensity: 0.6, roughness: 0.35 });

    new ResizeObserver(() => this.redimensionar()).observe(contenedor);
    this.redimensionar();
    this.renderer.setAnimationLoop(() => {
      this.controles.update();
      this.renderer.render(this.escena, this.camara);
      this.moverEtiquetas();
    });
  }

  redimensionar() {
    const { clientWidth: w, clientHeight: h } = this.contenedor;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
  }

  limpiar() {
    for (const hijo of [...this.modelo.children]) {
      this.modelo.remove(hijo);
      if (hijo !== this.marcador) hijo.traverse(o => o.geometry?.dispose());
    }
    this.mallasUnion = [];
    this.previa = null;
  }

  /**
   * @param modelo resultado de construirModelo()
   * @param op { colorBase, colorNeon, aristas, mostrarNeon, piso, profundidad, altoNeon,
   *             uniones:[{poligono}], altoUnion, ajustarCamara }
   */
  colores(colorBase) {
    this.matBase.color.set(colorBase);
    this.matAristas.color.set(new THREE.Color(colorBase).getHSL({}).l > 0.5 ? 0x000000 : 0xffffff);
  }

  // Extruye formas 2D entre z = desde y z = desde + alto; opcionalmente desplazadas en XY
  extruir(formas2d, desde, alto, material, conAristas, dx = 0, dy = 0) {
    const formas = formas2d.map(f => {
      const s = new THREE.Shape(f.exterior.map(([x, y]) => new THREE.Vector2(x, y)));
      s.holes = f.agujeros.map(a => new THREE.Path(a.map(([x, y]) => new THREE.Vector2(x, y))));
      return s;
    });
    const geo = new THREE.ExtrudeGeometry(formas, { depth: alto, bevelEnabled: false, curveSegments: 1 });
    geo.translate(dx, dy, desde);
    const malla = new THREE.Mesh(geo, material);
    this.modelo.add(malla);
    if (conAristas) this.modelo.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 35), this.matAristas));
    return malla;
  }

  actualizar(modelo, op) {
    this.limpiar();
    if (!modelo) return this.actualizarCotas();
    const {
      colorBase = '#ffffff', colorNeon = '#ff3fa4', aristas = true, mostrarNeon = true,
      piso = 2, profundidad = 6, altoNeon = 12, uniones = [], altoUnion = piso + profundidad,
    } = op;
    this.colores(colorBase);
    this.matNeon.color.set(colorNeon);
    this.matNeon.emissive.set(colorNeon);

    // Canal en U: piso + paredes
    const extruir = (formas2d, desde, alto, material = this.matBase, conAristas = aristas) =>
      this.extruir(formas2d, desde, alto, material, conAristas);
    extruir(modelo.formasPiso, 0, piso);
    extruir(modelo.formasParedes, piso, profundidad);
    this.altoUnion = altoUnion;
    // `formas`: la unión ya recortada (p. ej. por un orificio); si no, su polígono
    this.mallasUnion = uniones.map(u => extruir(u.formas ?? [{ exterior: u.poligono, agujeros: [] }], 0, altoUnion));

    // Neón flex: tira de perfil rectangular apoyada en el fondo de la ranura
    if (mostrarNeon) extruir(modelo.formasNeon, piso, altoNeon, this.matNeon, false);
    this.terminar(modelo, op);
  }

  terminar(modelo, op) {
    this.actualizarGrilla(Math.max(modelo.ancho, modelo.alto));
    if (op.ajustarCamara) this.encuadrar();
    this.actualizarCotas();
  }

  /**
   * Vista de las piezas cortadas, con sus encastres. Con `alternar` cada pieza va de un color
   * y, si `separacion` > 0, se separan en grilla.
   * @param plan resultado de planificarCortes()
   * @param op { colorBase, colorNeon, aristas, piso, alto, separacion, alternar, ancho, alto2d,
   *             formasNeon, mostrarNeon, altoNeon }
   */
  actualizarPiezas(plan, op) {
    this.limpiar();
    const { colorBase = '#ffffff', colorNeon = '#ff3fa4', aristas = true, piso, alto, separacion = 0, alternar = true } = op;
    this.colores(colorBase);
    const base = new THREE.Color(colorBase);
    const tono = base.clone().lerp(new THREE.Color(base.getHSL({}).l > 0.5 ? 0x3d7bff : 0xffc34d), 0.6);
    this.matPiezas ??= [new THREE.MeshStandardMaterial({ roughness: 0.55 }), new THREE.MeshStandardMaterial({ roughness: 0.55 })];
    this.matPiezas[0].color.copy(base);
    this.matPiezas[1].color.copy(tono);
    for (const p of plan.piezas) {
      const mat = alternar ? this.matPiezas[(p.col + p.fila) % 2] : this.matBase;
      const dx = p.col * separacion, dy = -p.fila * separacion;
      this.extruir(p.fondo, 0, piso, mat, aristas, dx, dy);
      this.extruir(p.paredes, piso, alto - piso, mat, aristas, dx, dy);
    }
    const conNeon = op.mostrarNeon && op.formasNeon && !separacion;
    if (conNeon) {
      this.matNeon.color.set(colorNeon);
      this.matNeon.emissive.set(colorNeon);
      this.extruir(op.formasNeon, piso, op.altoNeon, this.matNeon, false);
    }
    // Con todas las piezas del mismo color, las juntas se marcan sobre el borde de las paredes
    if (!alternar) {
      const pts = [];
      const trazar = (lineas, z) => {
        for (const l of lineas) for (let i = 1; i < l.length; i++) pts.push(l[i - 1][0], l[i - 1][1], z, l[i][0], l[i][1], z);
      };
      for (const p of plan.piezas) {
        trazar(p.juntas.fondo, piso + 0.05);       // queda tapada donde hay pared
        trazar(p.juntas.paredes, alto + 0.05);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.matJuntas ??= new THREE.LineBasicMaterial({ color: 0x3d7bff });
      this.modelo.add(new THREE.LineSegments(geo, this.matJuntas));
    }
    this.terminar({ ancho: op.ancho, alto: op.alto2d }, op);
  }

  // ---- Cotas: ancho y alto totales dibujados sobre el piso, junto al cartel ----

  mostrarCotas(visible) {
    this.cotasVisibles = visible;
    this.actualizarCotas();
  }

  actualizarCotas() {
    if (this.cotas) {
      this.escena.remove(this.cotas);
      this.cotas.geometry.dispose();
      this.cotas = null;
    }
    this.etiquetas ??= [0, 1].map(() => {
      const div = document.createElement('div');
      div.className = 'cota-etiqueta';
      this.contenedor.appendChild(div);
      return div;
    });
    this.etiquetas.forEach(e => { e.hidden = true; });
    this.posEtiquetas = [];

    // Caja de lo que se imprime (sin el neón, que puede asomar por arriba pero no cambia la planta,
    // ni los marcadores de edición)
    const caja = new THREE.Box3();
    this.modelo.updateMatrixWorld(true);
    for (const o of this.modelo.children) {
      if (o.isMesh && o.material !== this.matNeon && o !== this.marcador && o !== this.previa) caja.expandByObject(o);
    }
    this.tamanoImpreso = caja.isEmpty() ? null : { ancho: caja.max.x - caja.min.x, alto: caja.max.z - caja.min.z };
    if (caja.isEmpty() || this.cotasVisibles === false) return;

    // Mundo: x = ancho, z = alto del cartel (+z es abajo en el plano), y = altura sobre el piso
    const { min, max } = caja;
    const tam = Math.max(max.x - min.x, max.z - min.z);
    const sep = Math.max(15, tam * 0.07), flecha = Math.max(4, tam * 0.012), y = 0.2;
    const pts = [];
    const linea = (a, b) => pts.push(...a, ...b);
    // Cota horizontal (ancho) debajo del cartel
    const zc = max.z + sep;
    linea([min.x, y, max.z + 2], [min.x, y, zc + flecha]);
    linea([max.x, y, max.z + 2], [max.x, y, zc + flecha]);
    linea([min.x, y, zc], [max.x, y, zc]);
    linea([min.x, y, zc], [min.x + flecha * 1.6, y, zc - flecha * 0.6]);
    linea([min.x, y, zc], [min.x + flecha * 1.6, y, zc + flecha * 0.6]);
    linea([max.x, y, zc], [max.x - flecha * 1.6, y, zc - flecha * 0.6]);
    linea([max.x, y, zc], [max.x - flecha * 1.6, y, zc + flecha * 0.6]);
    // Cota vertical (alto) a la izquierda
    const xc = min.x - sep;
    linea([min.x - 2, y, min.z], [xc - flecha, y, min.z]);
    linea([min.x - 2, y, max.z], [xc - flecha, y, max.z]);
    linea([xc, y, min.z], [xc, y, max.z]);
    linea([xc, y, min.z], [xc - flecha * 0.6, y, min.z + flecha * 1.6]);
    linea([xc, y, min.z], [xc + flecha * 0.6, y, min.z + flecha * 1.6]);
    linea([xc, y, max.z], [xc - flecha * 0.6, y, max.z - flecha * 1.6]);
    linea([xc, y, max.z], [xc + flecha * 0.6, y, max.z - flecha * 1.6]);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.matCotas ??= new THREE.LineBasicMaterial({ color: 0xc9cce0, transparent: true, opacity: 0.8 });
    this.cotas = new THREE.LineSegments(geo, this.matCotas);
    this.escena.add(this.cotas);

    const cm = mm => (mm / 10).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    this.etiquetas[0].textContent = `${cm(max.x - min.x)} cm`;
    this.etiquetas[1].textContent = `${cm(max.z - min.z)} cm`;
    this.posEtiquetas = [new THREE.Vector3((min.x + max.x) / 2, y, zc), new THREE.Vector3(xc, y, (min.z + max.z) / 2)];
    this.etiquetas.forEach(e => { e.hidden = false; });
  }

  // Ubica las etiquetas HTML sobre la proyección de cada cota
  moverEtiquetas() {
    if (!this.posEtiquetas?.length) return;
    const { clientWidth: w, clientHeight: h } = this.contenedor;
    this.posEtiquetas.forEach((p, i) => {
      const v = p.clone().project(this.camara);
      const div = this.etiquetas[i];
      div.style.visibility = v.z > 1 ? 'hidden' : 'visible';
      div.style.transform = `translate(${(v.x + 1) / 2 * w}px, ${(1 - v.y) / 2 * h}px) translate(-50%, -50%)`;
    });
  }

  // ---- Edición de uniones con el mouse ----

  // Punto del piso (coordenadas del modelo, mm) bajo el puntero, o null
  puntoEnPiso(evento) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((evento.clientX - rect.left) / rect.width) * 2 - 1,
      -((evento.clientY - rect.top) / rect.height) * 2 + 1);
    this.rayo ??= new THREE.Raycaster();
    this.rayo.setFromCamera(ndc, this.camara);
    const p = this.rayo.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    // el grupo está rotado -90° en X: mundo (x, y, z) = modelo (x, z, -y)
    return p ? [p.x, -p.z] : null;
  }

  resaltarUnion(indice) {
    this.matUnionQuitar ??= new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive: 0x661010, roughness: 0.5 });
    this.mallasUnion.forEach((m, i) => { m.material = i === indice ? this.matUnionQuitar : this.matBase; });
  }

  // Pieza translúcida a agregar (verde) o quitar (rojo); opcionalmente con un agujero
  mostrarPrevia(poligono, { alto = this.altoUnion ?? 10, quitar = false, agujero = null } = {}) {
    if (this.previa) {
      this.modelo.remove(this.previa);
      this.previa.geometry.dispose();
      this.previa = null;
    }
    if (!poligono) return;
    this.matPrevia ??= new THREE.MeshStandardMaterial({ color: 0x2ee66b, emissive: 0x0b5c25, transparent: true, opacity: 0.85 });
    this.matPreviaQuitar ??= new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive: 0x661010, transparent: true, opacity: 0.85 });
    const forma = new THREE.Shape(poligono.map(([x, y]) => new THREE.Vector2(x, y)));
    if (agujero) forma.holes = [new THREE.Path(agujero.map(([x, y]) => new THREE.Vector2(x, y)))];
    this.previa = new THREE.Mesh(new THREE.ExtrudeGeometry(forma, { depth: alto + 0.1, bevelEnabled: false }),
      quitar ? this.matPreviaQuitar : this.matPrevia);
    this.previa.position.z = 0.05;
    this.modelo.add(this.previa);
  }

  // Marcador de orificio: cilindro translúcido que atraviesa el canal (verde = agregar, rojo = quitar)
  mostrarMarcador(centro, diametro, alto, quitar) {
    if (!this.marcador) {
      this.matMarcador = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.75, depthTest: false });
      this.marcador = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 32), this.matMarcador);
      this.marcador.rotation.x = Math.PI / 2;   // eje del cilindro = z del modelo
      this.marcador.renderOrder = 10;
    }
    if (!centro) { this.marcador.removeFromParent(); return; }
    this.matMarcador.color.set(quitar ? 0xff4d4d : 0x2ee66b);
    this.matMarcador.emissive.set(quitar ? 0x661010 : 0x0b5c25);
    this.marcador.scale.set(diametro, alto + 2, diametro);
    this.marcador.position.set(centro[0], centro[1], (alto + 2) / 2 - 1);
    if (this.marcador.parent !== this.modelo) this.modelo.add(this.marcador);
  }

  // Aros sobre el canal que señalan dónde hay orificios (se borran con el próximo render)
  marcarOrificios(centros, diametro, alto) {
    const pts = [], lados = 32, r = diametro / 2 + 0.4, z = alto + 0.1;
    for (const [cx, cy] of centros) {
      for (let i = 0; i < lados; i++) {
        const a = (i / lados) * Math.PI * 2, b = ((i + 1) / lados) * Math.PI * 2;
        pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a), z, cx + r * Math.cos(b), cy + r * Math.sin(b), z);
      }
    }
    if (!pts.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.matAros ??= new THREE.LineBasicMaterial({ color: 0xff3fa4, depthTest: false });
    const aros = new THREE.LineSegments(geo, this.matAros);
    aros.renderOrder = 9;
    this.modelo.add(aros);
  }

  // Grilla de 10 mm (50 mm en carteles grandes), un poco más grande que el cartel
  actualizarGrilla(tamModelo) {
    const paso = tamModelo > 1200 ? 50 : 10;
    const tam = Math.ceil((tamModelo * 1.4) / 100) * 100;
    if (tam === this.tamGrilla) return;
    if (this.grilla) { this.escena.remove(this.grilla); this.grilla.geometry.dispose(); }
    this.grilla = new THREE.GridHelper(tam, tam / paso, 0xffffff, 0xffffff);
    this.grilla.material.transparent = true;
    this.grilla.material.opacity = 0.08;
    this.grilla.position.y = -0.1;
    this.escena.add(this.grilla);
    this.tamGrilla = tam;
  }

  encuadrar() {
    const caja = new THREE.Box3().setFromObject(this.modelo);
    if (caja.isEmpty()) return;
    const esfera = caja.getBoundingSphere(new THREE.Sphere());
    const dist = esfera.radius / Math.sin(THREE.MathUtils.degToRad(this.camara.fov / 2)) * 0.95;
    const dir = new THREE.Vector3(0, 0.75, 0.66).normalize();
    this.camara.position.copy(esfera.center).addScaledVector(dir, dist);
    this.controles.target.copy(esfera.center);
    this.controles.update();
  }
}
