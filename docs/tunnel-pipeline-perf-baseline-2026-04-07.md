# Tunnel pipeline perf baseline (2026-04-07)

## Контекст

Документ фиксирует baseline для P0.2 (рефакторинг pipeline туннеля) по synthetic smoke MIG-08.

Источник замеров:
- `npm run check:mig08-smoke`
- sampleCount: `120`

## Сравнение (до/после)

| Срез | capturedAt (UTC) | fpsP50 | fpsP95 | frameMsP50 | frameMsP95 | smokeCompleted/Total |
|---|---:|---:|---:|---:|---:|---:|
| До шага 4 (pre-pool) | 2026-04-07T18:28:01.257Z | 60 | 62 | 16.67 | 17.24 | 6/6 |
| После шага 4 (pool/reuse) | 2026-04-07T19:16:41.011Z | 60 | 62 | 16.67 | 17.24 | 6/6 |

## Вывод

- Регрессий по synthetic smoke не обнаружено.
- После перехода на reuse буферов performance в synthetic-сценарии стабильна.
- Следующий шаг: подтвердить измерения на mobile baseline-девайсе и добавить device-specific таблицу.
