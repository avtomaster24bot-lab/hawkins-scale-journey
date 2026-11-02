/* Шкала Хокинса: Восхождение — управление аудио.
 * TrackPlayer: обёртка над <audio> с собственным интерфейсом, случайным выбором
 * варианта трека, мягким fade-in/fade-out и аккуратной обработкой
 * отсутствующих файлов (пока треки Suno ещё не загружены в /audio).
 */
(function () {
  'use strict';

  var FADE_MS = 900;
  var instances = [];

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /**
   * @param {HTMLElement} mount
   * @param {string[]} tracks  пути к файлам
   * @param {object} opts { title, onEnded, onMissing, onTime(listenedSec), onLoaded(src) }
   */
  function TrackPlayer(mount, tracks, opts) {
    this.mount = mount;
    this.tracks = (tracks || []).slice();
    this.opts = opts || {};
    this.queue = [];
    this.current = null;
    this.missing = false;
    this.listened = 0;          // секунды фактического прослушивания
    this._lastT = null;
    this._fadeTimer = null;
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this._build();
    this._bind();
    this.pickRandom();
    instances.push(this);
  }

  TrackPlayer.prototype._build = function () {
    var multi = this.tracks.length > 1;
    this.mount.classList.add('player');
    this.mount.innerHTML =
      '<button class="player__play" type="button" aria-label="Воспроизвести">' +
        '<svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>' +
        '<svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>' +
      '</button>' +
      '<div class="player__body">' +
        '<div class="player__meta">' +
          '<span class="player__title"></span>' +
          '<span class="player__variant"></span>' +
        '</div>' +
        '<div class="player__bar" role="slider" tabindex="0" aria-label="Позиция трека" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
          '<div class="player__fill"></div><div class="player__knob"></div>' +
        '</div>' +
        '<div class="player__times"><span class="player__cur">0:00</span><span class="player__dur">0:00</span></div>' +
      '</div>' +
      (multi ? '<button class="player__shuffle" type="button" title="Другой вариант трека" aria-label="Другой вариант трека">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3l4 4-4 4V8h-2.6l-2.2 2.6-1.3-1.5L13.5 6H17V3zM3 6h4.5l9.9 12H17v-3l4 4-4 4v-3h-1.4L5.6 8H3V6zm0 12h2.6l2.2-2.6 1.3 1.5L6.5 20H3v-2z"/></svg>' +
        '</button>' : '') +
      '<p class="player__status" hidden></p>';
    var q = this.mount.querySelector.bind(this.mount);
    this.el = {
      play: q('.player__play'), title: q('.player__title'), variant: q('.player__variant'),
      bar: q('.player__bar'), fill: q('.player__fill'), knob: q('.player__knob'),
      cur: q('.player__cur'), dur: q('.player__dur'), status: q('.player__status'),
      shuffle: q('.player__shuffle')
    };
    this.el.title.textContent = this.opts.title || '';
  };

  TrackPlayer.prototype._bind = function () {
    var self = this, a = this.audio;
    this.el.play.addEventListener('click', function () { self.toggle(); });
    if (this.el.shuffle) this.el.shuffle.addEventListener('click', function () { self.pickRandom(true); });

    a.addEventListener('loadedmetadata', function () {
      self.el.dur.textContent = fmt(a.duration);
      self._setStatus('');
      self.mount.classList.remove('is-missing');
      if (self.opts.onLoaded) self.opts.onLoaded(self.current);
    });
    a.addEventListener('timeupdate', function () {
      var p = a.duration ? (a.currentTime / a.duration) * 100 : 0;
      self.el.fill.style.width = p + '%';
      self.el.knob.style.left = p + '%';
      self.el.bar.setAttribute('aria-valuenow', Math.round(p));
      self.el.cur.textContent = fmt(a.currentTime);
      if (!a.paused && self._lastT !== null) {
        var d = a.currentTime - self._lastT;
        if (d > 0 && d < 1.5) self.listened += d;   // перемотка не засчитывается
      }
      self._lastT = a.currentTime;
      if (self.opts.onTime) self.opts.onTime(self.listened, a.duration);
    });
    a.addEventListener('play', function () { self.mount.classList.add('is-playing'); self.el.play.setAttribute('aria-label', 'Пауза'); });
    a.addEventListener('pause', function () { self.mount.classList.remove('is-playing'); self.el.play.setAttribute('aria-label', 'Воспроизвести'); });
    a.addEventListener('ended', function () {
      self.mount.classList.remove('is-playing');
      self.mount.classList.add('is-ended');
      if (self.opts.onEnded) self.opts.onEnded(self.current);
    });
    a.addEventListener('error', function () { self._tryNext(); });

    // Перемотка по клику / тачу
    var seek = function (clientX) {
      if (!a.duration || self.missing) return;
      var r = self.el.bar.getBoundingClientRect();
      var p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      a.currentTime = p * a.duration;
      self._lastT = a.currentTime;
    };
    var dragging = false;
    this.el.bar.addEventListener('pointerdown', function (e) { dragging = true; seek(e.clientX); });
    window.addEventListener('pointermove', function (e) { if (dragging) seek(e.clientX); });
    window.addEventListener('pointerup', function () { dragging = false; });
    this.el.bar.addEventListener('keydown', function (e) {
      if (!a.duration) return;
      if (e.key === 'ArrowRight') { a.currentTime = Math.min(a.duration, a.currentTime + 5); self._lastT = a.currentTime; }
      if (e.key === 'ArrowLeft') { a.currentTime = Math.max(0, a.currentTime - 5); self._lastT = a.currentTime; }
    });
  };

  /** Выбрать случайный вариант (по ТЗ 2.3.2). force — исключить текущий. */
  TrackPlayer.prototype.pickRandom = function (force) {
    var wasPlaying = !this.audio.paused;
    var pool = this.tracks.filter(function (t) { return !force || t !== this.current; }, this);
    this.queue = shuffled(pool.length ? pool : this.tracks);
    if (force && this.current) this.queue.push(this.current);   // текущий — последним запасным
    this.missing = false;
    this.mount.classList.remove('is-missing', 'is-ended');
    this._tryNext(wasPlaying);
  };

  TrackPlayer.prototype._tryNext = function (autoplay) {
    var next = this.queue.shift();
    if (!next) return this._markMissing();
    this.current = next;
    var idx = this.tracks.indexOf(next) + 1;
    this.el.variant.textContent = this.tracks.length > 1 ? 'вариант ' + idx + ' из ' + this.tracks.length : '';
    this._lastT = null;
    this.audio.src = next;
    this.audio.load();
    if (autoplay) this.play();
  };

  TrackPlayer.prototype._markMissing = function () {
    this.missing = true;
    this.current = null;
    this.mount.classList.add('is-missing');
    this.mount.classList.remove('is-playing');
    this.el.variant.textContent = '';
    this.el.dur.textContent = '—';
    this._setStatus('Трек ещё не загружен. Прочитайте текст вслух или про себя, выполните практику — и отметьте её кнопкой ниже.');
    if (this.opts.onMissing) this.opts.onMissing();
  };

  TrackPlayer.prototype._setStatus = function (msg) {
    this.el.status.textContent = msg;
    this.el.status.hidden = !msg;
  };

  TrackPlayer.prototype._fade = function (to, done) {
    var a = this.audio, from = a.volume, start = performance.now();
    clearInterval(this._fadeTimer);
    var self = this;
    this._fadeTimer = setInterval(function () {
      var k = Math.min(1, (performance.now() - start) / FADE_MS);
      a.volume = from + (to - from) * k;
      if (k >= 1) { clearInterval(self._fadeTimer); if (done) done(); }
    }, 30);
  };

  TrackPlayer.prototype.play = function () {
    if (this.missing) return;
    var self = this;
    instances.forEach(function (p) { if (p !== self) p.pause(); });   // только один трек одновременно
    this.audio.volume = 0;
    var pr = this.audio.play();
    if (pr && pr.catch) pr.catch(function () {});
    this._fade(1);
  };

  TrackPlayer.prototype.pause = function () {
    var a = this.audio;
    if (a.paused) return;
    this._fade(0, function () { a.pause(); });
  };

  TrackPlayer.prototype.toggle = function () {
    if (this.missing) return;
    if (this.audio.paused) this.play(); else this.pause();
  };

  window.TrackPlayer = TrackPlayer;
})();
