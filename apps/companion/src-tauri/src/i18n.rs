//! Every word the Companion shows, in English and Russian (docs/adr/0049).
//! The language is the one Bory speaks in the game (the `lang` of the latest
//! `char` Section on this PC), else the Windows language, else English.

use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicU8, Ordering};

use crate::snapshot::data_from_saved_variables;
use crate::wow::character_saved_variables;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Lang {
    #[default]
    En,
    Ru,
}

impl Lang {
    pub fn code(self) -> &'static str {
        match self {
            Lang::En => "en",
            Lang::Ru => "ru",
        }
    }

    fn from_code(code: &str) -> Option<Lang> {
        let code = code.trim().to_ascii_lowercase();
        if code.starts_with("ru") {
            Some(Lang::Ru)
        } else if code.starts_with("en") {
            Some(Lang::En)
        } else {
            None
        }
    }
}

/// The addon's language first, then the system's, then English.
pub fn pick(addon: Option<&str>, system: Option<&str>) -> Lang {
    addon
        .and_then(Lang::from_code)
        .or_else(|| system.and_then(Lang::from_code))
        .unwrap_or_default()
}

/// The `lang` the addon wrote into the newest `char` Section on this PC.
pub fn addon_lang(retail: &Path) -> Option<String> {
    let mut best: Option<(u64, String)> = None;
    for file in character_saved_variables(retail, None) {
        let Ok(text) = fs::read_to_string(&file.path) else {
            continue;
        };
        let Ok(Some(data)) = data_from_saved_variables(&text, "UnboredCharDB") else {
            continue;
        };
        let Some(section) = data.sections.get("char") else {
            continue;
        };
        let Some(lang) = section.body["lang"].as_str() else {
            continue;
        };
        let at = section.at.or(data.saved_at).unwrap_or(0);
        if best.as_ref().is_none_or(|(seen, _)| at > *seen) {
            best = Some((at, lang.to_string()));
        }
    }
    best.map(|(_, lang)| lang)
}

static CURRENT: AtomicU8 = AtomicU8::new(0);

pub fn set(lang: Lang) -> bool {
    let value = match lang {
        Lang::En => 0,
        Lang::Ru => 1,
    };
    CURRENT.swap(value, Ordering::Relaxed) != value
}

pub fn current() -> Lang {
    match CURRENT.load(Ordering::Relaxed) {
        1 => Lang::Ru,
        _ => Lang::En,
    }
}

fn table(lang: Lang) -> &'static [(&'static str, &'static str)] {
    match lang {
        Lang::En => EN,
        Lang::Ru => RU,
    }
}

/// The string for `key`; English when a language lacks it, the key when both do.
pub fn tr_in(lang: Lang, key: &str) -> String {
    let find = |lang| {
        table(lang)
            .iter()
            .find(|(name, _)| *name == key)
            .map(|(_, text)| *text)
    };
    find(lang)
        .or_else(|| find(Lang::En))
        .unwrap_or(key)
        .to_string()
}

/// `{0}`, `{1}`, ... replaced by `args`.
pub fn trf_in(lang: Lang, key: &str, args: &[&str]) -> String {
    let mut text = tr_in(lang, key);
    for (i, arg) in args.iter().enumerate() {
        text = text.replace(&format!("{{{i}}}"), arg);
    }
    text
}

pub fn tr(key: &str) -> String {
    tr_in(current(), key)
}

pub fn trf(key: &str, args: &[&str]) -> String {
    trf_in(current(), key, args)
}

/// An error code for `Err(String)`: an `ERR_` key and its `{0}`, `{1}` args.
/// `shown` turns it into words in the language of the moment.
pub fn code(key: &str, args: &[&str]) -> String {
    let mut out = key.to_string();
    for arg in args {
        out.push('|');
        out.push_str(&arg.replace('|', "/"));
    }
    out
}

