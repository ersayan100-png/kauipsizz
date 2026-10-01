/* ===== QAUIPSIZ — логика сайта =====
   Все данные хранятся в браузере (localStorage). Сервера нет — это учебный вариант. */

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
};

const TABS = ['home', 'history', 'assistant', 'profile', 'check', 'info'];
const PRIVATE = ['home', 'check', 'history', 'assistant', 'profile', 'info'];
let currentFile = null;

/* ---------- Утилиты ---------- */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2500);
}

async function hash(s) {
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  return btoa(unescape(encodeURIComponent(s)));
}

function currentUser() {
  const email = store.get('qz_session', null);
  return email ? store.get('qz_users', []).find((u) => u.email === email) : null;
}

/* ---------- Навигация ---------- */
function show(name) {
  if (PRIVATE.includes(name) && !currentUser()) name = 'welcome';

  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $('s-' + name).classList.add('active');

  const withTabs = PRIVATE.includes(name);
  $('tabbar').classList.toggle('show', withTabs);
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));

  if (name === 'home') renderHome();
  if (name === 'history') renderHistory();
  if (name === 'profile') renderProfile();
  window.scrollTo(0, 0);
}

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) { e.preventDefault(); show(go.dataset.go); return; }

  const tab = e.target.closest('[data-tab]');
  if (tab) { show(tab.dataset.tab); return; }

  const info = e.target.closest('[data-info]');
  if (info) { openInfo(info.dataset.info); return; }

  const act = e.target.closest('[data-action]');
  if (act && act.dataset.action === 'screenshot') {
    show('check');
    $('fileInput').click();
  }
});

/* ---------- Регистрация ---------- */
$('regForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('regName').value.trim();
  const email = $('regEmail').value.trim().toLowerCase();
  const pass = $('regPass').value;
  const pass2 = $('regPass2').value;
  const err = $('regError');

  if (name.length < 2) return (err.textContent = 'Атыңызды жазыңыз (кемінде 2 әріп).');
  if (!/^\S+@\S+\.\S+$/.test(email)) return (err.textContent = 'Email дұрыс емес.');
  if (pass.length < 6) return (err.textContent = 'Құпиясөз кемінде 6 таңба болуы керек.');
  if (pass !== pass2) return (err.textContent = 'Құпиясөздер сәйкес келмейді.');

  const users = store.get('qz_users', []);
  if (users.some((u) => u.email === email)) return (err.textContent = 'Бұл email тіркелген. «Кіру» батырмасын басыңыз.');

  users.push({ name, email, pass: await hash(pass) });
  store.set('qz_users', users);
  store.set('qz_session', email);
  err.textContent = '';
  e.target.reset();
  toast('Тіркелу сәтті өтті! 🎉');
  show('home');
});

/* ---------- Кіру / Шығу ---------- */
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('loginEmail').value.trim().toLowerCase();
  const pass = await hash($('loginPass').value);
  const user = store.get('qz_users', []).find((u) => u.email === email && u.pass === pass);
  const err = $('loginError');

  if (!user) return (err.textContent = 'Email немесе құпиясөз қате.');
  store.set('qz_session', email);
  err.textContent = '';
  e.target.reset();
  show('home');
});

$('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('qz_session');
  toast('Сіз аккаунттан шықтыңыз');
  show('welcome');
});

