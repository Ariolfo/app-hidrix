# Hidrix (Ionic)

App móvil de **Hidrix** — riego inteligente (FONTAGRO AGRO 4.0 · AGROSAVIA).

Stack: **Ionic 8 + Angular 20 + Capacitor 8** (NgModules).

## Requisitos

- Node.js **≥ 22** (Capacitor 8)
- Backend `ws-hidrix` levantado (ver sección siguiente)

## Backend (ws-hidrix) — el otro lado

La app consume la API en el puerto **5080**. SQL Server (Docker) en **1433**.

| Servicio | URL / puerto |
|----------|----------------|
| API HTTP | `http://localhost:5080` |
| API base (app) | `http://127.0.0.1:5080/api/v1` |
| Swagger | `http://localhost:5080/swagger` |
| Health | `http://localhost:5080/health` |
| SQL Server | `localhost:1433` · base `dbHidrix` |

```bash
cd ../ws-hidrix   # o la ruta del repo ws-hidrix
docker compose up -d
./database/install.sh

export PATH="$HOME/.dotnet:$PATH"
dotnet run --project src/Hidrix.Api --launch-profile http
```

Detalle (secretos, capas, endpoints): ver `ws-hidrix/README.md`.

## Instalación

```bash
cd app-hidrix
npm install
```

## Desarrollo web

```bash
npx ionic serve
# o
npm start
```

Abre **`http://localhost:8100`**. La app inicia en `/splash`, registra sin contraseña y muestra el mapa OSM (Leaflet).

### API base URL

En `src/environments/environment.ts`:

```ts
apiBaseUrl: 'http://127.0.0.1:5080/api/v1',
// Emulador Android (sin adb reverse):
// apiBaseUrl: 'http://10.0.2.2:5080/api/v1',
// Dispositivo físico: adb reverse tcp:5080 tcp:5080 + 127.0.0.1
```

Producción: placeholder en `environment.prod.ts`.

## Capacitor (Android / iOS)

```bash
# Compilar web
npm run build

# Sincronizar nativo
npx cap sync

# Abrir IDEs
npx cap open android
npx cap open ios
```

Primera vez (si faltan plataformas):

```bash
npm install @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios
npx cap sync
```

- **appId:** `co.agrosavia.hidrix`
- **appName:** `Hidrix`

## Pantallas

| Ruta | Descripción |
|------|-------------|
| `/splash` | Logo + chequeo de sesión |
| `/register` | Nombre + país/depto/ciudad |
| `/map` | Mapa OSM, chips de cultivo, marcadores |
| `/sensor/:id` | Detalle + histórico Chart.js (7d / 30d / 6m) |
| `/irrigation-calculator` | Calculadora local de riego |

Menú lateral: Mapa, Calculadora de riego, Cerrar sesión.

## Convenciones de color (mapa y detalle de sensor)

Colores usados en pines del mapa, pastilla de estado y bandera de alerta en la vista de datos. Fuente: `map.page.ts` (`STATUS_COLORS`) y `sensor-detail.page.scss`.

### Pines del mapa

| Estado | Color del pin | Hex |
|--------|---------------|-----|
| Exceso (`excess` / `saturation`) | Naranja | `#FB8C00` |
| Atención arriba de CC (`attention_high` / `normal`) | Amarillo ámbar | `#FBC02D` |
| Regar (`irrigate`) / Atención abajo de CC (`attention_low` / `attention`) | Amarillo | `#FDD835` |
| Déficit (`deficit`) | Rojo | `#E53935` |
| Sin datos (`no_data`) | Azul claro | `#90CAF9` |
| Desconocido | Igual que déficit | `#E53935` |

Estación **sin sensores**: pin verde `#309020`.

### Pastilla de estado (detalle del sensor)

| Estado | Fondo | Texto |
|--------|-------|-------|
| Exceso | Naranja `#FB8C00` | Blanco |
| Atención arriba de CC | Amarillo claro `#FFF9C4` | Negro |
| Regar / Atención abajo de CC | Amarillo `#FDD835` | Rojo `#C62828` |
| Déficit | Rojo `#E53935` | Amarillo `#FFEB3B` |
| Sin datos | Azul pastel `#BBDEFB` | Azul `#1565C0` |

### Bandera de alerta (`ALERTA: …`)

No se muestra cuando el estado es `attention_high` o `normal`.

| Estado | Fondo | Texto |
|--------|-------|-------|
| Exceso | Naranja claro `#FFE0B2` | Naranja oscuro `#E65100` |
| Regar / Atención abajo de CC | Amarillo `#FDD835` | Rojo `#C62828` |
| Déficit | Rojo `#E53935` | Amarillo `#FFEB3B` |
| Default | Crema `#FFF3CD` | Café `#8A6D00` |

Textos típicos: **EXCESO**, **REGAR**, **ATENCIÓN: HUMEDAD ABAJO DE CC**, **DÉFICIT** (o el mensaje de la API).

## Tests

```bash
npm test -- --watch=false --browsers=ChromeHeadless
```

## Estructura

Conforme a Guía DTI · Arquitectura Angular (6.1):

```
src/app/Modules/              # splash, register, map, sensor-detail, irrigation-calculator
src/app/Shared/Services/      # HTTP, auth, geo, estaciones, sensores, calculadora
src/app/Shared/Models/        # contratos TypeScript
src/app/Shared/Guards/        # AuthGuard
src/app/Shared/Directives/    # (reservado)
src/app/Shared/Pipes/         # (reservado)
src/app/components/           # UI reutilizable a nivel app
src/environments/             # apiBaseUrl
```
