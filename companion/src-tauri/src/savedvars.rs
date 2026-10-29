//! A small reader for the subset of Lua that WoW writes into SavedVariables.
//! It is not a Lua interpreter and it does not execute the file.

use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq)]
pub enum LuaValue {
    Nil,
    Bool(bool),
    Number(f64),
    String(String),
    Table(Vec<(TableKey, LuaValue)>),
}

#[derive(Debug, Clone, PartialEq)]
pub enum TableKey {
    Name(String),
    Index(u32),
}

impl LuaValue {
    pub fn as_str(&self) -> Option<&str> {
        match self {
            LuaValue::String(text) => Some(text),
            _ => None,
        }
    }

    pub fn as_u64(&self) -> Option<u64> {
        match self {
            LuaValue::Number(n) if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 => {
                Some(*n as u64)
            }
            _ => None,
        }
    }

    /// A table with only 1..n keys becomes an array; any other table an object.
    pub fn to_json(&self) -> serde_json::Value {
        use serde_json::Value;
        match self {
            LuaValue::Nil => Value::Null,
            LuaValue::Bool(b) => Value::Bool(*b),
            LuaValue::Number(n) => {
                if n.fract() == 0.0 && n.abs() < 9.0e15 {
                    Value::from(*n as i64)
                } else {
                    serde_json::Number::from_f64(*n).map(Value::Number).unwrap_or(Value::Null)
                }
            }
            LuaValue::String(text) => Value::String(text.clone()),
            LuaValue::Table(entries) => {
                let is_array = entries.iter().all(|(key, _)| matches!(key, TableKey::Index(_)));
                if is_array && !entries.is_empty() {
                    let items = array_items(self);
                    let contiguous = items.len() == entries.len()
                        && entries.iter().all(|(key, _)| {
                            matches!(key, TableKey::Index(i) if (*i as usize) <= entries.len())
                        });
                    if contiguous {
                        return Value::Array(items.into_iter().map(LuaValue::to_json).collect());
                    }
                }
                let mut map = serde_json::Map::new();
                for (key, item) in entries {
                    let name = match key {
                        TableKey::Name(name) => name.clone(),
                        TableKey::Index(i) => i.to_string(),
                    };
                    map.insert(name, item.to_json());
                }
                Value::Object(map)
            }
        }
    }
}

pub fn table_get<'a>(value: &'a LuaValue, name: &str) -> Option<&'a LuaValue> {
    let LuaValue::Table(entries) = value else {
        return None;
    };
    entries.iter().find_map(|(key, item)| match key {
        TableKey::Name(found) if found == name => Some(item),
        _ => None,
    })
}

pub fn array_items(value: &LuaValue) -> Vec<&LuaValue> {
    let LuaValue::Table(entries) = value else {
        return Vec::new();
    };
    let mut rows: Vec<(u32, &LuaValue)> = entries
        .iter()
        .filter_map(|(key, item)| match key {
            TableKey::Index(index) => Some((*index, item)),
            TableKey::Name(_) => None,
        })
        .collect();
    rows.sort_by_key(|(index, _)| *index);
    rows.into_iter().map(|(_, item)| item).collect()
}

