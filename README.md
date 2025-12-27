# 1C.ai Assistant (vscode-ai-frend)

![build](https://github.com/azheval/vscode-ai-frend/actions/workflows/ci.yml/badge.svg)

В расширении использованы наработки [1CExpert](https://github.com/ConsaltingGroup/1CExpert).
Расширение vscode-ai-frend. Чат с напарником от 1с.

## Требования к настройке (settings.json)

Для корректной работы расширения необходимо настроить файл `settings.json` вашего рабочего пространства (`.vscode/settings.json`). Ниже приведены доступные параметры:

* `vscode-ai-frend.autoConnect`: (boolean, по умолчанию `true`) Автоматически подключаться к 1C.ai при открытии панели чата.
* `vscode-ai-frend.defaultToken`: (string) Токен API для подключения к 1C.ai. **Обязательный параметр.**
* `vscode-ai-frend.defaultBaseUrl`: (string, по умолчанию `https://code.1c.ai`) Базовый URL для API 1C.ai.
* `vscode-ai-frend.defaultTimeout`: (number, по умолчанию `30`) Таймаут для API-запросов в секундах.

**Пример `settings.json`:**

```json
{
  "vscode-ai-frend.defaultToken": "ВАШ_API_ТОКЕН_ЗДЕСЬ",
  "vscode-ai-frend.defaultBaseUrl": "https://code.1c.ai",
  "vscode-ai-frend.autoConnect": true
}
```

## Ограничения

Чат открывается только в отдельной форме

## Примеры использования

Задать вопрос:

![image_001](/docs/images/001.png)

Передать код в вопрос:
![image_002](/docs/images/002.png)

Получить ответ:

![image_003](/docs/images/003.png)
