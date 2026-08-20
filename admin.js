import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import { getFirestore, collection, getDocs, doc, setDoc, addDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);

const state = { branches: [], subjects: [], lessons: [], quizzes: [] };
const pageTitles = {
  dashboard: 'الرئيسية', structure: 'الهيكل الدراسي', manual: 'إضافة اختبار يدوي',
  import: 'استيراد JSON', quizzes: 'الاختبارات'
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
}
function status(id, message, good = false) {
  const el = $(id); if (!el) return;
  el.textContent = message;
  el.className = `statusline ${good ? 'good' : 'bad'}`;
}
function errorText(error) {
  const code = error?.code || '';
  const messages = {
    'permission-denied': 'تم رفض العملية من Firestore Rules. تأكد أن القواعد منشورة وأنك داخل بحساب الأدمن الصحيح.',
    'unauthenticated': 'انتهت جلسة تسجيل الدخول. سجل الدخول مرة أخرى.',
    'already-exists': 'هذا المعرّف موجود مسبقًا.',
    'invalid-argument': 'البيانات المرسلة غير صحيحة.'
  };
  return messages[code] || error?.message || 'حدث خطأ غير معروف.';
}
function requireText(...values) { return values.every(v => String(v ?? '').trim()); }
function cleanId(value) { return String(value ?? '').trim().replace(/\s+/g, '-').toLowerCase(); }

async function loadData() {
  const names = ['branches', 'subjects', 'lessons', 'quizzes'];
  const results = await Promise.all(names.map(name => getDocs(collection(db, name))));
  names.forEach((name, i) => {
    state[name] = results[i].docs.map(d => ({ id: d.id, ...d.data() }));
  });
  updateCounts();
  populateSelects();
}
function updateCounts() {
  $('countBranches').textContent = state.branches.length;
  $('countSubjects').textContent = state.subjects.length;
  $('countLessons').textContent = state.lessons.length;
  $('countQuizzes').textContent = state.quizzes.length;
}
function fillSelect(id, items, placeholder, formatter = x => x.name) {
  const select = $(id); if (!select) return;
  select.innerHTML = '';
  const first = document.createElement('option'); first.value = ''; first.textContent = placeholder; select.append(first);
  items.forEach(item => { const o = document.createElement('option'); o.value = item.id; o.textContent = formatter(item); select.append(o); });
  select.disabled = items.length === 0;
}
function populateSelects() {
  fillSelect('subjectBranch', state.branches, 'اختر الفرع');
  fillSelect('lessonSubject', state.subjects, 'اختر المادة', s => `${s.name} · ${branchName(s.branchId)}`);
  fillSelect('quizLesson', state.lessons, 'اختر الدرس', l => `${l.name} · ${subjectName(l.subjectId)}`);
}
const branchName = id => state.branches.find(x => x.id === id)?.name || id || 'غير معروف';
const subjectName = id => state.subjects.find(x => x.id === id)?.name || id || 'غير معروف';
const lessonName = id => state.lessons.find(x => x.id === id)?.name || id || 'غير معروف';

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  $(`page-${name}`).classList.remove('hidden');
  $('pageTitle').textContent = pageTitles[name];
  document.querySelectorAll('[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === name));
  if (name === 'structure') renderStructure();
  if (name === 'manual') populateSelects();
  if (name === 'quizzes') renderQuizzes();
}

document.querySelectorAll('[data-page]').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));

function renderStructure() {
  populateSelects();
  $('branchList').innerHTML = state.branches.length ? state.branches.map(b => `<div class="item"><div><strong>${escapeHtml(b.name)}</strong><small>${escapeHtml(b.id)}</small></div><button class="btn danger" data-delete="branches" data-id="${escapeHtml(b.id)}">حذف</button></div>`).join('') : '<div class="empty">لا توجد فروع.</div>';
  $('subjectList').innerHTML = state.subjects.length ? state.subjects.map(s => `<div class="item"><div><strong>${escapeHtml(s.name)}</strong><small>${escapeHtml(branchName(s.branchId))} · ${escapeHtml(s.id)}</small></div><button class="btn danger" data-delete="subjects" data-id="${escapeHtml(s.id)}">حذف</button></div>`).join('') : '<div class="empty">لا توجد مواد.</div>';
  $('lessonList').innerHTML = state.lessons.length ? state.lessons.map(l => `<div class="item"><div><strong>${escapeHtml(l.name)}</strong><small>${escapeHtml(subjectName(l.subjectId))} · ${escapeHtml(branchName(l.branchId))} · ${escapeHtml(l.id)}</small></div><button class="btn danger" data-delete="lessons" data-id="${escapeHtml(l.id)}">حذف</button></div>`).join('') : '<div class="empty">لا توجد دروس.</div>';
  document.querySelectorAll('[data-delete]').forEach(btn => btn.onclick = () => removeEntity(btn.dataset.delete, btn.dataset.id));
}

async function removeEntity(collectionName, id) {
  if (!confirm('تأكيد الحذف؟')) return;
  try {
    await deleteDoc(doc(db, collectionName, id));
    await loadData(); renderStructure(); status('structureStatus', 'تم الحذف بنجاح.', true);
  } catch (e) { status('structureStatus', errorText(e)); }
}

