'use strict';

const test = require('node:test');
const assert = require('node:assert');
const R = require('../records_io.js');

// تخزين مزيف بواجهة localStorage؛ failWrite يحاكي امتلاء المساحة
const fakeStorage = (init = {}, failWrite = false) => {
  const m = new Map(Object.entries(init));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (failWrite) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    map: m,
  };
};

const fileText = (db, extra = {}) => JSON.stringify({ format: R.FORMAT, version: R.VERSION, db, ...extra });

const sess = (id, score = 90) => ({
  id, at: '2026-10-27T10:00:00.000Z', date: '٢٧/١٠/٢٠٢٦', score, jr: 1, jt: 1, k: 1, page: 2, surah: 's',
  errors: [{ name: 'n', t: 'j', code: 'jali_chg_haraka', g: 'radd', word: 'w1', k: '2_3', p: '1' }],
});
const legacy = () => ({ date: '١/١/٢٠٢٥', score: 88, j: 2, k: 1, surah: 's' });

test('ملف سليم يُقبل ويرجع السجلات كما هي', () => {
  const db = { 'طالب أ': [sess('a1'), legacy()] };
  const f = R.buildExport(db, new Date(2026, 9, 27));
  const v = R.validateImport(f.text);
  assert.strictEqual(v.ok, true);
  assert.deepStrictEqual(v.db, db);
});

test('اسم الملف يحمل التاريخ وامتداده json', () => {
  assert.strictEqual(R.buildExport({}, new Date(2026, 9, 27)).name, 'siraj-records_2026-10-27.json');
});

test('نص غير JSON يُرفض', () => {
  assert.strictEqual(R.validateImport('{not json').ok, false);
});

test('علامة خاطئة تُرفض', () => {
  assert.strictEqual(R.validateImport(fileText({}, { format: 'other' })).ok, false);
});

test('صيغة أكبر من المعروف تُرفض', () => {
  assert.strictEqual(R.validateImport(fileText({}, { version: R.VERSION + 1 })).ok, false);
});

test('قيمة طالب ليست قائمة تُرفض', () => {
  assert.strictEqual(R.validateImport(fileText({ 'طالب أ': {} })).ok, false);
});

test('درجة ليست رقمًا تُرفض', () => {
  assert.strictEqual(R.validateImport(fileText({ 'طالب أ': [{ ...sess('a1'), score: '90' }] })).ok, false);
});

test('جزء واحد غير صالح يرفض الملف كله', () => {
  const v = R.validateImport(fileText({ 'طالب أ': [sess('a1')], 'طالب ب': [{ date: 'x' }] }));
  assert.strictEqual(v.ok, false);
  assert.ok(v.error.includes('طالب ب'));
});

test('سجل قديم فيه j وبلا أخطاء يُقبل ويُدمج دون تحويل', () => {
  const v = R.validateImport(fileText({ 'طالب أ': [legacy()] }));
  assert.strictEqual(v.ok, true);
  const { db } = R.mergeDB({}, v.db);
  assert.deepStrictEqual(db['طالب أ'], [legacy()]);
});

test('جلسة قديمة بلا سورة وبلا أخطاء تُقبل وتُدمج كما هي', () => {
  const old = { date: '١/١/٢٠٢٥', score: 88, j: 2, k: 1 };
  const v = R.validateImport(fileText({ 'طالب أ': [old] }));
  assert.strictEqual(v.ok, true);
  assert.deepStrictEqual(R.mergeDB({}, v.db).db['طالب أ'], [old]);
});

test('خطأ قديم بلا رمز ولا درجة يُقبل', () => {
  const old = { ...legacy(), errors: [{ name: 'n', t: 'k', word: 'w1', k: '2_3', p: '1' }] };
  assert.strictEqual(R.validateImport(fileText({ 'طالب أ': [old] })).ok, true);
});

test('طالب اسمه نص فارغ يُقبل ويُدمج', () => {
  const v = R.validateImport(fileText({ '': [sess('e1')] }));
  assert.strictEqual(v.ok, true);
  const { db, summary } = R.mergeDB({}, v.db);
  assert.deepStrictEqual(db[''], [sess('e1')]);
  assert.deepStrictEqual(summary.newStudents, ['']);
});

