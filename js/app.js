/* SASP — terminal de suivi des effectifs. Application d'une page, sans framework.
   Navigation par l'adresse (#/effectif, #/agent/12…). Les données sont chargées une fois puis tenues à jour localement. */

const api = createApi();
const CFG = window.SASP_CONFIG || {};
const root = document.getElementById('app');

const S = {
  uid: null, session: null, me: null, role: null, perms: new Set(),
  roles: [], profiles: [], agents: [], grades: [], formations_cat: [], sanction_types: [], listes: [],
  carriere: [], formations: [], appreciations: [], sanctions: [],
  ui: { effectif: { q: '', jur: '', statut: '', libres: true }, journal: {}, histo: 'tout', paramTab: 'grades', adminTab: 'comptes' },
};
const TABLES = ['grades', 'formations_cat', 'sanction_types', 'listes', 'agents', 'carriere', 'formations', 'appreciations', 'sanctions'];
const STATUTS = ['Actif', 'Congé (LOA)', 'Suspendu', 'Démission', 'Renvoyé'];
const EVENTS = ["Entrée à l'académie", "Sortie d'académie", 'Promotion', 'Rétrogradation', 'Mutation de division', 'Changement de référent', 'Congé', 'Retour de congé', 'Départ'];
const GRADE_EVENTS = EVENTS.slice(0, 4);
const RESULTATS = ['Validée', 'Échouée', 'En cours'];
const GROUP_COLORS = { 'command staff': 'var(--g-command)', 'supervisory staff': 'var(--g-super)', detectives: 'var(--g-det)', application: 'var(--g-app)', academy: 'var(--g-acad)' };

/* ================================================================== outils */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dayNum = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
const daysBetween = (a, b) => Math.round(dayNum(b) - dayNum(a));
const addDays = (s, n) => new Date((dayNum(s) + n) * 864e5).toISOString().slice(0, 10);
const fmtD = (s) => { if (!s) return '—'; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const initials = (n) => String(n || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
const can = (p) => !!S.role && (S.role.est_admin || S.perms.has(p));
const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.id > a.id ? 1 : -1);
const agentById = (id) => S.agents.find((a) => a.id === id);
const gradeOf = (name) => S.grades.find((g) => norm(g.nom) === norm(name));
const groupColor = (g) => GROUP_COLORS[norm(g)] || 'var(--muted)';
const listeOf = (kind) => S.listes.filter((l) => l.kind === kind).sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom)).map((l) => l.nom);
const agentNames = () => [...S.agents].sort((a, b) => a.nom.localeCompare(b.nom)).map((a) => a.nom);
const myAgent = () => (S.me && S.me.agent_id ? agentById(S.me.agent_id) : null);
const sortedAgents = () => [...S.agents].sort((a, b) => ((gradeOf(b.grade)?.ordre ?? -1) - (gradeOf(a.grade)?.ordre ?? -1)) || a.nom.localeCompare(b.nom));

function sanctionStatus(s) {
  if (s.levee) return 'Levée';
  if (!s.fin) return 'Active';
  return s.fin >= today() ? 'Active' : 'Expirée';
}

const ICONS = {
  dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.7.8 2.8 2.5 3 5.2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c2 2 10 2 12 0v-5"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
  alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5v.5"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  shield: '<path d="M12 3l8 3v6c0 4.6-3.4 8-8 9-4.6-1-8-4.4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
};
const icon = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const BADGE = '<svg width="42" height="42" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="#1b3350" stroke="#3b5f88"/><path d="M20 8.5l9 3.6v7.2c0 6-4 9.6-9 11.7-5-2.1-9-5.7-9-11.7v-7.2z" fill="none" stroke="#d9b45a" stroke-width="1.6"/><path d="M20 14.8l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#d9b45a"/></svg>';

let toastTimer;
function toast(msg, err) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}
async function attempt(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; } catch (e) { toast(e.message || 'Une erreur est survenue.', true); throw e; }
}

/* ================================================================== calculs (ex-« Suivi agents ») */
function metrics(a) {
  const id = a.id, t = today();
  const car = S.carriere.filter((x) => x.agent_id === id);
  const fo = S.formations.filter((x) => x.agent_id === id);
  const ap = S.appreciations.filter((x) => x.agent_id === id);
  const sa = S.sanctions.filter((x) => x.agent_id === id);
  const gradeDate = car.filter((x) => GRADE_EVENTS.includes(x.type)).map((x) => x.date).sort().pop() || a.entree_academie || null;
  const jours = gradeDate ? Math.max(0, daysBetween(gradeDate, t)) : null;
  const grade = gradeOf(a.grade);
  const suivant = grade?.suivant || null;
  const ptsDepuis = ap.filter((x) => !gradeDate || x.date >= gradeDate).reduce((s, x) => s + Number(x.points || 0), 0);
  const lim = addDays(t, -30);
  const pts30 = ap.filter((x) => x.date >= lim).reduce((s, x) => s + Number(x.points || 0), 0);
  const req = suivant ? S.formations_cat.filter((f) => norm(f.requise_pour) === norm(suivant)) : [];
  const done = new Set(fo.filter((x) => x.resultat === 'Validée').map((x) => norm(x.formation)));
  const reqDone = req.filter((f) => done.has(norm(f.nom))).length;
  const actives = sa.filter((x) => sanctionStatus(x) === 'Active');
  const last = [...car, ...fo, ...ap, ...sa].map((x) => x.date).sort().pop() || null;

  let elig;
  if (!grade) elig = { state: 'none', label: 'Grade absent de la grille', reasons: [] };
  else if (!suivant) elig = { state: 'max', label: 'Grade maximal', reasons: [] };
  else {
    const reasons = [];
    if (a.statut !== 'Actif') reasons.push(`statut ${a.statut}`);
    if (jours === null || jours < grade.jours_min) reasons.push(`ancienneté ${jours ?? 0}/${grade.jours_min} j`);
    if (ptsDepuis < grade.points_min) reasons.push(`points ${ptsDepuis}/${grade.points_min}`);
    if (reqDone < req.length) reasons.push(`formations ${reqDone}/${req.length}`);
    if (actives.length) reasons.push(actives.length > 1 ? `${actives.length} sanctions actives` : 'sanction active');
    elig = reasons.length ? { state: 'no', label: `Pas encore éligible à ${suivant}`, reasons } : { state: 'yes', label: `Éligible à ${suivant}`, reasons };
  }
  return { gradeDate, jours, grade, suivant, ptsDepuis, pts30, req, reqDone, done, actives, last, elig };
}

function eligChip(m) {
  if (m.elig.state === 'yes') return '<span class="chip good">Éligible</span>';
  if (m.elig.state === 'max') return '<span class="chip plain">Grade max</span>';
  if (m.elig.state === 'none') return '<span class="chip plain">—</span>';
  return `<span class="chip warn" title="${esc(m.elig.reasons.join(', '))}">${m.elig.reasons.length} critère${m.elig.reasons.length > 1 ? 's' : ''} manquant${m.elig.reasons.length > 1 ? 's' : ''}</span>`;
}
function statutChip(s) {
  const cls = { Actif: 'good', 'Congé (LOA)': 'warn', Suspendu: 'bad' }[s] || 'plain';
  return `<span class="chip ${cls}">${esc(s || '—')}</span>`;
}
function sanctionChip(s) {
  const st = sanctionStatus(s);
  return `<span class="chip ${{ Active: 'bad', Levée: 'good', Expirée: 'plain' }[st]}">${st}</span>`;
}
const pointsChip = (p) => `<span class="chip plain ${p > 0 ? 'good' : p < 0 ? 'bad' : ''}">${p > 0 ? '+' : ''}${p}</span>`;
const agentLink = (id) => {
  const a = agentById(id);
  if (!a) return '<span class="muted">Agent supprimé</span>';
  return can('voir_suivi') || id === S.me?.agent_id ? `<a href="#/agent/${a.id}">${esc(a.nom)}</a>` : esc(a.nom);
};

/* ================================================================== chargement */
async function refreshAll() {
  if (!S.session) { Object.assign(S, { me: null, role: null, perms: new Set() }); return; }
  S.me = await api.me();
  if (!S.me) return;
  S.roles = await api.list('roles');
  S.role = S.roles.find((r) => r.id === S.me.role_id) || null;
  S.perms = new Set(S.role?.permissions || []);
  if (S.me.statut !== 'actif') return;
  const lists = TABLES.concat(can('gerer_utilisateurs') ? ['profiles'] : []);
  const res = await Promise.all(lists.map((t) => api.list(t).catch(() => [])));
  lists.forEach((t, i) => { S[t] = res[i]; });
  S.grades.sort((a, b) => a.ordre - b.ordre);
}

