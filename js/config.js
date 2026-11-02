// Configuration du site.
// Laisse ces deux valeurs vides pour le mode démonstration (données d'exemple, dans ce navigateur seulement).
// Pour la mise en ligne : Supabase > Project Settings > API > « Project URL » et « anon public key ».
window.SASP_CONFIG = {
  supabaseUrl: 'https://navknxeslawnreaozkec.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hdmtueGVzbGF3bnJlYW96a2VjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2MTAzMDgsImV4cCI6MjEwOTE4NjMwOH0.fx_79blcRoYk5qj6dX3QVxaqpZQE7XlDZDyucoBI5dk',

  // Nombre de jours sans aucune ligne de suivi avant qu'un agent actif soit signalé.
  joursSansSuivi: 14,
};