test('الجلسة المكررة لا تُضاف: بالمعرّف وبالمطابقة الكاملة للقديمة', () => {
  const cur = { 'طالب أ': [sess('a1'), legacy()] };
  const { db, summary } = R.mergeDB(cur, { 'طالب أ': [sess('a1'), legacy()] });
  assert.strictEqual(db['طالب أ'].length, 2);
  assert.strictEqual(summary.duplicates, 2);
  assert.strictEqual(summary.added, 0);
});

test('معرّف موجود بمحتوى مختلف: تبقى الموجودة ويُعدّ تعارضًا', () => {
  const cur = { 'طالب أ': [sess('a1', 90)] };
  const { db, summary } = R.mergeDB(cur, { 'طالب أ': [sess('a1', 50)] });
  assert.deepStrictEqual(db['طالب أ'], [sess('a1', 90)]);
  assert.strictEqual(summary.conflicts, 1);
});

test('طالب جديد يُضاف، وجلسات الموجود الجديدة توضع بعد جلساته الحالية', () => {
  const cur = { 'طالب أ': [sess('a1')] };
  const { db, summary } = R.mergeDB(cur, { 'طالب أ': [sess('a2')], 'طالب ب': [sess('b1')] });
  assert.deepStrictEqual(db['طالب أ'].map(s => s.id), ['a1', 'a2']);
  assert.deepStrictEqual(db['طالب ب'].map(s => s.id), ['b1']);
  assert.deepStrictEqual(summary.newStudents, ['طالب ب']);
  assert.deepStrictEqual(summary.existingStudents, ['طالب أ']);
});

test('الدمج لا يغيّر الكائنين الأصليين', () => {
  const cur = { 'طالب أ': [sess('a1')] }, inc = { 'طالب أ': [sess('a2')] };
  const curCopy = JSON.parse(JSON.stringify(cur)), incCopy = JSON.parse(JSON.stringify(inc));
  R.mergeDB(cur, inc);
  assert.deepStrictEqual(cur, curCopy);
  assert.deepStrictEqual(inc, incCopy);
});

test('الدمج لا ينقص جلسات أي طالب', () => {
  const cur = { 'طالب أ': [sess('a1'), legacy()], 'طالب ب': [sess('b1')] };
  const { db } = R.mergeDB(cur, { 'طالب أ': [sess('a1', 10)], 'طالب ج': [sess('c1')] });
  Object.keys(cur).forEach(n => assert.ok(db[n].length >= cur[n].length));
});

test('طالب باسم __proto__ يبقى سجلًا عاديًا', () => {
  const inc = JSON.parse('{"__proto__": [' + JSON.stringify(sess('p1')) + ']}');
  const { db } = R.mergeDB({}, inc);
  assert.ok(Object.prototype.hasOwnProperty.call(db, '__proto__'));
  assert.ok(Array.isArray(db['__proto__']));
});

test('فشل التحليل: النص الخام يُحفظ في المفتاح الاحتياطي وتعود سجلات فارغة بحالة تنبيه', () => {
  const st = fakeStorage({ db: '{broken' });
  const r = R.loadRecords(st, 'db', 'bk');
  assert.strictEqual(r.status, 'corrupt');
  assert.deepStrictEqual(r.db, {});
  assert.strictEqual(st.map.get('bk'), '{broken');
  assert.strictEqual(st.map.get('db'), '{broken');
});

test('المفتاح الاحتياطي لا يُكتب فوقه', () => {
  const st = fakeStorage({ db: '{broken2', bk: '{broken1' });
  const r = R.loadRecords(st, 'db', 'bk');
  assert.strictEqual(r.status, 'corrupt_unsaved');
  assert.strictEqual(st.map.get('bk'), '{broken1');
});

test('لا يُكتب فوق سجلات تالفة لم يُحفظ نصها احتياطيًا', () => {
  const st = fakeStorage({ db: '{broken2', bk: '{broken1' });
  assert.deepStrictEqual(R.saveRecords(st, 'db', 'bk', {}), { ok: false, reason: 'corrupt' });
  assert.strictEqual(st.map.get('db'), '{broken2');
});

