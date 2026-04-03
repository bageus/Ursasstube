# Объединение `bageus/Phaser` → `bageus/bageus.github.io`

Этот документ фиксирует безопасный сценарий переноса всего Phaser-кода из отдельного репозитория `bageus/Phaser` в основной `bageus/bageus.github.io`.

## Короткий ответ на частый вопрос
Да: запуск делается **из основного репозитория `bageus.github.io`**. Сначала вы читаете/следуете этому файлу, затем подтягиваете код из `bageus/Phaser` в префикс `external/phaser`, после чего переносите нужные части в боевые директории (`js/`, `public/assets/`, `css/`).

## Когда использовать
- Основной рантайм и релизная сборка живут в `bageus.github.io`.
- Отдельный репозиторий `Phaser` больше не нужен как самостоятельный источник правды.
- Нужна повторяемая процедура миграции без потери истории.

## Рекомендуемый подход

Используем **git subtree**:
- переносит код вместе с историей;
- не требует переписывать историю основного репозитория;
- можно повторять для следующих синхронизаций.

## Автоматизация

Для базового импорта можно использовать скрипт репозитория:

```bash
./scripts/import-phaser-subtree.sh main external/phaser
```

Скрипт добавляет/обновляет `phaser-origin`, делает `fetch` и выполняет `git subtree add/pull --squash`.

## Шаги

> Ниже пример для локальной копии `bageus.github.io`.

1. Подготовить рабочее дерево:
   ```bash
   git checkout main
   git pull --ff-only
   ```

2. Подключить тестовый репозиторий как временный remote:
   ```bash
   git remote add phaser-origin https://github.com/bageus/Phaser.git
   git fetch phaser-origin
   ```

3. Импортировать Phaser-репозиторий в отдельный префикс (рекомендуется сначала именно так):
   ```bash
   git subtree add --prefix=external/phaser phaser-origin/main --squash
   ```

4. Перенести нужные модули в рабочие директории основного приложения (примерно):
   - `external/phaser/js/**` → `js/**`
   - `external/phaser/public/assets/**` → `public/assets/**`
   - `external/phaser/css/**` → `css/**`

5. Удалить дубли/старые импорты и привести entrypoint к единому сценарию запуска через `js/main.js`.

6. Проверить:
   ```bash
   npm install
   npm run check
   npm run build
   ```

7. Зафиксировать миграцию отдельным коммитом.

8. После стабилизации удалить временный remote и (опционально) `external/phaser`:
   ```bash
   git remote remove phaser-origin
   ```

## Что важно проверить после переноса
- Нет дублирующихся файлов с разной логикой (особенно `game.js`, `state.js`, `physics.js`).
- В `package.json` осталась одна версия ключевых зависимостей (`phaser`, `vite`, tooling).
- Phaser-рендерер подключается через единый backend-роутинг, без legacy canvas fallback.
- `npm run build` создает валидный production bundle.

## Стратегия конфликтов
Если в обоих репозиториях есть одноименные файлы с разным содержимым:
1. Считать `bageus.github.io` источником правды по gameplay/state.
2. Из `Phaser` переносить только renderer/runtime интеграции и ассеты.
3. Разрешать конфликт руками в пользу архитектуры snapshot contract.

## Дальнейшая поддержка
Если потребуется разово подтянуть свежие изменения из старого `Phaser` до его архивации:
```bash
git fetch phaser-origin
git subtree pull --prefix=external/phaser phaser-origin/main --squash
```

После полного переноса рекомендуется:
- заархивировать `bageus/Phaser`;
- вести все изменения только в `bageus.github.io`.
