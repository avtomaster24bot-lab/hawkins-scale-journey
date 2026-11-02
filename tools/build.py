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

band = {"low": "Нижние уровни (20–175): бодрые, светлые, ритмичные — мистический евроданс, этно-данс, рагга, григорианский хорал. Текст признаёт состояние, музыка поднимает из него",
        "mid": "Средние уровни (200–400): уверенные, структурированные, полные надежды — мистический данс и даунтемпо с хоралом",
        "high": "Высокие уровни (500–700+): светлый хоровой эмбиент и нью-эйдж, 432/528 Гц, минимум ударных — спокойно, но тепло"}
out = ["# Промпты для Suno — «Шкала Хокинса: Восхождение»", "",
       "Для каждого уровня: откройте Suno → **Create → Custom**, вставьте **Style of Music** и **Lyrics** из блоков ниже, "
       "в поле Title — название уровня. Сгенерируйте 1–3 варианта, скачайте MP3 и положите их в папку `audio/` "
       "под именами, указанными в разделе «Файлы».", "",
       "**Главный принцип: музыка всегда поднимает.** Звук никогда не повторяет и не усиливает низкую эмоцию. "
       "Текст честно называет состояние, а музыка — тёплая, светлая, с движением вверх. Ориентир — мистический "
       "евроданс начала 90-х: григорианский хорал и мистические пады, глубокий мужской голос, рагга-куплеты, "
       "цепляющие женские припевы, синтезаторные стабы; на высоких уровнях — светлый хоровой эмбиент.", "",
       "Важно: Suno не принимает имена артистов в поле Style — поэтому звук описан словами. "
       "Если трек вышел мрачным, перегенерируйте и добавьте в конец стиля `, uplifting, major key, joyful`.", ""]
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
# Версионирование ассетов (cache-busting для GitHub Pages): ?v=<время сборки>
import re, time
ver = time.strftime("%Y%m%d%H%M%S")
for name in ("index.html", "level.html", "library.html"):
    f = root / name
    html = f.read_text(encoding="utf-8")
    html = re.sub(r'((?:href|src)="(?:css/style\.css|js/app\.js|js/player\.js|data/tracks\.js))(?:\?v=[^"]*)?"',
                  lambda m: m.group(1) + "?v=" + ver + '"', html)
    f.write_text(html, encoding="utf-8")
print("ok:", len(data["levels"]), "levels, asset version", ver)
