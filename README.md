> [!NOTE]
> Para cargar una imagen, se debe copiar a la carpeta `assets`:
> - Lista de imágenes o
> - Un archivo `zip` con las imágenes dentro.

### Ejemplo de archivo de configuración (`memorama-config.json`) dentro de la carpeta `config`.

```json
{
  "nombreApp": "Memorama Animales",
  "nivel": "intermedio",
  "autor": "Equipo STEAM-G",
  "version": "1.0.0",
  "fecha": "2026-01-15",
  "descripcion": "Encuentra todas las parejas de cartas antes de que se termine el tiempo.",
  "plataformas": ["android", "ios", "web"],
  "imagenes": {
    "basico": [
      "images1.jpg",
      "images2.jpg",
      "images3.png"
    ],
    "intermedio": [
      "intermedio.zip"
    ],
    "avanzado": [
      "avanzado.zip"
    ]
  }
}
