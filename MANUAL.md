# Neón Studio — Manual de uso

Neón Studio genera la **base imprimible en 3D para carteles de neón flex**: un canal en U que sigue el texto o el logo,
donde después se encastra la tira de neón. El resultado es un archivo STL (o un ZIP con varias piezas) listo para laminar.

---

## 1. Puesta en marcha

### Requisitos
- **Node.js** instalado (se usa sólo para el servidor local).
- **Conexión a internet**: las librerías 3D (three.js) y de geometría (clipper) se cargan desde un CDN.
  Las tipografías están incluidas en la carpeta `fonts/`, así que esas no necesitan internet.
- Un navegador moderno (Chrome, Edge o Firefox).

### Iniciar
- **Doble clic en `iniciar.bat`**: levanta el servidor y abre el navegador en <http://localhost:5173>.
  Si ya estaba corriendo, sólo abre el navegador.
- **A mano**, desde una terminal:
  ```powershell
  cd F:\REA\neon-studio
  node serve.js
  ```
  y abrir <http://localhost:5173>.

### Detener
Cerrar la ventana negra del servidor o apretar `Ctrl + C` en ella.

> **Importante:** el diseño **no se guarda**. Al recargar la página vuelve al ejemplo inicial.
> Lo único que se recuerda (en ese navegador) es el tamaño de la cama de la impresora.
> Exportá el STL antes de cerrar.

---

## 2. La pantalla

| Zona | Qué tiene |
|---|---|
| **Barra superior** | ↶ Deshacer (`Ctrl+Z`) · ↷ Rehacer (`Ctrl+Y`) · 💡 mostrar/ocultar el neón · 📏 mostrar/ocultar las medidas · ⌖ centrar la vista |
| **Columna izquierda** | Las secciones: Diseño, Canal, Uniones, Orificios, Anclajes, Cortes y Exportar |
| **Panel** | Los controles de la sección elegida |
| **Visor 3D** | El modelo. Arriba a la izquierda, ancho × alto total en cm. Sobre el piso, las cotas de ancho y alto |

**Mover la vista:** botón izquierdo = rotar · botón derecho = desplazar · rueda = zoom.
El zoom se acerca al centro de la vista, no al cursor: para mirar un detalle, primero desplazalo al centro con el botón derecho.

**Qué miden las cotas:** la pieza impresa completa (canal, uniones, orejitas y encastres), **sin** el neón.

**Deshacer/rehacer** cubre todos los cambios del diseño: texto, medidas, uniones, orificios, orejitas, cortes, etc.

---

## 3. Conceptos básicos

### El canal en U
Cada trazo del cartel es un canal con:
- un **fondo** (la base que apoya en la cama),
- dos **paredes** laterales,
- una **ranura** en el medio donde se encastra el neón flex.

### Los dos modos de recorrido del neón
- **Contorno:** el neón sigue el borde de cada letra. El canal se centra sobre ese borde, así que la letra queda
  **hueca, delineada por dentro y por fuera** ("doble contorno"). Ideal para letras gruesas o de bloque.
- **Centro:** un solo neón por el medio de cada trazo (como el neón de vidrio clásico). Ideal para manuscritas o trazos finos.

### Medidas
El **ancho del cartel** es el ancho de las letras. La pieza impresa mide un poco más, porque en modo Contorno
las paredes sobresalen del borde de la letra (unos 5 mm por lado con el canal por defecto) y porque se suman las orejitas.
Las cotas del visor siempre muestran la medida real impresa.

---

## 4. Secciones

### ✎ Diseño
Qué se escribe o dibuja.

