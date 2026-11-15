# Gym Tracker

App web mobile-first (PWA) para Android, iPhone y PC: rutinas de gimnasio, registro de
entrenamientos, sobrecarga progresiva con auto-regulación, coach con Claude y
sincronización entre dispositivos.

- **Cliente:** Vite + TypeScript + Preact. Funciona sin conexión; los datos viven en el dispositivo.
- **Servidor:** Node.js sin dependencias (`node:http` + `node:sqlite`). Sirve la app y guarda
  una copia por usuario para sincronizar celular y PC.
- **Claude:** cada dispositivo llama a la API de Anthropic con su propia clave.

## Requisitos

- Node.js **22.13 o superior**.

## Levantarla

```bash
npm install
```

```bash
npm run start
```

`start` compila la app y arranca el servidor en `http://localhost:8787`.
La base de datos queda en `data/gym-tracker.db` (configurable con `DATA_DIR`; el puerto con `PORT`).

Otros comandos: `npm run dev` (interfaz con recarga; necesita `npm run server` en otra terminal),
`npm run build`, `npm run server`, `npm test`.

## Ponerla en internet (necesario para celular + PC)

Para instalarla en el celular y sincronizar desde cualquier lado, el servidor tiene que estar
publicado con **HTTPS**. Android e iPhone solo permiten instalar una PWA y usarla sin conexión
desde `https://`.

Sirve cualquier hosting que corra Node o Docker y tenga **disco persistente** (ahí vive la base
SQLite): un VPS, Render, Railway, Fly.io, etc. El repositorio incluye un `Dockerfile`:

```bash
docker build -t gym-tracker .
```

```bash
docker run -d -p 8787:8787 -v gym-data:/data gym-tracker
```

En una plataforma gestionada: conectá el repositorio, elegí despliegue por Dockerfile, montá un
volumen en `/data` y usá el dominio HTTPS que te den. En un VPS, poné delante un proxy con
certificado (Caddy o nginx) apuntando al puerto 8787.

Solo en la red de tu casa también funciona (`http://IP-de-la-PC:8787`), pero sin HTTPS no se
puede instalar ni usar offline.

## Instalarla en el celular

Abrí la dirección HTTPS del servidor y:

- **Android (Chrome):** menú ⋮ → *Instalar app* / *Agregar a pantalla principal*.
- **iPhone (Safari):** botón Compartir → *Agregar a inicio*.

Queda con ícono propio, a pantalla completa y funciona sin conexión; al recuperar internet
sincroniza sola. No se distribuye por Play Store ni App Store.

## APK de Android (GitHub Releases)

El repositorio incluye un proyecto Android (Capacitor, carpeta `android/`) que empaqueta la app
web dentro de una APK, y un flujo de GitHub Actions (`.github/workflows/android-release.yml`)
que la compila y la publica como release.

- **Lanzar una versión:** creá y subí un tag `vX.Y.Z`, o en GitHub andá a
  *Actions → APK de Android → Run workflow*.
- **Descargar:** desde el celular, abrí *Releases* del repositorio, bajá el `.apk` y abrilo.
  Android pide permitir "instalar apps desconocidas" para el navegador la primera vez.
- **Firma:** para que cada versión nueva se instale encima de la anterior sin perder datos,
  cargá estos *secrets* en *Settings → Secrets and variables → Actions*:
  `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`.
  Sin ellos se publica una APK de depuración, que funciona pero obliga a desinstalar para actualizar.
  Guardá el keystore en un lugar seguro: si se pierde, no se puede actualizar la app instalada.
- **Sincronización desde la APK:** en *Ajustes → Servidor* hay que escribir la dirección HTTPS
  de tu servidor (la APK no trae servidor adentro). Sin servidor, la APK funciona con los datos
  guardados en el celular.
- **Exportar archivos:** dentro de la APK, "Exportar" copia el contenido al portapapeles en
  lugar de descargar un archivo.
- **iPhone:** no hay equivalente a la APK fuera del App Store; en iPhone se usa la versión web
  instalada desde Safari (ver abajo).