fn matches_template(template: &str, text: &str) -> bool {
    let mut pieces = Vec::new();
    let mut rest = template;
    while let Some(start) = rest.find('{') {
        match rest[start..].find('}') {
            Some(end) if rest[start + 1..start + end].parse::<u8>().is_ok() => {
                pieces.push(&rest[..start]);
                rest = &rest[start + end + 1..];
            }
            _ => break,
        }
    }
    if pieces.is_empty() {
        return template == text;
    }
    pieces.push(rest);
    let (first, last) = (pieces[0], pieces[pieces.len() - 1]);
    if !text.starts_with(first) || !text[first.len()..].ends_with(last) {
        return false;
    }
    let mut cursor = &text[first.len()..text.len() - last.len()];
    for piece in &pieces[1..pieces.len() - 1] {
        match cursor.find(piece) {
            Some(at) => cursor = &cursor[at + piece.len()..],
            None => return false,
        }
    }
    true
}

/// What the window, the tray and toasts show for a status or an error: a
/// code in the current language, our own words as they are, and anything
/// else (an OS, network or parser message) as one plain line (D215).
pub fn shown_in(lang: Lang, text: &str) -> String {
    if text.starts_with("ERR_") {
        let mut parts = text.split('|');
        let key = parts.next().unwrap_or_default();
        let args: Vec<&str> = parts.collect();
        if EN.iter().any(|(name, _)| *name == key) {
            return trf_in(lang, key, &args);
        }
        return tr_in(lang, "ERR_UNEXPECTED");
    }
    if text.is_empty()
        || EN
            .iter()
            .chain(RU.iter())
            .any(|(_, template)| matches_template(template, text))
    {
        return text.to_string();
    }
    tr_in(lang, "ERR_UNEXPECTED")
}

pub fn shown(text: &str) -> String {
    shown_in(current(), text)
}

/// The window's own words, sent with every state so the page never holds text.
pub fn ui_text(lang: Lang) -> serde_json::Map<String, serde_json::Value> {
    table(lang)
        .iter()
        .filter(|(key, _)| key.starts_with("UI_"))
        .map(|(key, _)| ((*key).to_string(), tr_in(lang, key).into()))
        .collect()
}

pub const PRIVACY_URL_EN: &str =
    "https://github.com/hmbanan666/wow-unbored#what-bory-knows-about-you";
pub const PRIVACY_URL_RU: &str = "https://github.com/hmbanan666/wow-unbored#%D1%87%D1%82%D0%BE-%D0%B1%D0%BE%D1%80%D0%B8-%D0%B7%D0%BD%D0%B0%D0%B5%D1%82-%D0%BE-%D1%82%D0%B5%D0%B1%D0%B5";

pub fn privacy_url(lang: Lang) -> &'static str {
    match lang {
        Lang::En => PRIVACY_URL_EN,
        Lang::Ru => PRIVACY_URL_RU,
    }
}