- **Texto / Logo SVG:**
  - **Texto:** se escribe en el cuadro. Admite varias líneas, con `Enter` para cortar.
  - **Logo SVG:** elegí o soltá un archivo `.svg`. Se leen dos tipos de elementos:
    - **Formas con relleno:** se tratan como letras, con el modo Contorno o Centro.
    - **Trazos (líneas sin relleno):** la línea del trazo es directamente el recorrido del neón y el canal se centra
      sobre ella, sea abierta o cerrada. Es la forma más directa de dibujar un neón.
    - **Lo que se ignora:** el grosor del trazo y los guiones (`stroke-dasharray`); un trazo punteado sale continuo.
    - **Lo que se descarta:** los puntos sueltos (trazos de largo casi nulo) y los lazos cerrados más chicos que dos
      anchos de canal (unos 20 mm), como un circulito de adorno, porque el canal los taparía y el neón no puede curvarse tanto.
    - **El ancho del cartel** se mide sobre el dibujo (rellenos y líneas centrales de los trazos); el canal suma
      unos 5 mm por lado.
- **Tipografía:** 22 fuentes de Google Fonts, primero las manuscritas y después las de bloque.
  Se elige de la lista, que muestra cada una con su estilo, o con las flechas ↑↓ sobre el selector.
- **Alineación e Interlineado:** para textos de varias líneas (el interlineado va de 0,70 a 1,80).
- **Recorrido del neón:** Contorno o Centro (ver arriba).
- **Unir letras que se superponen:** sólo en modo Contorno. En las manuscritas las letras se tocan.
  - **Activado:** se unen y el neón recorre sólo el borde exterior del conjunto.
  - **Desactivado:** cada letra tiene su propio contorno, aunque se crucen.
- **Ancho del cartel:** de 50 a 2000 mm.
- **Color de la base / Marcar aristas:** sólo para la vista previa, no afectan el STL.

**Qué esperar:**
- El modelo se regenera a medida que escribís o movés un control.
- Si el cartel no entra en la cama y está activado el corte (ver Cortes), después de dejar de tocar
  (≈0,4 s) aparecen las **juntas de los encastres en azul**. En carteles muy grandes ese cálculo puede tardar 1–2 segundos.

### ▭ Canal
El perfil en U, con un corte transversal dibujado a escala.

- **Neón flex:** medidas comerciales 6 × 12, 8 × 16 y 10 × 20 mm, o Personalizado.
  Elegir una medida ajusta el ancho de la ranura y el alto del neón.

| Medida | Rango | Por defecto | Para qué |
|---|---|---|---|
| Ancho de la ranura | 4–12 mm | 6,2 mm | Donde entra el neón. Conviene ~0,2 mm más que el neón |
| Alto del neón | 4–25 mm | 12 mm | **Sólo para la vista previa** |
| Grosor de pared | 0,5–5 mm | 2 mm | Paredes laterales |
| Grosor del fondo | 0,5–5 mm | 2 mm | Base |
| Alto de las paredes | 1–15 mm | 6 mm | Cuánto abraza al neón |

**Avisos que puede mostrar:**
- **Paredes de menos de 1,2 mm:** quedan frágiles (con boquilla de 0,4 mm son menos de 3 perímetros).
- **Fondo de menos de 1 mm:** puede romperse al despegarlo de la cama.
- **Paredes muy bajas respecto del neón:** sujetan poco; conviene pegar el neón con silicona.

El resumen muestra el ancho total del canal, el alto impreso y cuánto sobresale el neón.

### ⛓ Uniones
Puentes que conectan las partes sueltas (letras separadas, el punto de la i, el interior de una D) para que el cartel
salga **en una sola pieza**.

- **Unir todo en una sola pieza:** agrega automáticamente el **mínimo** de uniones, cada una en el punto más cercano
  entre dos piezas.
- **Ancho de la unión:** de 2 a 15 mm (4 por defecto).
- **Altura de la unión:**
  - **Completa:** hasta arriba de las paredes. Más firme.
  - **Baja:** sólo del grosor del fondo. Más discreta, queda detrás del neón.
- **Editar con el mouse:**
  - Sobre una unión existente se pone **roja** y un clic la quita.
  - En un hueco entre dos piezas aparece una nueva en **verde** y un clic la agrega.
  - **Volver a las automáticas** descarta los cambios a mano.

