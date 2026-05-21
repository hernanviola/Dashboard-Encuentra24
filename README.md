# Dashboard Inmobiliario Encuentra24 Costa Rica

Dashboard ejecutivo para explorar el mercado inmobiliario de Costa Rica usando los CSV generados por el scraper multi-categoría.

## Cómo abrirlo

Abrir este archivo en el navegador:

`dashboard-inmuebles-e24/index.html`

No requiere servidor local porque los datos se empaquetan en:

`dashboard-inmuebles-e24/data/dashboard-data.js`

## Archivos fuente usados

- `inmuebles_encuentra24_cr_completo.csv`
- `resumen_inmuebles_encuentra24_cr.csv`
- `outliers_inmuebles_encuentra24_cr.csv`

## Regenerar datos del dashboard

Desde la carpeta raíz del proyecto:

```bash
python3 scripts/build_inmuebles_dashboard_data.py
```

Esto copia los CSV a `dashboard-inmuebles-e24/data/` y reconstruye `dashboard-data.js`.

## Nota de cobertura

El dashboard no inventa datos. Si una operación o categoría aparece con bajo volumen, refleja exactamente lo que existe en el CSV completo.

## Metodología de resaltadores

Los resaltadores se detectan desde la card del listado, no desde el detalle del anuncio. El scraper busca los marcadores visuales de Encuentra24:

- `highlight_3.svg`: Platino
- cualquier otro marker visible o badge de resaltador: Otros resaltadores
- sin marker visible: Sin resaltador

El dashboard usa principalmente `highlight_group`, con cuatro valores: `platino`, `otros_resaltadores`, `sin_resaltador` y `desconocido`. No separa Oro y Plata para evitar una lectura comercial dudosa.
