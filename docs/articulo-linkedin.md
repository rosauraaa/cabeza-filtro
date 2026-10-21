# Cabeza Cubo: un filtro de RA que copia tus gestos (hecho en Blender + MediaPipe)

*(Borrador para LinkedIn · ~380 palabras. Antes de publicar, agrega el video o GIF y revisa los enlaces.)*

**Objetivo.** El reto de esta actividad fue crear un filtro facial de Realidad Aumentada que, al abrir la app, detecte el rostro con la cámara frontal, lo cubra por completo con una **máscara animada de diseño propio**, siga sus movimientos y **reaccione a gestos**. Así nació *Cabeza Cubo*: tu cabeza se vuelve un cubo amarillo con gorro de hélice que parpadea, sube las cejas y abre la boca contigo.

**Herramientas.**
- **Blender** para modelar, crear shape keys y animar la máscara.
- **MediaPipe Face Landmarker** para detectar 478 puntos de la cara y 52 *blendshapes* de expresión.
- **three.js** para renderizar el GLB animado encima del video.
- **Web Audio API** para los sonidos.

**Proceso.** Modelé la máscara con un script de Python en Blender, usando como unidad el ancho de la cara para que el tamaño fuera fácil de calibrar. Además de los ojos, cejas, boca y lengua, creé cuatro **shape keys** (parpadeo izquierdo y derecho, cejas arriba y boca abierta) y dos **animaciones**: la hélice gira y el gorro rebota. Todo se exporta en un GLB de 240 KB. En la web, cada frame paso los blendshapes de MediaPipe a esos shape keys y coloco la máscara con la matriz de transformación facial.

**Gestos:**
- Al **abrir la boca** sale confeti de cubitos.
- Al **subir las cejas** el gorro sale volando con la hélice a toda velocidad.
- Al **guiñar** salen estrellitas.

Cada gesto se activa con un umbral (por ejemplo, boca abierta > 50 %) y una pausa de casi un segundo para que no se dispare sin parar.

**Retos.**
- *Alinear sin desfase:* combiné la rotación de MediaPipe con la posición y la escala calculadas a partir de los landmarks de los lados de la cara, en una cámara ortográfica del mismo tamaño que el video, más un suavizado ligero.
- *Coordenadas en Blender:* al unir piezas, los vértices quedaban relativos al primer objeto y la boca "se despegaba" al abrirse. Lo resolví aplicando las transformaciones antes de unir.
- *Mallas con varios materiales:* three.js las divide en varias mallas, así que los morphs se aplican a todas.

**Resultado.** Un filtro que abre directo en la cámara, cubre toda la cara, sigue los giros y responde de forma clara a tres gestos. Lo probé en *(teléfono 1)* y *(teléfono 2)* con varias personas, con lentes y con distinta iluminación.

🎥 *(video o GIF aquí)*
😃 Pruébalo: https://rosauraaa.github.io/cabeza-cubo-filtro/
💻 Código: https://github.com/rosauraaa/cabeza-cubo-filtro

#RealidadAumentada #FaceTracking #MediaPipe #Blender #threejs #WebAR