**Qué esperar:**
- El resumen indica cuántas piezas y uniones hay.
- Si quedan partes separadas (por ejemplo, porque quitaste una unión necesaria), lo avisa en naranja. Exportar también lo advierte.
- En esta sección se ve siempre el cartel entero, sin cortes, para que la edición responda al instante.

### ◉ Orificios
Agujeros que atraviesan el canal para pasar los **cables del neón** hacia atrás del cartel.

- **Colocar orificios con el mouse:**
  - Un marcador verde se pega al **centro del canal más cercano** y un clic hace el orificio.
  - Sobre un orificio existente el marcador se pone **rojo** y un clic lo quita.
- **Diámetro:** de 2 a 15 mm (5 por defecto). Es uno solo para todos los orificios.
  Si es más ancho que la ranura, **también corta las paredes** y el panel lo avisa.
- **Orificio al inicio de cada tira:** pone uno donde arranca cada tramo de neón: el comienzo de un trazo abierto
  o el punto más bajo de un contorno cerrado. No repite donde ya hay uno.
- **Quitar todos.**

**Qué esperar:**
- **El neón se oculta** mientras estás en esta sección, para ver los orificios. Cada uno se marca además con un **aro rosa**.
- Los orificios atraviesan fondo, paredes y uniones.
- En modo **Centro** el trazo se divide en cada cruce, así que el botón automático puede poner **muchos** orificios
  (por ejemplo, 22 en "Neón Bar"). Ahí conviene ponerlos a mano.

### ⚓ Anclajes
Orejitas con un orificio, pegadas al borde, para **atornillar el cartel a la pared o colgarlo**.

- **Colocar orejitas con el mouse:**
  - Cerca del borde, **por fuera del cartel o por dentro de la figura** (por ejemplo, adentro de una O grande),
    aparece una orejita verde pegada al borde más cercano. Un clic la agrega.
  - Sobre una existente se pone **roja** y un clic la quita. Hay que apuntar a la orejita misma, no más allá de su punta.
- **Forma:** Semicírculo o Recta.
- **Altura:**
  - **Sólo la base:** del grosor del fondo.
  - **Toda la altura:** como las paredes, sin tapar nunca la ranura del neón.
- **Orificio:** de 2 a 12 mm (5 por defecto).
- **Ancho de la orejita:** de 8 a 30 mm (14 por defecto). Si el orificio no entra con **2 mm de material alrededor**,
  la orejita se agranda sola y el panel avisa la medida real.
- **Quitar todas.**

**Qué esperar:**
- Forma, altura, orificio y ancho valen para **todas** las orejitas a la vez.
- Las orejitas agrandan la medida total del cartel: las cotas y el recuadro de medidas lo reflejan.

### ✂ Cortes
Si el cartel no entra en la impresora, se divide en **columnas y filas** con **encastres cola de milano**.

- **Dividir en piezas si no entra en la cama:** activado por defecto.
- **Impresora:** presets (Bambu Lab, Prusa, Creality…) o Personalizada.
  El tamaño de la cama **se recuerda en el navegador**.
- **Área de impresión:** se dejan **5 mm libres por lado**, y también se descuenta lo que sobresalen los encastres.
- **Holgura del encastre:** de 0 a 0,6 mm (0,2 por defecto).
  - **Más holgura:** encaja más fácil, pero queda más flojo.
  - **Menos holgura:** queda más justo, pero puede no entrar.
  - Ajustala según tu impresora; hacé una prueba chica primero.
- **Ver piezas separadas:** aleja las piezas 30 mm entre sí para verlas mejor.

**Cómo corta:**
- Cada corte va **donde cruza menos material**, evitando los roces tangenciales.
- En cada cruce lleva una cola de milano: **macho** en la pieza de la izquierda o de arriba, **hembra** en la vecina.
- El encastre atraviesa fondo y paredes.

**Qué esperar:**
- En esta sección las piezas se ven en colores alternados. El resumen lista cada pieza (C1F1, C2F1… = columna, fila)
  con sus medidas, y avisa si alguna no entra.