/* ================================================================== routes */
const NAV = [
  { sec: 'Suivi' },
  { id: 'tableau', label: 'Tableau de bord', icon: 'dash', show: () => can('voir_effectif') || can('voir_suivi') },
  { id: 'effectif', label: 'Effectif', icon: 'users', show: () => can('voir_effectif') },
  { id: 'mon-dossier', label: 'Mon dossier', icon: 'user', show: () => !!myAgent() },
  { sec: 'Journaux' },
  { id: 'carriere', label: 'Carrière', icon: 'trend', show: () => can('voir_suivi') },
  { id: 'formations', label: 'Formations', icon: 'cap', show: () => can('voir_suivi') },
  { id: 'appreciations', label: 'Appréciations', icon: 'star', show: () => can('voir_suivi') },
  { id: 'sanctions', label: 'Sanctions', icon: 'alert', show: () => can('voir_sanctions') },
  { sec: 'Outils' },
  { id: 'rapports', label: 'Générateur de rapports', icon: 'doc', show: () => true },
  { sec: 'Gestion' },
  { id: 'parametres', label: 'Paramètres', icon: 'gear', show: () => can('gerer_parametres') },
  { id: 'admin', label: 'Comptes et rôles', icon: 'shield', show: () => can('gerer_utilisateurs'), count: () => S.profiles.filter((p) => p.statut === 'en_attente').length },
];
function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  if (/access_token|error_description/.test(h)) return { page: defaultPage() };
  const [page, arg] = h.split('/');
  return { page: page || defaultPage(), arg };
}
function defaultPage() {
  if (can('voir_effectif') || can('voir_suivi')) return 'tableau';
  if (myAgent()) return 'mon-dossier';
  return 'rapports';
}
const PAGES = {
  tableau: { allowed: () => can('voir_effectif') || can('voir_suivi'), render: pageDashboard },
  effectif: { allowed: () => can('voir_effectif'), render: pageEffectif },
  agent: { allowed: () => true, render: pageAgent },
  'mon-dossier': { allowed: () => !!myAgent(), render: () => pageAgent(S.me.agent_id) },
  carriere: { allowed: () => can('voir_suivi'), render: () => pageJournal('carriere') },
  formations: { allowed: () => can('voir_suivi'), render: () => pageJournal('formations') },
  appreciations: { allowed: () => can('voir_suivi'), render: () => pageJournal('appreciations') },
  sanctions: { allowed: () => can('voir_sanctions'), render: () => pageJournal('sanctions') },
  rapports: { allowed: () => true, render: pageRapports },
  parametres: { allowed: () => can('gerer_parametres'), render: pageParametres },
  admin: { allowed: () => can('gerer_utilisateurs'), render: pageAdmin },
};

/* ================================================================== rendu principal */
function render() {
  if (!S.session) return renderLogin();
  if (!S.me) return renderGate('Profil introuvable', "Votre compte n'a pas de profil. Vérifiez que le fichier schema.sql a bien été exécuté dans Supabase, puis reconnectez-vous.");
  if (S.me.statut === 'en_attente') return renderGate('Compte en attente de validation', `Bonjour ${esc(S.me.pseudo || '')}. Un membre du Command Staff doit valider votre compte et vous attribuer un rôle. Revenez un peu plus tard.`, true);
  if (S.me.statut === 'desactive') return renderGate('Compte désactivé', "Votre accès a été retiré. Contactez le Command Staff si vous pensez qu'il s'agit d'une erreur.");
  const { page, arg } = currentRoute();
  const def = PAGES[page];
  root.innerHTML = `${demoBar()}<div class="shell">${sidebar(page === 'agent' && Number(arg) === S.me.agent_id ? 'mon-dossier' : page)}<main id="main" tabindex="-1"></main></div>`;
  const main = document.getElementById('main');
  if (!def) { main.innerHTML = head('Page introuvable', "Cette adresse ne correspond à aucune page.") ; return; }
  if (!def.allowed()) { main.innerHTML = head('Accès refusé', "Votre rôle ne donne pas accès à cette page. Demandez au Command Staff si vous en avez besoin."); return; }
  def.render(arg);
}

function demoBar() {
  if (!api.demo) return '';
  const opts = (window.__demoProfiles || []).map((p) => `<option value="${esc(p.id)}" ${p.id === api.getAs() ? 'selected' : ''}>${esc(p.label)}</option>`).join('');
  return `<div class="demo-bar" role="note">Mode démonstration : données d'exemple enregistrées dans ce navigateur.
    <label>Voir le site en tant que <select id="demoAs">${opts}</select></label>
    <button type="button" class="btn sm ghost" id="demoReset">Réinitialiser la démo</button></div>`;
}

function sidebar(active) {
  let html = '', pending = [];
  for (const item of NAV) {
    if (item.sec) { pending = [`<span class="nav-label">${item.sec}</span>`]; continue; }
    if (!item.show()) continue;
    const n = item.count ? item.count() : 0;
    html += pending.join(''); pending = [];
    html += `<a href="#/${item.id}" ${item.id === active ? 'aria-current="page"' : ''}><span class="ic">${icon(item.icon)}</span>${item.label}${n ? `<span class="count" aria-label="${n} en attente">${n}</span>` : ''}</a>`;
  }
  const ag = myAgent();
  const av = S.me.avatar_url ? `<img src="${esc(S.me.avatar_url)}" alt="">` : initials(ag ? ag.nom : S.me.pseudo);
  return `<aside class="side">
    <div class="brand">${BADGE}<div><small>San Andreas State Police</small><b>Terminal de suivi</b></div></div>
    <nav class="nav" aria-label="Navigation principale">${html}</nav>
    <div class="me"><span class="avatar">${av}</span><div class="who"><b>${esc(ag ? ag.nom : S.me.pseudo)}</b><span class="badge">${esc(S.role ? S.role.nom : 'Sans rôle')}</span></div>
      <button type="button" class="icon-btn danger" id="logout" title="Se déconnecter" aria-label="Se déconnecter">${icon('logout')}</button></div>
  </aside>`;
}

const head = (title, sub, actions = '') => `<div class="page-head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="actions">${actions}</div></div>`;
const M = () => document.getElementById('main');

