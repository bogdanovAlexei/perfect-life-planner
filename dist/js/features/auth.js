(function () {
  let authMode = 'login';
  let supabaseClient;
  let authSession = null;

  const dialog = document.getElementById('authDialog');
  const accountButton = document.getElementById('accountButton');
  const title = document.getElementById('authTitle');
  const copy = document.getElementById('authCopy');
  const submitButton = document.getElementById('authSubmit');
  const toggleButton = document.getElementById('authToggle');
  const stateMessage = document.getElementById('authState');
  const emailInput = document.getElementById('authEmail');
  const passwordInput = document.getElementById('authPassword');

  function paintAuthMode() {
    const signup = authMode === 'signup';
    title.textContent = signup ? 'Créer mon compte' : 'Se connecter';
    copy.textContent = signup ? 'Enregistrez votre planning et retrouvez-le sur votre iPhone.' : 'Retrouvez votre planning sur tous vos appareils.';
    submitButton.textContent = signup ? 'Créer mon compte' : 'Se connecter';
    submitButton.dataset.action = 'auth';
    toggleButton.textContent = signup ? 'J’ai déjà un compte' : 'Créer un compte';
    toggleButton.hidden = false;
    passwordInput.autocomplete = signup ? 'new-password' : 'current-password';
  }

  function clearSensitiveFields() {
    passwordInput.value = '';
  }

  function paintSession(session) {
    authSession = session || null;
    const signedIn = Boolean(authSession?.user);
    accountButton.textContent = signedIn ? 'Mon compte' : 'Se connecter';
    accountButton.setAttribute('aria-label', signedIn ? 'Ouvrir mon compte' : 'Se connecter');
    void syncHealthWithSession(authSession);
  }

  async function loadSupabase() {
    if (supabaseClient) return supabaseClient;
    const url = window.PLP_SUPABASE_URL;
    const key = window.PLP_SUPABASE_PUBLISHABLE_KEY;
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url || '') || !String(key || '').startsWith('sb_publishable_')) {
      throw new Error('SUPABASE_CONFIG_MISSING');
    }
    const sdk = await window.PLPSecurity.loadScript('supabase');
    supabaseClient = sdk.createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    return supabaseClient;
  }

  accountButton.addEventListener('click', () => {
    clearSensitiveFields();
    if (authSession?.user) {
      title.textContent = 'Compte connecté';
      copy.textContent = authSession.user.email || 'Votre espace PLP';
      submitButton.textContent = 'Se déconnecter';
      submitButton.dataset.action = 'signout';
      toggleButton.hidden = true;
      stateMessage.textContent = 'Votre session Supabase est active.';
    } else {
      authMode = 'login';
      paintAuthMode();
      stateMessage.textContent = 'Connexion sécurisée via Supabase.';
    }
    dialog.showModal();
  });

  document.getElementById('closeAuth').addEventListener('click', () => {
    clearSensitiveFields();
    dialog.close();
  });

  toggleButton.addEventListener('click', () => {
    authMode = authMode === 'login' ? 'signup' : 'login';
    clearSensitiveFields();
    paintAuthMode();
  });

  submitButton.addEventListener('click', async () => {
    if (submitButton.dataset.action === 'signout') {
      submitButton.disabled = true;
      try {
        const client = await loadSupabase();
        const { error } = await client.auth.signOut({ scope: 'global' });
        if (error) throw error;
        paintSession(null);
        clearSensitiveFields();
        dialog.close();
        notice('Vous êtes déconnecté de PLP.');
      } catch {
        stateMessage.textContent = 'La déconnexion distante a échoué. Réessayez dans quelques instants.';
      } finally {
        submitButton.disabled = false;
      }
      return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!emailInput.validity.valid || password.length < 8 || password.length > 128) {
      stateMessage.textContent = 'Saisissez un email valide et un mot de passe de 8 à 128 caractères.';
      return;
    }

    submitButton.disabled = true;
    stateMessage.textContent = 'Connexion en cours…';
    try {
      const modeBeforeSubmit = authMode;
      const client = await loadSupabase();
      const result = modeBeforeSubmit === 'signup'
        ? await client.auth.signUp({ email, password })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      clearSensitiveFields();
      paintSession(result.data?.session || null);

      if (modeBeforeSubmit === 'signup' && !result.data?.session) {
        authMode = 'login';
        paintAuthMode();
        stateMessage.textContent = 'Compte créé. Vérifiez votre email puis connectez-vous.';
        notice('Votre compte PLP est créé.');
      } else {
        stateMessage.textContent = 'Connexion réussie.';
        notice('Vous êtes connecté à PLP.');
        setTimeout(() => dialog.close(), 900);
      }
    } catch (error) {
      stateMessage.textContent = error?.message === 'SUPABASE_CONFIG_MISSING'
        ? 'La connexion sécurisée n’est pas encore configurée.'
        : window.PLPSecurity.authMessage(error);
    } finally {
      submitButton.disabled = false;
    }
  });

  (async () => {
    try {
      const client = await loadSupabase();
      const current = await client.auth.getSession();
      paintSession(current.data?.session || null);
      client.auth.onAuthStateChange((_event, session) => paintSession(session));
    } catch {
      paintSession(null);
    }
  })();
}());