- **Puntos débiles:** como se corta por donde hay menos material, a menudo el corte cae justo en un **puente de unión**
  (4 mm). El encastre ahí es chico. Si el cartel va a estar expuesto a esfuerzos, reforzá esas juntas con pegamento.

### ⬇ Exportar
- **Nombre del archivo:** se propone a partir del texto, por ejemplo `neon-feliz-cumpleanos`. Se puede cambiar.
- **Resumen:**
  - **Medidas:** las totales.
  - **Volumen y filamento:** estimados en PLA (1,24 g/cm³), sin contar relleno ni soportes.
  - **Metros de neón necesarios:** conviene **comprar un 10 % más**.
  - **Avisos:** partes sueltas o que no entra en la cama.
- **Descargar STL / Descargar ZIP (N piezas):**
  - **Cartel entero:** un STL binario en **milímetros, con Z hacia arriba**, apoyado en la cama.
  - **Cartel cortado:** un ZIP con un STL por pieza (`nombre_c1f1.stl`, `nombre_c2f1.stl`…), cada una centrada.

**Sobre las mallas:**
- El STL se valida antes de descargar. Normalmente es **una sola malla cerrada**.
- En algunos diseños sale en **dos cuerpos** (fondo y paredes) que se superponen. Es correcto: el laminador
  los une solo al laminar. El mensaje al terminar indica cuál de los dos casos es.

---

## 5. Consideraciones para imprimir

- **Orientación:** el STL ya está apoyado sobre el fondo; no hace falta rotarlo ni poner soportes.
- **Paredes:** con boquilla de 0,4 mm, 2 mm de pared son 5 perímetros. Configurá el laminador para que las paredes
  queden **macizas** (perímetros suficientes), no con relleno.
- **Ranura:** si el neón entra muy justo o muy flojo, ajustá el **ancho de la ranura** en Canal (de a 0,1–0,2 mm).
  Imprimí primero un cartel chico de prueba.
- **Encastres:** probá la holgura con dos piezas antes de imprimir todo el cartel.
- **Primera capa:** el fondo es ancho y fino; una buena adherencia evita que se levanten las puntas en carteles grandes.
- **Color:** el color de la base del visor es sólo de muestra; el color real lo da el filamento.

---

## 6. Problemas frecuentes

| Problema | Qué hacer |
|---|---|
| La página no abre | Verificá que el servidor esté corriendo (`iniciar.bat`) y que haya internet |
| `EADDRINUSE` al iniciar | El servidor ya está corriendo en otra ventana: abrí <http://localhost:5173> directamente |
| "No se pudo trazar el neón con este diseño" | El texto o SVG no tiene formas con relleno válidas, o es demasiado chico: probá otro modo o más ancho |
| Las letras manuscritas se ven raras en Contorno | Probá desactivar "Unir letras que se superponen" o usar el modo Centro |
| El SVG no aparece o le faltan partes | Revisá que las formas tengan relleno o trazo visibles; los circulitos de menos de ~20 mm y los puntos sueltos se descartan a propósito |
| En modo Centro desaparece un círculo relleno | Un disco no tiene línea central: dibujalo como trazo (círculo sin relleno) o usá el modo Contorno |
| "Quedan N partes separadas" | Activá "Unir todo en una sola pieza" en Uniones, o agregá una unión a mano |
| Una pieza no entra en la cama | Revisá el tamaño de la cama en Cortes; si es una pieza muy alargada, achicá el cartel |
| Se perdió el diseño | El diseño no se guarda al recargar la página: exportá antes de cerrar |

---

## 7. Licencias

- Las tipografías son de **Google Fonts**, con licencia **SIL Open Font License** o **Apache 2.0**.
  Se pueden usar libremente, incluso para carteles comerciales. Sus licencias están en `fonts/licencia-*.txt`
  y deben acompañar a las fuentes si se redistribuye la aplicación.
- three.js y clipper-lib son librerías de código abierto (MIT y Boost, respectivamente).
