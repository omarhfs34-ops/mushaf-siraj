'use strict';

/* ============================================================
   سراج المدينة — منطق التطبيق
   البيانات تُحمّل من data.json، والعرض والتفاعل طبقة فوق النص
   القرآني (الرسم العثماني) لا تُعيد كتابته إطلاقاً.
   ============================================================ */

// === CONFIG =================================================
// مصدر واحد للثوابت: مسارات، مفاتيح تخزين، حدود، ألوان، أنواع الأخطاء.
const CONFIG = {
  AUDIO_CDN: 'https://cdn.islamic.network/quran/audio/128/',
  RECITERS: [
    { id: 'ar.alafasy',      label: 'العفاسي' },
    { id: 'ar.husary',       label: 'الحصري' },
    { id: 'ar.minshawi',     label: 'المنشاوي المرتل' },
  ],
  STORAGE_PAGE: 'siraj_madina_page',
  STORAGE_DB: 'siraj_madina_db',
  STORAGE_DB_BACKUP: 'siraj_madina_db_backup',   // نص السجلات الخام إن تعذّر تحليله؛ لا يُكتب فوقه
  STORAGE_TAFSIR_SRC: 'siraj_madina_tafsir_src',
  STORAGE_TAFSIR_HINT: 'siraj_madina_tafsir_hint',
  TAFSIR_DIR: 'data/tafsir/',
  TAFSIR_SOURCES: ['mukhtasar_ar', 'saadi'],   // الأول هو الافتراضي
  RECITE_URL: '',   // صفحة الطالب في أداة التصحيح؛ فارغ = لا يظهر قسم «تسميع عن بُعد»
  FIRST_PAGE: 1,
  LAST_PAGE: 604,
  SEARCH_MIN_LEN: 2,
  SEARCH_MAX_RESULTS: 40,
  FLASH_MS: 2000,
  TOAST_MS: 2200,
  // درجة البداية والخصومات الافتراضية: رد وتنبيه للجلي، ثم الخفي
  BASE_SCORE: 100,
  DEFAULT_RADD_DEDUCTION: 4,
  DEFAULT_TANBIH_DEDUCTION: 2,
  DEFAULT_KHAFI_DEDUCTION: 2,
  // لوحة الألوان الثابتة لمداخل الغريب (لون ثابت لكل مدخل)
  PALETTE: ['#B8860B', '#1B6B5A', '#9B2D30', '#3B5BA5', '#7A4E9E', '#A0631C',
            '#2E7D32', '#C0392B', '#1565C0', '#6A4C93', '#00838F', '#AD6800',
            '#5B8C00', '#8E24AA', '#00695C', '#D84315'],
  // اللحن الجلي: نوع × موضع، ورمزه jali_<نوع>_<موضع>، ودرجته رد أو تنبيه
  JALI_TYPES: { add: 'زيادة', del: 'نقص', chg: 'تغيير' },
  JALI_PLACES: { word: 'كلمة', letter: 'حرف', haraka: 'حركة' },
  JALI_GRADES: { radd: 'رد', tanbih: 'تنبيه' },
  // أنواع اللحن الخفي (الدقيق)
  ERR_KHAFI: ['أصل الحكم', 'ترقيق المفخم', 'تفخيم المرقق', 'إتمام الحركات', 'تحقيق المشدد',
              'زمن المدود', 'قصر الغنة', 'تلكؤ', 'تمطيط', 'أداء الإخفاء', 'النبر في القراءة',
              'قلقلة السواكن', 'عدم القلقلة', 'قراءة مشوبة بغنة', 'عدم تحقيق الهمزات',
              'عدم تبيين الحرف الأخير عند الوقف', 'إضافة همزة أو هاء عند الوقف'],
};

// === HELPERS / STATE ========================================
const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const toArabicNumerals = n => String(n).replace(/[0-9]/g, d => AR_DIGITS[+d]);
const gharibColor = i => CONFIG.PALETTE[i % CONFIG.PALETTE.length]; // لون ثابت لكل مدخل
const $ = id => document.getElementById(id);
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

let D;                 // بيانات القرآن (data.json)
let curPage;           // الصفحة الحالية
let entryPage = null;  // فهرس صفحة أول ظهور لكل مدخل غريب (يُبنى عند أول بحث)

// حالة التشغيل الصوتي
let audio = null, audioSurah = 0, audioAyah = 0, playing = false;
let curReciter = CONFIG.RECITERS[0].id;
const globalAyahNumber = (s, a) => D.STARTS[s] + a - 1;

// حالة وضع التصحيح
let corrMode = false;
let raddDeduction = CONFIG.DEFAULT_RADD_DEDUCTION;
let tanbihDeduction = CONFIG.DEFAULT_TANBIH_DEDUCTION;
let khafiDeduction = CONFIG.DEFAULT_KHAFI_DEDUCTION;
let errors = [];
let pickTarget = null;
let jaliGrade = null;  // درجة الجلي المختارة في النافذة (تُفرَّغ بعد كل إضافة)

// حالة لوحة التفسير
const tafsirCache = {};  // src_s → وعد بملف السورة
let tafsirSrc = CONFIG.TAFSIR_SOURCES.includes(lsGet(CONFIG.STORAGE_TAFSIR_SRC))
  ? lsGet(CONFIG.STORAGE_TAFSIR_SRC) : CONFIG.TAFSIR_SOURCES[0];
let tafsirSurah = 0, tafsirAyah = 0;
let reciteSurah = 0, reciteAyah = 0;  // آية التسميع المختارة في وضع التصحيح

// === DATA LOADING ===========================================
const pageFromHash = () => {
  const m = (location.hash || '').match(/page=(\d+)/);
  return m ? Math.min(CONFIG.LAST_PAGE, Math.max(CONFIG.FIRST_PAGE, +m[1])) : null;
};


