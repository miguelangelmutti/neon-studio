# Neón Studio

Generador de **bases imprimibles en 3D para carteles de neón flex**. Escribís un texto (o subís un logo SVG) y la
aplicación arma un **canal en U** que sigue cada trazo, listo para encastrar la tira de neón, y lo exporta como **STL**.
Si el cartel no entra en tu impresora, lo divide en piezas con **encastres cola de milano**.

Corre entero en el navegador: no hay backend ni build, sólo archivos estáticos y un servidor mínimo en Node.

## Funciones

- **Diseño:**
  - Texto con 22 tipografías de Google Fonts, o logo SVG: las formas con relleno se tratan como letras
    y los trazos son directamente el recorrido del neón.
  - Varias líneas, alineación e interlineado.
  - Dos modos de recorrido:
    - **Contorno:** doble contorno; la letra queda hueca.
    - **Centro:** un solo neón por el medio de cada trazo, a partir de un esqueleto del trazo.
- **Canal:** ancho de ranura, paredes, fondo y altura configurables, con presets de neón 6×12, 8×16 y 10×20 mm.
- **Uniones:** puentes automáticos (mínimos) entre las partes sueltas para imprimir en una sola pieza, editables con el mouse.
- **Orificios:** agujeros para pasar los cables, colocados con el mouse o al inicio de cada tira.
- **Anclajes:** orejitas con orificio para atornillar o colgar el cartel, por fuera o por dentro de la figura.
- **Cortes:** división por tamaño de cama, con presets de impresoras y cortes donde se cruza menos material.
  Cada cruce lleva una cola de milano con holgura ajustable.
- **Exportar:** STL binario en mm, una malla cerrada y validada, o un ZIP con un STL por pieza.
  Incluye una estimación de filamento y de metros de neón.
- **Visor 3D:** cotas, vista del neón, piezas separadas, y deshacer/rehacer de todo el estado.

## Uso rápido

Requisitos:
- **Node.js**, sólo para servir los archivos.
- **Conexión a internet**, porque three.js y clipper-lib se cargan desde jsDelivr.

```bash
node serve.js
# → http://localhost:5173  (otro puerto: PORT=8080 node serve.js)
```

En Windows alcanza con hacer doble clic en `iniciar.bat`, que levanta el servidor y abre el navegador.

El detalle de cada sección, las consideraciones para imprimir y los problemas frecuentes están en el
**[Manual de uso](MANUAL.md)**.

## Estructura

```
index.html        Interfaz: barra, secciones, paneles y visor
css/app.css       Estilos (tema oscuro)
serve.js          Servidor estático de desarrollo (puerto 5173, sin caché)
iniciar.bat       Atajo para Windows: inicia el servidor y abre el navegador
fonts/            Tipografías (.ttf) y sus licencias (licencia-*.txt)
js/
  main.js         Estado, controles, historial, edición con el mouse y orquestación
  geometria.js    Texto/SVG → contornos; canal en U (Clipper); esqueleto para el modo Centro
  escena.js       Visor three.js: extrusión, piezas, cotas, marcadores y previas
  uniones.js      Puentes automáticos entre piezas (árbol de expansión mínima) y edición manual
  orificios.js    Agujeros para cables: punto más cercano del recorrido e inicios de tira
  anclajes.js     Orejitas de anclaje: borde más cercano, normal y forma
  cortes.js       División por cama: posición de los cortes y colas de milano
  exportar.js     Capas de impresión, malla escalonada manifold, validación y STL
```

### Cómo se arma el modelo

1. **Contornos:** opentype.js convierte el texto en contornos; los SVG se leen con el SVGLoader de three.js
   (los rellenos como contornos y los trazos como recorridos de neón ya dados).
2. **Recorrido del neón:**
   - **Contorno:** el propio borde de cada letra.
   - **Centro:** el esqueleto del trazo (Zhang-Suen), simplificado y suavizado.
3. **Canal (Clipper, coordenadas enteras a 1 µm):**
   - el **fondo** es una franja alrededor del recorrido;
   - las **paredes** son esa franja menos la ranura del neón.
4. **Agregados:** se suman uniones y orejitas, y se restan orificios.
5. **Cortes:** se recortan las piezas con las colas de milano.
6. **Malla:** se arma una malla escalonada (fondo, escalón, paredes), soldando vértices y uniones en T.
   - Se verifica que sea manifold.
   - Si no lo es, se reintenta triangulando con un corrimiento ínfimo.
   - Como último recurso se exportan dos cuerpos cerrados superpuestos, que el laminador une.

## Tecnologías

- [three.js](https://threejs.org/) 0.160 — visor 3D, SVGLoader, STLExporter, fflate (ZIP)
- [opentype.js](https://opentype.js.org/) (incluido en three.js) — lectura de tipografías
- [clipper-lib](https://www.npmjs.com/package/clipper-lib) 6.4.2 — operaciones booleanas y offsets de polígonos

## Licencias de terceros

- **Tipografías:** de [Google Fonts](https://fonts.google.com/), bajo SIL Open Font License 1.1 o Apache 2.0.
  Cada licencia está en `fonts/licencia-*.txt`.
- **three.js:** MIT.
- **clipper-lib:** Boost Software License.
