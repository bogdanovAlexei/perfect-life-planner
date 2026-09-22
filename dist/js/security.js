(function () {
  const mebibyte = 1024 * 1024;
  const scriptPromises = new Map();

  const limits = Object.freeze({
    scheduleImageBytes: 12 * mebibyte,
    healthFileBytes: 30 * mebibyte,
    archiveEntries: 200,
    archiveEntryBytes: 20 * mebibyte,
    archiveExpandedBytes: 80 * mebibyte,
    textImportBytes: 10 * mebibyte,
  });

  const scripts = Object.freeze({
    supabase: Object.freeze({
      url: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0',
      integrity: 'sha384-JBR+x8blGwjDRO63aHCGiZMD4VNiTR4ZUGA+N6ZKLf3zNt1fK8IBpcgPaMrxqWBp',
      globalName: 'supabase',
    }),
    jszip: Object.freeze({
      url: 'https://cdn.jsdelivr.net/npm/jszip@3.10.2/dist/jszip.min.js',
      integrity: 'sha384-DdGlNq+wVXAn83gXqwyeFHB7iyXy6L0rLrNzgDmhKWPjiJLg9vj6qosYmZmkMfQ+',
      globalName: 'JSZip',
    }),
    tesseract: Object.freeze({
      url: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
      integrity: 'sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F',
      globalName: 'Tesseract',
    }),
  });

  function loadScript(name) {
    const definition = scripts[name];
    if (!definition) return Promise.reject(new Error('DEPENDENCY_NOT_ALLOWED'));
    if (window[definition.globalName]) return Promise.resolve(window[definition.globalName]);
    if (scriptPromises.has(name)) return scriptPromises.get(name);

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = definition.url;
      script.integrity = definition.integrity;
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer';
      script.onload = () => window[definition.globalName]
        ? resolve(window[definition.globalName])
        : reject(new Error('DEPENDENCY_UNAVAILABLE'));
      script.onerror = () => reject(new Error('DEPENDENCY_UNAVAILABLE'));
      document.head.appendChild(script);
    });
    scriptPromises.set(name, promise);
    promise.catch(() => scriptPromises.delete(name));
    return promise;
  }

  function extensionOf(file) {
    return String(file?.name || '').split('.').pop().toLowerCase();
  }

  function validateFile(file, options) {
    if (!(file instanceof Blob)) throw new Error('Fichier invalide.');
    if (!file.size) throw new Error('Le fichier est vide.');
    if (file.size > options.maxBytes) throw new Error(options.sizeMessage);
    const extension = extensionOf(file);
    if (options.extensions && !options.extensions.includes(extension)) throw new Error(options.typeMessage);
    if (options.mimePrefixes?.length && file.type && !options.mimePrefixes.some((prefix) => file.type.startsWith(prefix))) {
      throw new Error(options.typeMessage);
    }
    return extension;
  }

  function authMessage(error) {
    const code = String(error?.code || '').toLowerCase();
    const status = Number(error?.status || 0);
    if (code === 'invalid_credentials' || status === 400) return 'Email ou mot de passe incorrect.';
    if (code === 'email_not_confirmed') return 'Confirmez votre adresse email avant de vous connecter.';
    if (code === 'user_already_exists') return 'Un compte existe déjà avec cette adresse.';
    if (code === 'weak_password') return 'Choisissez un mot de passe plus difficile à deviner.';
    if (status === 429 || code.includes('rate_limit')) return 'Trop de tentatives. Réessayez dans quelques minutes.';
    return 'La connexion a échoué. Réessayez dans quelques instants.';
  }

  window.PLPSecurity = Object.freeze({
    limits,
    scripts,
    loadScript,
    validateFile,
    extensionOf,
    authMessage,
  });
}());