#[derive(Debug, Clone, PartialEq)]
pub struct Stamp {
    pub id: String,
    pub at: Option<u64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SessionProgress {
    pub mode: Option<String>,
    pub budget: Option<u64>,
    pub source: Option<String>,
    pub saved_at: Option<u64>,
    pub current_id: Option<String>,
    pub done: Vec<Stamp>,
    pub skipped: Vec<Stamp>,
    pub remaining: Vec<String>,
}

pub fn parse_saved_variables(text: &str) -> Result<BTreeMap<String, LuaValue>, String> {
    let mut parser = Parser {
        bytes: text.as_bytes(),
        i: 0,
    };
    let mut out = BTreeMap::new();
    loop {
        parser.skip();
        if parser.eof() {
            break;
        }
        let name = parser
            .ident()
            .map_err(|err| format!("expected a global name: {err}"))?;
        parser.skip();
        parser
            .expect(b'=')
            .map_err(|_| format!("expected '=' after {name}"))?;
        let value = parser.parse_value()?;
        out.insert(name, value);
    }
    Ok(out)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SavedRequest {
    pub id: String,
    pub created_at: Option<u64>,
    pub character: String,
    pub realm: String,
    pub mode: String,
    pub budget: u64,
    pub wish: Option<String>,
    pub context: Option<serde_json::Value>,
}

pub fn request_from_saved_variables(text: &str) -> Result<Option<SavedRequest>, String> {
    let values = parse_saved_variables(text)?;
    let Some(db) = values.get("UnboredCharDB") else {
        return Ok(None);
    };
    let Some(request) = table_get(db, "request") else {
        return Ok(None);
    };
    let Some(id) = table_get(request, "id").and_then(LuaValue::as_str) else {
        return Ok(None);
    };
    if id.is_empty() {
        return Ok(None);
    }
    let character = table_get(request, "character")
        .and_then(LuaValue::as_str)
        .unwrap_or("")
        .to_string();
    let realm = table_get(request, "realm")
        .and_then(LuaValue::as_str)
        .unwrap_or("")
        .to_string();
    let mode = table_get(request, "mode")
        .and_then(LuaValue::as_str)
        .unwrap_or("")
        .to_string();
    let budget = table_get(request, "budget").and_then(LuaValue::as_u64).unwrap_or(60);
    let wish = table_get(request, "wish")
        .and_then(LuaValue::as_str)
        .map(str::to_string)
        .filter(|text| !text.is_empty());
    Ok(Some(SavedRequest {
        id: id.to_string(),
        created_at: table_get(request, "createdAt").and_then(LuaValue::as_u64),
        character,
        realm,
        mode,
        budget,
        wish,
        context: table_get(request, "context")
            .map(LuaValue::to_json)
            .filter(serde_json::Value::is_object),
    }))
}

pub fn session_from_saved_variables(text: &str) -> Result<Option<SessionProgress>, String> {
    let values = parse_saved_variables(text)?;
    let Some(db) = values.get("UnboredCharDB") else {
        return Ok(None);
    };
    let Some(session) = table_get(db, "session") else {
        return Ok(None);
    };
    Ok(Some(session_progress(session)))
}

pub fn session_progress(session: &LuaValue) -> SessionProgress {
    let remaining = table_get(session, "tasks")
        .map(array_items)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|task| table_get(task, "id").and_then(LuaValue::as_str).map(str::to_string))
        .collect::<Vec<_>>();
    SessionProgress {
        mode: table_get(session, "mode")
            .and_then(LuaValue::as_str)
            .map(str::to_string),
        budget: table_get(session, "budget").and_then(LuaValue::as_u64),
        source: table_get(session, "source")
            .and_then(LuaValue::as_str)
            .map(str::to_string),
        saved_at: table_get(session, "savedAt").and_then(LuaValue::as_u64),
        current_id: remaining.first().cloned(),
        done: stamps(table_get(session, "done")),
        skipped: stamps(table_get(session, "skipped")),
        remaining,
    }
}

fn stamps(value: Option<&LuaValue>) -> Vec<Stamp> {
    let Some(value) = value else {
        return Vec::new();
    };
    array_items(value)
        .into_iter()
        .filter_map(|row| {
            let id = table_get(row, "id")?.as_str()?.to_string();
            Some(Stamp {
                id,
                at: table_get(row, "at").and_then(LuaValue::as_u64),
            })
        })
        .collect()
}

struct Parser<'a> {
    bytes: &'a [u8],
    i: usize,
}