const init = async () => {
  D = (typeof QURAN_DATA !== 'undefined') ? QURAN_DATA : await fetch('data/khdry_final.json').then(r => r.json());

  curPage = pageFromHash() || +(localStorage.getItem(CONFIG.STORAGE_PAGE) || CONFIG.FIRST_PAGE);

  buildSurahSelect();
  buildErrorTags();
  bindStaticEvents();
  render(curPage);

  if (!lsGet(CONFIG.STORAGE_TAFSIR_HINT)) {
    toast('انقر على رقم الآية لعرض تفسيرها');
    lsSet(CONFIG.STORAGE_TAFSIR_HINT, '1');
  }
};

// ملف تفسير السورة يُجلب مرة واحدة لكل تفسير ولكل سورة؛ الفشل لا يُحفظ فيُعاد عند الطلب التالي
const loadTafsir = (src, s) => {
  const key = src + '_' + s;
  if (!tafsirCache[key]) {
    tafsirCache[key] = fetch(CONFIG.TAFSIR_DIR + src + '/' + String(s).padStart(3, '0') + '.json')
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(e => { delete tafsirCache[key]; throw e; });
  }
  return tafsirCache[key];
};

// === RENDERING ==============================================
const buildSurahSelect = () => {
  const sel = $('surahSel');
  for (let s = 1; s <= 114; s++) {
    const o = document.createElement('option');
    o.value = s;
    o.textContent = toArabicNumerals(s) + ' — ' + D.NAMES[s];
    sel.appendChild(o);
  }
};

const render = p => {
  curPage = p;
  clearReciteAyah();
  localStorage.setItem(CONFIG.STORAGE_PAGE, p);
  if (history.replaceState) history.replaceState(null, '', '#page=' + p);
  $('pgIn').value = p;

  const lines = D.PAGES[String(p)] || [];
  const box = $('lines');
  box.innerHTML = '';
  const pageSurahs = new Set(), marginEntries = [];
  let lastS = 0, lastA = 0;  // سورة وآية آخر كلمة رُسمت (لربط دائرة الرقم بآيتها)

  for (const ln of lines) {
    const div = document.createElement('div');
    if (ln[0] === 'S') {
      div.className = 'surah-hd';
      div.textContent = 'سُورَةُ ' + D.NAMES[ln[1]];
      pageSurahs.add(ln[1]);
    } else if (ln[0] === 'B') {
      div.className = 'ln basmala';
      div.style.fontFamily = "'" + ln[2] + "'";
      div.textContent = ln[1];
    } else {
      div.className = 'ln';
      let wc = 0;
      for (const g of ln[1]) {
        if (g[0] === 'n') {            // رقم آية: عنصر مستقل في موضعه الطبيعي
          const num = document.createElement('span');
          num.className = 'vn';
          num.style.fontFamily = "'" + g[2] + "'";
          num.textContent = g[1];
          if (lastS) {                 // بلا كلمة سابقة في الصفحة: لا ربط
            const vs = lastS, va = lastA;
            num.dataset.k = vs + '_' + va;
            num.addEventListener('click', () => ayahClick(vs, va));
          }
          div.appendChild(num);
          continue;
        }
        if (g[0] === 'q') {            // علامة ربع/حزب
          const q = document.createElement('span');
          q.style.fontFamily = "'" + g[2] + "'";
          q.textContent = g[1];
          div.appendChild(q);
          continue;
        }
        const [, s, a, lp, ch, fn] = g;
        pageSurahs.add(s);
        lastS = s; lastA = a;
        wc++;
        const gharibAyah = (D.GHARIB[s] || {})[a] || {};
        const cell = gharibAyah[String(lp)];
        const span = document.createElement('span');
        span.className = 'w';
        span.style.fontFamily = "'" + fn + "'";
        span.textContent = ch;
        span.dataset.k = s + '_' + a;
        span.dataset.p = lp;
        if (cell) {
          span.style.color = gharibColor(cell.i);
          span.dataset.gi = cell.i;
          if (cell.s) marginEntries.push(cell.i);
        }
        span.addEventListener('click', () => wordClick(span, s, a));
        div.appendChild(span);
      }
      if (wc <= 2) div.classList.add('center');
    }
    box.appendChild(div);
  }

  const ss = [...pageSurahs].sort((a, b) => a - b);
  $('hdSurah').textContent = ss.map(s => D.NAMES[s]).join(' · ');
  $('hdPage').textContent = 'صفحة ' + toArabicNumerals(p);
  if (ss.length) $('surahSel').value = ss[0];

  const ml = $('marginList');
  ml.innerHTML = '';
  [...new Set(marginEntries)].forEach(i => {
    const e = D.MEAN[i], col = gharibColor(i);
    const d = document.createElement('div');
    d.className = 'me';
    d.id = 'me' + i;
    d.style.borderRightColor = col;
    d.innerHTML = '<span class="mw" style="color:' + col + '">' + e.w + '</span> <span class="mm">' + e.m + '</span>';
    d.addEventListener('click', () => flashWord(i));
    ml.appendChild(d);
  });

  // في وضع التصحيح: علامات النقر وتلوين الأخطاء المسجلة على هذه الصفحة
  if (corrMode) applyCorrectionMarks();
};

