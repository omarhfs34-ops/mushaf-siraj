'use strict';

/* ============================================================
   سراج المدينة — سجلات التصحيح: قراءة وحفظ وتصدير واستيراد
   دوال خالصة لا تلمس الصفحة؛ تعمل في المتصفح (RecordsIO) وفي Node (require).
   ============================================================ */

const RecordsIO = (() => {
  const FORMAT = 'siraj-records';
  const VERSION = 1;

  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const clone = v => JSON.parse(JSON.stringify(v));
  const arNum = n => String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);

  // كل نص يُدرج في الصفحة يمر من هنا فتصير علاماته نصًا عاديًا
  const escapeHtml = v => String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // اسم صنف الخطأ من قيمتين ثابتتين، لا من قيمة السجل نفسها
  const errClass = t => t === 'j' ? 'j' : 'k';
  // الرقم يُعرض بالأرقام العربية إن كان رقمًا فعلًا، وإلا فنص فارغ
  const numText = v => typeof v === 'number' && Number.isFinite(v) ? arNum(v) : '';

  const NUM_FIELDS = ['score', 'jr', 'jt', 'j', 'k', 'page'];  // تُفحص إن وُجدت، والدرجة إلزامية
  const ERR_TYPES = ['j', 'k'];
  const ERR_GRADES = ['radd', 'tanbih'];  // درجة الجلي إن وُجدت؛ والأخطاء القديمة بلا درجة

  // قواعد بنية السجلات، للاستيراد وللقراءة من التخزين: رسالة أول خلل، أو null
  const checkDB = db => {
    if (!isObj(db)) return 'لا سجلات في الملف.';
    for (const [name, sessions] of Object.entries(db)) {
      const who = 'الطالب «' + name + '»';
      if (!Array.isArray(sessions)) return who + ': لا قائمة جلسات.';
      for (let i = 0; i < sessions.length; i++) {
        const s = sessions[i], where = who + '، الجلسة ' + arNum(i + 1) + ': ';
        if (!isObj(s)) return where + 'ليست كائنًا.';
        if (typeof s.score !== 'number') return where + 'الدرجة ليست رقمًا.';
        for (const f of NUM_FIELDS) {
          if (s[f] !== undefined && typeof s[f] !== 'number') return where + 'الحقل ' + f + ' ليس رقمًا.';
        }
        if (typeof s.date !== 'string') return where + 'التاريخ ليس نصًا.';
        if (s.id !== undefined && typeof s.id !== 'string') return where + 'المعرّف ليس نصًا.';
        if (s.at !== undefined && typeof s.at !== 'string') return where + 'الوقت ليس نصًا.';
        if (s.errors !== undefined) {
          if (!Array.isArray(s.errors)) return where + 'الأخطاء ليست قائمة.';
          for (let j = 0; j < s.errors.length; j++) {
            const er = s.errors[j];
            if (!isObj(er) || (er.k !== undefined && typeof er.k !== 'string')) {
              return where + 'الخطأ ' + arNum(j + 1) + ' غير صالح.';
            }
            if (er.t !== undefined && !ERR_TYPES.includes(er.t)) return where + 'نوع الخطأ ' + arNum(j + 1) + ' غير معروف.';
            if (er.g !== undefined && !ERR_GRADES.includes(er.g)) return where + 'درجة الخطأ ' + arNum(j + 1) + ' غير معروفة.';
          }
        }
      }
    }
    return null;
  };

  // نص السجلات المخزّن ← كائن، أو null إن تعذّر تحليله أو فسدت بنيته
  const parseDB = raw => {
    if (raw === null || raw === undefined) return {};
    try {
      const db = JSON.parse(raw);
      return checkDB(db) === null ? db : null;
    } catch (e) {
      return null;
    }
  };

  // الحالة: ok | corrupt (حُفظ النص الخام احتياطيًا) | corrupt_unsaved | unavailable
  // النص الخام يُحفظ في المفتاح الاحتياطي ما دام فارغًا، ولا يُكتب فوقه
  const loadRecords = (storage, key, backupKey) => {
    let raw;
    try { raw = storage.getItem(key); } catch (e) { return { db: {}, status: 'unavailable' }; }
    const db = parseDB(raw);
    if (db) return { db, status: 'ok' };
    let backup = null;
    try { backup = storage.getItem(backupKey); } catch (e) {}
    if (backup === null) {
      try { storage.setItem(backupKey, raw); backup = raw; } catch (e) {}
    }
    return { db: {}, status: backup === raw ? 'corrupt' : 'corrupt_unsaved' };
  };

  // لا يُكتب فوق سجلات تالفة لم يُحفظ نصها في المفتاح الاحتياطي
  const saveRecords = (storage, key, backupKey, db) => {
    let raw, backup;
    try {
      raw = storage.getItem(key);
      backup = storage.getItem(backupKey);
    } catch (e) {
      return { ok: false, reason: 'unavailable' };
    }
    if (raw !== null && !parseDB(raw) && raw !== backup) return { ok: false, reason: 'corrupt' };
    try {
      storage.setItem(key, JSON.stringify(db));
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'write' };
    }
  };

  const pad = n => String(n).padStart(2, '0');
  const buildExport = (db, now) => ({
    name: 'siraj-records_' + now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + '.json',
    text: JSON.stringify({ format: FORMAT, version: VERSION, exportedAt: now.toISOString(), db }, null, 2),
  });

  // يُرفض الملف كله عند أول جزء غير صالح
  const validateImport = text => {
    const fail = error => ({ ok: false, error });
    let data;
    try { data = JSON.parse(text); } catch (e) { return fail('الملف ليس بصيغة JSON صالحة.'); }
    if (!isObj(data) || data.format !== FORMAT) return fail('ليس ملف سجلات من مصحف السراج.');
    if (!Number.isInteger(data.version) || data.version < 1) return fail('رقم صيغة الملف غير صالح.');
    if (data.version > VERSION) {
      return fail('صيغة الملف (' + arNum(data.version) + ') أحدث مما تعرفه هذه النسخة (' + arNum(VERSION) + ').');
    }
    const err = checkDB(data.db);
    if (err) return fail(err);
    return { ok: true, db: data.db };
  };

  // نص ثابت للكائن بمفاتيح مرتبة، للمطابقة الكاملة
  const canonical = v => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']'
    : isObj(v) ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'
    : JSON.stringify(v);

  // الجلسة ذات المعرّف تُعرف به، والقديمة بلا معرّف تُعرف بكامل حقولها
  const sessionKey = s => typeof s.id === 'string' ? 'id:' + s.id : 'full:' + canonical(s);

  // إضافة فقط: لا يُحذف شيء ولا يُستبدل، والجديد يوضع بعد جلسات الطالب الحالية
  const mergeDB = (current, incoming) => {
    const out = new Map(Object.entries(clone(current)));
    const summary = { students: 0, sessions: 0, newStudents: [], existingStudents: [], added: 0, duplicates: 0, conflicts: 0 };
    Object.entries(clone(incoming)).forEach(([name, sessions]) => {
      summary.students++;
      summary.sessions += sessions.length;
      const had = out.has(name);
      const list = had ? out.get(name) : [];
      if (had) summary.existingStudents.push(name);
      const seen = new Map(list.map(s => [sessionKey(s), canonical(s)]));
      sessions.forEach(s => {
        const key = sessionKey(s), full = canonical(s);
        if (seen.has(key)) {
          summary.duplicates++;
          if (seen.get(key) !== full) summary.conflicts++;  // معرّف موجود بمحتوى مختلف: تبقى الموجودة
          return;
        }
        seen.set(key, full);
        list.push(s);
        summary.added++;
      });
      if (!had && list.length) {  // قائمة فارغة لطالب جديد: تُقبل ولا يُضاف بها شيء
        out.set(name, list);
        summary.newStudents.push(name);
      }
    });
    return { db: Object.fromEntries(out), summary };
  };

  return { FORMAT, VERSION, escapeHtml, errClass, numText, parseDB, loadRecords, saveRecords, buildExport, validateImport, sessionKey, mergeDB };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RecordsIO;