function renderLogin() {
  root.innerHTML = `${demoBar()}<div class="login"><div class="card">
    ${BADGE.replace('width="42" height="42"', 'width="72" height="72"')}
    <div><h1>San Andreas State Police</h1><p>Terminal de suivi des effectifs</p></div>
    <button type="button" class="btn discord" id="login">${api.demo ? 'Entrer dans la démonstration' : `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.3 4.4A19.6 19.6 0 0 0 15.5 3l-.6 1.3a18 18 0 0 0-5.8 0L8.5 3a19.6 19.6 0 0 0-4.8 1.5C.7 9 0 13.4.3 17.8a19.8 19.8 0 0 0 6 3l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14 14 0 0 0 11.8 0l.5.4a12.8 12.8 0 0 1-2 1l1.3 2a19.7 19.7 0 0 0 6-3c.4-5.1-.8-9.5-3.4-13.4zM8.7 15.1c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4zm6.6 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4z"/></svg> Se connecter avec Discord`}</button>
    <p class="fine">${api.demo ? 'Aucune base de données configurée : le site utilise des données d\'exemple.' : 'À la première connexion, votre compte est créé puis validé par le Command Staff.'}</p>
  </div></div>`;
}
function renderGate(title, text, refresh) {
  root.innerHTML = `${demoBar()}<div class="login"><div class="card">${BADGE.replace('width="42" height="42"', 'width="64" height="64"')}<h1>${title}</h1><p>${text}</p>
    <div class="actions" style="justify-content:center">${refresh ? '<button type="button" class="btn primary" id="refresh">Actualiser</button>' : ''}<button type="button" class="btn ghost" id="logout">Se déconnecter</button></div></div></div>`;
}

/* ================================================================== tableau de bord */
function pageDashboard() {
  const actifs = S.agents.filter((a) => a.statut === 'Actif');
  const ms = new Map(S.agents.map((a) => [a.id, metrics(a)]));
  const eligibles = S.agents.filter((a) => ms.get(a.id).elig.state === 'yes');
  const sActives = S.sanctions.filter((s) => sanctionStatus(s) === 'Active').sort(byDateDesc);
  const seuil = CFG.joursSansSuivi || 14;
  const sansSuivi = actifs.filter((a) => { const l = ms.get(a.id).last; return !l || daysBetween(l, today()) > seuil; });
  const top = [...S.agents].map((a) => ({ a, p: ms.get(a.id).pts30 })).filter((x) => x.p !== 0).sort((x, y) => y.p - x.p).slice(0, 8);
  const rookies = S.agents.filter((a) => norm(a.grade) === 'rookie').length;
  const places = S.grades.reduce((s, g) => s + Number(g.places || 0), 0);

  const groups = [];
  [...S.grades].sort((a, b) => b.ordre - a.ordre).forEach((g) => {
    let grp = groups.find((x) => x.nom === g.groupe);
    if (!grp) groups.push(grp = { nom: g.groupe, grades: [] });
    grp.grades.push(g);
  });
  const occ = groups.map((grp) => `<div class="occ-group">${esc(grp.nom || 'Sans groupe')}</div>` + grp.grades.map((g) => {
    const n = S.agents.filter((a) => norm(a.grade) === norm(g.nom)).length;
    const pct = g.places ? Math.min(100, (n / g.places) * 100) : (n ? 100 : 0);
    return `<div class="occ" style="--gc:${groupColor(g.groupe)}"><span>${esc(g.nom)}</span><span class="bar" role="img" aria-label="${n} agents sur ${g.places} places"><i style="width:${pct}%"></i></span><span class="n">${n} / ${g.places}</span></div>`;
  }).join('')).join('');

  const item = (a, right, sub) => `<div class="item"><span class="avatar">${initials(a.nom)}</span><div class="grow"><b>${agentLink(a.id)}</b><span class="muted">${sub}</span></div>${right}</div>`;
  M().innerHTML = head('Tableau de bord', `Situation de l'effectif au ${fmtD(today())}.`, can('gerer_carriere') ? `<a class="btn primary" href="#/effectif">${icon('users', 16)} Voir l'effectif</a>` : '') +
    `<div class="kpis">
      <div class="kpi"><small>Effectif</small><b>${S.agents.length}</b><span>${Math.max(0, places - S.agents.length)} places libres</span></div>
      <div class="kpi ok"><small>Agents actifs</small><b>${actifs.length}</b><span>${S.agents.length - actifs.length} en congé ou inactifs</span></div>
      <div class="kpi"><small>Rookies à l'académie</small><b>${rookies}</b><span>en formation initiale</span></div>
      <div class="kpi ok"><small>Éligibles à une promotion</small><b>${eligibles.length}</b><span>tous critères remplis</span></div>
      <div class="kpi ${sActives.length ? 'alert' : ''}"><small>Sanctions actives</small><b>${sActives.length}</b><span>en cours</span></div>
    </div>
    <div class="grid two">
      <div class="card"><h2>Occupation des grades<span class="hint">agents / places</span></h2>${occ || '<p class="empty">Aucun grade défini.</p>'}</div>
      <div class="grid">
        <div class="card"><h2>Éligibles à une promotion<span class="hint">${eligibles.length}</span></h2><div class="list">${eligibles.map((a) => item(a, `<span class="chip good">${esc(ms.get(a.id).suivant)}</span>`, `${esc(a.grade)} · depuis ${ms.get(a.id).jours ?? 0} j`)).join('') || '<p class="empty">Personne ne remplit encore tous les critères.</p>'}</div></div>
        ${can('voir_sanctions') || sActives.length ? `<div class="card"><h2>Sanctions actives</h2><div class="list">${sActives.slice(0, 8).map((s) => { const a = agentById(s.agent_id); return a ? item(a, sanctionChip(s), `${esc(s.type)} · ${s.fin ? `jusqu'au ${fmtD(s.fin)}` : 'permanente'}`) : ''; }).join('') || '<p class="empty">Aucune sanction en cours.</p>'}</div></div>` : ''}
      </div>
    </div>
    <div class="grid two" style="margin-top:18px">
      <div class="card"><h2>Sans suivi depuis plus de ${seuil} jours<span class="hint">${sansSuivi.length}</span></h2><div class="list">${sansSuivi.slice(0, 10).map((a) => { const l = ms.get(a.id).last; return item(a, `<span class="chip warn">${l ? `${daysBetween(l, today())} j` : 'jamais'}</span>`, `${esc(a.grade)} · dernier suivi ${l ? fmtD(l) : 'aucun'}`); }).join('') || '<p class="empty">Tous les agents actifs ont un suivi récent.</p>'}</div></div>
      <div class="card"><h2>Points des 30 derniers jours</h2><div class="list">${top.map((x) => item(x.a, pointsChip(x.p), esc(x.a.grade))).join('') || '<p class="empty">Aucune appréciation ces 30 derniers jours.</p>'}</div></div>
    </div>`;
}

/* ================================================================== effectif */
function pageEffectif() {
  const f = S.ui.effectif;
  const places = S.grades.reduce((s, g) => s + Number(g.places || 0), 0);
  M().innerHTML = head('Effectif', `${S.agents.length} agents · ${Math.max(0, places - S.agents.length)} places libres. Cliquez sur un agent pour ouvrir sa fiche.`,
    can('gerer_carriere') ? `<button type="button" class="btn primary" data-act="agent-new">${icon('plus', 16)} Ajouter un agent</button>` : '') +
    `<div class="filters" role="search">
      <label class="sr-only" for="fq">Rechercher</label><input id="fq" class="in search" placeholder="Nom, matricule, badge, Discord…" value="${esc(f.q)}">
      <label class="sr-only" for="fj">Juridiction</label><select id="fj" class="in"><option value="">Toutes les juridictions</option>${listeOf('juridiction').map((j) => `<option ${j === f.jur ? 'selected' : ''}>${esc(j)}</option>`).join('')}</select>
      <label class="sr-only" for="fs">Statut</label><select id="fs" class="in"><option value="">Tous les statuts</option>${STATUTS.map((s) => `<option ${s === f.statut ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <label class="check" style="align-self:center"><input type="checkbox" id="fl" ${f.libres ? 'checked' : ''}> Afficher les places libres</label>
    </div><div id="effTable"></div>`;
  const upd = () => { f.q = $('#fq').value; f.jur = $('#fj').value; f.statut = $('#fs').value; f.libres = $('#fl').checked; drawEffectif(); };
  ['#fq', '#fj', '#fs', '#fl'].forEach((s) => $(s).addEventListener(s === '#fq' ? 'input' : 'change', upd));
  drawEffectif();
}
function drawEffectif() {
  const f = S.ui.effectif, q = norm(f.q);
  const filtering = q || f.jur || f.statut;
  const match = (a) => (!q || norm([a.nom, a.matricule, a.badge, a.discord, a.division].join(' ')).includes(q)) && (!f.jur || a.juridiction === f.jur) && (!f.statut || a.statut === f.statut);
  const clickable = can('voir_suivi');
  const row = (a, g) => {
    const m = metrics(a);
    return `<tr class="${clickable ? 'click' : ''}" ${clickable ? `data-href="#/agent/${a.id}" tabindex="0"` : ''}>
      <td class="grade-cell">${esc(g ? g.nom : a.grade || '—')}</td>
      <td><b>${esc(a.nom)}</b><span class="sub">${esc(a.discord || '')}</span></td>
      <td class="tabular">${esc(a.matricule)}</td><td class="tabular">${esc(a.badge || '—')}</td>
      <td>${esc(a.juridiction || '—')}</td><td>${esc(a.division || '—')}</td>
      <td>${statutChip(a.statut)}</td><td>${eligChip(m)}</td></tr>`;
  };
  const groups = [];
  [...S.grades].sort((a, b) => b.ordre - a.ordre).forEach((g) => {
    let grp = groups.find((x) => x.nom === g.groupe);
    if (!grp) groups.push(grp = { nom: g.groupe, grades: [] });
    grp.grades.push(g);
  });
  let body = '', shown = 0;
  for (const grp of groups) {
    let rows = '';
    for (const g of grp.grades) {
      const all = S.agents.filter((a) => norm(a.grade) === norm(g.nom));
      const vis = all.filter(match).sort((a, b) => a.matricule.localeCompare(b.matricule, 'fr', { numeric: true }));
      rows += vis.map((a) => row(a, g)).join('');
      shown += vis.length;
      if (f.libres && !filtering) for (let i = all.length; i < g.places; i++) rows += `<tr class="free"><td class="grade-cell">${esc(g.nom)}</td><td colspan="7">Place libre</td></tr>`;
    }
    if (rows) body += `<tr class="group-head"><td colspan="8"><span style="--gc:${groupColor(grp.nom)}">${esc(grp.nom || 'Sans groupe')}</span></td></tr>${rows}`;
  }
  const orphans = S.agents.filter((a) => !gradeOf(a.grade) && match(a));
  if (orphans.length) { body += `<tr class="group-head"><td colspan="8"><span>Grade hors grille</span></td></tr>${orphans.map((a) => row(a, null)).join('')}`; shown += orphans.length; }
  $('#effTable').innerHTML = `<div class="table-wrap"><table><caption class="sr-only">Effectif par grade</caption>
    <thead><tr><th>Grade</th><th>Agent</th><th>Matricule</th><th>N° badge</th><th>Juridiction</th><th>Division</th><th>Statut</th><th>Promotion</th></tr></thead>
    <tbody>${body || '<tr><td colspan="8" class="empty">Aucun agent ne correspond à ces filtres.</td></tr>'}</tbody></table></div>
    ${filtering ? `<p class="muted" style="margin-top:10px">${shown} agent${shown > 1 ? 's' : ''} affiché${shown > 1 ? 's' : ''}.</p>` : ''}`;
}

/* ================================================================== fiche agent */
function pageAgent(arg) {
  const a = agentById(Number(arg));
  if (!a) { M().innerHTML = head('Agent introuvable', "Cet agent n'existe pas ou vous n'avez pas accès à sa fiche."); return; }
  const own = a.id === S.me.agent_id;
  if (!own && !can('voir_suivi')) { M().innerHTML = head('Accès refusé', "Votre rôle ne permet pas de consulter les fiches des autres agents."); return; }
  const m = metrics(a), g = m.grade;
  const btn = (act, label, ic, cls = '') => `<button type="button" class="btn sm ${cls}" data-act="${act}" data-agent="${a.id}">${icon(ic, 15)} ${label}</button>`;
  const actions = [
    can('gerer_carriere') && m.suivant ? btn('promote', `Promouvoir ${esc(m.suivant)}`, 'up', 'primary') : '',
    can('gerer_carriere') ? btn('new-carriere', 'Événement', 'trend') : '',
    can('ecrire_formations') ? btn('new-formations', 'Formation', 'cap') : '',
    can('ecrire_appreciations') ? btn('new-appreciations', 'Appréciation', 'star') : '',
    can('ecrire_sanctions') ? btn('new-sanctions', 'Sanction', 'alert', 'danger') : '',
    can('gerer_carriere') ? btn('agent-edit', 'Modifier', 'edit', 'ghost') : '',
  ].join('');
  const meter = (v, max) => max ? `<div class="meter"><i class="${v >= max ? 'full' : ''}" style="width:${Math.min(100, (v / max) * 100)}%"></i></div>` : '';
  const ecls = { yes: 'yes', no: 'no', max: 'max', none: 'max' }[m.elig.state];

  M().innerHTML = `${head(own ? 'Mon dossier' : 'Fiche agent', own ? 'Votre progression, vos formations et votre historique.' : `<a href="#/effectif">Effectif</a> / ${esc(a.nom)}`)}
    <div class="card">
      <div class="profile">
        <span class="avatar lg" style="background:color-mix(in srgb, ${groupColor(g?.groupe)} 22%, #1d1e22);color:#fff">${initials(a.nom)}</span>
        <div class="id"><h2>${esc(a.nom)}</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"><span class="badge">${esc(a.grade || 'Sans grade')}</span>${statutChip(a.statut)}${g ? `<span class="chip plain">${esc(g.groupe || '')}</span>` : ''}</div>
          <div class="meta"><span>Matricule <b>${esc(a.matricule)}</b></span><span>Badge <b>${esc(a.badge || '—')}</b></span><span>Discord <b>${esc(a.discord || '—')}</b></span><span>Juridiction <b>${esc(a.juridiction || '—')}</b></span><span>Division <b>${esc(a.division || '—')}</b></span><span>Référent <b>${esc(a.referent || '—')}</b></span><span>Entrée à l'académie <b>${fmtD(a.entree_academie)}</b></span></div>
        </div>
        <div class="actions" style="max-width:520px;justify-content:flex-end">${actions}</div>
      </div>
      <div class="stats">
        <div class="stat"><small>Dans le grade</small><b>${m.jours ?? '—'}</b> <span>j${g ? ` / ${g.jours_min}` : ''}</span>${g && m.suivant ? meter(m.jours || 0, g.jours_min) : ''}<span>${m.gradeDate ? `depuis le ${fmtD(m.gradeDate)}` : 'date inconnue'}</span></div>
        <div class="stat"><small>Points depuis le grade</small><b>${m.ptsDepuis}</b> <span>${g && m.suivant ? `/ ${g.points_min}` : ''}</span>${g && m.suivant ? meter(m.ptsDepuis, g.points_min) : ''}</div>
        <div class="stat"><small>Points (30 jours)</small><b>${m.pts30 > 0 ? '+' : ''}${m.pts30}</b></div>
        <div class="stat"><small>Formations requises</small><b>${m.reqDone}</b> <span>/ ${m.req.length}</span>${m.req.length ? meter(m.reqDone, m.req.length) : ''}</div>
        <div class="stat"><small>Sanctions actives</small><b style="color:${m.actives.length ? 'var(--bad)' : 'inherit'}">${m.actives.length}</b></div>
        <div class="stat"><small>Dernier suivi</small><b>${m.last ? daysBetween(m.last, today()) : '—'}</b> <span>${m.last ? `j · ${fmtD(m.last)}` : 'aucun'}</span></div>
      </div>
      <div class="eligibility ${ecls}"><b>${esc(m.elig.label)}</b>${m.elig.reasons.length ? `<span>Il manque : ${esc(m.elig.reasons.join(', '))}.</span>` : ''}</div>
    </div>
    <div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,2fr);margin-top:18px" id="agentGrid">
      <div class="grid" style="align-content:start">
        <div class="card"><h2>${m.suivant ? `Formations pour devenir ${esc(m.suivant)}` : 'Formations du grade suivant'}</h2>
          <div class="checklist">${m.req.map((f) => `<div><span>${esc(f.nom)}</span>${m.done.has(norm(f.nom)) ? '<span class="chip good">Validée</span>' : '<span class="chip warn">À faire</span>'}</div>`).join('') || '<p class="empty">Aucune formation requise.</p>'}</div></div>
        <div class="card"><h2>Formations validées<span class="hint">${m.done.size}</span></h2>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${[...new Set(S.formations.filter((x) => x.agent_id === a.id && x.resultat === 'Validée').map((x) => x.formation))].map((n) => `<span class="chip plain">${esc(n)}</span>`).join('') || '<p class="empty">Aucune pour le moment.</p>'}</div></div>
        ${a.notes ? `<div class="card"><h2>Notes</h2><p style="margin:0;white-space:pre-wrap">${esc(a.notes)}</p></div>` : ''}
      </div>
      <div class="card"><h2>Historique</h2>
        <div class="tabs" role="tablist" aria-label="Filtrer l'historique">${[['tout', 'Tout'], ['carriere', 'Carrière'], ['formations', 'Formations'], ['appreciations', 'Appréciations'], ['sanctions', 'Sanctions']].map(([k, l]) => `<button type="button" role="tab" data-histo="${k}" aria-selected="${S.ui.histo === k}">${l}</button>`).join('')}</div>
        <div class="timeline" id="timeline"></div></div>
    </div>`;
  if (window.matchMedia('(max-width: 960px)').matches) $('#agentGrid').style.gridTemplateColumns = '1fr';
  drawTimeline(a);
}
function drawTimeline(a) {
  const k = S.ui.histo;
  const ev = [];
  const take = (t) => k === 'tout' || k === t;
  if (take('carriere')) S.carriere.filter((x) => x.agent_id === a.id).forEach((x) => ev.push({ t: 'carriere', x, title: `${esc(x.type)}${x.avant || x.apres ? ` <span class="muted">· ${esc(x.avant || '—')} → ${esc(x.apres || '—')}</span>` : ''}`, text: x.commentaire, by: x.decide_par && `Décidé par ${x.decide_par}` }));
  if (take('formations')) S.formations.filter((x) => x.agent_id === a.id).forEach((x) => ev.push({ t: 'formations', x, title: `${esc(x.formation)} <span class="chip ${x.resultat === 'Validée' ? 'good' : x.resultat === 'Échouée' ? 'bad' : 'warn'}">${esc(x.resultat)}</span>${x.note != null ? ` <span class="muted">${x.note}/20</span>` : ''}`, text: x.commentaire, by: x.formateur && `Formateur : ${x.formateur}` }));
  if (take('appreciations')) S.appreciations.filter((x) => x.agent_id === a.id).forEach((x) => ev.push({ t: 'appreciations', x, title: `${esc(x.critere || 'Appréciation')} ${pointsChip(Number(x.points))}`, text: x.justification, by: x.referent && `Référent : ${x.referent}` }));
  if (take('sanctions')) S.sanctions.filter((x) => x.agent_id === a.id).forEach((x) => ev.push({ t: 'sanctions', x, title: `${esc(x.type)} ${sanctionChip(x)}`, text: x.motif, by: [x.emise_par && `Émise par ${x.emise_par}`, x.fin ? `fin le ${fmtD(x.fin)}` : 'permanente'].filter(Boolean).join(' · ') }));
  ev.sort((p, q) => byDateDesc(p.x, q.x));
  const perm = { carriere: 'gerer_carriere', formations: 'ecrire_formations', appreciations: 'ecrire_appreciations', sanctions: 'ecrire_sanctions' };
  $('#timeline').innerHTML = ev.map((e) => `<div class="tl ${e.t}"><span class="date">${fmtD(e.x.date)}</span><span class="dot"></span>
    <div class="what"><b>${e.title}</b>${e.text ? `<p>${esc(e.text)}</p>` : ''}${e.by ? `<p>${typeof e.by === 'string' ? esc(e.by) : ''}</p>` : ''}</div>
    <div class="tl-actions">${can(perm[e.t]) ? `<button type="button" class="icon-btn" data-act="edit-${e.t}" data-id="${e.x.id}" aria-label="Modifier">${icon('edit', 16)}</button>` : ''}</div></div>`).join('') || '<p class="empty">Rien à afficher pour le moment.</p>';
}

/* ================================================================== journaux */
const JOURNALS = {
  carriere: { title: 'Carrière', sub: 'Entrées, promotions, rétrogradations, mutations et départs. Une promotion met à jour le grade de l\'agent.', perm: 'gerer_carriere', add: 'Ajouter un événement',
    filter: () => EVENTS, filterKey: 'type', filterLabel: 'Tous les événements',
    head: ['Date', 'Agent', 'Événement', 'Avant', 'Après', 'Décidé par', 'Commentaire'],
    cells: (x) => [fmtD(x.date), agentLink(x.agent_id), esc(x.type), esc(x.avant || '—'), esc(x.apres || '—'), esc(x.decide_par || '—'), esc(x.commentaire || '')] },
  formations: { title: 'Formations', sub: 'Formations suivies par les agents. Seules les formations « Validée » comptent pour une promotion.', perm: 'ecrire_formations', add: 'Enregistrer une formation',
    filter: () => S.formations_cat.map((f) => f.nom), filterKey: 'formation', filterLabel: 'Toutes les formations',
    head: ['Date', 'Agent', 'Formation', 'Résultat', 'Note', 'Formateur', 'Commentaire'],
    cells: (x) => [fmtD(x.date), agentLink(x.agent_id), esc(x.formation), `<span class="chip ${x.resultat === 'Validée' ? 'good' : x.resultat === 'Échouée' ? 'bad' : 'warn'}">${esc(x.resultat)}</span>`, x.note != null ? `${x.note}/20` : '—', esc(x.formateur || '—'), esc(x.commentaire || '')] },
  appreciations: { title: 'Appréciations', sub: 'Points attribués par les officiers référents, de −5 à +5.', perm: 'ecrire_appreciations', add: 'Ajouter une appréciation',
    filter: () => listeOf('critere'), filterKey: 'critere', filterLabel: 'Tous les critères',
    head: ['Date', 'Agent', 'Critère', 'Points', 'Référent', 'Justification'],
    cells: (x) => [fmtD(x.date), agentLink(x.agent_id), esc(x.critere || '—'), pointsChip(Number(x.points)), esc(x.referent || '—'), esc(x.justification || '')] },
  sanctions: { title: 'Sanctions', sub: 'La date de fin est calculée selon le type. Une sanction active bloque la promotion.', perm: 'ecrire_sanctions', add: 'Émettre une sanction',
    filter: () => ['Active', 'Expirée', 'Levée'], filterKey: '__status', filterLabel: 'Tous les statuts',
    head: ['Date', 'Agent', 'Type', 'Motif', 'Émise par', 'Fin', 'Statut'],
    cells: (x) => [fmtD(x.date), agentLink(x.agent_id), esc(x.type), esc(x.motif || ''), esc(x.emise_par || '—'), x.fin ? fmtD(x.fin) : 'Permanente', sanctionChip(x)] },
};
function pageJournal(t) {
  const J = JOURNALS[t];
  const f = S.ui.journal[t] || (S.ui.journal[t] = { q: '', v: '' });
  M().innerHTML = head(J.title, J.sub, can(J.perm) ? `<button type="button" class="btn primary" data-act="new-${t}">${icon('plus', 16)} ${J.add}</button>` : '') +
    `<div class="filters" role="search"><label class="sr-only" for="jq">Rechercher un agent</label><input id="jq" class="in search" placeholder="Agent, matricule ou mot-clé…" value="${esc(f.q)}">
      <label class="sr-only" for="jv">${J.filterLabel}</label><select id="jv" class="in"><option value="">${J.filterLabel}</option>${J.filter().map((o) => `<option ${o === f.v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>
    <div id="jTable"></div>`;
  const upd = () => { f.q = $('#jq').value; f.v = $('#jv').value; drawJournal(t); };
  $('#jq').addEventListener('input', upd); $('#jv').addEventListener('change', upd);
  drawJournal(t);
}
function drawJournal(t) {
  const J = JOURNALS[t], f = S.ui.journal[t], q = norm(f.q);
  const rows = S[t].filter((x) => {
    const a = agentById(x.agent_id);
    const hay = norm([a?.nom, a?.matricule, ...Object.values(x)].join(' '));
    const v = J.filterKey === '__status' ? sanctionStatus(x) : x[J.filterKey];
    return (!q || hay.includes(q)) && (!f.v || v === f.v);
  }).sort(byDateDesc);
  const edit = can(J.perm);
  $('#jTable').innerHTML = `<div class="table-wrap"><table><caption class="sr-only">${J.title}</caption><thead><tr>${J.head.map((h) => `<th>${h}</th>`).join('')}${edit ? '<th><span class="sr-only">Actions</span></th>' : ''}</tr></thead>
    <tbody>${rows.map((x) => `<tr>${J.cells(x).map((c) => `<td>${c}</td>`).join('')}${edit ? `<td class="row-actions">${t === 'sanctions' && sanctionStatus(x) === 'Active' ? `<button type="button" class="btn sm ghost" data-act="lift" data-id="${x.id}">Lever</button> ` : ''}<button type="button" class="icon-btn" data-act="edit-${t}" data-id="${x.id}" aria-label="Modifier">${icon('edit', 16)}</button></td>` : ''}</tr>`).join('') || `<tr><td colspan="${J.head.length + 1}" class="empty">Aucune ligne${q || f.v ? ' ne correspond à ces filtres' : ' pour le moment'}.</td></tr>`}</tbody></table></div>
    <p class="muted" style="margin-top:10px">${rows.length} ligne${rows.length > 1 ? 's' : ''}.</p>`;
}

/* ---------- formulaires des journaux */
function agentOptions() { return sortedAgents().map((a) => [a.id, `${a.nom} — ${a.grade || 'sans grade'} (${a.matricule})`]); }
function journalFields(t, row) {
  const common = [
    { name: 'agent_id', label: 'Agent', type: 'select', options: agentOptions(), required: true, number: true },
    { name: 'date', label: 'Date', type: 'date', required: true },
  ];
  const names = agentNames();
  if (t === 'carriere') return [...common,
    { name: 'type', label: 'Événement', type: 'select', options: EVENTS, required: true },
    { name: 'decide_par', label: 'Décidé par', type: 'text', list: names },
    { name: 'avant', label: 'Avant', type: 'text', help: 'Rempli automatiquement selon l\'événement.' },
    { name: 'apres', label: 'Après', type: 'text', list: [], help: 'Pour une promotion : le nouveau grade, qui sera appliqué à la fiche.' },
    { name: 'commentaire', label: 'Commentaire', type: 'textarea', full: true }];
  if (t === 'formations') return [...common,
    { name: 'formation', label: 'Formation', type: 'select', options: S.formations_cat.map((f) => f.nom).concat(row?.formation && !S.formations_cat.some((f) => f.nom === row.formation) ? [row.formation] : []), required: true },
    { name: 'resultat', label: 'Résultat', type: 'select', options: RESULTATS, required: true },
    { name: 'formateur', label: 'Formateur', type: 'text', list: names },
    { name: 'note', label: 'Note sur 20', type: 'number', min: 0, max: 20, step: 0.5 },
    { name: 'commentaire', label: 'Commentaire', type: 'textarea', full: true }];
  if (t === 'appreciations') return [...common,
    { name: 'critere', label: 'Critère', type: 'select', options: listeOf('critere'), required: true },
    { name: 'points', label: 'Points (−5 à +5)', type: 'number', min: -5, max: 5, step: 1, required: true },
    { name: 'referent', label: 'Officier référent', type: 'text', list: names, full: true },
    { name: 'justification', label: 'Justification', type: 'textarea', full: true, required: true }];
  return [...common,
    { name: 'type', label: 'Type de sanction', type: 'select', options: S.sanction_types.map((s) => s.nom), required: true },
    { name: 'emise_par', label: 'Émise par', type: 'text', list: names },
    { name: 'fin', label: 'Fin', type: 'date', help: 'Calculée selon le type. Vide = permanente.' },
    { name: 'levee', label: 'Levée avant la fin', type: 'checkbox' },
    { name: 'motif', label: 'Motif', type: 'textarea', full: true, required: true }];
}
function careerBefore(a, type) {
  if (!a) return '';
  if (GRADE_EVENTS.includes(type)) return type === "Entrée à l'académie" ? '' : a.grade || '';
  if (type === 'Mutation de division') return a.division || '';
  if (type === 'Changement de référent') return a.referent || '';
  if (['Congé', 'Retour de congé', 'Départ'].includes(type)) return a.statut || '';
  return '';
}
function careerChoices(type) {
  if (GRADE_EVENTS.includes(type)) return S.grades.map((g) => g.nom);
  if (type === 'Mutation de division') return listeOf('division');
  if (type === 'Changement de référent') return agentNames();
  if (type === 'Départ') return ['Démission', 'Renvoyé'];
  return [];
}
async function applyCareer(row) {
  const a = agentById(row.agent_id);
  if (!a || !row.apres) return false;
  const patch = {};
  const g = gradeOf(row.apres);
  if (GRADE_EVENTS.includes(row.type) && g) patch.grade = g.nom;
  if (row.type === "Entrée à l'académie" && !a.entree_academie) patch.entree_academie = row.date;
  if (row.type === 'Mutation de division') patch.division = row.apres;
  if (row.type === 'Changement de référent') patch.referent = row.apres;
  if (row.type === 'Congé') patch.statut = 'Congé (LOA)';
  if (row.type === 'Retour de congé') patch.statut = 'Actif';
  if (row.type === 'Départ' && STATUTS.includes(row.apres)) patch.statut = row.apres;
  if (!Object.keys(patch).length) return false;
  const upd = await api.update('agents', a.id, patch);
  Object.assign(a, upd);
  return true;
}
function openJournalForm(t, row, preset = {}) {
  const J = JOURNALS[t];
  const isNew = !row;
  const me = myAgent();
  const values = row ? { ...row } : {
    date: today(), agent_id: preset.agent_id ?? null,
    ...(t === 'carriere' ? { decide_par: me?.nom || '' } : {}),
    ...(t === 'formations' ? { resultat: 'Validée', formateur: me?.nom || '' } : {}),
    ...(t === 'appreciations' ? { referent: me?.nom || '', points: 1 } : {}),
    ...(t === 'sanctions' ? { emise_par: me?.nom || '', levee: false } : {}),
    ...preset,
  };
  let finTouched = !isNew;
  openForm({
    title: isNew ? J.add : `Modifier — ${J.title.toLowerCase()}`,
    fields: journalFields(t, row), values,
    submitLabel: isNew ? 'Enregistrer' : 'Enregistrer les modifications',
    onInput(name, v, set, get) {
      if (t === 'carriere' && (name === 'type' || name === 'agent_id' || name === '__init')) {
        const a = agentById(Number(get('agent_id')));
        if (isNew || name !== '__init') set('avant', careerBefore(a, get('type')));
        setList('apres', careerChoices(get('type')));
        if (name === 'type' && get('type') === 'Promotion' && a) { const g = gradeOf(a.grade); if (g?.suivant) set('apres', g.suivant); }
      }
      if (t === 'sanctions') {
        if (name === 'fin') finTouched = true;
        if ((name === 'type' || name === 'date' || name === '__init') && !finTouched) {
          const st = S.sanction_types.find((s) => s.nom === get('type'));
          set('fin', st && st.duree_jours > 0 && get('date') ? addDays(get('date'), st.duree_jours) : '');
        }
      }
    },
    async onSubmit(v) {
      const saved = isNew ? await api.insert(t, v) : await api.update(t, row.id, v);
      if (isNew) S[t].push(saved); else Object.assign(S[t].find((x) => x.id === row.id), saved);
      let extra = '';
      if (t === 'carriere' && can('gerer_carriere') && (await applyCareer(saved))) extra = ' Fiche de l\'agent mise à jour.';
      toast(`Enregistré.${extra}`);
      render();
    },
    onDelete: isNew ? null : async () => {
      await api.remove(t, row.id);
      S[t] = S[t].filter((x) => x.id !== row.id);
      toast('Ligne supprimée.'); render();
    },
  });
}

/* ---------- formulaire agent */
function openAgentForm(a) {
  const isNew = !a;
  openForm({
    title: isNew ? 'Ajouter un agent' : `Modifier ${a.nom}`,
    values: a ? { ...a } : { statut: 'Actif', grade: 'Rookie', entree_academie: today() },
    fields: [
      { name: 'nom', label: 'Prénom Nom', type: 'text', required: true },
      { name: 'matricule', label: 'Matricule', type: 'text', required: true, pattern: '[0-9]+', help: 'Chiffres uniquement, ex. 04.' },
      { name: 'grade', label: 'Grade', type: 'select', options: S.grades.map((g) => g.nom), required: true, help: isNew ? '' : 'Pour une promotion, passez plutôt par « Promouvoir » : elle reste dans l\'historique.' },
      { name: 'badge', label: 'N° de badge', type: 'text' },
      { name: 'discord', label: 'Pseudo Discord', type: 'text' },
      { name: 'juridiction', label: 'Juridiction', type: 'select', options: [''].concat(listeOf('juridiction')) },
      { name: 'division', label: 'Division', type: 'select', options: [''].concat(listeOf('division')) },
      { name: 'referent', label: 'Officier référent', type: 'text', list: agentNames() },
      { name: 'entree_academie', label: "Entrée à l'académie", type: 'date' },
      { name: 'statut', label: 'Statut', type: 'select', options: STATUTS, required: true },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true },
    ],
    submitLabel: isNew ? "Ajouter l'agent" : 'Enregistrer',
    async onSubmit(v) {
      if (S.agents.some((x) => x.matricule === v.matricule && x.id !== a?.id)) throw new Error(`Le matricule ${v.matricule} est déjà utilisé.`);
      if (isNew) {
        const saved = await api.insert('agents', v);
        S.agents.push(saved);
        if (saved.entree_academie) {
          const ev = await api.insert('carriere', { agent_id: saved.id, date: saved.entree_academie, type: "Entrée à l'académie", avant: '', apres: saved.grade, decide_par: myAgent()?.nom || null, commentaire: null });
          S.carriere.push(ev);
        }
        toast(`${saved.nom} a été ajouté à l'effectif.`);
        location.hash = `#/agent/${saved.id}`;
      } else {
        Object.assign(a, await api.update('agents', a.id, v));
        toast('Fiche mise à jour.'); render();
      }
    },
    onDelete: isNew ? null : async () => {
      await api.remove('agents', a.id);
      S.agents = S.agents.filter((x) => x.id !== a.id);
      for (const t of ['carriere', 'formations', 'appreciations', 'sanctions']) S[t] = S[t].filter((x) => x.agent_id !== a.id);
      toast(`${a.nom} a été retiré de l'effectif.`); location.hash = '#/effectif';
    },
    deleteText: isNew ? '' : `Supprimer ${a.nom} et tout son historique ? Pour un départ, préférez l'événement « Départ » qui garde l'historique.`,
  });
}

