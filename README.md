# Memorama

Juego de memoria (parejas de cartas) construido con **React + Ionic + Capacitor**.
El jugador debe encontrar todas las parejas antes de que se agote el tiempo.

---

## Tabla de contenidos

1. [Requisitos previos](#requisitos-previos)
2. [Instalación](#instalación)
3. [Archivo de configuración](#archivo-de-configuración)
4. [Imágenes y assets](#imágenes-y-assets)
5. [Proceso de build](#proceso-de-build)
6. [Scripts disponibles](#scripts-disponibles)

---

## Requisitos previos

- **Node.js** >= 18
- **npm** >= 9
- **Android Studio** (solo si se desea compilar la APK)

---

## Instalación

```bash
npm install
npm run dev        # Servidor de desarrollo
```

---

## Archivo de configuración

El archivo `memorama-config.json` controla el comportamiento del juego. Debe ubicarse en la carpeta **`public/config/`** durante el desarrollo.

### Ubicación

```
public/
└── config/
    └── memorama-config.json
```

### Propiedades

| Propiedad | Tipo | Requerida | Descripción |
|-----------|------|:---------:|-------------|
| `nombreApp` | `string` | No | Nombre que se muestra en la interfaz del juego. |
| `nivel` | `string` | No | Nivel de dificultad por defecto. Valores posibles: `"basico"`, `"intermedio"`, `"avanzado"` (también acepta en inglés: `"basic"`, `"intermediate"`, `"advanced"`). Si se omite, se usa `"basico"`. |
| `version` | `string` | No | Versión de la configuración (formato semántico, ej. `"1.0.0"`). |
| `fecha` | `string` | No | Fecha de creación en formato ISO: `"YYYY-MM-DD"`. |
| `descripcion` | `string` | No | Texto descriptivo que se muestra en la pantalla principal. |
| `plataformas` | `string[]` | No | Plataformas objetivo, ej. `["android", "ios", "web"]`. Solo informativo. |
| `imagenes` | `object` | No | Objeto con las imágenes por nivel de dificultad. Si se omite, el juego usa letras (A-P) como contenido de las cartas. |

### Niveles de dificultad

| Nivel | Parejas | Cartas | Tiempo |
|-------|:-------:|:------:|:------:|
| `basico` | 3 | 6 | 15 s |
| `intermedio` | 4 | 8 | 20 s |
| `avanzado` | 5 | 10 | 30 s |

### Propiedad `imagenes`

El objeto `imagenes` mapea cada nivel a un arreglo de rutas de imagen. Las claves deben coincidir con los nombres de nivel (`basico`, `intermedio`, `avanzado`).

Cada arreglo puede contener:

- **Archivos de imagen individuales** (`.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`) — se deben colocar en `public/assets/`.
- **Archivos `.zip`** — contienen varias imágenes comprimidas. Se descomprimen automáticamente. También deben ubicarse en `public/assets/`.

> [!IMPORTANT]
> La cantidad de imágenes provistas por nivel debe ser **igual o mayor** al número de parejas de ese nivel (3, 4 o 5 respectivamente).

### Ejemplo completo

```json
{
  "nombreApp": "Memorama Animales",
  "nivel": "intermedio",
  "version": "1.0.0",
  "fecha": "2026-01-15",
  "descripcion": "Encuentra todas las parejas de cartas antes de que se termine el tiempo.",
  "plataformas": ["android", "ios", "web"],
  "imagenes": {
    "basico": [
      "imagen1.jpg",
      "imagen2.jpg",
      "imagen3.png"
    ],
    "intermedio": [
      "intermedio.zip"
    ],
    "avanzado": [
      "avanzado.zip"
    ]
  }
}
```

---

## Imágenes y assets

Todas las imágenes referenciadas en `memorama-config.json` deben colocarse dentro de la carpeta **`public/assets/`**.

```
public/
└── assets/
    ├── imagen1.jpg
    ├── imagen2.jpg
    ├── imagen3.png
    ├── intermedio.zip
    └── avanzado.zip
```

**Formatos soportados:** `.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`

**Archivos ZIP:** deben contener imágenes en la raíz del archivo (sin subcarpetas). Se descomprimen automáticamente.

---

## Proceso de build

El comando `npm run build` ejecuta el pipeline completo para generar un archivo `android-base.zip` listo para distribución.

### Pipeline

```
npm run build
```

Ejecuta en secuencia:

| Paso | Script | Qué hace |
|:----:|--------|----------|
| 1 | `build:web` | Compila la aplicación React con Vite (genera la carpeta `dist/`). |
| 2 | `build:android` | Crea el proyecto nativo de Android con Capacitor (si no existe). |
| 3 | `build:android:sync` | Copia el contenido de `dist/` dentro de los assets de Android. |
| 4 | `patch:capacitor` | Aplica parches necesarios al archivo Gradle de Capacitor. |
| 5 | `clean:assets` | **Limpieza de archivos innecesarios** (ver detalle abajo). |
| 6 | `zip:android` | Empaqueta la carpeta `android/` en `android-base.zip`. |

### Limpieza de archivos (`clean:assets`)

Para **optimizar el tamaño** del ZIP final, el paso de limpieza elimina archivos que no son necesarios para la compilación por parte del usuario final:

| Archivos / carpetas eliminados | Razón |
|-------------------------------|-------|
| `android/.gradle` | Caché de Gradle (se regenera al compilar). |
| `android/build`, `android/app/build` | Artefactos de compilación previos. |
| `android/capacitor-cordova-android-plugins/build` | Build de plugins (se regenera). |
| `android/.idea/*` | Archivos de configuración de Android Studio / IntelliJ. |
| `android/.gitignore` | No necesario para el usuario final. |
| `android/local.properties` | Contiene rutas locales del SDK (cada usuario debe generar el suyo). |
| `android/app/src/androidTest`, `android/app/src/test` | Tests de ejemplo de Android (no relevantes). |
| `android/.../config/memorama-config.json` | **Se elimina intencionalmente** para que el usuario coloque su propia configuración. |
| `android/.../config/memorama-config-example.json` | Archivo de ejemplo (se elimina del build). |

> [!NOTE]
> El archivo `memorama-config.json` se elimina del ZIP a propósito. Cada usuario debe crear su propio archivo de configuración con sus imágenes y preferencias antes de compilar la APK en Android Studio.

### Resultado

Después de ejecutar `npm run build`, se genera el archivo **`android-base.zip`** en la raíz del proyecto. Este archivo contiene el proyecto Android listo para:

1. Descomprimir.
2. Agregar el archivo `memorama-config.json` en `android/app/src/main/assets/public/config/`.
3. Colocar las imágenes referenciadas en `android/app/src/main/assets/public/assets/`.
4. Abrir con Android Studio y compilar la APK.

---

## Scripts disponibles

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Inicia el servidor de desarrollo (Vite). |
| `npm run build` | Pipeline completo: build web + Android + limpieza + ZIP. |
| `npm run build:web` | Solo compila la aplicación web. |
| `npm run preview` | Vista previa del build de producción. |
| `npm run test.unit` | Ejecuta tests unitarios (Vitest). |
| `npm run test.e2e` | Ejecuta tests E2E (Cypress). |
| `npm run lint` | Ejecuta el linter (ESLint). |