/* ---------- Тексеру (анализ) ---------- */
const RULES = [
  { re: /https?:\/\/|www\.|bit\.ly|t\.me\//i, w: 2, why: 'Мәтінде сілтеме бар' },
  { re: /ұтып|ұтыс|сыйлық|выиграл|выигрыш|приз|подарок/i, w: 3, why: 'Ұтыс немесе сыйлық туралы уәде' },
  { re: /срочно|немедленно|заблокир|шұғыл|тез арада|бұғатталады/i, w: 2, why: 'Асықтырады, қорқытады' },
  { re: /смс|sms|cvv|пин|pin|пароль|құпиясөз|карта нөмір|номер карты|код/i, w: 3, why: 'Құпия деректерді сұрайды' },
  { re: /\d[\d\s]*\s?(тг|₸|тенге|теңге)/i, w: 1, why: 'Ақша сомасы аталған' },
  { re: /аудар|перевед|перевод|төле|оплат/i, w: 1, why: 'Ақша аударуды сұрайды' }
];

function analyze(text) {
  let score = 0;
  const why = [];
  RULES.forEach((r) => { if (r.re.test(text)) { score += r.w; why.push(r.why); } });

  if (score >= 4) return { level: 'high', label: 'Жоғары қауіп', icon: '!', why,
    advice: 'Сілтемені ашпаңыз және жеке мәліметтеріңізді бермеңіз. Бұл — фишинг болуы мүмкін.' };
  if (score >= 2) return { level: 'mid', label: 'Орташа қауіп', icon: '!', why,
    advice: 'Сақ болыңыз. Жіберушіні ресми нөмір немесе сайт арқылы тексеріңіз.' };
  return { level: 'low', label: 'Қауіп аз', icon: '✓', why,
    advice: 'Айқын қауіп белгілері табылмады, бірақ күдік болса, жіберушімен басқа жолмен байланысыңыз.' };
}

function resultCard(item, withWhy) {
  const whyHtml = withWhy && item.why.length
    ? `<ul class="why">${item.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '';
  return `
    <div class="res lvl-${item.level}">
      <div class="res-head">
        <div class="res-icon">${item.icon}</div>
        <div>
          <b>${item.level === 'high' ? 'Күмәнді хабарлама' : 'Тексеру нәтижесі'}</b><br>
          <span class="muted">${esc(item.date)}</span><br>
          <span class="badge">${item.label}</span>
        </div>
      </div>
      <p class="quote">«${esc(item.text.length > 140 ? item.text.slice(0, 140) + '…' : item.text)}»</p>
      ${whyHtml}
      <div class="tip" style="margin-top:10px"><b>💡 Ұсыныс</b><br>${item.advice}</div>
    </div>`;
}

function nowText() {
  return new Date().toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

$('analyzeBtn').addEventListener('click', () => {
  const text = $('checkText').value.trim();
  if (!text) {
    return toast(currentFile ? 'Скриншоттағы мәтінді жазып жіберіңіз' : 'Алдымен мәтін жазыңыз');
  }
  const item = { ...analyze(text), text, date: nowText(), id: Date.now() };
  const user = currentUser();
  const key = 'qz_hist_' + user.email;
  store.set(key, [item, ...store.get(key, [])].slice(0, 50));
  $('result').innerHTML = resultCard(item, true);
  $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

/* Скриншот */
$('pickFile').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  currentFile = f;
  $('previewImg').src = URL.createObjectURL(f);
  $('preview').hidden = false;
  toast('Скриншот қосылды. Мәтінін жоғарыға жазыңыз');
});
$('removeFile').addEventListener('click', () => {
  currentFile = null;
  $('fileInput').value = '';
  $('preview').hidden = true;
});

/* ---------- Басты ---------- */
function renderHome() {
  const u = currentUser();
  if (!u) return;
  $('userName').textContent = u.name;
  const hist = store.get('qz_hist_' + u.email, []);
  $('lastAnalysis').innerHTML = hist.length
    ? resultCard(hist[0], false)
    : '<div class="empty">Әзірге тексеру жоқ.<br>«Бастау» батырмасын басыңыз.</div>';
}

/* ---------- Тарих ---------- */
function renderHistory() {
  const hist = store.get('qz_hist_' + currentUser().email, []);
  $('historyList').innerHTML = hist.length
    ? hist.map((h) => resultCard(h, false)).join('')
    : '<div class="empty" style="margin-top:14px">Тарих бос.</div>';
  $('clearHistory').style.display = hist.length ? 'block' : 'none';
}

$('clearHistory').addEventListener('click', () => {
  if (confirm('Тарихты толық тазалайсыз ба?')) {
    store.set('qz_hist_' + currentUser().email, []);
    renderHistory();
    toast('Тарих тазаланды');
  }
});

/* ---------- Профиль ---------- */
function renderProfile() {
  const u = currentUser();
  $('pName').textContent = u.name;
  $('pEmail').textContent = u.email;
  $('pCount').textContent = store.get('qz_hist_' + u.email, []).length;
}

/* ---------- Ақпарат экраны ---------- */
const INFO = {
  examples: {
    title: 'Жағдайлар мысалдары',
    items: [
      ['«Сіз ұттыңыз!»', 'Белгісіз нөмірден сыйлық немесе ақша ұтқаныңыз туралы хабарлама келеді, сілтеме беріледі. Бұл — алаяқтық.'],
      ['«Картаңыз бұғатталды»', 'Банк атынан келген хабарлама SMS-кодты сұрайды. Банк ешқашан кодты сұрамайды.'],
      ['«Туысыңыз қиын жағдайда»', 'Танымайтын нөмірден ақша аударуды сұрайды. Алдымен туысыңызға өзі қоңырау шалыңыз.'],
      ['Жалған жұмыс ұсынысы', 'Жеңіл табыс, алдын ала төлем талап етеді. Нақты жұмыс беруші ақша сұрамайды.']
    ]
  },
  tips: {
    title: 'Қауіпсіздік кеңестері',
    items: [
      ['Кодты ешкімге айтпаңыз', 'SMS-код, CVV және PIN — тек сіздікі.'],
      ['Сілтемені тексеріңіз', 'Белгісіз сілтемені ашпай тұрып, мекенжайын мұқият қараңыз.'],
      ['Күшті құпиясөз', 'Кемінде 10 таңба: әріп, сан және символ. Әр сайтқа бөлек құпиясөз қолданыңыз.'],
      ['Екі сатылы кіру', 'Маңызды аккаунттарда қосымша растауды қосыңыз.'],
      ['Асықпаңыз', 'Алаяқтар әрдайым асықтырады. Тоқтап, ойланып, басқа адамнан сұраңыз.']
    ]
  },
  knowledge: {
    title: 'Білім орталығы',
    items: [
      ['Фишинг деген не?', 'Жалған хат немесе сайт арқылы пароль, карта деректерін ұрлау тәсілі.'],
      ['Әлеуметтік инженерия', 'Алаяқ адамның сеніміне кіріп, өзіне керекті ақпаратты өзіне айтқызады.'],
      ['Қауіпті Wi-Fi', 'Ашық желіде банк қосымшасына кірмеңіз.'],
      ['Алаяқтыққа ұшырасаңыз', 'Банкке хабарлаңыз, картаны бұғаттаңыз және полицияға (102) өтініш беріңіз.']
    ]
  }
};

function openInfo(key) {
  const d = INFO[key];
  $('infoTitle').textContent = d.title;
  $('infoBody').innerHTML = d.items
    .map(([t, p]) => `<div class="info-card"><h3>${esc(t)}</h3><p>${esc(p)}</p></div>`).join('');
  show('info');
}

/* ---------- AI көмекші (қарапайым ережелер бойынша) ---------- */
const ANSWERS = [
  { re: /фишинг/i, a: 'Фишинг — жалған хабарлама, хат немесе сайт арқылы пароль мен карта деректерін ұрлау.\nБелгілері: асықтыру, күдікті сілтеме, құпия деректерді сұрау.' },
  { re: /құпиясөз|пароль/i, a: 'Құпиясөзді қорғау үшін:\n• кемінде 10 таңба қолданыңыз\n• әр сайтқа бөлек құпиясөз қойыңыз\n• ешкімге айтпаңыз\n• екі сатылы растауды қосыңыз' },
  { re: /смс|sms|код/i, a: 'SMS-кодты ешкімге айтпаңыз, тіпті «банк қызметкері» болса да. Банк кодты ешқашан сұрамайды. Қоңырауды аяқтап, банктің ресми нөміріне өзіңіз хабарласыңыз.' },
  { re: /сілтеме|ссылк/i, a: 'Жалған сілтемені тану үшін:\n• мекенжайдағы қателерді қараңыз (kaspi-kz, ka5pi)\n• қысқартылған сілтемелерден сақ болыңыз\n• сайттың https және ресми екенін тексеріңіз' },
  { re: /сәлем|салем|привет/i, a: 'Сәлем! Мен QAUIPSIZ көмекшісімін. Фишинг, құпиясөз немесе күдікті хабарлама туралы сұраңыз.' }
];

function addMsg(text, who) {
  const m = document.createElement('div');
  m.className = 'msg ' + who;
  m.textContent = text;
  $('chat').appendChild(m);
  m.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function ask(q) {
  addMsg(q, 'me');
  const hit = ANSWERS.find((r) => r.re.test(q));
  setTimeout(() => addMsg(hit ? hit.a : 'Мен бұл сұраққа дәл жауап бере алмаймын. Күдікті хабарламаны «Жағдайды тексеру» бөлімінде тексеріп көріңіз.', 'bot'), 400);
}

$('chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('chatInput').value.trim();
  if (!q) return;
  $('chatInput').value = '';
  ask(q);
});
$('chips').addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') ask(e.target.textContent); });

/* ---------- Запуск ---------- */
show(currentUser() ? 'home' : 'welcome');