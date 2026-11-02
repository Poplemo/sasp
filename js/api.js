/* Accès aux données : Supabase en ligne, ou mode démonstration (localStorage) si la config est vide.
   Les deux exposent la même interface : session, signIn, signOut, me, list, insert, update, remove. */

const PERMISSIONS = [
  { key: 'voir_effectif', label: "Voir l'effectif", help: 'Liste des agents et tableau de bord.' },
  { key: 'voir_suivi', label: 'Voir les fiches et journaux', help: 'Carrière, formations, appréciations de tous les agents.' },
  { key: 'voir_sanctions', label: 'Voir les sanctions', help: 'Sanctions de tous les agents.' },
  { key: 'ecrire_appreciations', label: 'Noter les agents', help: 'Ajouter des points d\'appréciation.' },
  { key: 'ecrire_formations', label: 'Valider des formations', help: 'Enregistrer les formations suivies.' },
  { key: 'ecrire_sanctions', label: 'Émettre des sanctions', help: 'Créer, modifier et lever des sanctions.' },
  { key: 'gerer_carriere', label: 'Gérer les agents et carrières', help: 'Ajouter un agent, promouvoir, muter, modifier une fiche.' },
  { key: 'gerer_parametres', label: 'Modifier les paramètres', help: 'Grades, formations, sanctions, divisions, critères.' },
  { key: 'gerer_utilisateurs', label: 'Gérer les comptes et rôles', help: 'Valider les inscriptions, attribuer les rôles.' },
];

function createApi() {
  const cfg = window.SASP_CONFIG || {};
  return cfg.supabaseUrl && cfg.supabaseAnonKey ? supabaseApi(cfg) : demoApi();
}

/* ------------------------------------------------------------------ Supabase */
function supabaseApi(cfg) {
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const fail = (error) => {
    if (!error) return;
    const msg = /row-level security|permission denied|JSON object requested/i.test(error.message)
      ? "Action refusée : votre rôle n'a pas la permission nécessaire."
      : error.message;
    throw new Error(msg);
  };
  return {
    demo: false,
    async session() { return (await client.auth.getSession()).data.session; },
    onAuth(cb) { client.auth.onAuthStateChange((_e, s) => cb(s)); },
    async signIn() {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'discord',
        options: { redirectTo: location.origin + location.pathname },
      });
      fail(error);
    },
    async signOut() { await client.auth.signOut(); },
    async me() {
      const { data: { user } } = await client.auth.getUser();
      if (!user) return null;
      const { data, error } = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
      fail(error);
      return data;
    },
    async list(table) {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await client.from(table).select('*').order('id').range(from, from + 999);
        fail(error);
        rows.push(...data);
        if (data.length < 1000) break;
      }
      return rows;
    },
    async insert(table, row) {
      const { data, error } = await client.from(table).insert(row).select().single();
      fail(error); return data;
    },
    async update(table, id, patch) {
      const { data, error } = await client.from(table).update(patch).eq('id', id).select().single();
      fail(error); return data;
    },
    async remove(table, id) {
      const { error, count } = await client.from(table).delete({ count: 'exact' }).eq('id', id);
      fail(error);
      if (count === 0) throw new Error("Action refusée : votre rôle n'a pas la permission nécessaire.");
    },
  };
}