test('فشل الكتابة يعود بسبب واضح', () => {
  const st = fakeStorage({}, true);
  assert.deepStrictEqual(R.saveRecords(st, 'db', 'bk', { 'طالب أ': [sess('a1')] }), { ok: false, reason: 'write' });
});

test('الحفظ السليم يكتب السجلات', () => {
  const st = fakeStorage();
  const db = { 'طالب أ': [sess('a1')] };
  assert.deepStrictEqual(R.saveRecords(st, 'db', 'bk', db), { ok: true });
  assert.deepStrictEqual(JSON.parse(st.map.get('db')), db);
});

test('نوع خطأ مصنوع يرفض الملف كله', () => {
  const bad = { ...sess('a2'), errors: [{ name: 'n', t: 'j"><img src=x onerror=alert(1)>', word: 'w1', k: '2_3', p: '1' }] };
  assert.strictEqual(R.validateImport(fileText({ 'طالب أ': [sess('a1'), bad] })).ok, false);
});

test('حقل عددي مصنوع يرفض الملف', () => {
  assert.strictEqual(R.validateImport(fileText({ 'طالب أ': [{ ...sess('a1'), jr: '<b>1</b>' }] })).ok, false);
  assert.strictEqual(R.validateImport(fileText({ 'طالب أ': [{ ...legacy(), page: '2' }] })).ok, false);
});

test('تخزين صالح الصياغة فاسد البنية: النص الخام يُحفظ احتياطيًا وتعود حالة تنبيه', () => {
  const raw = '{"طالب أ":{"score":90}}';
  const st = fakeStorage({ db: raw });
  const r = R.loadRecords(st, 'db', 'bk');
  assert.strictEqual(r.status, 'corrupt');
  assert.deepStrictEqual(r.db, {});
  assert.strictEqual(st.map.get('bk'), raw);
  assert.strictEqual(st.map.get('db'), raw);
});

test('طالب بقائمة جلسات فارغة يُقبل ولا يُضاف به شيء', () => {
  const v = R.validateImport(fileText({ 'طالب أ': [], 'طالب ب': [sess('b1')] }));
  assert.strictEqual(v.ok, true);
  const { db, summary } = R.mergeDB({}, v.db);
  assert.ok(!Object.prototype.hasOwnProperty.call(db, 'طالب أ'));
  assert.deepStrictEqual(summary.newStudents, ['طالب ب']);
  assert.strictEqual(summary.added, 1);
});

test('درجة الخطأ إن وُجدت: radd أو tanbih فقط، والخطأ بلا درجة مقبول', () => {
  const withGrade = g => fileText({ 'طالب أ': [{ ...sess('a1'), errors: [{ name: 'n', t: 'j', g, word: 'w1', k: '2_3', p: '1' }] }] });
  assert.strictEqual(R.validateImport(withGrade('radd')).ok, true);
  assert.strictEqual(R.validateImport(withGrade('tanbih')).ok, true);
  assert.strictEqual(R.validateImport(withGrade('constructor')).ok, false);
  assert.strictEqual(R.validateImport(withGrade('<b>x</b>')).ok, false);
  const noGrade = { ...legacy(), errors: [{ name: 'n', t: 'j', word: 'w1', k: '2_3', p: '1' }] };
  assert.strictEqual(R.validateImport(fileText({ 'طالب أ': [noGrade] })).ok, true);
});

test('اسم صنف الخطأ من قيمتين ثابتتين فقط', () => {
  assert.strictEqual(R.errClass('j'), 'j');
  assert.strictEqual(R.errClass('k'), 'k');
  assert.strictEqual(R.errClass('j" onclick="alert(1)'), 'k');
  assert.strictEqual(R.errClass(undefined), 'k');
});

test('الرقم يُعرض إن كان رقمًا فعلًا فقط', () => {
  assert.strictEqual(R.numText(90), '٩٠');
  assert.strictEqual(R.numText('90<b>'), '');
  assert.strictEqual(R.numText(undefined), '');
  assert.strictEqual(R.numText(NaN), '');
});

test('المعالجة تحوّل علامات الصفحة إلى نص عادي', () => {
  assert.strictEqual(R.escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.strictEqual(R.escapeHtml("a & b's"), 'a &amp; b&#39;s');
  assert.strictEqual(R.escapeHtml(undefined), '');
});
