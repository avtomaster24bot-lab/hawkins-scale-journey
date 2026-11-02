#!/usr/bin/env python3
"""Пересобирает data/tracks.js и SUNO_PROMPTS.md из data/tracks.json.

Запуск из корня репозитория:  python3 tools/build.py
tracks.json — единственный источник правды. tracks.js нужен только как
резерв, чтобы сайт работал даже при открытии index.html двойным кликом (file://).
"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
data = json.loads((root / "data/tracks.json").read_text(encoding="utf-8"))

(root / "data/tracks.js").write_text(
    "// Автогенерация из data/tracks.json (tools/build.py). Не редактируйте вручную.\n"
    "window.HAWKINS_DATA = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n",
    encoding="utf-8")

band = {"low": "Низкие уровни (20–175): тревожные, диссонирующие, тяжёлые биты, шёпот, минимализм",
        "mid": "Средние уровни (200–400): ритмичные, структурированные, надежда и сила",
        "high": "Высокие уровни (500–700+): эмбиент, хоралы, простор, 432/528 Гц, минимум ударных"}
out = ["# Промпты для Suno — «Шкала Хокинса: Восхождение»", "",
       "Для каждого уровня: откройте Suno → **Create → Custom**, вставьте **Style of Music** и **Lyrics** из блоков ниже, "
       "в поле Title — название уровня. Сгенерируйте 1–3 варианта, скачайте MP3 и положите их в папку `audio/` "
       "под именами, указанными в разделе «Файлы».", "",
       "Совет: если Suno «съедает» шёпот или хор, добавьте в конец стиля `, atmospheric, cinematic, Enigma, Michael Cretu style production`.", ""]
cur = None
for l in data["levels"]:
    if l["band"] != cur:
        cur = l["band"]; out += ["---", "", f"## {band[cur]}", ""]
    out += [f"### {l['display']} — {l['name']} ({l['name_en']})", "",
            f"**Тема:** {l['theme']}  ", f"**Состояние:** {l.get('state', '')}  ", f"**Аффирмация:** {l['affirmation']}  ",
            f"**Практика:** {l['practice']}", "",
            "**Style of Music:**", "```text", l["suno_style"], "```", "",
            "**Lyrics:**", "```text", l["suno_lyrics"], "```", "",
            "**Файлы:** " + ", ".join(f"`{t}`" for t in l["tracks"]), ""]
(root / "SUNO_PROMPTS.md").write_text("\n".join(out), encoding="utf-8")
print("ok:", len(data["levels"]), "levels")