/* ------------------------------------------------------------------ Mode démonstration */
function demoApi() {
  const KEY = 'sasp-demo-v1';
  const AUTH = 'sasp-demo-auth';
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  let mem = null; // si localStorage est indisponible
  const fresh = () => {
    const s = JSON.parse(JSON.stringify(window.SEED));
    const withIds = (rows) => rows.map((r, i) => ({ id: r.id || i + 1, ...r }));
    for (const k of Object.keys(s)) s[k] = withIds(s[k]);
    s.roles = withIds([
      { nom: 'Administrateur', est_admin: true, permissions: [], ordre: 1 },
      { nom: 'Command Staff', est_admin: false, permissions: PERMISSIONS.map((p) => p.key), ordre: 2 },
      { nom: 'Superviseur', est_admin: false, permissions: ['voir_effectif', 'voir_suivi', 'voir_sanctions', 'ecrire_appreciations', 'ecrire_formations', 'ecrire_sanctions'], ordre: 3 },
      { nom: 'Formateur', est_admin: false, permissions: ['voir_effectif', 'voir_suivi', 'ecrire_appreciations', 'ecrire_formations'], ordre: 4 },
      { nom: 'Agent', est_admin: false, permissions: ['voir_effectif'], ordre: 5 },
    ]);
    s.profiles = [
      { id: 'demo-admin', pseudo: '.Poplemo', avatar_url: null, statut: 'actif', role_id: 1, agent_id: 4, created_at: '2026-11-01T10:00:00Z' },
      { id: 'demo-sup', pseudo: 'meyroox', avatar_url: null, statut: 'actif', role_id: 3, agent_id: 6, created_at: '2026-11-01T12:00:00Z' },
      { id: 'demo-new', pseudo: 'titusandronicus', avatar_url: null, statut: 'en_attente', role_id: null, agent_id: null, created_at: '2026-11-02T09:00:00Z' },
    ];
    // Quelques lignes d'exemple pour que les journaux ne soient pas vides.
    s.carriere = withIds([
      { date: '2026-10-25', agent_id: 7, type: "Entrée à l'académie", avant: '', apres: 'Rookie', decide_par: 'Will Karter', commentaire: 'Recrutement session d\'octobre' },
      { date: '2026-10-25', agent_id: 8, type: "Entrée à l'académie", avant: '', apres: 'Rookie', decide_par: 'Will Karter', commentaire: '' },
    ]);
    s.appreciations = withIds([
      { date: '2026-10-29', agent_id: 7, referent: 'Will Karter', critere: 'Communication radio', points: 3, justification: 'Annonces radio claires pendant la poursuite.' },
      { date: '2026-10-31', agent_id: 7, referent: 'Aaron Smith', critere: 'Respect des procédures', points: 4, justification: 'Arrestation conforme, Miranda lu au menottage.' },
      { date: '2026-11-01', agent_id: 8, referent: 'Will Karter', critere: 'Présence et ponctualité', points: -2, justification: 'Absent au briefing sans prévenir.' },
    ]);
    s.sanctions = withIds([
      { date: '2026-11-01', agent_id: 8, type: 'Avertissement oral', motif: 'Absence non justifiée au briefing', emise_par: 'Will Karter', fin: '2026-11-15', levee: false },
    ]);
    return s;
  };
  const load = () => store.get(KEY) || mem || (mem = fresh());
  const save = (s) => { mem = s; store.set(KEY, s); };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const listeners = [];
  const authed = () => store.get(AUTH) === true;
  return {
    demo: true,
    async session() { return authed() ? { user: { id: 'demo-admin' } } : null; },
    onAuth(cb) { listeners.push(cb); },
    async signIn() { store.set(AUTH, true); listeners.forEach((cb) => cb({ user: { id: 'demo-admin' } })); },
    async signOut() { store.set(AUTH, false); listeners.forEach((cb) => cb(null)); },
    async me() {
      const as = store.get('sasp-demo-as') || 'demo-admin';
      return clone(load().profiles.find((p) => p.id === as) || load().profiles[0]);
    },
    setAs(id) { store.set('sasp-demo-as', id); },
    getAs() { return store.get('sasp-demo-as') || 'demo-admin'; },
    async list(table) { return clone(load()[table] || []); },
    async insert(table, row) {
      const s = load();
      const rows = s[table] || (s[table] = []);
      const id = rows.reduce((m, r) => Math.max(m, typeof r.id === 'number' ? r.id : 0), 0) + 1;
      const rec = { id, ...row };
      rows.push(rec); save(s); return clone(rec);
    },
    async update(table, id, patch) {
      const s = load();
      const r = (s[table] || []).find((x) => x.id === id);
      if (!r) throw new Error('Ligne introuvable.');
      Object.assign(r, patch); save(s); return clone(r);
    },
    async remove(table, id) {
      const s = load();
      s[table] = (s[table] || []).filter((x) => x.id !== id);
      if (table === 'agents') for (const t of ['carriere', 'formations', 'appreciations', 'sanctions']) s[t] = s[t].filter((x) => x.agent_id !== id);
      save(s);
    },
    reset() { store.set(KEY, null); mem = null; try { localStorage.removeItem(KEY); } catch (e) {} },
  };
}
