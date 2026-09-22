(function () {
  const TABLE = 'user_planner_schedules';
  const EMPTY_SCHEDULE = { events: [], freshMode: true, hideFlexible: false };
  const MAX_SCHEDULE_BYTES = 2 * 1024 * 1024;
  const MIN_PASSWORD_LENGTH = 8;
  const MAX_PASSWORD_LENGTH = 128;

  const planner = window.PLPPlanner;
  const signedOutPanel = document.getElementById('signedOutPanel');
  const signedInPanel = document.getElementById('signedInPanel');
  const authForm = document.getElementById('accountAuthForm');
  const authEmail = document.getElementById('accountEmail');
  const authPassword = document.getElementById('accountPassword');
  const authSubmit = document.getElementById('accountSubmit');
  const modeToggle = document.getElementById('accountModeToggle');
  const message = document.getElementById('accountMessage');
  const badge = document.getElementById('accountBadge');
  const intro = document.getElementById('accountIntro');
  const transfer = document.getElementById('scheduleTransfer');

  let supabaseClient = null;
  let authSession = null;
  let authMode = 'login';
  let saveTimer = 0;
  let saveQueue = Promise.resolve();
  let activeScheduleUserId = null;
  let scheduleReady = false;
  let localImportCandidate = null;
  let transitionId = 0;
  let unsubscribePlanner = null;

  function setMessage(text, kind = '') {
    message.textContent = text;
    message.dataset.kind = kind;
  }

  function accountError(error, fallback = 'Cette action a échoué. Réessayez dans quelques instants.') {
    const messageText = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '').toLowerCase();
    const status = Number(error?.status || 0);
    if (code === 'invalid_credentials' || status === 400) return 'Adresse email ou mot de passe incorrect.';
    if (code === 'email_not_confirmed') return 'Confirmez votre adresse email avant de continuer.';
    if (code === 'user_already_exists') return 'Un compte existe déjà avec cette adresse.';
    if (code === 'weak_password' || messageText.includes('password should be')) return 'Choisissez un mot de passe plus difficile à deviner.';
    if (status === 429 || code.includes('rate_limit')) return 'Trop de tentatives. Réessayez dans quelques minutes.';
    if (messageText.includes('user_planner_schedules') || messageText.includes('schema cache')) {
      return 'Le stockage privé du planning n’est pas encore disponible. Réessayez plus tard ou contactez le support PLP.';
    }
    if (status >= 500) return fallback;
    return fallback;
  }

  function paintMode() {
    const signup = authMode === 'signup';
    authSubmit.textContent = signup ? 'Créer mon compte' : 'Se connecter';
    modeToggle.textContent = signup ? 'J’ai déjà un compte' : 'Créer un compte';
    authPassword.autocomplete = signup ? 'new-password' : 'current-password';
    intro.textContent = signup
      ? 'Créez un compte personnel pour enregistrer votre planning privé.'
      : 'Connectez-vous pour retrouver votre emploi du temps et vos informations sur vos appareils.';
  }

  function paintIdentity(user) {
    const email = String(user?.email || 'Adresse email non renseignée');
    document.getElementById('profileEmail').textContent = email;
    document.getElementById('accountAvatar').textContent = (email[0] || 'P').toUpperCase();
    const createdAt = user?.created_at ? new Date(user.created_at) : null;
    const createdLabel = createdAt && !Number.isNaN(createdAt.valueOf())
      ? `Compte créé le ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(createdAt)}`
      : 'Compte personnel PLP';
    const emailState = user?.email_confirmed_at ? 'Email vérifié' : 'Email à confirmer';
    const signedInAt = user?.last_sign_in_at ? new Date(user.last_sign_in_at) : null;
    const activityLabel = signedInAt && !Number.isNaN(signedInAt.valueOf())
      ? `Dernière connexion le ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(signedInAt)}`
      : 'Aucune connexion précédente';
    document.getElementById('profileCreated').textContent = `${createdLabel} · ${emailState} · ${activityLabel}`;
  }

  function paintSession(session) {
    authSession = session?.user ? session : null;
    const signedIn = Boolean(authSession?.user);
    signedOutPanel.hidden = signedIn;
    signedInPanel.hidden = !signedIn;
    badge.textContent = signedIn ? 'Connecté' : 'Hors connexion';
    badge.dataset.state = signedIn ? 'connected' : '';
    if (signedIn) {
      paintIdentity(authSession.user);
      intro.textContent = 'Gérez ici les informations de votre compte et votre planning personnel.';
    } else {
      paintMode();
    }
  }

  async function getClient() {
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

  window.PLPAuth = {
    get session() { return authSession; },
    get client() { return supabaseClient; },
    getClient,
  };

  function clearPlanner() {
    planner.replaceSchedule(EMPTY_SCHEDULE);
  }

  function clearTransferChoice() {
    transfer.hidden = true;
    localImportCandidate = null;
  }

  function showTransferChoice(schedule) {
    localImportCandidate = schedule;
    const count = schedule.events.length;
    document.getElementById('transferMessage').textContent = count
      ? `Un ancien planning enregistré sur cet appareil (${count} plage${count > 1 ? 's' : ''}) n’est associé à aucun compte. Ne l’importez que s’il vous appartient.`
      : 'Un ancien planning est enregistré sur cet appareil. Ne l’importez que s’il vous appartient.';
    transfer.hidden = false;
  }

  async function loadPersonalSchedule(session, savedLocalSchedule, currentTransition) {
    const userId = session?.user?.id;
    if (!userId) return;
    const client = await getClient();
    const result = await client.from(TABLE).select('schedule_data, updated_at').eq('user_id', userId).maybeSingle();
    if (result.error) throw result.error;
    if (currentTransition !== transitionId || authSession?.user?.id !== userId) return;

    if (result.data?.schedule_data) {
      planner.replaceSchedule(result.data.schedule_data);
      clearTransferChoice();
      setMessage(result.data.updated_at
        ? `Votre planning personnel est synchronisé · ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(result.data.updated_at))}.`
        : 'Votre planning personnel est synchronisé.', 'success');
    } else {
      clearPlanner();
      if (savedLocalSchedule && (savedLocalSchedule.events.length || savedLocalSchedule.freshMode === false)) showTransferChoice(savedLocalSchedule);
      else clearTransferChoice();
      setMessage('Votre planning personnel est prêt. Il sera enregistré automatiquement dans ce compte.', 'success');
    }

    badge.textContent = result.data ? 'Synchronisé' : 'Prêt';
    badge.dataset.state = 'connected';
    activeScheduleUserId = userId;
    scheduleReady = true;
    if (unsubscribePlanner) unsubscribePlanner();
    unsubscribePlanner = planner.subscribe(() => schedulePersonalSave(userId));
  }

  function schedulePersonalSave(userId) {
    if (!scheduleReady || !authSession?.user || authSession.user.id !== userId) return;
    clearTimeout(saveTimer);
    badge.textContent = 'Enregistrement…';
    badge.dataset.state = 'pending';
    saveTimer = window.setTimeout(() => {
      const snapshot = planner.getScheduleSnapshot();
      const encoded = JSON.stringify(snapshot);
      if (new Blob([encoded]).size > MAX_SCHEDULE_BYTES) {
        setMessage('Ce planning est trop volumineux pour être synchronisé. Réduisez le nombre de plages ou de descriptions.', 'error');
        badge.textContent = 'Non synchronisé';
        return;
      }
      saveQueue = saveQueue.catch(() => {}).then(async () => {
        if (!authSession?.user || authSession.user.id !== userId || !scheduleReady) return;
        const client = await getClient();
        const result = await client.from(TABLE).upsert({
          user_id: userId,
          schedule_data: snapshot,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (result.error) throw result.error;
        if (authSession?.user?.id === userId) {
          badge.textContent = 'Synchronisé';
          badge.dataset.state = 'connected';
          setMessage('Votre planning personnel est enregistré dans ce compte.', 'success');
        }
      }).catch((error) => {
        if (authSession?.user?.id === userId) {
          badge.textContent = 'Hors synchronisation';
          badge.dataset.state = 'pending';
          setMessage(accountError(error, 'La synchronisation du planning a échoué. Vos changements restent sur cet appareil.'), 'error');
        }
      });
    }, 500);
  }

  async function transitionSession(session) {
    const nextSession = session?.user ? session : null;
    const previousUserId = authSession?.user?.id || null;
    const nextUserId = nextSession?.user?.id || null;

    if (nextUserId && nextUserId === activeScheduleUserId && scheduleReady) {
      authSession = nextSession;
      paintSession(nextSession);
      return;
    }
    if (!nextUserId && !previousUserId && !activeScheduleUserId) {
      authSession = null;
      paintSession(null);
      document.body.classList.remove('account-loading');
      return;
    }

    const currentTransition = ++transitionId;
    const mayOfferLocalSchedule = !previousUserId;
    const localSchedule = mayOfferLocalSchedule ? planner.getScheduleSnapshot() : null;
    clearTimeout(saveTimer);
    scheduleReady = false;
    activeScheduleUserId = null;
    if (unsubscribePlanner) {
      unsubscribePlanner();
      unsubscribePlanner = null;
    }
    authSession = nextSession;
    paintSession(nextSession);
    if (nextUserId || previousUserId) window.clearLocalHealth?.();

    if (!nextUserId) {
      clearTransferChoice();
      clearPlanner();
      setMessage('Vous êtes déconnecté. Votre prochain planning sera local à cet appareil.', '');
      void window.syncHealthWithSession?.(null);
      return;
    }

    badge.textContent = 'Chargement…';
    badge.dataset.state = 'pending';
    setMessage('Chargement de votre planning privé…');
    clearPlanner();
    try {
      await loadPersonalSchedule(nextSession, localSchedule, currentTransition);
      if (currentTransition === transitionId) void window.syncHealthWithSession?.(nextSession);
    } catch (error) {
      if (currentTransition !== transitionId) return;
      clearPlanner();
      badge.textContent = 'Synchronisation indisponible';
      badge.dataset.state = 'pending';
      setMessage(accountError(error, 'Impossible de charger le planning privé. Aucun planning local n’a été rattaché à ce compte.'), 'error');
    } finally {
      if (currentTransition === transitionId) document.body.classList.remove('account-loading');
    }
  }

  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = authEmail.value.trim();
    const password = authPassword.value;
    if (!authEmail.validity.valid || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      setMessage('Saisissez une adresse email valide et un mot de passe de 8 à 128 caractères.', 'error');
      return;
    }

    authSubmit.disabled = true;
    setMessage(authMode === 'signup' ? 'Création du compte…' : 'Connexion en cours…');
    try {
      const client = await getClient();
      const result = authMode === 'signup'
        ? await client.auth.signUp({ email, password })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      authPassword.value = '';
      if (authMode === 'signup' && !result.data?.session) {
        authMode = 'login';
        paintMode();
        setMessage('Compte créé. Vérifiez votre email pour confirmer votre adresse, puis connectez-vous.', 'success');
      } else {
        setMessage('Connexion réussie. Chargement de votre planning personnel…', 'success');
      }
    } catch (error) {
      setMessage(error?.message === 'SUPABASE_CONFIG_MISSING'
        ? 'La connexion sécurisée n’est pas encore configurée.'
        : accountError(error, 'La connexion a échoué. Réessayez dans quelques instants.'), 'error');
    } finally {
      authSubmit.disabled = false;
    }
  });

  modeToggle.addEventListener('click', () => {
    authMode = authMode === 'login' ? 'signup' : 'login';
    authPassword.value = '';
    paintMode();
    setMessage(authMode === 'signup' ? 'Votre planning ne sera enregistré dans le compte qu’après la confirmation de l’import.' : 'Entrez les identifiants de votre compte PLP.');
  });

  document.getElementById('accountSignOut').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const client = await getClient();
      const result = await client.auth.signOut({ scope: 'local' });
      if (result.error) throw result.error;
      setMessage('Vous êtes déconnecté. Le planning de ce compte n’est plus affiché sur cet appareil.', 'success');
    } catch (error) {
      setMessage(accountError(error, 'La déconnexion a échoué. Réessayez dans quelques instants.'), 'error');
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('changeEmailForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('newAccountEmail');
    const email = input.value.trim();
    if (!input.validity.valid || !authSession?.user) {
      setMessage('Saisissez une adresse email valide.', 'error');
      return;
    }
    try {
      const client = await getClient();
      const result = await client.auth.updateUser({ email });
      if (result.error) throw result.error;
      input.value = '';
      setMessage('Demande envoyée. Confirmez la nouvelle adresse à partir du message reçu avant qu’elle remplace l’adresse actuelle.', 'success');
    } catch (error) {
      setMessage(accountError(error, 'La demande de changement d’email a échoué.'), 'error');
    }
  });

  document.getElementById('changePasswordForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const current = document.getElementById('currentAccountPassword');
    const next = document.getElementById('newAccountPassword');
    const confirmation = document.getElementById('confirmAccountPassword');
    if (next.value.length < MIN_PASSWORD_LENGTH || next.value.length > MAX_PASSWORD_LENGTH || next.value !== confirmation.value) {
      setMessage('Le nouveau mot de passe doit compter 8 à 128 caractères et les deux saisies doivent correspondre.', 'error');
      return;
    }
    if (!authSession?.user?.email || !current.value) {
      setMessage('Saisissez votre mot de passe actuel pour confirmer cette modification.', 'error');
      return;
    }
    try {
      const client = await getClient();
      const verified = await client.auth.signInWithPassword({ email: authSession.user.email, password: current.value });
      if (verified.error) throw verified.error;
      const changed = await client.auth.updateUser({ password: next.value });
      if (changed.error) throw changed.error;
      current.value = '';
      next.value = '';
      confirmation.value = '';
      setMessage('Votre mot de passe a été changé.', 'success');
    } catch (error) {
      setMessage(accountError(error, 'Le changement de mot de passe a échoué.'), 'error');
    }
  });

  document.getElementById('importLocalSchedule').addEventListener('click', () => {
    if (!localImportCandidate || !authSession?.user || !scheduleReady) return;
    planner.replaceSchedule(localImportCandidate);
    clearTransferChoice();
    setMessage('Ancien planning importé dans ce compte. Synchronisation en cours…', 'success');
  });

  document.getElementById('discardLocalSchedule').addEventListener('click', () => {
    clearTransferChoice();
    setMessage('L’ancien planning de cet appareil n’a pas été importé dans ce compte.', 'success');
  });

  (async () => {
    try {
      const client = await getClient();
      client.auth.onAuthStateChange((event, session) => {
        if (event === 'INITIAL_SESSION') return;
        window.setTimeout(() => {
          void transitionSession(session).then(() => {
            if (session?.user && ['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
              void window.syncHealthWithSession?.(session);
            }
          });
        }, 0);
      });
      const result = await client.auth.getSession();
      if (result.error) throw result.error;
      await transitionSession(result.data?.session || null);
    } catch (error) {
      authSession = null;
      paintSession(null);
      document.body.classList.remove('account-loading');
      setMessage(error?.message === 'SUPABASE_CONFIG_MISSING'
        ? 'La connexion Supabase n’est pas configurée. Votre planning reste enregistré sur cet appareil.'
        : 'Connexion Supabase indisponible. Vous pouvez utiliser un planning local sur cet appareil.', 'error');
    }
  })();
}());
