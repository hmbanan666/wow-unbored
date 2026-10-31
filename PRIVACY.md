# Privacy

[По-русски ниже](#по-русски)

Bory learns about **your own characters only**. What the addon reads, and when, is in the README: [What Bory knows about you](README.md#what-bory-knows-about-you).

## What the Unbored server keeps

Only what the Companion on your PC sends, linked to your game account (the WoW account folder name):

- **Your characters and their game data:** the latest copy of each kind of data, and older copies so Bory can see what changed.
- **Your sessions and what you did in them** (player history), and the older 0.6 profiles if you used that version.
- **Your Requests and Bory's answers:** what you asked for or asked about, and the plans and answers made for them.
- **Personal advice and ideas** made for your characters.
- **This PC:** its name, when it was last seen, and whether it is approved. The PC's key is kept only as a hash.

It never gets anything about other players, no passwords and no Battle.net sign-in. It is used only for Unbored. The game account is stored as a salted hash of the account folder name, not the folder name itself.

## Server logs and backups

There are no scheduled backups of the database or the data volume.

Container logs use Docker's json-file driver. They do not include game data or requests: a line is written at startup, and each request is logged as method, path and status only. Logs rotate at 10 MB, keeping 3 files.

## How to delete it

In the Companion window open **Advanced** and click **Forget my data**, then confirm. The server erases, for every game account this PC sent:

- the characters, their game data and its older copies,
- player history and 0.6 profiles,
- Requests, and the plans and answers made for them,
- personal advice and ideas.

Then it stops taking data from this PC. The Companion also clears the plans, advice and ideas it put into the game. This can't be undone. To use the planner again, click **Connect again** in the Companion window. This PC gets a new key, the same kind as a first install, and can send again. A disconnect made by the Unbored team is not undone by that button.

Two things stay on your PC, because they never left it in this form: the addon's own files in `World of Warcraft/_retail_/WTF/Account/…/SavedVariables/Unbored.lua` (delete them, or remove the addon, to clear them) and the Companion's settings.

To turn off most of what is sent without deleting anything: right-click Bory, **Settings**, untick **Share game data to make Bory smarter**.

Questions: [open an issue](https://github.com/hmbanan666/wow-unbored/issues).

## По-русски

Бори узнаёт **только о твоих персонажах**. Что и когда читает аддон, написано в README: [Что Бори знает о тебе](README.md#что-бори-знает-о-тебе).

### Что хранит сервер Unbored

Только то, что присылает Companion с твоего ПК, с привязкой к игровой учётной записи (имени папки учётной записи WoW):

- **Персонажи и их игровые данные:** последняя копия каждого вида данных и более старые копии, чтобы Бори видел, что изменилось.
- **Сессии и что ты в них делал** (история игрока), а также старые профили 0.6, если ты пользовался той версией.
- **Твои запросы и ответы Бори:** о чём ты просил или спрашивал, и планы и ответы на них.
- **Личные подсказки и идеи** для твоих персонажей.
- **Этот ПК:** его имя, когда он был на связи и одобрен ли он. Ключ ПК хранится только в виде хеша.

О других игроках сервер не получает ничего, паролей и входа в Battle.net тоже. Данные используются только для Unbored. Игровая учётная запись хранится как хеш с солью от имени папки, а не само имя.

### Журналы и резервные копии сервера

Плановых резервных копий базы и тома с данными нет.

Журналы контейнера пишет драйвер Docker json-file. В них нет игровых данных и запросов: строка пишется при старте, а каждый запрос — только как метод, путь и статус. Журналы крутятся по 10 МБ, хранятся 3 файла.

### Как всё удалить

В окне Companion открой **Advanced** и нажми **Forget my data**, затем подтверди. Сервер удалит для каждой игровой учётной записи, которую присылал этот ПК:

- персонажей, их игровые данные и старые копии,
- историю игрока и профили 0.6,
- запросы, планы и ответы на них,
- личные подсказки и идеи.

После этого сервер перестаёт принимать данные с этого ПК. Companion также очищает планы, подсказки и идеи, которые он положил в игру. Отменить это нельзя. Чтобы снова пользоваться планировщиком, нажми **Connect again** в окне Companion. У этого ПК будет новый ключ, как при первой установке, и он снова сможет отправлять данные. Если команда Unbored сама отключила ПК, эта кнопка его не вернёт.

На твоём ПК остаётся то, что никуда в таком виде не уходило: файлы самого аддона в `World of Warcraft/_retail_/WTF/Account/…/SavedVariables/Unbored.lua` (удали их или сам аддон, чтобы очистить) и настройки Companion.

Чтобы отправлять меньше, ничего не удаляя: правый клик по Бори, **Настройки**, сними галочку **Делиться игровыми данными, чтобы Бори был умнее**.

Вопросы: [напиши нам](https://github.com/hmbanan666/wow-unbored/issues).
