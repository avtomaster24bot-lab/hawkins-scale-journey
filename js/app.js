/* Шкала Хокинса: Восхождение — основная логика:
 * загрузка data/tracks.json, прогресс в localStorage, карта, страница практики,
 * библиотека, опциональный 24-часовой таймер, анимация восхождения.
 */
(function () {
  'use strict';

  var KEY_PROGRESS = 'hawkins_progress';   // id текущего открытого уровня (по ТЗ 3.4)
  var KEY_FINISHED = 'hawkins_finished';   // '1' — пройден последний уровень
  var KEY_HISTORY = 'hawkins_history';     // { "20": timestampMs, ... } — когда завершён уровень
  var KEY_SETTINGS = 'hawkins_settings';   // { daily: false }
  var DAY_MS = 24 * 60 * 60 * 1000;
  var MIN_LISTEN_SEC = 60;                 // сколько слушать, чтобы открылась «Я выполнил практику»
  var START_LEVEL = 20;

  /* ---------- Утилиты ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function readJSON(key, def) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? def : v; } catch (e) { return def; }
  }
  function writeJSON(key, v) { localStorage.setItem(key, JSON.stringify(v)); }
  function param(name) { return new URLSearchParams(location.search).get(name); }
  function fmtCountdown(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  /* ---------- Данные ---------- */
  function loadData() {
    // Основной источник — data/tracks.json (ТЗ 3.4 п.5). Резерв — data/tracks.js,
    // чтобы сайт работал и при открытии файла напрямую (file://), где fetch запрещён.
    return fetch('data/tracks.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(function () {
        if (window.HAWKINS_DATA) return window.HAWKINS_DATA;
        throw new Error('Не удалось загрузить data/tracks.json');
      })
      .then(function (d) {
        d.levels.sort(function (a, b) { return a.id - b.id; });
        d.levels.forEach(function (l, i) { l.index = i; l.color = levelColor(i, d.levels.length); });
        return d;
      });
  }

  // Цвет уровня: от тёмно-багрового (стыд) через янтарь и бирюзу к фиолетово-белому свету.
  function levelColor(i, n) {
    var t = i / (n - 1);
    var hue = Math.round(350 + t * 280) % 360;
    var light = Math.round(48 + t * 30);
    return 'hsl(' + hue + ', 75%, ' + light + '%)';
  }

  /* ---------- Прогресс ---------- */
  var Progress = {
    ids: [],
    init: function (levels) { this.ids = levels.map(function (l) { return l.id; }); },
    current: function () {
      var v = parseInt(localStorage.getItem(KEY_PROGRESS), 10);
      if (isNaN(v) || this.ids.indexOf(v) === -1) v = START_LEVEL;
      return v;
    },
    finished: function () { return localStorage.getItem(KEY_FINISHED) === '1'; },
    history: function () { return readJSON(KEY_HISTORY, {}); },
    settings: function () { return Object.assign({ daily: false }, readJSON(KEY_SETTINGS, {})); },
    setSettings: function (s) { writeJSON(KEY_SETTINGS, s); },
    next: function (id) { var i = this.ids.indexOf(id); return i >= 0 && i < this.ids.length - 1 ? this.ids[i + 1] : null; },
    prev: function (id) { var i = this.ids.indexOf(id); return i > 0 ? this.ids[i - 1] : null; },
    lastCompletedAt: function () {
      var h = this.history(), max = 0;
      Object.keys(h).forEach(function (k) { if (h[k] > max) max = h[k]; });
      return max;
    },
    /** мс до открытия текущего уровня при включённой «Ежедневности» (0 — открыт). */
    restRemaining: function () {
      if (!this.settings().daily || this.finished()) return 0;
      var last = this.lastCompletedAt();
      if (!last) return 0;
      return Math.max(0, last + DAY_MS - Date.now());
    },
    state: function (id) {
      var cur = this.current();
      if (this.finished() || id < cur) return 'passed';
      if (id === cur) return this.restRemaining() > 0 ? 'resting' : 'current';
      return 'locked';
    },
    passedCount: function () {
      var self = this;
      return this.ids.filter(function (id) { return self.state(id) === 'passed'; }).length;
    },
    /** Завершить уровень. Возвращает объект для анимации или null, если действие не засчитано. */
    complete: function (id) {
      if (this.state(id) !== 'current') return null;
      var h = this.history(); h[id] = Date.now(); writeJSON(KEY_HISTORY, h);
      var nxt = this.next(id);
      if (nxt) localStorage.setItem(KEY_PROGRESS, String(nxt));
      else localStorage.setItem(KEY_FINISHED, '1');
      return { from: id, to: nxt };
    },
    reset: function () {
      [KEY_PROGRESS, KEY_FINISHED, KEY_HISTORY].forEach(function (k) { localStorage.removeItem(k); });
    }
  };

  /* ---------- Сакральная геометрия (SVG) ---------- */
  function geometrySVG() {
    var c = 100, r = 22, parts = [];
    var pts = [[0, 0]];
    for (var k = 0; k < 6; k++) { var a = Math.PI / 3 * k; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    for (var k2 = 0; k2 < 6; k2++) {
      var a2 = Math.PI / 3 * k2 + Math.PI / 6;
      pts.push([Math.cos(a2) * r * Math.sqrt(3), Math.sin(a2) * r * Math.sqrt(3)]);
      var a3 = Math.PI / 3 * k2;
      pts.push([Math.cos(a3) * r * 2, Math.sin(a3) * r * 2]);
    }
    pts.forEach(function (p) {
      parts.push('<circle cx="' + (c + p[0]).toFixed(2) + '" cy="' + (c + p[1]).toFixed(2) + '" r="' + r + '"/>');
    });
    var tri = function (rot) {
      var s = '';
      for (var i = 0; i < 3; i++) {
        var a = rot + i * 2 * Math.PI / 3, R = r * 3;
        s += (i ? 'L' : 'M') + (c + Math.cos(a) * R).toFixed(2) + ' ' + (c + Math.sin(a) * R).toFixed(2);
      }
      return '<path d="' + s + 'Z"/>';
    };
    return '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">' +
      '<g class="geo-outer"><circle cx="100" cy="100" r="96"/><circle cx="100" cy="100" r="88"/>' +
      tri(-Math.PI / 2) + tri(Math.PI / 2) + '</g>' +
      '<g class="geo-flower">' + parts.join('') + '</g>' +
      '<circle class="geo-core" cx="100" cy="100" r="3"/></svg>';
  }
  function paintGeometry() {
    document.querySelectorAll('[data-geometry]').forEach(function (el) { el.innerHTML = geometrySVG(); });
  }

  /* ---------- Карта (index.html) ---------- */
  function initMap(data) {
    var levels = data.levels;
    var cur = Progress.current();
    var curLevel = levels.filter(function (l) { return l.id === cur; })[0];
    var finished = Progress.finished();

    // Список: сверху — Просветление, снизу — Стыд (вертикальная шкала)
    var html = levels.slice().reverse().map(function (l) {
      var st = Progress.state(l.id);
      var labels = { passed: 'пройден', current: 'текущий', resting: 'отдых', locked: 'закрыт' };
      var tag = st === 'locked' ? 'div' : 'a';
      var href = st === 'locked' ? '' : ' href="level.html?id=' + l.id + '"';
      return '<li class="node node--' + st + ' band--' + l.band + '" style="--c:' + l.color + '" data-id="' + l.id + '">' +
        '<' + tag + ' class="node__link"' + href + (st === 'locked' ? ' aria-disabled="true"' : '') + '>' +
          '<span class="node__num">' + esc(l.display) + '</span>' +
          '<span class="node__dot" aria-hidden="true"></span>' +
          '<span class="node__text">' +
            '<span class="node__name">' + esc(l.name) + '</span>' +
            '<span class="node__en">' + esc(l.name_en) + '</span>' +
            '<span class="node__theme">' + esc(l.theme) + '</span>' +
          '</span>' +
          '<span class="node__state">' + (st === 'passed' ? '✓ ' : st === 'locked' ? '🔒 ' : '') + labels[st] + '</span>' +
        '</' + tag + '>' +
      '</li>';
    }).join('');
    $('#scale').innerHTML = html;

    renderCurrentCard(curLevel, finished, levels.length);

    // Настройки
    var toggle = $('#dailyToggle');
    toggle.checked = Progress.settings().daily;
    toggle.onchange = function () {
      var s = Progress.settings(); s.daily = toggle.checked; Progress.setSettings(s);
      initMap(data);
    };
    var resetBtn = $('#resetBtn');
    resetBtn.onclick = function () {
      if (confirm('Сбросить весь прогресс и начать восхождение с уровня 20 (Стыд)?')) {
        Progress.reset();
        location.href = 'index.html';
      }
    };

    // Анимация восхождения после завершения уровня
    var asc = parseInt(param('ascended'), 10);
    if (!isNaN(asc) && !initMap._animated) {
      initMap._animated = true;
      history.replaceState(null, '', 'index.html');
      playAscension(levels, asc);
    } else if (!initMap._scrolled) {
      initMap._scrolled = true;
      scrollToCurrent(false);
    }
  }

  function renderCurrentCard(l, finished, total) {
    var card = $('#currentCard');
    var passed = Progress.passedCount();
    var pct = Math.round(passed / total * 100);
    var progressBar = '<div class="journey"><div class="journey__bar"><span style="width:' + pct + '%"></span></div>' +
      '<span class="journey__label">Пройдено ' + passed + ' из ' + total + '</span></div>';
    clearInterval(renderCurrentCard._timer);

    if (finished) {
      card.style.setProperty('--c', 'hsl(48, 90%, 75%)');
      card.innerHTML = '<p class="eyebrow">Восхождение завершено</p>' +
        '<h2 class="current-card__title">700+ · Просветление</h2>' +
        '<p class="current-card__aff">«Я есмь.»</p>' + progressBar +
        '<div class="current-card__actions"><a class="btn btn--gold" href="library.html">Открыть библиотеку</a>' +
        '<a class="btn btn--ghost" href="level.html?id=700">Переслушать финал</a></div>';
      return;
    }
    var rest = Progress.restRemaining();
    card.style.setProperty('--c', l.color);
    card.innerHTML = '<p class="eyebrow">Ваш уровень сознания</p>' +
      '<h2 class="current-card__title"><span class="current-card__num">' + esc(l.display) + '</span> ' + esc(l.name) +
      ' <span class="current-card__en">' + esc(l.name_en) + '</span></h2>' +
      '<p class="current-card__aff">«' + esc(l.affirmation) + '»</p>' + progressBar +
      '<div class="current-card__actions">' +
        (rest > 0
          ? '<button class="btn btn--gold" disabled>Начать практику</button>' +
            '<p class="current-card__rest">Ежедневность: следующая практика откроется через <b id="restTimer">' + fmtCountdown(rest) + '</b></p>'
          : '<a class="btn btn--gold btn--pulse" id="startBtn" href="level.html?id=' + l.id + '">Начать практику</a>') +
      '</div>';
    if (rest > 0) {
      renderCurrentCard._timer = setInterval(function () {
        var r = Progress.restRemaining();
        var t = $('#restTimer');
        if (r <= 0) { clearInterval(renderCurrentCard._timer); location.reload(); return; }
        if (t) t.textContent = fmtCountdown(r);
      }, 1000);
    }
  }

  function scrollToCurrent(smooth) {
    var el = document.querySelector('.node--current, .node--resting');
    if (!el) return;
    if (window.innerWidth < 760 || smooth) {
      setTimeout(function () { el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' }); }, smooth ? 50 : 0);
    }
  }

  function playAscension(levels, fromId) {
    var from = levels.filter(function (l) { return l.id === fromId; })[0];
    if (!from) return;
    var to = levels[from.index + 1];
    var box = $('#ascension');
    var sparks = '';
    for (var i = 0; i < 24; i++) {
      sparks += '<span class="spark" style="--i:' + i + ';--d:' + (Math.random() * 0.8).toFixed(2) + 's;--x:' + (Math.random() * 2 - 1).toFixed(2) + '"></span>';
    }
    box.innerHTML = '<div class="ascension__flash"></div><div class="ascension__spiral">' + sparks + '</div>' +
      '<div class="ascension__geo" data-geometry></div>' +
      '<div class="ascension__text">' +
        '<p class="eyebrow">Уровень пройден</p>' +
        '<p class="ascension__from">' + esc(from.display) + ' · ' + esc(from.name) + '</p>' +
        (to ? '<p class="ascension__arrow">↑</p><p class="ascension__to" style="--c:' + to.color + '">' + esc(to.display) + ' · ' + esc(to.name) + '</p>'
            : '<p class="ascension__to">Восхождение завершено</p>') +
      '</div>';
    paintGeometry();
    box.hidden = false;
    document.body.classList.add('is-ascending');
    var close = function () {
      box.classList.add('is-leaving');
      setTimeout(function () {
        box.hidden = true; box.classList.remove('is-leaving'); box.innerHTML = '';
        document.body.classList.remove('is-ascending');
        var node = document.querySelector('.node--current, .node--resting');
        if (node) { node.classList.add('node--arrived'); }
        scrollToCurrent(true);
      }, 700);
    };
    var t = setTimeout(close, 3600);
    box.onclick = function () { clearTimeout(t); close(); };
  }

  /* ---------- Страница уровня (level.html) ---------- */
  function initLevel(data) {
    var id = parseInt(param('id'), 10);
    var l = data.levels.filter(function (x) { return x.id === id; })[0];
    var root = $('#level');
    if (!l) {
      root.innerHTML = '<div class="notice"><h1>Уровень не найден</h1><p>Вернитесь на карту и выберите доступный уровень.</p>' +
        '<a class="btn btn--gold" href="index.html">К карте</a></div>';
      return;
    }
    document.title = l.display + ' · ' + l.name + ' · Шкала Хокинса';
    document.body.style.setProperty('--c', l.color);
    document.body.classList.add('band--' + l.band);
    var st = Progress.state(l.id);

    if (st === 'locked') {
      root.innerHTML = '<div class="notice"><p class="eyebrow">Уровень закрыт</p><h1>' + esc(l.display) + ' · ' + esc(l.name) + '</h1>' +
        '<p>Этот уровень откроется, когда вы пройдёте все предыдущие. Восхождение идёт шаг за шагом.</p>' +
        '<a class="btn btn--gold" href="level.html?id=' + Progress.current() + '">К текущему уровню</a></div>';
      return;
    }

    var lyricsHTML = esc(l.lyrics).split(/\n{2,}/).map(function (stanza) {
      return '<p>' + stanza.replace(/\n/g, '<br>') + '</p>';
    }).join('');

    var modeNote = {
      current: 'Прослушайте трек до конца — кнопка «Завершить уровень» станет активной. Или выполните практику и отметьте её.',
      resting: 'Включена «Ежедневность». Сегодня вы уже прошли уровень — этот откроется для завершения через <b id="restTimer">' + fmtCountdown(Progress.restRemaining()) + '</b>. Слушать и читать можно уже сейчас.',
      passed: 'Этот уровень уже пройден. Вы можете переслушать его в любой момент — прогресс не изменится.'
    }[st];

    root.innerHTML =
      '<header class="level__head">' +
        '<div class="level__geometry" data-geometry aria-hidden="true"></div>' +
        '<p class="eyebrow">' + (st === 'passed' ? 'Архив · пройденный уровень' : 'Практика · уровень ' + (l.index + 1) + ' из ' + data.levels.length) + '</p>' +
        '<div class="level__num">' + esc(l.display) + '</div>' +
        '<h1 class="level__name">' + esc(l.name) + '</h1>' +
        '<p class="level__en">' + esc(l.name_en) + '</p>' +
        '<p class="level__theme">' + esc(l.theme) + '</p>' +
      '</header>' +
      '<section class="card"><div id="player"></div></section>' +
      '<section class="card practice"><h2 class="card__title">Практика</h2><p>' + esc(l.practice) + '</p>' +
        '<p class="practice__aff">«' + esc(l.affirmation) + '»</p></section>' +
      '<section class="card lyrics"><h2 class="card__title">Текст</h2><div class="lyrics__body">' + lyricsHTML + '</div></section>' +
      '<section class="card actions" id="actions">' +
        '<p class="actions__note">' + modeNote + '</p>' +
        (st === 'passed'
          ? '<div class="actions__row"><a class="btn btn--gold" href="index.html">Вернуться к карте</a></div>'
          : '<div class="actions__row">' +
              '<button class="btn btn--ghost" id="doneBtn" type="button" disabled>Я выполнил практику</button>' +
              '<button class="btn btn--gold" id="completeBtn" type="button" disabled>Завершить уровень</button>' +
            '</div><p class="actions__hint" id="actionsHint">«Я выполнил практику» откроется после ' + MIN_LISTEN_SEC + ' секунд прослушивания (или сразу, если трек ещё не загружен).</p>') +
      '</section>' +
      '<nav class="level__nav">' +
        (Progress.prev(l.id) ? '<a href="level.html?id=' + Progress.prev(l.id) + '">← ' + Progress.prev(l.id) + '</a>' : '<span></span>') +
        (Progress.next(l.id) && Progress.state(Progress.next(l.id)) !== 'locked' ? '<a href="level.html?id=' + Progress.next(l.id) + '">' + Progress.next(l.id) + ' →</a>' : '<span></span>') +
      '</nav>';
    paintGeometry();

    var doneBtn = $('#doneBtn'), completeBtn = $('#completeBtn'), hint = $('#actionsHint');
    var canComplete = st === 'current';
    function unlockDone(msg) {
      if (!doneBtn || !doneBtn.disabled) return;
      doneBtn.disabled = false;
      if (hint) hint.textContent = msg;
    }
    function unlockComplete(msg) {
      if (!completeBtn) return;
      if (doneBtn) unlockDone('');
      if (!canComplete) { if (hint) hint.innerHTML = 'Практика отмечена. Завершить уровень можно будет, когда закончится суточный отдых.'; return; }
      completeBtn.disabled = false;
      completeBtn.classList.add('btn--pulse');
      if (hint) hint.textContent = msg;
    }

    new window.TrackPlayer($('#player'), l.tracks, {
      title: l.display + ' · ' + l.name,
      onMissing: function () { unlockDone('Трек ещё не загружен — выполните практику по тексту и нажмите «Я выполнил практику».'); },
      onTime: function (sec) { if (sec >= MIN_LISTEN_SEC) unlockDone('Можно отметить практику или дослушать трек до конца.'); },
      onEnded: function () { unlockComplete('Трек прослушан полностью. Уровень можно завершить.'); }
    });

    if (doneBtn) doneBtn.addEventListener('click', function () {
      doneBtn.classList.add('is-checked');
      doneBtn.textContent = '✓ Практика выполнена';
      unlockComplete('Практика отмечена. Нажмите «Завершить уровень».');
    });
    if (completeBtn) completeBtn.addEventListener('click', function () {
      var res = Progress.complete(l.id);
      if (!res) return;
      document.body.classList.add('is-leaving');
      setTimeout(function () { location.href = 'index.html?ascended=' + l.id; }, 450);
    });

    if (st === 'resting') {
      var timer = setInterval(function () {
        var r = Progress.restRemaining(), t = $('#restTimer');
        if (r <= 0) { clearInterval(timer); location.reload(); return; }
        if (t) t.textContent = fmtCountdown(r);
      }, 1000);
    }
  }

  /* ---------- Библиотека (library.html) ---------- */
  function initLibrary(data) {
    var root = $('#library');
    var passed = data.levels.filter(function (l) { return Progress.state(l.id) === 'passed'; });
    if (!passed.length) {
      root.innerHTML = '<div class="notice"><h2>Архив пока пуст</h2><p>Здесь появятся треки уровней, которые вы уже прошли. Начните восхождение с первого уровня.</p>' +
        '<a class="btn btn--gold" href="level.html?id=' + Progress.current() + '">Начать практику</a></div>';
      return;
    }
    root.innerHTML = passed.slice().reverse().map(function (l) {
      return '<article class="card lib-item band--' + l.band + '" style="--c:' + l.color + '">' +
        '<header class="lib-item__head"><span class="lib-item__num">' + esc(l.display) + '</span>' +
          '<div><h2 class="lib-item__name">' + esc(l.name) + ' <small>' + esc(l.name_en) + '</small></h2>' +
          '<p class="lib-item__aff">«' + esc(l.affirmation) + '»</p></div></header>' +
        '<div class="lib-item__player" data-id="' + l.id + '"></div>' +
        '<details class="lib-item__lyrics"><summary>Текст и практика</summary>' +
          '<p class="lib-item__practice">' + esc(l.practice) + '</p>' +
          '<div class="lyrics__body">' + esc(l.lyrics).split(/\n{2,}/).map(function (s) { return '<p>' + s.replace(/\n/g, '<br>') + '</p>'; }).join('') + '</div>' +
          '<a class="lib-item__open" href="level.html?id=' + l.id + '">Открыть страницу уровня →</a>' +
        '</details></article>';
    }).join('');
    passed.forEach(function (l) {
      var mount = root.querySelector('.lib-item__player[data-id="' + l.id + '"]');
      new window.TrackPlayer(mount, l.tracks, { title: l.display + ' · ' + l.name });
    });
  }

  /* ---------- Старт ---------- */
  function boot() {
    paintGeometry();
    var page = document.body.getAttribute('data-page');
    loadData().then(function (data) {
      Progress.init(data.levels);
      if (page === 'map') initMap(data);
      else if (page === 'level') initLevel(data);
      else if (page === 'library') initLibrary(data);
    }).catch(function (err) {
      console.error(err);
      var el = $('#currentCard') || $('#level') || $('#library');
      if (el) el.innerHTML = '<div class="notice"><h2>Ошибка загрузки</h2><p>' + esc(err.message) + '</p></div>';
    }).then(function () {
      requestAnimationFrame(function () { document.body.classList.add('is-ready'); });
    });
  }

  window.Hawkins = { Progress: Progress };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