const EN: &[(&str, &str)] = &[
    // Mood (mood.rs)
    ("SETUP_HEAD", "Show me where World of Warcraft is"),
    ("SETUP_HINT", "I need your World of Warcraft folder to set up Bory in the game."),
    ("ERROR_HEAD", "Can't reach the planner right now"),
    ("ERROR_HINT", "Check your internet connection. I'll keep trying every 30 seconds; quick plans in the game still work."),
    ("FORGOT_HEAD", "Done. I forgot everything about you"),
    ("FORGOT_HINT", "Your game data, plans and answers are gone from the planner, and this PC stopped sending. Click Connect again when you want the planner back. Quick plans in the game still work."),
    ("REVOKED_HEAD", "This PC was disconnected"),
    ("REVOKED_HINT", "Ask the Unbored team to approve it again. Quick plans in the game still work."),
    ("CONNECTING", "Connecting..."),
    ("PAIRING_HEAD", "Waiting for a one-time OK"),
    ("PAIRING_HINT", "This PC ({0}) needs a one-time OK from the Unbored team. I check every 30 seconds; nothing to do here."),
    ("UPDATED_HEAD", "Bory was updated, press Load in game"),
    ("UPDATED_HINT", "Click Load in Bory's bubble once to finish the update."),
    ("READY_PLAN", "Your plan is ready in the game"),
    ("READY_ANSWER", "Your answer is ready in the game"),
    ("READY_HINT", "Bory picks it up next time you log in, or click Refresh in Bory's bubble."),
    ("CONNECTED_HEAD", "Connected! You're all set"),
    ("CONNECTED_HINT", "Start World of Warcraft and click Bory to pick a plan."),
    ("THINKING_HEAD", "Thinking about your request..."),
    ("THINKING_HINT", "Keep playing. I'm working on it in the background."),
    ("IDLE_HEAD", "All set, go play"),
    ("IDLE_HINT", "I'll bring your plans and answers into the game."),
    // Status lines and errors (gui.rs)
    ("PROGRESS_SENT", "Progress sent for {0} character file(s)."),
    ("NOTHING_YET", "Nothing from the game yet. Log in once and pick a plan with Bory."),
    ("PROGRESS_ON_PLANNER", "Progress is already on the planner."),
    ("PROGRESS_READ", "Progress read from the game files."),
    ("PICK_RETAIL_FIRST", "Pick the Retail folder first."),
    ("WROTE_PLAN", "Wrote {0}. Bory picks it up next time you log in, or click Refresh in Bory's bubble."),
    ("STEP_WOW", "World of Warcraft found"),
    ("STEP_ADDON", "Bory is in the game (addon {0})"),
    ("STEP_ADDON_NONE", "Putting Bory into the game"),
    ("STEP_APPROVED", "This PC is approved"),
    ("STEP_REVOKED", "This PC was disconnected"),
    ("STEP_PAIRING", "Waiting for a one-time OK for this PC"),
    ("FOUND_IT", "Found it. Setting up the addon..."),
    ("PICK_FOLDER", "Pick your World of Warcraft folder."),
    ("NOT_WOW_FOLDER", "I can't find World of Warcraft in that folder. Pick the one that has Wow.exe in it."),
    ("BROWSER_FAILED", "Could not open the browser. The page is {0}"),
    ("OPEN_IN_BROWSER", "Open {0} in your browser."),
    ("ENDPOINT_SAVED", "Planner address saved."),
    ("NO_PLAN_YET", "No plan on the planner yet."),
    ("FORGET_OFFLINE", "I can't reach the planner, so nothing was erased yet. Try again in a minute."),
    ("FORGET_FAILED", "The planner could not erase it just now ({0}). Nothing changed; try again in a minute."),
    ("FORGET_DONE", "The planner erased your game data, plans and answers, and stopped taking data from this PC."),
    ("FORGET_NOTHING", "The planner had nothing from this PC. I cleared the plans and ideas on this PC too."),
    ("RECONNECT_OFFLINE", "I can't reach the planner right now. Nothing changed; try Connect again in a minute."),
    ("RECONNECT_FAILED", "I couldn't connect again just now. Try in a minute."),
    ("RECONNECT_ONLY_AFTER", "Connect again is here after Forget my data."),
    ("RECONNECTED", "You're connected again."),
    ("CONNECTED_TOAST", "You're connected! Start World of Warcraft and click Bory to pick a plan."),
    ("PLANNER_RETURNED", "The planner answered with an error ({0})."),
    ("PLANNER_RETURNED_FOR", "The planner answered with an error ({0}) for {1}."),
    ("GAME_DATA_TOO_BIG", "The game data is too big to send."),
    ("APPROVED_CHOOSE_RETAIL", "Approved. Choose the Retail folder."),
    ("PLANNER_REFUSED", "The planner could not take that request."),
    ("REQUEST_SENT", "Request sent. The planner is working on it."),
    ("PLANNER_FAILED", "The planner could not answer that one."),
    ("NEW_PLAN", "New plan ready. Bory picks it up next time you log in."),
    ("PAIRING_APPROVED", "Approved."),
    ("PAIRING_REVOKED", "This PC was disconnected."),
    ("PAIRING_WAITING", "Waiting for a one-time OK."),
    ("PAIRING_CHOOSE_RETAIL", "{0} Choose the Retail folder."),
    // Error codes (i18n::code, shown through i18n::shown)
    ("ERR_UNEXPECTED", "Something went wrong on this PC. I'll try again in a moment; restarting the Companion helps if it keeps happening."),
    ("ERR_OFFLINE", "I can't reach the internet right now. I'll keep trying; quick plans in the game still work."),
    ("ERR_PLANNER_ANSWER", "The planner sent an answer I couldn't read. I'll ask again in a moment."),
    ("ERR_PLAN_STRING", "That plan string doesn't look right. Fetch the plan instead."),
    ("ERR_GAME_FILES", "I couldn't write Bory's files into the game folder. Check that the folder isn't read-only; I'll try again."),
    ("ERR_ADDON_DOWNLOAD", "The Bory download looked broken, so I kept the one you have. I'll try again later."),
    ("ERR_NO_ACCOUNT_FOLDER", "One character has no account folder, so I skipped it."),
    ("ERR_ACCOUNT_SALT", "A settings file on this PC is damaged. Restart the Companion; if it stays, reinstall it."),
    ("ERR_PLANNER_URL", "The planner address must start with https://."),
    ("GITHUB_RETURNED", "GitHub answered with an error ({0})."),
    ("NO_ADDON_RELEASE", "No addon release found."),
    ("ADDON_INSTALLED", "Addon {0} is installed."),
    ("BUSY_UPDATING_ADDON", "Updating Bory in the game..."),
    ("BUSY_INSTALLING_ADDON", "Putting Bory into the game..."),
    ("BUSY_SELF_UPDATE", "Updating myself..."),
    ("ADDON_UPDATED_TOAST", "I updated Bory. Click Load in Bory's bubble once to finish."),
    ("ADDON_NEW_TOAST", "Bory is in the game now. Restart World of Warcraft once to meet him."),
    ("INSTALLED_ADDON", "Installed addon {0}."),
    ("ADDON_CHECK", "Addon check: {0}"),
    ("TRAY_OPEN", "Open"),
    ("TRAY_QUIT", "Quit"),
    // The window (index.html, app.ts)
    ("UI_HELLO", "Hello!"),
    ("UI_CONNECT_AGAIN", "Connect again"),
    ("UI_CHOOSE_FOLDER", "Choose folder"),
    ("UI_LOOK_AGAIN", "Look again"),
    ("UI_AUTOSTART", "Start with Windows"),
    ("UI_PRIVACY", "Bory only learns about your own characters."),
    ("UI_PRIVACY_LINK", "What he knows"),
    ("UI_ADVANCED", "Advanced"),
    ("UI_RETAIL_FOLDER", "Retail folder"),
    ("UI_USE_FOLDER", "Use this folder"),
    ("UI_PLANNER_URL", "Planner URL"),
    ("UI_POLL_BEFORE", "Poll every"),
    ("UI_POLL_AFTER", "minutes (0 = the automatic check only)"),
    ("UI_SAVE", "Save"),
    ("UI_PLAN_STRING", "Plan string"),
    ("UI_WRITE_PLAN", "Write plan"),
    ("UI_FETCH_PLAN", "Fetch plan"),
    ("UI_READ_PROGRESS", "Read progress"),
    ("UI_FORGET_TEXT", "Erase everything the planner keeps about your characters and stop sending from this PC."),
    ("UI_FORGET", "Forget my data"),
    ("UI_FORGET_TITLE", "Forget my data?"),
    ("UI_FORGET_MESSAGE", "Bory will forget your characters, game data, plans and answers on the planner, and this PC stops sending. This can't be undone."),
    ("UI_FORGET_OK", "Forget it all"),
    ("UI_FORGET_CANCEL", "Keep it"),
    ("UI_PICK_TITLE", "Choose your World of Warcraft folder"),
    ("UI_ADDON_LINE", "Addon {0}, this PC is {1}"),
    ("UI_ADDON_NONE", "not installed"),
    ("UI_PAIRING_approved", "approved"),
    ("UI_PAIRING_pending", "waiting for a one-time OK"),
    ("UI_PAIRING_revoked", "disconnected"),
    ("UI_PAIRING_NONE", "connecting"),
    ("UI_VERSION", "Companion {0}"),
    ("UI_PROGRESS_ROW", "{0} - {1}: {2} done, {3} skipped"),
    ("UI_PROGRESS_NOW", " now {0}"),
    ("UI_NOTHING", "The Companion returned nothing to show."),
    ("UI_OUTSIDE_APP", "Open this window from the Unbored Companion app."),
];