impl<'a> Parser<'a> {
    fn eof(&self) -> bool {
        self.i >= self.bytes.len()
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.i).copied()
    }

    fn skip(&mut self) {
        loop {
            while self.peek().is_some_and(|b| b.is_ascii_whitespace()) {
                self.i += 1;
            }
            if self.bytes.get(self.i..).is_some_and(|rest| rest.starts_with(b"--")) {
                self.i += 2;
                while self.peek().is_some_and(|b| b != b'\n') {
                    self.i += 1;
                }
                continue;
            }
            break;
        }
    }

    fn expect(&mut self, byte: u8) -> Result<(), String> {
        if self.peek() == Some(byte) {
            self.i += 1;
            Ok(())
        } else {
            Err(format!("expected '{}'", byte as char))
        }
    }

    fn ident(&mut self) -> Result<String, String> {
        let start = self.i;
        let Some(first) = self.peek() else {
            return Err("end of file".into());
        };
        if !(first.is_ascii_alphabetic() || first == b'_') {
            return Err("not an identifier".into());
        }
        self.i += 1;
        while self
            .peek()
            .is_some_and(|b| b.is_ascii_alphanumeric() || b == b'_')
        {
            self.i += 1;
        }
        String::from_utf8(self.bytes[start..self.i].to_vec()).map_err(|_| "bad identifier".into())
    }

    fn parse_value(&mut self) -> Result<LuaValue, String> {
        self.skip();
        match self.peek() {
            Some(b'"') | Some(b'\'') => Ok(LuaValue::String(self.parse_string()?)),
            Some(b'{') => self.parse_table(),
            Some(b'-') | Some(b'0'..=b'9') => self.parse_number().map(LuaValue::Number),
            Some(_) => {
                let word = self.ident()?;
                match word.as_str() {
                    "true" => Ok(LuaValue::Bool(true)),
                    "false" => Ok(LuaValue::Bool(false)),
                    "nil" => Ok(LuaValue::Nil),
                    other => Err(format!("unexpected {other}")),
                }
            }
            None => Err("unexpected end of file".into()),
        }
    }

    fn parse_string(&mut self) -> Result<String, String> {
        let quote = self.peek().ok_or("string")?;
        self.i += 1;
        let mut out = Vec::new();
        while let Some(byte) = self.peek() {
            self.i += 1;
            if byte == quote {
                return String::from_utf8(out).map_err(|_| "plan string is not utf-8".into());
            }
            if byte == b'\\' {
                let esc = self.peek().ok_or("truncated escape")?;
                self.i += 1;
                match esc {
                    b'\\' => out.push(b'\\'),
                    b'"' => out.push(b'"'),
                    b'\'' => out.push(b'\''),
                    b'n' => out.push(b'\n'),
                    b'r' => out.push(b'\r'),
                    b't' => out.push(b'\t'),
                    b'0'..=b'9' => {
                        let mut digits = vec![esc];
                        for _ in 0..2 {
                            if self.peek().is_some_and(|b| b.is_ascii_digit()) {
                                digits.push(self.peek().unwrap());
                                self.i += 1;
                            }
                        }
                        let text = std::str::from_utf8(&digits).unwrap_or("0");
                        let code: u32 = text.parse().unwrap_or(0);
                        if code > 255 {
                            return Err("bad decimal escape".into());
                        }
                        out.push(code as u8);
                    }
                    other => out.push(other),
                }
            } else {
                out.push(byte);
            }
        }
        Err("unterminated string".into())
    }

    fn parse_number(&mut self) -> Result<f64, String> {
        let start = self.i;
        if self.peek() == Some(b'-') {
            self.i += 1;
        }
        while self.peek().is_some_and(|b| b.is_ascii_digit()) {
            self.i += 1;
        }
        if self.peek() == Some(b'.') {
            self.i += 1;
            while self.peek().is_some_and(|b| b.is_ascii_digit()) {
                self.i += 1;
            }
        }
        if self.peek().is_some_and(|b| b == b'e' || b == b'E') {
            self.i += 1;
            if self.peek().is_some_and(|b| b == b'+' || b == b'-') {
                self.i += 1;
            }
            while self.peek().is_some_and(|b| b.is_ascii_digit()) {
                self.i += 1;
            }
        }
        let text = std::str::from_utf8(&self.bytes[start..self.i]).map_err(|_| "bad number")?;
        text.parse::<f64>().map_err(|_| format!("bad number {text}"))
    }

    fn parse_table(&mut self) -> Result<LuaValue, String> {
        self.expect(b'{')?;
        let mut entries = Vec::new();
        let mut next_index = 1u32;
        loop {
            self.skip();
            if self.peek() == Some(b'}') {
                self.i += 1;
                break;
            }
            if self.peek().is_none() {
                return Err("unterminated table".into());
            }
            let key = if self.peek() == Some(b'[') {
                self.i += 1;
                self.skip();
                let key = if self.peek() == Some(b'"') || self.peek() == Some(b'\'') {
                    TableKey::Name(self.parse_string()?)
                } else {
                    let number = self.parse_number()?;
                    if number.fract() != 0.0 || number < 1.0 {
                        return Err("bad table index".into());
                    }
                    TableKey::Index(number as u32)
                };
                self.skip();
                self.expect(b']')?;
                self.skip();
                self.expect(b'=')?;
                key
            } else if self.peek().is_some_and(|b| b.is_ascii_alphabetic() || b == b'_') {
                let save = self.i;
                let ident = self.ident()?;
                self.skip();
                if self.peek() == Some(b'=') {
                    self.i += 1;
                    TableKey::Name(ident)
                } else {
                    self.i = save;
                    let key = TableKey::Index(next_index);
                    next_index += 1;
                    let value = self.parse_value()?;
                    entries.push((key, value));
                    self.skip();
                    if self.peek() == Some(b',') || self.peek() == Some(b';') {
                        self.i += 1;
                    }
                    continue;
                }
            } else {
                let key = TableKey::Index(next_index);
                next_index += 1;
                let value = self.parse_value()?;
                entries.push((key, value));
                self.skip();
                if self.peek() == Some(b',') || self.peek() == Some(b';') {
                    self.i += 1;
                }
                continue;
            };
            if let TableKey::Index(index) = &key {
                if *index >= next_index {
                    next_index = index + 1;
                }
            }
            let value = self.parse_value()?;
            entries.push((key, value));
            self.skip();
            if self.peek() == Some(b',') || self.peek() == Some(b';') {
                self.i += 1;
            }
        }
        Ok(LuaValue::Table(entries))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"
UnboredCharDB = {
	["level"] = 80,
	["session"] = {
		["version"] = 1,
		["source"] = "import",
		["mode"] = "custom",
		["budget"] = 60,
		["savedAt"] = 1761720000,
		["done"] = {
			{
				["id"] = "mentor:fall",
				["at"] = 1761719000,
			}, -- [1]
		},
		["skipped"] = {
			{
				["id"] = "mentor:\"skip\"",
				["at"] = 1761719500,
			}, -- [1]
		},
		["tasks"] = {
			{
				["id"] = "mentor:ashes",
				["title"] = "Ashes of Al'ar",
				["estMinutes"] = 20,
				["mapID"] = 109,
				["x"] = 0.739,
				["y"] = 0.637,
			}, -- [1]
			{
				["id"] = "mentor:next",
				["title"] = "Line\nbreak",
				["estMinutes"] = 10,
			}, -- [2]
		},
	},
}
"#;

    #[test]
    fn reads_session_progress_from_a_character_file() {
        let progress = session_from_saved_variables(SAMPLE).unwrap().unwrap();
        assert_eq!(progress.mode.as_deref(), Some("custom"));
        assert_eq!(progress.budget, Some(60));
        assert_eq!(progress.source.as_deref(), Some("import"));
        assert_eq!(progress.saved_at, Some(1_761_720_000));
        assert_eq!(progress.current_id.as_deref(), Some("mentor:ashes"));
        assert_eq!(progress.remaining, vec!["mentor:ashes", "mentor:next"]);
        assert_eq!(progress.done[0].id, "mentor:fall");
        assert_eq!(progress.done[0].at, Some(1_761_719_000));
        assert_eq!(progress.skipped[0].id, "mentor:\"skip\"");
        let values = parse_saved_variables(SAMPLE).unwrap();
        let title = table_get(
            array_items(table_get(table_get(values.get("UnboredCharDB").unwrap(), "session").unwrap(), "tasks").unwrap())[1],
            "title",
        );
        assert_eq!(title.and_then(LuaValue::as_str), Some("Line\nbreak"));
    }

    #[test]
    fn reads_a_plan_request() {
        let text = r#"
UnboredCharDB = {
  ["request"] = {
    ["id"] = "req-1",
    ["createdAt"] = 10,
    ["character"] = "Hero",
    ["realm"] = "Area 52",
    ["mode"] = "farm",
    ["budget"] = 60,
    ["wish"] = "mount",
    ["context"] = {
      ["mapID"] = 2248,
      ["x"] = 0.4512,
      ["zone"] = "Isle of Dorn",
      ["skyriding"] = true,
      ["trackedQuests"] = {
        { ["id"] = 81, ["title"] = "Q" },
      },
    },
  },
}
"#;
        let request = request_from_saved_variables(text).unwrap().unwrap();
        assert_eq!(request.id, "req-1");
        assert_eq!(request.character, "Hero");
        assert_eq!(request.mode, "farm");
        assert_eq!(request.wish.as_deref(), Some("mount"));
        let context = request.context.unwrap();
        assert_eq!(context["mapID"], 2248);
        assert_eq!(context["x"], 0.4512);
        assert_eq!(context["skyriding"], true);
        assert_eq!(context["trackedQuests"][0]["title"], "Q");
    }

    #[test]
    fn ignores_an_account_file_with_no_character_session() {
        let text = "UnboredDB = {\n  [\"mode\"] = \"roam\",\n}\n";
        assert!(session_from_saved_variables(text).unwrap().is_none());
    }
}
