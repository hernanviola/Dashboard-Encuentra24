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