async function addBranch() {
  const name = $('branchName').value.trim();
  const id = cleanId($('branchId').value || name);
  if (!name) return status('structureStatus', 'اكتب اسم الفرع.');
  if (!id) return status('structureStatus', 'اكتب معرّفًا صالحًا.');
  if (state.branches.some(x => x.id === id)) return status('structureStatus', 'هذا الفرع موجود مسبقًا.');
  try {
    await setDoc(doc(db, 'branches', id), { name, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    $('branchName').value = ''; $('branchId').value = '';
    await loadData(); renderStructure(); status('structureStatus', 'تمت إضافة الفرع.', true);
  } catch (e) { status('structureStatus', errorText(e)); }
}
async function addSubject() {
  const name = $('subjectName').value.trim();
  const id = cleanId($('subjectId').value || name);
  const branchId = $('subjectBranch').value;
  if (!requireText(name, id, branchId)) return status('structureStatus', 'أكمل اسم المادة ومعرّفها واختر الفرع.');
  if (state.subjects.some(x => x.id === id)) return status('structureStatus', 'هذا المعرّف مستخدم لمادة أخرى.');
  if (!state.branches.some(x => x.id === branchId)) return status('structureStatus', 'الفرع المحدد غير موجود.');
  try {
    await setDoc(doc(db, 'subjects', id), { name, branchId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    $('subjectName').value = ''; $('subjectId').value = '';
    await loadData(); renderStructure(); status('structureStatus', 'تمت إضافة المادة وربطها بالفرع.', true);
  } catch (e) { status('structureStatus', errorText(e)); }
}
async function addLesson() {
  const name = $('lessonName').value.trim();
  const id = cleanId($('lessonId').value || name);
  const subjectId = $('lessonSubject').value;
  const subject = state.subjects.find(x => x.id === subjectId);
  if (!requireText(name, id, subjectId)) return status('structureStatus', 'أكمل اسم الدرس ومعرّفه واختر المادة.');
  if (!subject) return status('structureStatus', 'المادة المحددة غير موجودة.');
  if (state.lessons.some(x => x.id === id)) return status('structureStatus', 'هذا المعرّف مستخدم لدرس آخر.');
  try {
    await setDoc(doc(db, 'lessons', id), { name, subjectId, branchId: subject.branchId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    $('lessonName').value = ''; $('lessonId').value = '';
    await loadData(); renderStructure(); status('structureStatus', 'تمت إضافة الدرس وربطه بالمادة والفرع تلقائيًا.', true);
  } catch (e) { status('structureStatus', errorText(e)); }
}
$('addBranch').onclick = addBranch; $('addSubject').onclick = addSubject; $('addLesson').onclick = addLesson;

let questionCounter = 0;
function addQuestion() {
  questionCounter += 1;
  const n = questionCounter;
  const el = document.createElement('article'); el.className = 'question-editor'; el.dataset.q = n;
  el.innerHTML = `<div class="question-head"><strong>السؤال ${n}</strong><button type="button" class="btn danger remove-q">حذف</button></div>
  <div class="field"><label>السؤال</label><textarea class="q-text" placeholder="اكتب السؤال"></textarea></div>
  <div class="options-grid">${[0,1,2,3].map(i => `<div class="option-edit"><input class="q-opt" placeholder="الخيار ${i+1}"><label class="check"><input type="radio" name="correct-${n}" value="${i}"> صحيح</label></div>`).join('')}</div>
  <div class="field"><label>الشرح (اختياري)</label><input class="q-exp" placeholder="شرح الإجابة الصحيحة"></div>`;
  el.querySelector('.remove-q').onclick = () => el.remove(); $('questions').append(el);
}
$('addQuestion').onclick = addQuestion;
function collectQuestions() {
  return [...document.querySelectorAll('.question-editor')].map(el => {
    const options = [...el.querySelectorAll('.q-opt')].map(x => x.value.trim());
    const correct = el.querySelector('input[type="radio"]:checked');
    return { text: el.querySelector('.q-text').value.trim(), options, correctIndex: correct ? Number(correct.value) : -1, explanation: el.querySelector('.q-exp').value.trim() };
  });
}
async function saveQuiz() {
  const lessonId = $('quizLesson').value, title = $('quizTitle').value.trim();
  const duration = Number($('quizDuration').value);
  const lesson = state.lessons.find(x => x.id === lessonId);
  const questions = collectQuestions();
  if (!lesson || !title || !Number.isFinite(duration) || duration < 1) return status('quizStatus', 'أكمل الدرس والعنوان والمدة.');
  if (!questions.length) return status('quizStatus', 'أضف سؤالًا واحدًا على الأقل.');
  const invalid = questions.findIndex(q => !q.text || q.options.length !== 4 || q.options.some(x => !x) || q.correctIndex < 0 || q.correctIndex > 3);
  if (invalid !== -1) return status('quizStatus', `السؤال ${invalid + 1} غير مكتمل. اكتب 4 خيارات وحدد الإجابة الصحيحة.`);
  try {
    await addDoc(collection(db, 'quizzes'), { title, duration, questions, lessonId, subjectId: lesson.subjectId, branchId: lesson.branchId, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: auth.currentUser.email });
    $('quizTitle').value = ''; $('quizDuration').value = '10'; $('questions').innerHTML = ''; questionCounter = 0;
    await loadData(); status('quizStatus', 'تم حفظ الاختبار بنجاح.', true);
  } catch (e) { status('quizStatus', errorText(e)); }
}
$('saveQuiz').onclick = saveQuiz;

function renderQuizzes() {
  const box = $('quizList');
  if (!state.quizzes.length) return box.innerHTML = '<div class="empty">لا توجد اختبارات.</div>';
  box.innerHTML = state.quizzes.map(q => `<div class="item"><div><strong>${escapeHtml(q.title)}</strong><small>${escapeHtml(branchName(q.branchId))} · ${escapeHtml(subjectName(q.subjectId))} · ${escapeHtml(lessonName(q.lessonId))} · ${q.questions?.length || 0} سؤال</small></div><button class="btn danger" data-q-delete="${escapeHtml(q.id)}">حذف</button></div>`).join('');
  box.querySelectorAll('[data-q-delete]').forEach(btn => btn.onclick = async () => { if (!confirm('حذف الاختبار؟')) return; try { await deleteDoc(doc(db, 'quizzes', btn.dataset.qDelete)); await loadData(); renderQuizzes(); } catch (e) { alert(errorText(e)); } });
}
$('refresh').onclick = async () => { try { await loadData(); renderQuizzes(); } catch (e) { alert(errorText(e)); } };

function validateTest(test) {
  const b = test.branch, s = test.subject, l = test.lesson;
  if (!b?.id || !b?.name || !s?.id || !s?.name || !l?.id || !l?.name || !test.title || !Array.isArray(test.questions) || !test.questions.length) throw new Error('كل اختبار يجب أن يحتوي على branch و subject و lesson و title و questions.');
  if (test.questions.some(q => !q?.text || !Array.isArray(q.options) || q.options.length !== 4 || q.options.some(x => !String(x).trim()) || Number(q.correctIndex) < 0 || Number(q.correctIndex) > 3)) throw new Error(`في الاختبار "${test.title}" يوجد سؤال غير صالح.`);
}
$('validateJson').onclick = () => { try { const parsed = JSON.parse($('jsonInput').value); const tests = Array.isArray(parsed) ? parsed : parsed.tests; if (!Array.isArray(tests) || !tests.length) throw new Error('ضع مصفوفة tests تحتوي على اختبار واحد على الأقل.'); tests.forEach(validateTest); status('jsonStatus', `JSON صالح · ${tests.length} اختبار.`, true); } catch (e) { status('jsonStatus', `JSON غير صالح: ${e.message}`); } };
$('importJson').onclick = async () => {
  try {
    const parsed = JSON.parse($('jsonInput').value); const tests = Array.isArray(parsed) ? parsed : parsed.tests;
    if (!Array.isArray(tests) || !tests.length) throw new Error('لا توجد اختبارات للاستيراد.'); tests.forEach(validateTest);
    for (const test of tests) {
      const { branch: b, subject: s, lesson: l } = test;
      await setDoc(doc(db, 'branches', b.id), { name: b.name, updatedAt: serverTimestamp() }, { merge: true });
      await setDoc(doc(db, 'subjects', s.id), { name: s.name, branchId: b.id, updatedAt: serverTimestamp() }, { merge: true });
      await setDoc(doc(db, 'lessons', l.id), { name: l.name, subjectId: s.id, branchId: b.id, updatedAt: serverTimestamp() }, { merge: true });
      await addDoc(collection(db, 'quizzes'), { title: test.title, duration: Number(test.duration) || 10, questions: test.questions, lessonId: l.id, subjectId: s.id, branchId: b.id, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: auth.currentUser.email });
    }
    await loadData(); status('jsonStatus', `تم استيراد ${tests.length} اختبار بنجاح.`, true);
  } catch (e) { status('jsonStatus', `فشل الاستيراد: ${errorText(e)}`); }
};

$('loginForm').onsubmit = async (event) => {
  event.preventDefault(); const button = $('loginBtn'); button.disabled = true; button.textContent = 'جارٍ الدخول…';
  try { await signInWithEmailAndPassword(auth, $('email').value.trim(), $('password').value); $('authStatus').textContent = ''; }
  catch (e) { status('authStatus', errorText(e)); }
  finally { button.disabled = false; button.textContent = 'تسجيل الدخول'; }
};
$('logout').onclick = $('logoutMobile').onclick = () => signOut(auth);

onAuthStateChanged(auth, async (user) => {
  if (!user) { $('authScreen').classList.remove('hidden'); $('app').classList.add('hidden'); return; }
  $('authScreen').classList.add('hidden'); $('app').classList.remove('hidden'); $('adminEmail').textContent = user.email;
  try { await loadData(); showPage('dashboard'); }
  catch (e) { $('adminEmail').textContent = `${user.email} · ${errorText(e)}`; alert(errorText(e)); }
});