/* ================================================================== générateur de rapports */
function pageRapports() {
  M().innerHTML = head('Générateur de rapports', "Rapports d'arrestation prêts à coller dans le MDT.", '<a class="btn ghost" href="rapport.html" target="_blank" rel="noopener">Ouvrir dans un nouvel onglet</a>') +
    '<iframe class="frame" src="rapport.html?embed=1" title="Générateur de rapports d\'arrestation"></iframe>';
}

/* ================================================================== paramètres */
const PARAMS = {
  grades: { label: 'Grades', table: 'grades', sub: 'Ordre (1 = le plus bas), grade suivant, conditions de promotion et nombre de places.',
    head: ['Ordre', 'Grade', 'Groupe', 'Grade suivant', 'Jours min.', 'Points min.', 'Places'],
    rows: () => [...S.grades].sort((a, b) => a.ordre - b.ordre),
    cells: (g) => [g.ordre, `<b>${esc(g.nom)}</b>`, esc(g.groupe || '—'), esc(g.suivant || '—'), g.jours_min, g.points_min, g.places],
    fields: () => [
      { name: 'nom', label: 'Nom du grade', type: 'text', required: true, help: 'Renommer un grade ne modifie pas les agents qui l\'ont déjà.' },
      { name: 'ordre', label: 'Ordre', type: 'number', min: 1, required: true },
      { name: 'groupe', label: 'Groupe', type: 'text', list: [...new Set(S.grades.map((g) => g.groupe).filter(Boolean))] },
      { name: 'suivant', label: 'Grade suivant', type: 'select', options: [''].concat(S.grades.map((g) => g.nom)) },
      { name: 'jours_min', label: 'Jours minimum dans le grade', type: 'number', min: 0, required: true },
      { name: 'points_min', label: 'Points minimum pour monter', type: 'number', min: 0, required: true },
      { name: 'places', label: 'Nombre de places', type: 'number', min: 0, required: true }],
    defaults: () => ({ ordre: (S.grades.at(-1)?.ordre || 0) + 1, jours_min: 0, points_min: 0, places: 1 }) },
  formations_cat: { label: 'Formations', table: 'formations_cat', sub: 'Chaque formation peut être obligatoire pour accéder à un grade.',
    head: ['Formation', 'Catégorie', 'Obligatoire pour devenir'],
    rows: () => [...S.formations_cat].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.nom.localeCompare(b.nom)),
    cells: (f) => [`<b>${esc(f.nom)}</b>`, esc(f.categorie || '—'), esc(f.requise_pour || '—')],
    fields: () => [
      { name: 'nom', label: 'Formation', type: 'text', required: true, full: true },
      { name: 'categorie', label: 'Catégorie', type: 'text', list: [...new Set(S.formations_cat.map((f) => f.categorie).filter(Boolean))] },
      { name: 'requise_pour', label: 'Obligatoire pour devenir', type: 'select', options: [''].concat(S.grades.map((g) => g.nom)) },
      { name: 'ordre', label: "Ordre d'affichage", type: 'number', min: 0 }],
    defaults: () => ({ ordre: S.formations_cat.length }) },
  sanction_types: { label: 'Types de sanction', table: 'sanction_types', sub: 'Durée pendant laquelle la sanction reste active. 0 = permanente.',
    head: ['Type', 'Reste active'],
    rows: () => [...S.sanction_types].sort((a, b) => a.duree_jours - b.duree_jours),
    cells: (s) => [`<b>${esc(s.nom)}</b>`, s.duree_jours ? `${s.duree_jours} jours` : 'Permanente'],
    fields: () => [{ name: 'nom', label: 'Type de sanction', type: 'text', required: true }, { name: 'duree_jours', label: 'Reste active (jours)', type: 'number', min: 0, required: true, help: '0 = permanente.' }],
    defaults: () => ({ duree_jours: 30 }) },
};
['division:Divisions', 'critere:Critères d\'appréciation', 'juridiction:Juridictions'].forEach((d) => {
  const [kind, label] = d.split(':');
  PARAMS[kind] = { label, table: 'listes', kind, sub: kind === 'critere' ? 'Critères proposés dans les appréciations.' : `Valeurs proposées pour la ${label.toLowerCase().slice(0, -1)} d'un agent.`,
    head: ['Nom', 'Ordre'],
    rows: () => S.listes.filter((l) => l.kind === kind).sort((a, b) => a.ordre - b.ordre),
    cells: (l) => [`<b>${esc(l.nom)}</b>`, l.ordre],
    fields: () => [{ name: 'nom', label: 'Nom', type: 'text', required: true }, { name: 'ordre', label: "Ordre d'affichage", type: 'number', min: 0 }],
    defaults: () => ({ kind, ordre: S.listes.filter((l) => l.kind === kind).length }) };
});
function pageParametres() {
  const tab = S.ui.paramTab, P = PARAMS[tab];
  M().innerHTML = head('Paramètres', 'Les listes utilisées dans tout le site. Les modifications sont visibles immédiatement par tous.', `<button type="button" class="btn primary" data-act="param-new">${icon('plus', 16)} Ajouter</button>`) +
    `<div class="tabs" role="tablist">${Object.entries(PARAMS).map(([k, p]) => `<button type="button" role="tab" data-ptab="${k}" aria-selected="${k === tab}">${p.label}</button>`).join('')}</div>
    <p class="muted" style="margin:-6px 0 14px">${P.sub}</p>
    <div class="table-wrap"><table><thead><tr>${P.head.map((h) => `<th>${h}</th>`).join('')}<th><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>${P.rows().map((r) => `<tr>${P.cells(r).map((c) => `<td>${c}</td>`).join('')}<td class="row-actions"><button type="button" class="icon-btn" data-act="param-edit" data-id="${r.id}" aria-label="Modifier">${icon('edit', 16)}</button></td></tr>`).join('') || `<tr><td colspan="${P.head.length + 1}" class="empty">Liste vide.</td></tr>`}</tbody></table></div>`;
}
function openParamForm(row) {
  const P = PARAMS[S.ui.paramTab], isNew = !row;
  openForm({
    title: isNew ? `Ajouter — ${P.label.toLowerCase()}` : `Modifier ${row.nom}`,
    fields: P.fields(), values: row ? { ...row } : P.defaults(),
    async onSubmit(v) {
      if (P.kind) v.kind = P.kind;
      const saved = isNew ? await api.insert(P.table, v) : await api.update(P.table, row.id, v);
      if (isNew) S[P.table].push(saved); else Object.assign(S[P.table].find((x) => x.id === row.id), saved);
      toast('Paramètre enregistré.'); render();
    },
    onDelete: isNew ? null : async () => { await api.remove(P.table, row.id); S[P.table] = S[P.table].filter((x) => x.id !== row.id); toast('Supprimé.'); render(); },
  });
}