Para compilar la APK en tu PC hace falta Android Studio: `npm run android` y después abrir la
carpeta `android/`.

## Versión web para iPhone (GitHub Pages)

Apple no permite instalar apps desde un archivo descargado: un `.ipa` solo se instala por el
App Store o TestFlight, y ambos requieren una cuenta de Apple Developer (USD 99 por año).
Por eso el lanzamiento para iPhone es la versión web instalable:

- El flujo `.github/workflows/web-pages.yml` compila la app y la publica en la rama `gh-pages`
  cada vez que hay cambios. Si el sitio no aparece solo, activalo una vez en
  *Settings → Pages → Source: Deploy from a branch → `gh-pages`*.
- Queda en `https://<usuario>.github.io/<repositorio>/`. En el iPhone: abrirla en **Safari** →
  Compartir → *Agregar a inicio*. Funciona sin conexión y guarda los datos en el teléfono.
- Para sincronizar con otros dispositivos, en *Ajustes → Servidor* se escribe la dirección
  HTTPS del servidor (GitHub Pages solo publica la app, no el servidor).

La versión anterior en Streamlit quedó en `legacy-streamlit/`.

## Versión artefacto de Claude (sin clave ni servidor)

La misma app se puede publicar como artefacto en claude.ai (`npm run build:artifact` genera
`dist-artifact/page.html` y sus scripts). En esa variante:

- **Claude:** el coach y el importador usan la cuenta de Claude de quien abre la página. No hay
  clave de API; la primera vez Claude pide permiso.
- **Datos:** se guardan en el espacio privado de cada persona dentro del artefacto, así que
  aparecen en cualquier dispositivo donde abra la página con su cuenta. No hace falta servidor.
- **Límites:** necesita conexión y sesión iniciada en Claude; no lee PDF (sí fotos, capturas,
  texto, CSV, Excel y JSON); quien la reciba compartida necesita acceso de Colaborador para
  que se guarden sus datos.

El código de esta variante está en `src/ai-artifact.ts` y `src/sync-artifact.ts`; la web y la APK
usan `src/claude.ts` y `src/sync.ts`.

## Cuenta y sincronización

En **Hoy → Cuenta ⚙** creá un usuario y contraseña. Iniciando sesión con el mismo usuario en
otro dispositivo aparecen las mismas rutinas e historial.

- Se sincroniza después de cada cambio, al volver a la app y una vez por minuto.
- Los cambios de dos dispositivos se fusionan: las sesiones se suman, en una rutina editada
  en ambos gana la edición más reciente, y lo borrado en uno se borra en el otro.
- El entrenamiento en curso y la clave de Claude **no** se sincronizan: son de cada dispositivo.
- No hay recuperación de contraseña: si se pierde, hay que crear otro usuario y restaurar una copia.

## Claude

En **Ajustes → Claude** cada dispositivo carga su propia clave de API.

- La clave se crea en la consola de Anthropic (platform.claude.com → API keys). Es una cuenta de
  API con pago por uso, distinta de la suscripción de claude.ai: Anthropic no ofrece un
  "iniciar sesión con Claude" para apps de terceros.
- La clave se guarda solo en ese dispositivo y las llamadas van directo a Anthropic; nunca
  pasan por el servidor de la app.
- Modelo por defecto: Claude Opus 5.5 (se puede cambiar a Sonnet 5.5 o Haiku 5.5). En Opus y
  Sonnet está activado el reintento automático en un modelo alternativo si el principal
  rechaza un pedido.

Qué hace Claude en la app:

- **Coach (pestaña Coach):** chat que recibe tu rutina, meta, volumen por músculo, últimas
  sesiones y los hallazgos del análisis automático.
- **Importador:** interpreta fotos, capturas, PDF y cualquier formato que el lector local no reconozca.

Sin clave, la app funciona igual con el análisis automático por reglas y el importador local.

## Importar rutinas

**Rutinas → Importar**. Todo termina en el mismo formato unificado y editable.