const flashWord = i => {
  document.querySelectorAll('.w.flash').forEach(x => x.classList.remove('flash'));
  document.querySelectorAll('.w[data-gi="' + i + '"]').forEach(x => {
    x.classList.add('flash');
    x.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  setTimeout(() => document.querySelectorAll('.w.flash').forEach(x => x.classList.remove('flash')), CONFIG.FLASH_MS);
};

const wordClick = (span, s, a) => {
  if (corrMode) { openErrorPicker(span, s, a); return; }
  document.querySelectorAll('.me.hl').forEach(x => x.classList.remove('hl'));
  if (span.dataset.gi !== undefined) {
    const me = $('me' + span.dataset.gi);
    if (me) { me.classList.add('hl'); me.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }
  playAyah(s, a);
};

// === TAFSIR =================================================
// النص يُدرج حرفيًا بـ textContent؛ مكان كل حاشية بين ¬ و¥ رقم مرفوع، والحواشي تُسرد في أسفل التفسير
// وفي المختصر ما بين _ و_ بخط بارز وتُخفى الشرطتان، إلا إن كان عددها فرديًا فيُعرض كما هو
const fillTafsirText = (box, text, src) => {
  box.textContent = '';
  const em = src === 'mukhtasar_ar' && (text.split('_').length - 1) % 2 === 0;
  const re = em ? /¬([^¬¥]*)¥|_([^_]+)_/g : /¬([^¬¥]*)¥/g; // لا تحوي الحاشية علامة فتح؛ العلامة اليتيمة تُعرض كما هي
  const notes = [];
  let last = 0, m;
  while ((m = re.exec(text))) {
    box.appendChild(document.createTextNode(text.slice(last, m.index)));
    let el;
    if (m[1] !== undefined) {
      notes.push(m[1]);
      el = document.createElement('sup');
      el.className = 'tfs-fnref';
      el.textContent = '[' + toArabicNumerals(notes.length) + ']';
    } else {
      el = document.createElement('strong');
      el.className = 'tfs-em';
      el.textContent = m[2];
    }
    box.appendChild(el);
    last = re.lastIndex;
  }
  box.appendChild(document.createTextNode(text.slice(last)));
  if (!notes.length) return;
  const list = document.createElement('div');
  list.className = 'tfs-notes';
  notes.forEach((note, i) => {
    const row = document.createElement('div');
    row.textContent = '[' + toArabicNumerals(i + 1) + '] ' + note;
    list.appendChild(row);
  });
  box.appendChild(list);
};

const openTafsir = (s, a) => {
  s = Number(s); a = Number(a);
  tafsirSurah = s; tafsirAyah = a;
  $('tfsLbl').textContent = 'سورة ' + D.NAMES[s] + ' — آية ' + toArabicNumerals(a);
  $('tfsPrev').disabled = a <= 1;
  $('tfsNext').disabled = a >= D.AYAHS[s];
  document.querySelectorAll('#tfsSw button').forEach(b => b.classList.toggle('active', b.dataset.src === tafsirSrc));
  $('tfsPanel').classList.add('show');
  const body = $('tfsBody'), src = tafsirSrc;
  const stale = () => src !== tafsirSrc || s !== tafsirSurah || a !== tafsirAyah; // تغيّر الطلب أثناء التحميل
  body.textContent = 'جارٍ التحميل';
  loadTafsir(src, s)
    .then(data => { if (!stale()) fillTafsirText(body, data.ayahs[String(a)] || '', src); })
    .catch(() => { if (!stale()) body.textContent = 'تعذّر تحميل التفسير'; });
};

const setTafsirSrc = src => {
  if (src === tafsirSrc) return;
  tafsirSrc = src;
  lsSet(CONFIG.STORAGE_TAFSIR_SRC, src);
  openTafsir(tafsirSurah, tafsirAyah);
};

const closeTafsir = () => { $('tfsPanel').classList.remove('show'); };

const selectReciteAyah = (s, a) => {
  reciteSurah = s; reciteAyah = a;
  $('rcLbl').textContent = 'الآية المختارة: ' + D.NAMES[s] + ' ' + toArabicNumerals(a);
  $('rcBtn').disabled = false;
};

// تفريغ آية التسميع عند تغيّر السياق (تقليب الصفحة، الخروج من وضع التصحيح)
const clearReciteAyah = () => {
  reciteSurah = 0; reciteAyah = 0;
  $('rcLbl').textContent = 'انقر رقم الآية لاختيارها';
  $('rcBtn').disabled = true;
};

// رقم الآية: يفتح التفسير في وضع القراءة، ويختار آية التسميع في وضع التصحيح
const ayahClick = (s, a) => {
  if (corrMode) selectReciteAyah(s, a);
  else openTafsir(s, a);
};

// === NAVIGATION =============================================
const goPage = p => {
  if (p >= CONFIG.FIRST_PAGE && p <= CONFIG.LAST_PAGE) render(p);
  else $('pgIn').value = curPage;
};
const flipPage = d => goPage(curPage + d);
const goSurah = s => goPage(D.SURAH_PAGE[s]);

// === AUDIO ==================================================
const clearAudioHighlights = () => {
  document.querySelectorAll('.w.ayah-on').forEach(w => w.classList.remove('ayah-on'));
  document.querySelectorAll('.me.audio-on').forEach(m => m.classList.remove('audio-on'));
};

const highlightAyah = (s, a) => {
  clearAudioHighlights();
  // إن كانت الآية في صفحة أخرى، انتقل إليها
  const pg = (D.PAGES_OF && D.PAGES_OF[s + '_' + a]) || null;
  if (pg && pg !== curPage) render(pg);
  // أبرز كلمات الآية في النص
  const key = s + '_' + a;
  let first = null;
  document.querySelectorAll('.w[data-k="' + key + '"]').forEach(w => { w.classList.add('ayah-on'); if (!first) first = w; });
  if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  // أومض مداخل غريب هذه الآية في الهامش
  const gharibAyah = (D.GHARIB[s] || {})[a] || {};
  const seen = new Set();
  Object.values(gharibAyah).forEach(c => {
    if (c.s && !seen.has(c.i)) {
      seen.add(c.i);
      const me = $('me' + c.i);
      if (me) me.classList.add('audio-on');
    }
  });
};

const playAyah = (s, a) => {
  audioSurah = s; audioAyah = a;
  if (audio) { audio.pause(); audio = null; }
  audio = new Audio(CONFIG.AUDIO_CDN + curReciter + '/' + globalAyahNumber(s, a) + '.mp3');
  $('aBar').classList.add('show');
  $('aLbl').textContent = 'سورة ' + D.NAMES[s] + ' — آية ' + toArabicNumerals(a);
  $('aPlayBtn').textContent = '⏸';
  playing = true;
  highlightAyah(s, a);
  // التفسير المفتوح يتبع التلاوة (ولا يشغّل التفسيرُ التلاوةَ)
  if (!corrMode && $('tfsPanel').classList.contains('show') && (s !== tafsirSurah || a !== tafsirAyah)) openTafsir(s, a);
  audio.play().catch(() => {
    $('aLbl').textContent = 'تعذر التشغيل — تحقق من الاتصال';
    playing = false;
    $('aPlayBtn').textContent = '▶';
  });
  audio.onended = () => { if (audioAyah < D.AYAHS[audioSurah]) playAyah(audioSurah, audioAyah + 1); else closeAudio(); };
};

const toggleAudio = () => {
  if (!audio) return;
  if (playing) { audio.pause(); playing = false; $('aPlayBtn').textContent = '▶'; }
  else { audio.play(); playing = true; $('aPlayBtn').textContent = '⏸'; }
};

const closeAudio = () => {
  if (audio) { audio.pause(); audio = null; }
  playing = false;
  $('aBar').classList.remove('show');
  clearAudioHighlights();
};

const setReciter = id => {
  if (curReciter === id) return;
  curReciter = id;
  if (audio && playing) {
    const s = audioSurah, a = audioAyah;
    audio.pause(); audio = null;
    playAyah(s, a);
  }
};

// === SEARCH =================================================
const openSearch = () => { $('srchOv').classList.add('show'); $('srchIn').focus(); }
const closeSearch = () => { $('srchOv').classList.remove('show'); }

// تطبيع للبحث فقط (يُطبَّق على نص المداخل/المعاني، لا على نص الآيات القرآني)
const normalizeArabic = t => t
  .replace(/[ً-ٰٟۖ-ۭ]/g, '')
  .replace(/[ٱأإآ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه');

const buildEntryPage = () => {
  entryPage = {};
  for (const [p, lines] of Object.entries(D.PAGES))
    for (const ln of lines) if (ln[0] === 'A')
      for (const g of ln[1]) {
        if (g[0] !== 'w') continue;
        const [, s, a, lp] = g;
        const c = (D.GHARIB[s] || {})[a]?.[String(lp)];
        if (c && c.s && entryPage[c.i] === undefined) entryPage[c.i] = +p;
      }
}

const handleSearchInput = e => {
  const res = $('srchRes');
  res.innerHTML = '';
  const q = normalizeArabic(e.target.value.trim());
  if (q.length < CONFIG.SEARCH_MIN_LEN) return;
  if (!entryPage) buildEntryPage();
  let n = 0;
  const meanArr = D.MEAN;
  for (let i = 0; i < meanArr.length && n < CONFIG.SEARCH_MAX_RESULTS; i++) {
    const it = meanArr[i];
    if (normalizeArabic(it.w).includes(q) || normalizeArabic(it.m).includes(q)) {
      n++;
      const col = gharibColor(i);
      const d = document.createElement('div');
      d.className = 'sr';
      d.innerHTML = '<span class="rw" style="color:' + col + '">' + it.w + '</span> — <span>' + it.m +
        '</span> <span class="rl">صفحة ' + toArabicNumerals(entryPage[i] || '؟') + '</span>';
      d.addEventListener('click', () => {
        closeSearch();
        goPage(entryPage[i] || curPage);
        setTimeout(() => flashWord(i), 350);
      });
      res.appendChild(d);
    }
  }
  if (!n) res.innerHTML = '<div class="no-results">لا نتائج</div>';
}

// === CORRECTION MODE ========================================
const esc = RecordsIO.escapeHtml;
const num = RecordsIO.numText;  // أرقام السجلات: تُعرض إن كانت أرقامًا فعلًا
const store = () => { try { return localStorage; } catch (e) { return null; } };

const LOAD_WARN = {
  corrupt: 'تعذّرت قراءة السجلات المحفوظة، فحُفظ نصها الخام كما هو في مفتاح احتياطي مستقل (' +
    CONFIG.STORAGE_DB_BACKUP + ') لا يُكتب فوقه. تظهر السجلات الآن فارغة.',
  corrupt_unsaved: 'تعذّرت قراءة السجلات المحفوظة، ولم يمكن حفظ نصها في المفتاح الاحتياطي؛ فلن يُكتب فوقها، ولن يُحفظ شيء حتى تُعالج.',
  unavailable: 'تعذّر الوصول إلى تخزين المتصفح، فلا تظهر السجلات ولا تُحفظ.',
};
const SAVE_FAIL = {
  unavailable: 'تعذّر الحفظ: تخزين المتصفح غير متاح.',
  corrupt: 'تعذّر الحفظ: السجلات المخزنة تالفة ولم تُحفظ نسختها الاحتياطية، فلم يُكتب فوقها.',
  write: 'تعذّر الحفظ: ربما امتلأت مساحة التخزين.',
};

let dbWarned = false;  // تنبيه فشل القراءة مرة واحدة في كل فتح للصفحة
const loadDB = () => {
  const r = RecordsIO.loadRecords(store(), CONFIG.STORAGE_DB, CONFIG.STORAGE_DB_BACKUP);
  if (r.status !== 'ok' && !dbWarned) { dbWarned = true; alert(LOAD_WARN[r.status]); }
  return r.db;
};
// تعيد { ok } أو { ok: false, reason }؛ والرسالة على المستدعي
const saveDB = db => RecordsIO.saveRecords(store(), CONFIG.STORAGE_DB, CONFIG.STORAGE_DB_BACKUP, db);

const newSessionId = () => (window.crypto && crypto.randomUUID)
  ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);

// تنزيل ملف من المتصفح نفسه دون أي اتصال بالشبكة
const downloadFile = (name, text) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const toast = m => {
  const t = $('toast');
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), CONFIG.TOAST_MS);
};

const setMode = m => {
  corrMode = (m === 'correct');
  $('mRead').classList.toggle('active', !corrMode);
  $('mCorr').classList.toggle('active', corrMode);
  $('corrPanel').classList.toggle('show', corrMode);
  $('marginPanel').style.display = corrMode ? 'none' : '';
  if (corrMode) closeTafsir();
  else clearReciteAyah();
  document.querySelectorAll('.ln .w').forEach(w => w.classList.toggle('cor-hover', corrMode));
  toast(corrMode ? 'وضع التصحيح — انقر كلمةً لتسجيل خطأ' : 'وضع القراءة');
};

// تلوين الأخطاء المسجلة على كلمات الصفحة الحالية (في وضع التصحيح)
const applyCorrectionMarks = () => {
  document.querySelectorAll('.ln .w').forEach(w => {
    w.classList.add('cor-hover');
    const has = errors.filter(e => e.k === w.dataset.k && e.p === w.dataset.p);
    if (has.some(e => e.t === 'j')) w.classList.add('ej');
    if (has.some(e => e.t === 'k')) w.classList.add('ek');
  });
};

const setJaliGrade = g => {
  jaliGrade = g;
  document.querySelectorAll('#jGrade .jg').forEach(b => b.classList.toggle('active', b.dataset.g === g));
};

// بناء أوسمة الأخطاء مرة واحدة
const buildErrorTags = () => {
  Object.entries(CONFIG.JALI_GRADES).forEach(([g, label]) => {
    const b = document.createElement('button');
    b.className = 'jg ' + g;
    b.dataset.g = g;
    b.textContent = label;
    b.addEventListener('click', () => setJaliGrade(g));
    $('jGrade').appendChild(b);
  });
  // جدول الجلي: صف عناوين المواضع، ثم صف لكل نوع
  const grid = $('jGrid');
  grid.appendChild(document.createElement('span'));
  Object.values(CONFIG.JALI_PLACES).forEach(pn => {
    const h = document.createElement('span');
    h.className = 'jh';
    h.textContent = pn;
    grid.appendChild(h);
  });
  Object.entries(CONFIG.JALI_TYPES).forEach(([t, tn]) => {
    const h = document.createElement('span');
    h.className = 'jh';
    h.textContent = tn;
    grid.appendChild(h);
    Object.entries(CONFIG.JALI_PLACES).forEach(([pl, pn]) => {
      const b = document.createElement('button');
      b.className = 'jcell';
      b.textContent = pn;
      b.addEventListener('click', () => addJali('jali_' + t + '_' + pl, tn + ' — ' + pn));
      grid.appendChild(b);
    });
  });
  CONFIG.ERR_KHAFI.forEach(n => {
    const b = document.createElement('span');
    b.className = 'etag k';
    b.textContent = n;
    b.addEventListener('click', () => addError(n, 'k'));
    $('tagsK').appendChild(b);
  });
}

const openErrorPicker = (span, s, a) => {
  pickTarget = { span, s, a, k: span.dataset.k, p: span.dataset.p };
  const txt = (D.WTEXT[span.dataset.k] || [])[+span.dataset.p - 1] || span.textContent;
  $('eWord').textContent = txt + ' — ' + errLoc(span.dataset.k);
  $('ePick').classList.add('show');
};
const closeErrorPicker = () => { $('ePick').classList.remove('show'); pickTarget = null; setJaliGrade(null); };

const addJali = (code, name) => {
  if (!jaliGrade) { toast('اختر الدرجة أولاً: رد أو تنبيه'); return; }
  addError(name, 'j', { code, g: jaliGrade });
};

const addError = (name, type, extra = {}) => {
  if (!pickTarget) return;
  const id = pickTarget.k + '_' + pickTarget.p + '_' + Date.now();
  const txt = (D.WTEXT[pickTarget.k] || [])[+pickTarget.p - 1] || pickTarget.span.textContent;
  const e = { id, name, t: type, ...extra, k: pickTarget.k, p: pickTarget.p, word: txt };
  errors.push(e);
  pickTarget.span.classList.add(type === 'j' ? 'ej' : 'ek');
  updateScore();
  renderErrorList();
  closeErrorPicker();
  toast((type === 'j' ? 'لحن جلي: ' : 'لحن خفي: ') + errLabel(e));
}

const delError = id => {
  const e = errors.find(x => x.id === id);
  if (!e) return;
  errors = errors.filter(x => x.id !== id);
  // أزل التلوين إن لم يبق خطأ على نفس الكلمة
  if (!errors.some(x => x.k === e.k && x.p === e.p)) {
    document.querySelectorAll('.w[data-k="' + e.k + '"][data-p="' + e.p + '"]').forEach(w => w.classList.remove('ej', 'ek'));
  }
  updateScore();
  renderErrorList();
}

// حساب موحّد لعدد الأخطاء والدرجة (يمنع تكرار المنطق)
const countErrors = () => {
  return {
    radd: errors.filter(e => e.t === 'j' && e.g === 'radd').length,
    tanbih: errors.filter(e => e.t === 'j' && e.g === 'tanbih').length,
    khafi: errors.filter(e => e.t === 'k').length,
  };
}
const computeScore = (radd, tanbih, khafi) => {
  return Math.max(0, CONFIG.BASE_SCORE - radd * raddDeduction - tanbih * tanbihDeduction - khafi * khafiDeduction);
}

const updateScore = () => {
  const { radd, tanbih, khafi } = countErrors();
  $('scoreNum').textContent = toArabicNumerals(computeScore(radd, tanbih, khafi));
  $('cntR').textContent = toArabicNumerals(radd) + ' رد';
  $('cntT').textContent = toArabicNumerals(tanbih) + ' تنبيه';
  $('cntK').textContent = toArabicNumerals(khafi) + ' خفي';
}

const errLoc = k => {           // وصف موضع كامل من المفتاح سورة_آية
  const [s, a] = k.split('_').map(Number);
  return 'سورة ' + D.NAMES[s] + ' (' + toArabicNumerals(s) + ') — آية ' + toArabicNumerals(a);
}

// وصف الخطأ للعرض: «تغيير — حركة (رد)» للجلي، والاسم كما هو للخفي
const errLabel = e => e.g ? e.name + ' (' + CONFIG.JALI_GRADES[e.g] + ')' : e.name;

const renderErrorList = () => {
  const el = $('errList');
  el.innerHTML = '';
  errors.forEach(e => {
    const d = document.createElement('div');
    d.className = 'eitem ' + RecordsIO.errClass(e.t);
    const body = document.createElement('div');
    body.className = 'e-body';
    body.innerHTML =
      '<div class="e-word">' + esc(e.word) + ' <span class="e-type">(' + (e.t === 'j' ? 'جلي' : 'خفي') + ')</span></div>' +
      '<div class="e-name">' + esc(errLabel(e)) + '</div>' +
      '<div class="e-loc">' + esc(errLoc(e.k)) + '</div>';
    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.addEventListener('click', () => delError(e.id));
    d.appendChild(body);
    d.appendChild(btn);
    el.appendChild(d);
  });
}

const gradeLabel = s => { return s >= 95 ? 'ممتاز' : s >= 85 ? 'جيد جداً' : s >= 75 ? 'جيد' : s >= 60 ? 'مقبول' : 'يحتاج مراجعة'; };
const gradeColor = s => { return s >= 95 ? '#1B6B5A' : s >= 85 ? '#2E7D32' : s >= 75 ? '#AD6800' : s >= 60 ? '#C0392B' : '#7A1212'; };

const curSurahOnPage = () => {
  const lines = D.PAGES[String(curPage)] || [];
  for (const ln of lines) if (ln[0] === 'A') for (const g of ln[1]) if (g[0] === 'w') return g[1];
  return 1;
};

const saveSession = () => {
  const name = $('stdName').value.trim();
  if (!name) { toast('أدخل اسم الطالب أولاً'); return; }
  const { radd, tanbih, khafi } = countErrors();
  const score = computeScore(radd, tanbih, khafi);
  const surahNames = [...new Set(errors.map(e => D.NAMES[+e.k.split('_')[0]]))];
  const now = new Date();
  const sess = {
    id: newSessionId(), at: now.toISOString(),
    date: now.toLocaleDateString('ar-EG'), score, jr: radd, jt: tanbih, k: khafi,
    page: curPage, surah: surahNames.join(' · ') || D.NAMES[curSurahOnPage()] || '',
    errors: errors.map(e => ({ name: e.name, t: e.t, code: e.code, g: e.g, word: e.word, k: e.k, p: e.p })),
  };
  const db = loadDB();
  if (!db[name]) db[name] = [];
  db[name].unshift(sess);
  const r = saveDB(db);
  if (!r.ok) { alert(SAVE_FAIL[r.reason] + '\nأخطاء الجلسة الحالية باقية كما هي.'); return; }
  toast('✅ حُفظت جلسة ' + name + ' — الدرجة: ' + toArabicNumerals(score));
  errors = [];
  updateScore();
  renderErrorList();
  document.querySelectorAll('.w.ej,.w.ek').forEach(w => w.classList.remove('ej', 'ek'));
}

// === RECORDS & STATS ========================================
const openRecords = () => { renderRecords(); $('recOv').classList.add('show'); };
const closeRecords = () => { $('recOv').classList.remove('show'); };

const renderRecords = () => {
  const db = loadDB(), names = Object.keys(db).filter(n => db[n].length);  // الفارغ يبقى مخزّنًا ولا يُعرض
  const box = $('recBox');
  let totSess = 0, totScore = 0;
  names.forEach(n => db[n].forEach(s => { totSess++; totScore += s.score; }));
  const avg = totSess ? Math.round(totScore / totSess) : 0;

  let h = '<h3>📊 سجل الطلاب والإحصاءات</h3>';
  h += '<div class="stat-row">' +
    '<div class="stat-b"><div class="n">' + toArabicNumerals(names.length) + '</div><div class="l">طالب</div></div>' +
    '<div class="stat-b"><div class="n">' + toArabicNumerals(totSess) + '</div><div class="l">جلسة</div></div>' +
    '<div class="stat-b"><div class="n">' + num(avg) + '</div><div class="l">متوسط الدرجات</div></div></div>';

  if (!names.length) {
    h += '<div class="no-data">لا يوجد سجلات بعد<br><small>ابدأ جلسة تصحيح واحفظها</small></div>';
  } else {
    names.forEach(name => {
      const sess = db[name], last = sess[0];
      const encName = encodeURIComponent(name);
      h += '<div class="std-card"><div class="sh" data-toggle="sessions">' +
        '<span class="nm">' + esc(name) + '</span>' +
        '<span><span class="gtag" style="background:' + gradeColor(last.score) + '">' + num(last.score) + '</span> ' +
        '<span class="sess-meta">' + toArabicNumerals(sess.length) + ' جلسة ▾</span></span></div>';
      h += '<div class="std-sessions">';
      sess.forEach((s, i) => {
        h += '<div class="sess-row"><span>' + esc(s.date) + ' — ' + esc(s.surah) + '</span>' +
          '<span><span class="gtag" style="background:' + gradeColor(s.score) + '">' + num(s.score) + ' · ' + gradeLabel(s.score) + '</span> ' +
          '<button class="rbtn" data-toggle="detail">تفاصيل</button> ' +
          '<button class="rbtn del" data-action="delSess" data-name="' + encName + '" data-idx="' + i + '">حذف</button></span></div>';
        // تفاصيل أخطاء هذه الجلسة بمواضعها
        h += '<div class="sess-errors">';
        if (s.errors && s.errors.length) {
          s.errors.forEach(er => {
            const loc = er.k ? errLoc(er.k) : '';
            h += '<div class="sess-err ' + RecordsIO.errClass(er.t) + '">' +
              '<b class="sw">' + esc(er.word) + '</b> ' +
              '<span class="st">(' + (er.t === 'j' ? 'لحن جلي' : 'لحن خفي') + ')</span><br>' +
              '<span class="sn">' + esc(errLabel(er)) + '</span> — <span class="sl">' + esc(loc) + '</span></div>';
          });
        } else { h += '<div class="no-data tiny">لا تفاصيل</div>'; }
        h += '</div>';
      });
      h += '<div class="std-actions">' +
        '<button class="rbtn" data-action="export" data-name="' + encName + '">🖨️ تقرير للطباعة</button>' +
        '<button class="rbtn del" data-action="delStudent" data-name="' + encName + '">حذف الطالب</button></div>';
      h += '</div></div>';
    });
  }
  h += '<div class="std-actions">' +
    '<button class="rbtn" data-action="exportAll">⬇️ تصدير السجلات</button>' +
    '<button class="rbtn" data-action="importFile">⬆️ استيراد سجلات</button></div>';
  h += '<button class="rclose" data-action="closeRecords">إغلاق</button>';
  box.innerHTML = h;
}

// تفويض أحداث صندوق السجل (بدل onclick المضمّنة سابقاً)
const handleRecordsClick = e => {
  const toggle = e.target.closest('[data-toggle]');
  if (toggle) {
    const kind = toggle.dataset.toggle;
    if (kind === 'sessions') {
      const panel = toggle.nextElementSibling; // .std-sessions
      panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
    } else if (kind === 'detail') {
      // الزر داخل .sess-row؛ تفاصيله هي العنصر التالي لصف الجلسة (.sess-errors)
      const panel = toggle.closest('.sess-row').nextElementSibling;
      panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
    }
    return;
  }
  const act = e.target.closest('[data-action]');
  if (!act) return;
  const name = act.dataset.name ? decodeURIComponent(act.dataset.name) : '';
  switch (act.dataset.action) {
    case 'delSess': delSession(name, +act.dataset.idx); break;
    case 'delStudent': delStudent(name); break;
    case 'export': exportStudent(name); break;
    case 'exportAll': exportAll(); break;
    case 'importFile': $('recFile').click(); break;
    case 'closeRecords': closeRecords(); break;
  }
}

const delSession = (name, i) => {
  const db = loadDB();
  if (!db[name]) return;
  db[name].splice(i, 1);
  if (!db[name].length) delete db[name];
  const r = saveDB(db);
  if (!r.ok) alert(SAVE_FAIL[r.reason]);
  renderRecords();
};
const delStudent = name => {
  const db = loadDB();
  delete db[name];
  const r = saveDB(db);
  if (!r.ok) alert(SAVE_FAIL[r.reason]);
  renderRecords();
}

// تصدير السجلات كلها كما هي، ومنها القديمة، في ملف واحد
const exportAll = () => {
  const f = RecordsIO.buildExport(loadDB(), new Date());
  downloadFile(f.name, f.text);
};

// تحقق ← ملخص ← تأكيد ← تصدير تلقائي للحالي ← كتابة واحدة؛ الملف غير الصالح يُرفض كله
const importRecords = async file => {
  let text;
  try { text = await file.text(); } catch (e) { alert('تعذّرت قراءة الملف، ولم يُكتب شيء.'); return; }
  const v = RecordsIO.validateImport(text);
  if (!v.ok) { alert('رُفض الملف ولم يُكتب شيء:\n' + v.error); return; }
  const cur = loadDB();
  const { db, summary: m } = RecordsIO.mergeDB(cur, v.db);
  const n = toArabicNumerals;
  const msg = 'في الملف: ' + n(m.students) + ' طالب، و' + n(m.sessions) + ' جلسة.\n' +
    'طلاب جدد: ' + n(m.newStudents.length) + '\n' +
    'طلاب موجودون من قبل (تُضاف جلساتهم الجديدة بعد جلساتهم الحالية): ' + (m.existingStudents.join('، ') || 'لا أحد') + '\n' +
    'جلسات ستُضاف: ' + n(m.added) + '\n' +
    'جلسات مكررة لن تُضاف: ' + n(m.duplicates) +
    (m.conflicts ? '\nمنها ' + n(m.conflicts) + ' بمعرّف موجود ومحتوى مختلف، وتبقى الموجودة كما هي.' : '');
  if (!m.added) { alert(msg + '\n\nلا جلسات جديدة، ولم يُكتب شيء.'); return; }
  if (!confirm(msg + '\n\nستُنزَّل أولًا نسخة من السجلات الحالية. هل تتابع؟')) return;
  const backup = RecordsIO.buildExport(cur, new Date());
  downloadFile(backup.name, backup.text);
  const r = saveDB(db);
  if (!r.ok) { alert(SAVE_FAIL[r.reason] + '\nلم يُستورد شيء.'); return; }
  toast('✅ استُوردت ' + n(m.added) + ' جلسة');
  renderRecords();
};

const exportStudent = name => {
  const db = loadDB(), sess = db[name] || [];
  const avg = sess.length ? Math.round(sess.reduce((a, s) => a + s.score, 0) / sess.length) : 0;
  let rows = '', details = '';
  sess.forEach((s, i) => {
    rows += '<tr><td>' + toArabicNumerals(i + 1) + '</td><td>' + esc(s.date) + '</td><td>' + esc(s.surah) +
      '</td><td>' + esc(s.jr === undefined
        ? 'سجل قديم: ' + num(s.j) + ' جلي / ' + num(s.k) + ' خفي'
        : num(s.jr) + ' رد / ' + num(s.jt) + ' تنبيه / ' + num(s.k) + ' خفي') + '</td><td>' +
      num(s.score) + '</td><td>' + gradeLabel(s.score) + '</td></tr>';
    if (s.errors && s.errors.length) {
      details += '<h3>جلسة ' + toArabicNumerals(i + 1) + ' — ' + esc(s.date) + ' (الدرجة: ' + num(s.score) + ')</h3>';
      details += '<table><thead><tr><th>الكلمة</th><th>السورة</th><th>الترتيب</th><th>الآية</th><th>نوع الخطأ</th><th>التفصيل</th></tr></thead><tbody>';
      s.errors.forEach(er => {
        const sa = er.k ? er.k.split('_').map(Number) : [0, 0];
        details += '<tr><td class="word">' + esc(er.word) + '</td><td>' + (sa[0] ? esc(D.NAMES[sa[0]]) : '') +
          '</td><td>' + (sa[0] ? toArabicNumerals(sa[0]) : '') + '</td><td>' + (sa[1] ? toArabicNumerals(sa[1]) : '') +
          '</td><td style="color:' + (er.t === 'j' ? '#C0392B' : '#2980B9') + '">' + (er.t === 'j' ? 'لحن جلي' : 'لحن خفي') +
          '</td><td>' + esc(errLabel(er)) + '</td></tr>';
      });
      details += '</tbody></table>';
    }
  });
  const w = window.open('', '_blank');
  w.document.write('<html dir="rtl"><head><meta charset="utf-8"><title>تقرير ' + esc(name) + '</title>' +
    '<link rel="stylesheet" href="styles.css"></head><body class="print-body">' +
    '<h2>تقرير الطالب: ' + esc(name) + '</h2><p class="center">متوسط الدرجات: ' + num(avg) +
    ' — عدد الجلسات: ' + toArabicNumerals(sess.length) + '</p>' +
    '<table><thead><tr><th>#</th><th>التاريخ</th><th>السورة</th><th>الأخطاء</th><th>الدرجة</th><th>التقدير</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<h2>تفصيل الأخطاء</h2>' + (details || '<p class="center muted">لا أخطاء مسجلة</p>') +
    '<scr' + 'ipt>window.onload=()=>window.print()<\/scr' + 'ipt></body></html>');
  w.document.close();
}

// === SHARE ==================================================
const sharePage = () => {
  const base = location.href.split('#')[0];
  const url = base + '#page=' + curPage;
  const sNames = (D.PAGES[String(curPage)] || []).filter(l => l[0] === 'A').flatMap(l => l[1]).filter(g => g[0] === 'w').map(g => g[1]);
  const sName = sNames.length ? D.NAMES[sNames[0]] : '';
  const txt = 'سراج المدينة — صفحة ' + toArabicNumerals(curPage) + (sName ? ' (سورة ' + sName + ')' : '') + '\n' + url;
  if (navigator.share) {
    navigator.share({ title: 'سراج المدينة', text: 'صفحة ' + toArabicNumerals(curPage), url }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(txt).then(() => toast('📋 نُسخ رابط الصفحة — الصقه في واتساب')).catch(() => prompt('انسخ الرابط:', url));
  } else { prompt('انسخ الرابط:', url); }
}

// === INIT ===================================================
// ربط كل أحداث العناصر الثابتة (بدل onclick داخل HTML)
const bindStaticEvents = () => {
  window.addEventListener('hashchange', () => { const p = pageFromHash(); if (p && p !== curPage) render(p); });

  $('surahSel').addEventListener('change', e => goSurah(e.target.value));
  $('pgIn').addEventListener('change', e => goPage(+e.target.value));
  document.querySelector('[data-act="prev"]').addEventListener('click', () => flipPage(-1));
  document.querySelector('[data-act="next"]').addEventListener('click', () => flipPage(1));
  document.querySelector('[data-act="search"]').addEventListener('click', openSearch);
  document.querySelector('[data-act="share"]').addEventListener('click', sharePage);

  $('mRead').addEventListener('click', () => setMode('read'));
  $('mCorr').addEventListener('click', () => setMode('correct'));

  $('drInput').addEventListener('change', e => { raddDeduction = +e.target.value; updateScore(); });
  $('dtInput').addEventListener('change', e => { tanbihDeduction = +e.target.value; updateScore(); });
  $('dkInput').addEventListener('change', e => { khafiDeduction = +e.target.value; updateScore(); });
  document.querySelector('[data-act="save"]').addEventListener('click', saveSession);
  document.querySelector('[data-act="records"]').addEventListener('click', openRecords);

  document.querySelector('[data-act="eclose"]').addEventListener('click', closeErrorPicker);
  $('ePick').addEventListener('click', e => { if (e.target === e.currentTarget) closeErrorPicker(); });

  $('recOv').addEventListener('click', e => { if (e.target === e.currentTarget) closeRecords(); });
  $('recBox').addEventListener('click', handleRecordsClick);
  $('recFile').addEventListener('change', e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) importRecords(f);
  });

  $('aPlayBtn').addEventListener('click', toggleAudio);
  document.querySelector('[data-act="aclose"]').addEventListener('click', closeAudio);
  $('aReciter').addEventListener('change', e => setReciter(e.target.value));

  $('srchOv').addEventListener('click', e => { if (e.target === e.currentTarget) closeSearch(); });
  $('srchIn').addEventListener('input', handleSearchInput);

  document.querySelector('[data-act="tclose"]').addEventListener('click', closeTafsir);
  $('tfsPrev').addEventListener('click', () => openTafsir(tafsirSurah, tafsirAyah - 1));
  $('tfsNext').addEventListener('click', () => openTafsir(tafsirSurah, tafsirAyah + 1));
  document.querySelectorAll('#tfsSw button').forEach(b => b.addEventListener('click', () => setTafsirSrc(b.dataset.src)));
  $('rcSec').hidden = !CONFIG.RECITE_URL;
  $('rcBtn').addEventListener('click', () => {
    if (!reciteSurah) return;
    const u = new URL(CONFIG.RECITE_URL, location.href);
    u.searchParams.set('surah', reciteSurah);
    u.searchParams.set('ayah', reciteAyah);
    window.open(u.href, '_blank', 'noopener');
  });

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') flipPage(1);
    if (e.key === 'ArrowRight') flipPage(-1);
  });
}

init();