/* ================================================================== comptes et rôles */
function pageAdmin() {
  const tab = S.ui.adminTab;
  const pending = S.profiles.filter((p) => p.statut === 'en_attente').length;
  M().innerHTML = head('Comptes et rôles', 'Validez les inscriptions, reliez chaque compte à un agent et choisissez ce que chaque rôle peut faire.',
    tab === 'roles' ? `<button type="button" class="btn primary" data-act="role-new">${icon('plus', 16)} Créer un rôle</button>` : '') +
    `<div class="tabs" role="tablist"><button type="button" role="tab" data-atab="comptes" aria-selected="${tab === 'comptes'}">Comptes${pending ? ` (${pending} en attente)` : ''}</button><button type="button" role="tab" data-atab="roles" aria-selected="${tab === 'roles'}">Rôles et permissions</button></div><div id="adminBody"></div>`;
  tab === 'comptes' ? drawAccounts() : drawRoles();
}
function drawAccounts() {
  const order = { en_attente: 0, actif: 1, desactive: 2 };
  const rows = [...S.profiles].sort((a, b) => order[a.statut] - order[b.statut] || String(a.pseudo).localeCompare(String(b.pseudo)));
  const opt = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('');
  $('#adminBody').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Compte Discord</th><th>Inscrit le</th><th>Statut</th><th>Rôle</th><th>Agent lié</th></tr></thead><tbody>
    ${rows.map((p) => { const self = p.id === S.me.id; return `<tr>
      <td><div style="display:flex;gap:10px;align-items:center"><span class="avatar">${p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : initials(p.pseudo)}</span><div><b>${esc(p.pseudo || 'Sans pseudo')}</b>${self ? '<span class="sub">Vous</span>' : ''}</div></div></td>
      <td class="tabular">${fmtD(p.created_at)}</td>
      <td><label class="sr-only" for="st-${p.id}">Statut</label><select class="in" id="st-${p.id}" data-prof="${p.id}" data-field="statut" ${self ? 'disabled title="Vous ne pouvez pas modifier votre propre statut"' : ''}>${opt([['en_attente', 'En attente'], ['actif', 'Actif'], ['desactive', 'Désactivé']], p.statut)}</select></td>
      <td><label class="sr-only" for="ro-${p.id}">Rôle</label><select class="in" id="ro-${p.id}" data-prof="${p.id}" data-field="role_id" ${self ? 'disabled title="Vous ne pouvez pas modifier votre propre rôle"' : ''}>${opt([['', 'Aucun rôle']].concat([...S.roles].sort((a, b) => a.ordre - b.ordre).map((r) => [r.id, r.nom])), p.role_id)}</select></td>
      <td><label class="sr-only" for="ag-${p.id}">Agent lié</label><select class="in" id="ag-${p.id}" data-prof="${p.id}" data-field="agent_id">${opt([['', 'Aucun']].concat(sortedAgents().map((a) => [a.id, `${a.nom} (${a.matricule})`])), p.agent_id)}</select></td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">Aucun compte.</td></tr>'}
    </tbody></table></div><p class="muted" style="margin-top:10px">Pour activer un compte : choisissez un rôle, puis passez son statut à « Actif ». Les changements sont enregistrés immédiatement.</p>`;
}
function drawRoles() {
  const used = (id) => S.profiles.filter((p) => p.role_id === id).length;
  $('#adminBody').innerHTML = `<div class="roles">${[...S.roles].sort((a, b) => a.ordre - b.ordre).map((r) => `<form class="card role-card" data-role="${r.id}">
    <div class="head"><label class="sr-only" for="rn-${r.id}">Nom du rôle</label><input class="in" id="rn-${r.id}" name="nom" value="${esc(r.nom)}" required><span class="chip plain" title="Comptes avec ce rôle">${used(r.id)}</span></div>
    <div class="perm-list">
      <label class="check"><input type="checkbox" name="est_admin" ${r.est_admin ? 'checked' : ''}><span><b>Administrateur</b><small>Toutes les permissions, y compris celles ajoutées plus tard.</small></span></label>
      ${PERMISSIONS.map((p) => `<label class="check"><input type="checkbox" name="perm" value="${p.key}" ${r.est_admin || r.permissions.includes(p.key) ? 'checked' : ''} ${r.est_admin ? 'disabled' : ''}><span>${p.label}<small>${p.help}</small></span></label>`).join('')}
    </div>
    <div class="actions"><button type="submit" class="btn primary sm">Enregistrer</button><button type="button" class="btn danger sm" data-act="role-del" data-id="${r.id}">Supprimer</button></div>
  </form>`).join('')}</div>`;
}

/* ================================================================== fenêtres */
let formCtx = null;
function openForm(ctx) {
  formCtx = ctx;
  const v = ctx.values || {};
  const field = (f) => {
    const id = `ff-${f.name}`, val = v[f.name] ?? '';
    const req = f.required ? 'required' : '';
    let input;
    if (f.type === 'select') {
      const opts = f.options.map((o) => (Array.isArray(o) ? o : [o, o === '' ? '—' : o]));
      input = `<select class="in" id="${id}" name="${f.name}" ${req}>${f.required && !opts.some(([k]) => String(k) === String(val)) ? '<option value="">Choisir…</option>' : ''}${opts.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    } else if (f.type === 'textarea') input = `<textarea class="in" id="${id}" name="${f.name}" ${req}>${esc(val)}</textarea>`;
    else if (f.type === 'checkbox') return `<div class="f ${f.full ? 'full' : ''}" style="justify-content:flex-end"><label class="check"><input type="checkbox" id="${id}" name="${f.name}" ${val ? 'checked' : ''}> ${f.label}</label></div>`;
    else input = `<input class="in" id="${id}" name="${f.name}" type="${f.type}" value="${esc(val)}" ${req} ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.step != null ? `step="${f.step}"` : ''} ${f.pattern ? `pattern="${f.pattern}"` : ''} ${f.list ? `list="dl-${f.name}" autocomplete="off"` : ''}>${f.list ? `<datalist id="dl-${f.name}">${f.list.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>` : ''}`;
    return `<div class="f ${f.full || f.type === 'textarea' ? 'full' : ''}"><label for="${id}">${f.label}${f.required ? ' <span aria-hidden="true">*</span>' : ''}</label>${input}${f.help ? `<p class="help">${f.help}</p>` : ''}</div>`;
  };
  const m = document.getElementById('modal');
  m.innerHTML = `<form class="card" id="mform" novalidate><h2 id="mtitle">${esc(ctx.title)}</h2><div class="fields">${ctx.fields.map(field).join('')}</div>
    <p class="help" id="merr" role="alert" style="color:var(--bad);margin-top:12px" hidden></p>
    <div class="foot">${ctx.onDelete ? '<button type="button" class="btn danger left" id="mdel">Supprimer</button>' : ''}<button type="button" class="btn ghost" id="mcancel">Annuler</button><button type="submit" class="btn primary" id="msave">${esc(ctx.submitLabel || 'Enregistrer')}</button></div></form>`;
  m.hidden = false;
  m.setAttribute('aria-labelledby', 'mtitle');
  const form = $('#mform');
  const get = (n) => { const el = form.elements[n]; return el ? (el.type === 'checkbox' ? el.checked : el.value) : undefined; };
  const set = (n, val) => { const el = form.elements[n]; if (el) { if (el.type === 'checkbox') el.checked = !!val; else el.value = val ?? ''; } };
  if (ctx.onInput) {
    form.addEventListener('input', (e) => e.target.name && ctx.onInput(e.target.name, e.target.value, set, get));
    form.addEventListener('change', (e) => e.target.name && e.target.tagName === 'SELECT' && ctx.onInput(e.target.name, e.target.value, set, get));
    ctx.onInput('__init', null, set, get);
  }
  const firstEmpty = [...form.querySelectorAll('input,select,textarea')].find((el) => !el.value && el.type !== 'checkbox') || form.querySelector('input,select,textarea');
  firstEmpty?.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#merr');
    if (!form.checkValidity()) {
      const bad = form.querySelector(':invalid');
      err.textContent = `Vérifiez le champ « ${form.querySelector(`label[for="${bad.id}"]`)?.textContent.replace('*', '').trim() || bad.name} » : ${bad.validationMessage}`;
      err.hidden = false; bad.focus(); return;
    }
    const out = {};
    for (const f of ctx.fields) {
      let val = get(f.name);
      if (f.type === 'checkbox') { out[f.name] = !!val; continue; }
      if (typeof val === 'string') val = val.trim();
      if (val === '') val = null;
      else if (f.type === 'number' || f.number) val = Number(val);
      out[f.name] = val;
    }
    $('#msave').disabled = true;
    try { await ctx.onSubmit(out); closeModal(); } catch (ex) { err.textContent = ex.message; err.hidden = false; $('#msave').disabled = false; }
  });
  $('#mcancel').addEventListener('click', closeModal);
  $('#mdel')?.addEventListener('click', async () => {
    if (!(await confirmBox(ctx.deleteText || 'Supprimer définitivement cet élément ?', 'Supprimer'))) return;
    try { await ctx.onDelete(); closeModal(); } catch (ex) { toast(ex.message, true); }
  });
}
function closeModal() { const m = document.getElementById('modal'); m.hidden = true; m.innerHTML = ''; formCtx = null; }
function confirmBox(text, okLabel) {
  return new Promise((resolve) => {
    const c = document.getElementById('confirm');
    c.innerHTML = `<div class="card" style="width:min(440px,100%)"><h2 id="ctitle">Confirmation</h2><p>${esc(text)}</p><div class="foot"><button type="button" class="btn ghost" id="cno">Annuler</button><button type="button" class="btn danger" id="cyes">${esc(okLabel)}</button></div></div>`;
    c.hidden = false; $('#cyes').focus();
    const done = (r) => { c.hidden = true; c.innerHTML = ''; resolve(r); };
    $('#cyes').addEventListener('click', () => done(true));
    $('#cno').addEventListener('click', () => done(false));
  });
}
function setList(name, items) {
  const dl = document.getElementById(`dl-${name}`);
  if (dl) dl.innerHTML = items.map((o) => `<option value="${esc(o)}">`).join('');
}
function $(sel) { return document.querySelector(sel); }

/* ================================================================== événements globaux */
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act], [data-href], [data-histo], [data-ptab], [data-atab], #login, #logout, #refresh, #demoReset');
  if (!t) return;
  if (t.id === 'login') { t.disabled = true; try { await api.signIn(); } catch (ex) { toast(ex.message, true); t.disabled = false; } return; }
  if (t.id === 'logout') { await api.signOut(); return; }
  if (t.id === 'refresh') { await refreshAll(); render(); return; }
  if (t.id === 'demoReset') { if (await confirmBox('Remettre les données de démonstration à zéro ?', 'Réinitialiser')) { api.reset(); await refreshAll(); render(); toast('Démo réinitialisée.'); } return; }
  if (t.dataset.href) { location.hash = t.dataset.href; return; }
  if (t.dataset.histo) { S.ui.histo = t.dataset.histo; document.querySelectorAll('[data-histo]').forEach((b) => b.setAttribute('aria-selected', b === t)); drawTimeline(agentById(Number(currentRoute().arg) || S.me.agent_id)); return; }
  if (t.dataset.ptab) { S.ui.paramTab = t.dataset.ptab; render(); return; }
  if (t.dataset.atab) { S.ui.adminTab = t.dataset.atab; render(); return; }
  const act = t.dataset.act, id = Number(t.dataset.id), agentId = Number(t.dataset.agent);
  if (act === 'agent-new') return openAgentForm(null);
  if (act === 'agent-edit') return openAgentForm(agentById(agentId));
  if (act === 'promote') { const a = agentById(agentId); const g = gradeOf(a.grade); return openJournalForm('carriere', null, { agent_id: a.id, type: 'Promotion', avant: a.grade, apres: g?.suivant || '' }); }
  if (act?.startsWith('new-')) return openJournalForm(act.slice(4), null, agentId ? { agent_id: agentId } : {});
  if (act?.startsWith('edit-')) { const tb = act.slice(5); return openJournalForm(tb, S[tb].find((x) => x.id === id)); }
  if (act === 'lift') { const s = S.sanctions.find((x) => x.id === id); try { Object.assign(s, await attempt(() => api.update('sanctions', id, { levee: true }), 'Sanction levée.')); render(); } catch (ex) {} return; }
  if (act === 'param-new') return openParamForm(null);
  if (act === 'param-edit') { const P = PARAMS[S.ui.paramTab]; return openParamForm(S[P.table].find((x) => x.id === id)); }
  if (act === 'role-new') { try { const r = await attempt(() => api.insert('roles', { nom: `Nouveau rôle ${S.roles.length + 1}`, est_admin: false, permissions: ['voir_effectif'], ordre: S.roles.length + 1 }), 'Rôle créé : renommez-le et cochez ses permissions.'); S.roles.push(r); render(); } catch (ex) {} return; }
  if (act === 'role-del') {
    const r = S.roles.find((x) => x.id === id), n = S.profiles.filter((p) => p.role_id === id).length;
    if (r.id === S.me.role_id) return toast('Vous ne pouvez pas supprimer votre propre rôle.', true);
    if (!(await confirmBox(`Supprimer le rôle « ${r.nom} » ?${n ? ` ${n} compte${n > 1 ? 's perdront' : ' perdra'} leurs accès.` : ''}`, 'Supprimer'))) return;
    try { await attempt(() => api.remove('roles', id), 'Rôle supprimé.'); S.roles = S.roles.filter((x) => x.id !== id); S.profiles.forEach((p) => { if (p.role_id === id) p.role_id = null; }); render(); } catch (ex) {}
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!document.getElementById('confirm').hidden) $('#cno')?.click(); else if (!document.getElementById('modal').hidden) closeModal(); }
  if (e.key === 'Enter' && e.target.matches('tr[data-href]')) location.hash = e.target.dataset.href;
});
document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.id === 'demoAs') { api.setAs(el.value); await refreshAll(); location.hash = '#/'; render(); return; }
  if (el.dataset.prof) {
    const p = S.profiles.find((x) => x.id === el.dataset.prof);
    const field = el.dataset.field;
    const value = el.value === '' ? null : field === 'statut' ? el.value : Number(el.value);
    if (field === 'statut' && value === 'actif' && !p.role_id) toast('Pensez à choisir un rôle : sans rôle, le compte ne verra rien.', true);
    try { Object.assign(p, await attempt(() => api.update('profiles', p.id, { [field]: value }), 'Compte mis à jour.')); const nav = document.querySelector('.side'); if (nav) nav.outerHTML = sidebar('admin'); } catch (ex) { drawAccounts(); }
  }
});
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-role]');
  if (!f) return;
  e.preventDefault();
  const id = Number(f.dataset.role);
  const patch = { nom: f.elements.nom.value.trim(), est_admin: f.elements.est_admin.checked, permissions: [...f.querySelectorAll('input[name="perm"]:checked:not(:disabled)')].map((x) => x.value) };
  if (!patch.nom) return toast('Le rôle doit avoir un nom.', true);
  try { const r = await attempt(() => api.update('roles', id, patch), 'Rôle enregistré.'); Object.assign(S.roles.find((x) => x.id === id), r); if (id === S.me.role_id) { await refreshAll(); } render(); } catch (ex) {}
});
document.addEventListener('change', (e) => {
  if (e.target.name === 'est_admin' && e.target.closest('form[data-role]')) e.target.closest('form').querySelectorAll('input[name="perm"]').forEach((c) => { c.disabled = e.target.checked; if (e.target.checked) c.checked = true; });
});
window.addEventListener('hashchange', () => { closeModal(); render(); window.scrollTo(0, 0); });

/* ================================================================== démarrage */
(async function boot() {
  root.innerHTML = '<div class="loading">Chargement…</div>';
  try {
    if (api.demo) {
      const s = await api.list('profiles'), roles = await api.list('roles');
      window.__demoProfiles = s.map((p) => ({ id: p.id, label: `${p.pseudo} — ${p.statut === 'en_attente' ? 'en attente' : roles.find((r) => r.id === p.role_id)?.nom || 'sans rôle'}` }));
    }
    S.session = await api.session();
    S.uid = S.session?.user?.id || null;
    api.onAuth(async (s) => {
      const uid = s?.user?.id || null;
      if (uid === S.uid) return;
      S.uid = uid; S.session = s;
      await refreshAll(); render();
    });
    await refreshAll();
    if (/access_token/.test(location.hash)) history.replaceState(null, '', location.pathname + '#/');
  } catch (e) {
    root.innerHTML = `<div class="login"><div class="card"><h1>Connexion impossible</h1><p>${esc(e.message)}</p><p class="fine">Vérifiez l'adresse et la clé Supabase dans js/config.js.</p></div></div>`;
    return;
  }
  render();
})();