| Formato | Cómo se lee |
| --- | --- |
| Texto libre (`Press de banca 4x6-8 @80 RPE 8 descanso 2min`) | En el dispositivo |
| Tablas CSV / TSV / Markdown con encabezados (Día, Ejercicio, Series, Reps, Peso, Descanso, RPE/RIR, Tempo, Notas; en español o inglés) | En el dispositivo |
| Excel `.xlsx` (una o varias hojas; cada hoja puede ser un día) | En el dispositivo |
| JSON (formato unificado o variantes) | En el dispositivo |
| Fotos, capturas, PDF, formatos libres | Claude |

Los pesos en libras se convierten a kg. Los ejercicios se emparejan con la biblioteca; los que
no existen se crean y se avisa para revisarlos.

### Formato unificado

Cada ejercicio de una rutina tiene:

| Campo | Significado |
| --- | --- |
| `name` | Ejercicio |
| `sets` | Cantidad de series |
| `repMin`, `repMax` | Rango de repeticiones (o segundos si `unit` es `"seg"`) |
| `weight` | Peso en kg (0 = peso corporal) |
| `setWeights` | Un peso por serie cuando cambian (pirámides), ej. `[100, 110, 120]` |
| `increment` | Salto de sobrecarga progresiva en kg |
| `restSec` | Descanso en segundos |
| `targetRpe` | RPE objetivo |
| `tempo` | Ej. `"3-1-1-0"` |
| `block` | Bloque o superserie |
| `notes` | Cualquier otra indicación |

```json
{
  "format": "gym-tracker-routine", "version": 1, "name": "Mi rutina",
  "days": [
    { "name": "Día 1", "exercises": [
      { "name": "Sentadilla", "sets": 3, "repMin": 5, "repMax": 5,
        "setWeights": [100, 110, 120], "restSec": 180, "targetRpe": 8, "notes": "profunda" }
    ] }
  ]
}
```

Desde el editor de cada rutina se puede **exportar** en este mismo formato.

## Auto-regulación (`src/domain/progression.ts`)

| Situación | Sugerencia |
| --- | --- |
| Todas las series en el tope del rango | Subir el salto completo |
| Idem, pero lo marcaste como "costó" o RPE 9 | Microcarga: medio salto |
| Idem, con RPE 10 o sensaciones ≤ 3 | Mantener |
| Dentro del rango | Mantener y sumar repeticiones |
| Bajo el mínimo dos sesiones seguidas | Descarga del 10% |
| Molestia | Bajar 10% |

## Estructura

```
server/index.mjs         # API de cuentas y sincronización + archivos estáticos
Dockerfile
public/                  # manifest, service worker, íconos
src/
  main.tsx, App.tsx      # arranque y navegación
  store.ts               # estado local + persistencia + acciones
  device.ts              # ajustes de este dispositivo (clave de Claude, sesión)
  sync.ts                # sincronización con el servidor
  claude.ts              # chat y lectura de rutinas con Claude
  domain/                # lógica pura, testeada
    types.ts  exercises.ts  templates.ts  goals.ts  volume.ts
    importer.ts          # texto, tablas, Excel, JSON -> formato unificado
    merge.ts             # fusión de datos entre dispositivos
    progression.ts       # auto-regulación
    coach.ts             # análisis automático + contexto para Claude
  screens/               # Home, Routines, RoutineEditor, Import, Workout,
                         # PostWorkout, History, Goal, Coach, Settings
tests/logic.test.ts
```

## API del servidor

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/api/register`, `/api/login` | `{username, password}` → `{token}` |
| POST | `/api/logout` | Invalida el token |
| GET | `/api/state` | `{rev, data}` del usuario |
| PUT | `/api/state` | `{baseRev, data}`; responde 409 con el estado actual si otro dispositivo escribió antes |
| DELETE | `/api/account` | Elimina la cuenta y sus datos |

Las contraseñas se guardan con scrypt y sal; los tokens, hasheados. Hay límite de intentos de
acceso por IP.