const RU: &[(&str, &str)] = &[
    ("SETUP_HEAD", "Покажи, где World of Warcraft"),
    ("SETUP_HINT", "Мне нужна папка World of Warcraft, чтобы поселить Бори в игре."),
    ("ERROR_HEAD", "Не могу достучаться до планировщика"),
    ("ERROR_HINT", "Проверь интернет. Я пробую каждые 30 секунд; быстрые планы в игре работают и так."),
    ("FORGOT_HEAD", "Готово. Я всё про тебя забыл"),
    ("FORGOT_HINT", "Твои игровые данные, планы и ответы удалены с планировщика, а этот ПК больше ничего не отправляет. Нажми «Подключиться снова», когда захочешь вернуть планировщик. Быстрые планы в игре работают и так."),
    ("REVOKED_HEAD", "Этот ПК отключён"),
    ("REVOKED_HINT", "Попроси команду Unbored снова его одобрить. Быстрые планы в игре работают и так."),
    ("CONNECTING", "Подключаюсь..."),
    ("PAIRING_HEAD", "Жду разового одобрения"),
    ("PAIRING_HINT", "Этому ПК ({0}) нужно разовое одобрение команды Unbored. Я проверяю каждые 30 секунд, делать ничего не надо."),
    ("UPDATED_HEAD", "Бори обновился, нажми «Загрузить» в игре"),
    ("UPDATED_HINT", "Нажми «Загрузить» в облачке Бори один раз, чтобы закончить обновление."),
    ("READY_PLAN", "Твой план ждёт в игре"),
    ("READY_ANSWER", "Твой ответ ждёт в игре"),
    ("READY_HINT", "Бори заберёт его при следующем входе, или нажми «Обновить» в облачке Бори."),
    ("CONNECTED_HEAD", "Подключено! Всё готово"),
    ("CONNECTED_HINT", "Запусти World of Warcraft и нажми на Бори, чтобы выбрать план."),
    ("THINKING_HEAD", "Думаю над твоим запросом..."),
    ("THINKING_HINT", "Играй дальше. Я занимаюсь этим в фоне."),
    ("IDLE_HEAD", "Всё готово, иди играть"),
    ("IDLE_HINT", "Я принесу твои планы и ответы в игру."),
    ("PROGRESS_SENT", "Прогресс отправлен, файлов персонажей: {0}."),
    ("NOTHING_YET", "Из игры пока ничего. Зайди один раз и выбери план с Бори."),
    ("PROGRESS_ON_PLANNER", "Прогресс уже на планировщике."),
    ("PROGRESS_READ", "Прогресс прочитан из файлов игры."),
    ("PICK_RETAIL_FIRST", "Сначала выбери папку Retail."),
    ("WROTE_PLAN", "Записал {0}. Бори заберёт его при следующем входе, или нажми «Обновить» в облачке Бори."),
    ("STEP_WOW", "World of Warcraft найден"),
    ("STEP_ADDON", "Бори в игре (аддон {0})"),
    ("STEP_ADDON_NONE", "Селю Бори в игру"),
    ("STEP_APPROVED", "Этот ПК одобрен"),
    ("STEP_REVOKED", "Этот ПК отключён"),
    ("STEP_PAIRING", "Жду разового одобрения для этого ПК"),
    ("FOUND_IT", "Нашёл. Ставлю аддон..."),
    ("PICK_FOLDER", "Выбери папку World of Warcraft."),
    ("NOT_WOW_FOLDER", "В этой папке нет World of Warcraft. Выбери ту, где лежит Wow.exe."),
    ("BROWSER_FAILED", "Не получилось открыть браузер. Страница: {0}"),
    ("OPEN_IN_BROWSER", "Открой {0} в браузере."),
    ("ENDPOINT_SAVED", "Адрес планировщика сохранён."),
    ("NO_PLAN_YET", "На планировщике пока нет плана."),
    ("FORGET_OFFLINE", "Не могу достучаться до планировщика, так что пока ничего не удалено. Попробуй через минуту."),
    ("FORGET_FAILED", "Планировщик не смог удалить данные ({0}). Ничего не изменилось; попробуй через минуту."),
    ("FORGET_DONE", "Планировщик удалил твои игровые данные, планы и ответы и больше не принимает данные с этого ПК."),
    ("FORGET_NOTHING", "У планировщика ничего не было с этого ПК. Планы и идеи на этом ПК я тоже очистил."),
    ("RECONNECT_OFFLINE", "Не могу достучаться до планировщика. Ничего не изменилось; нажми «Подключиться снова» через минуту."),
    ("RECONNECT_FAILED", "Не получилось подключиться снова. Попробуй через минуту."),
    ("RECONNECT_ONLY_AFTER", "«Подключиться снова» появляется после «Забыть мои данные»."),
    ("RECONNECTED", "Ты снова подключён."),
    ("CONNECTED_TOAST", "Подключено! Запусти World of Warcraft и нажми на Бори, чтобы выбрать план."),
    ("PLANNER_RETURNED", "Планировщик ответил ошибкой ({0})."),
    ("PLANNER_RETURNED_FOR", "Планировщик ответил ошибкой ({0}) для {1}."),
    ("GAME_DATA_TOO_BIG", "Игровые данные слишком большие для отправки."),
    ("APPROVED_CHOOSE_RETAIL", "Одобрено. Выбери папку Retail."),
    ("PLANNER_REFUSED", "Планировщик не смог принять этот запрос."),
    ("REQUEST_SENT", "Запрос отправлен. Планировщик уже работает."),
    ("PLANNER_FAILED", "Планировщик не смог на это ответить."),
    ("NEW_PLAN", "Новый план готов. Бори заберёт его при следующем входе."),
    ("PAIRING_APPROVED", "Одобрено."),
    ("PAIRING_REVOKED", "Этот ПК отключён."),
    ("PAIRING_WAITING", "Жду разового одобрения."),
    ("PAIRING_CHOOSE_RETAIL", "{0} Выбери папку Retail."),
    ("ERR_UNEXPECTED", "Что-то пошло не так на этом ПК. Я попробую ещё раз; если повторяется, перезапусти Companion."),
    ("ERR_OFFLINE", "Не могу выйти в интернет. Я продолжаю пробовать; быстрые планы в игре работают и так."),
    ("ERR_PLANNER_ANSWER", "Планировщик прислал ответ, который я не смог прочитать. Спрошу ещё раз чуть позже."),
    ("ERR_PLAN_STRING", "Эта строка плана не похожа на правильную. Лучше забери план кнопкой."),
    ("ERR_GAME_FILES", "Не получилось записать файлы Бори в папку игры. Проверь, что папка не только для чтения; я попробую ещё раз."),
    ("ERR_ADDON_DOWNLOAD", "Загрузка Бори пришла битой, так что я оставил тот, что есть. Попробую позже."),
    ("ERR_NO_ACCOUNT_FOLDER", "У одного персонажа нет папки учётной записи, я его пропустил."),
    ("ERR_ACCOUNT_SALT", "Файл настроек на этом ПК повреждён. Перезапусти Companion; если не поможет, переустанови его."),
    ("ERR_PLANNER_URL", "Адрес планировщика должен начинаться с https://."),
    ("GITHUB_RETURNED", "GitHub ответил ошибкой ({0})."),
    ("NO_ADDON_RELEASE", "Не нашёл выпуск аддона."),
    ("ADDON_INSTALLED", "Аддон {0} установлен."),
    ("BUSY_UPDATING_ADDON", "Обновляю Бори в игре..."),
    ("BUSY_INSTALLING_ADDON", "Селю Бори в игру..."),
    ("BUSY_SELF_UPDATE", "Обновляюсь..."),
    ("ADDON_UPDATED_TOAST", "Я обновил Бори. Нажми «Загрузить» в облачке Бори один раз, чтобы закончить."),
    ("ADDON_NEW_TOAST", "Бори теперь в игре. Перезапусти World of Warcraft один раз, чтобы с ним познакомиться."),
    ("INSTALLED_ADDON", "Аддон {0} установлен."),
    ("ADDON_CHECK", "Проверка аддона: {0}"),
    ("TRAY_OPEN", "Открыть"),
    ("TRAY_QUIT", "Выйти"),
    ("UI_HELLO", "Привет!"),
    ("UI_CONNECT_AGAIN", "Подключиться снова"),
    ("UI_CHOOSE_FOLDER", "Выбрать папку"),
    ("UI_LOOK_AGAIN", "Поискать снова"),
    ("UI_AUTOSTART", "Запускать вместе с Windows"),
    ("UI_PRIVACY", "Бори узнаёт только о твоих персонажах."),
    ("UI_PRIVACY_LINK", "Что он знает"),
    ("UI_ADVANCED", "Дополнительно"),
    ("UI_RETAIL_FOLDER", "Папка Retail"),
    ("UI_USE_FOLDER", "Взять эту папку"),
    ("UI_PLANNER_URL", "Адрес планировщика"),
    ("UI_POLL_BEFORE", "Проверять каждые"),
    ("UI_POLL_AFTER", "мин. (0 = только автоматическая проверка)"),
    ("UI_SAVE", "Сохранить"),
    ("UI_PLAN_STRING", "Строка плана"),
    ("UI_WRITE_PLAN", "Записать план"),
    ("UI_FETCH_PLAN", "Забрать план"),
    ("UI_READ_PROGRESS", "Прочитать прогресс"),
    ("UI_FORGET_TEXT", "Удалить всё, что планировщик хранит о твоих персонажах, и перестать отправлять данные с этого ПК."),
    ("UI_FORGET", "Забыть мои данные"),
    ("UI_FORGET_TITLE", "Забыть мои данные?"),
    ("UI_FORGET_MESSAGE", "Бори забудет твоих персонажей, игровые данные, планы и ответы на планировщике, а этот ПК перестанет отправлять данные. Это не отменить."),
    ("UI_FORGET_OK", "Забыть всё"),
    ("UI_FORGET_CANCEL", "Оставить"),
    ("UI_PICK_TITLE", "Выбери папку World of Warcraft"),
    ("UI_ADDON_LINE", "Аддон {0}, этот ПК: {1}"),
    ("UI_ADDON_NONE", "не установлен"),
    ("UI_PAIRING_approved", "одобрен"),
    ("UI_PAIRING_pending", "ждёт разового одобрения"),
    ("UI_PAIRING_revoked", "отключён"),
    ("UI_PAIRING_NONE", "подключается"),
    ("UI_VERSION", "Companion {0}"),
    ("UI_PROGRESS_ROW", "{0} - {1}: сделано {2}, пропущено {3}"),
    ("UI_PROGRESS_NOW", ", сейчас {0}"),
    ("UI_NOTHING", "Companion ничего не вернул."),
    ("UI_OUTSIDE_APP", "Открой это окно из приложения Unbored Companion."),
];

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    fn keys(list: &[(&str, &str)]) -> BTreeSet<String> {
        list.iter().map(|(key, _)| (*key).to_string()).collect()
    }

    #[test]
    fn every_key_is_in_both_languages() {
        let en = keys(EN);
        let ru = keys(RU);
        assert_eq!(en.len(), EN.len(), "no English key twice");
        assert_eq!(ru.len(), RU.len(), "no Russian key twice");
        let only_en: Vec<_> = en.difference(&ru).collect();
        let only_ru: Vec<_> = ru.difference(&en).collect();
        assert!(only_en.is_empty(), "missing in Russian: {only_en:?}");
        assert!(only_ru.is_empty(), "missing in English: {only_ru:?}");
        for (key, text) in EN.iter().chain(RU.iter()) {
            assert!(!text.trim().is_empty(), "{key} is empty");
        }
        for (key, text) in EN {
            let ru = tr_in(Lang::Ru, key);
            for i in 0..4 {
                let mark = format!("{{{i}}}");
                assert_eq!(
                    text.contains(&mark),
                    ru.contains(&mark),
                    "{key}: the same {mark} in both"
                );
            }
        }
    }

    #[test]
    fn every_error_code_has_words_in_both_languages() {
        let codes: Vec<&str> = EN
            .iter()
            .map(|(key, _)| *key)
            .filter(|key| key.starts_with("ERR_"))
            .collect();
        assert!(codes.len() >= 9);
        for key in codes {
            let en = shown_in(Lang::En, &code(key, &[]));
            let ru = shown_in(Lang::Ru, &code(key, &[]));
            assert_eq!(en, tr_in(Lang::En, key), "{key} in English");
            assert_eq!(ru, tr_in(Lang::Ru, key), "{key} in Russian");
            assert_ne!(en, ru, "{key} is translated");
            assert!(
                ru.chars().any(|c| ('а'..='я').contains(&c)),
                "{key} reads Russian"
            );
        }
    }

    #[test]
    fn shows_our_words_and_hides_raw_messages() {
        let ours = trf_in(Lang::Ru, "PLANNER_RETURNED", &["503"]);
        assert_eq!(shown_in(Lang::Ru, &ours), ours);
        assert_eq!(
            shown_in(Lang::En, &tr_in(Lang::En, "PROGRESS_READ")),
            tr_in(Lang::En, "PROGRESS_READ")
        );
        let waiting = trf_in(
            Lang::En,
            "PAIRING_CHOOSE_RETAIL",
            &[&tr_in(Lang::En, "PAIRING_WAITING")],
        );
        assert_eq!(shown_in(Lang::En, &waiting), waiting);
        for raw in [
            "error sending request for url (https://unbored.kosarev.space/v1/devices/me)",
            "The system cannot find the path specified. (os error 3)",
            "Could not write the plan: Access is denied. (os error 5)",
            "ERR_NO_SUCH_CODE",
        ] {
            assert_eq!(
                shown_in(Lang::Ru, raw),
                tr_in(Lang::Ru, "ERR_UNEXPECTED"),
                "{raw}"
            );
        }
        assert_eq!(shown_in(Lang::En, ""), "");
        assert_eq!(code("ERR_OFFLINE", &["a|b"]), "ERR_OFFLINE|a/b");
    }

    #[test]
    fn picks_the_game_language_then_windows_then_english() {
        assert_eq!(pick(Some("ru"), Some("en-US")), Lang::Ru);
        assert_eq!(pick(Some("en"), Some("ru-RU")), Lang::En);
        assert_eq!(pick(None, Some("ru-RU")), Lang::Ru);
        assert_eq!(pick(Some("de"), Some("ru_RU")), Lang::Ru);
        assert_eq!(pick(None, Some("de-DE")), Lang::En);
        assert_eq!(pick(None, None), Lang::En);
    }

    #[test]
    fn formats_and_falls_back() {
        assert_eq!(
            trf_in(Lang::Ru, "STEP_ADDON", &["0.9.0"]),
            "Бори в игре (аддон 0.9.0)"
        );
        assert_eq!(tr_in(Lang::Ru, "NO_SUCH_KEY"), "NO_SUCH_KEY");
        let ui = ui_text(Lang::Ru);
        assert_eq!(ui["UI_HELLO"], "Привет!");
        assert!(ui.keys().all(|key| key.starts_with("UI_")));
    }

    #[test]
    fn reads_the_language_of_the_newest_char_section() {
        let root = std::env::temp_dir().join(format!("unbored-i18n-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let write = |name: &str, lang: &str, at: u64| {
            let dir = root.join(format!("WTF/Account/111#1/Realm/{name}/SavedVariables"));
            fs::create_dir_all(&dir).unwrap();
            let text = format!(
                "UnboredCharDB = {{ [\"data\"] = {{ [\"schema\"] = 2, [\"savedAt\"] = {at}, [\"sections\"] = {{ [\"char\"] = {{ [\"v\"] = 1, [\"at\"] = {at}, [\"body\"] = {{ [\"lang\"] = \"{lang}\" }} }} }} }} }}\n"
            );
            fs::write(dir.join("Unbored.lua"), text).unwrap();
        };
        assert_eq!(addon_lang(&root), None);
        write("Old", "en", 10);
        write("New", "ru", 20);
        assert_eq!(addon_lang(&root).as_deref(), Some("ru"));
        let _ = fs::remove_dir_all(&root);
    }
}
