// Siti pubblici: collegamenti dalla configurazione e invio dei moduli.
// Collegato: manda alla funzione «richiesta-sito» di Supabase con la chiave publishable.
// Dentro il pannello di prova (nessuna configurazione): passa la richiesta al pannello, che la mette nella Mail del gestionale.
(function () {
  var cfg = window.MESSINA || {};
  var incorporato = window.parent !== window;
  document.querySelectorAll('[data-link]').forEach(function (a) {
    var u = cfg[a.getAttribute('data-link')];
    if (u) a.setAttribute('href', u);
  });
  if (incorporato) {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-link]');
      if (!a || cfg[a.getAttribute('data-link')]) return;
      e.preventDefault();
      parent.postMessage({ tipo: 'messina-vai', dove: a.getAttribute('data-link') }, '*');
    });
  }

  document.querySelectorAll('form[data-sito]').forEach(function (f) {
    var esito = f.querySelector('.esito');
    var btn = f.querySelector('button[type=submit]');
    var testoBtn = btn.textContent;
    function mostra(tipo, msg) { esito.hidden = false; esito.className = 'esito ' + tipo; esito.textContent = msg; esito.focus(); }
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!f.reportValidity()) return;
      var d = new FormData(f), dettagli = {};
      f.querySelectorAll('[data-dettaglio]').forEach(function (el) {
        var k = el.getAttribute('data-dettaglio');
        if (el.type === 'checkbox') { if (el.checked) (dettagli[k] = dettagli[k] || []).push(el.value); }
        else if (el.value.trim()) dettagli[k] = el.value.trim();
      });
      var corpo = {
        sito: f.getAttribute('data-sito'), nome: d.get('nome'), azienda: d.get('azienda'), email: d.get('email'),
        telefono: d.get('telefono'), note: d.get('note'), dettagli: dettagli, privacy: !!d.get('privacy'), sito_web: d.get('sito_web') || '',
      };
      btn.disabled = true; btn.textContent = 'Invio in corso';
      var invio;
      if (cfg.supabaseUrl && cfg.supabaseKey) {
        invio = fetch(cfg.supabaseUrl + '/functions/v1/richiesta-sito', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseKey, Authorization: 'Bearer ' + cfg.supabaseKey },
          body: JSON.stringify(corpo),
        }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.errore || 'Invio non riuscito'); }); });
      } else if (incorporato) {
        parent.postMessage({ tipo: 'messina-sito', corpo: corpo }, '*');
        invio = new Promise(function (ok) { setTimeout(ok, 450); });
      } else {
        invio = Promise.reject(new Error('Il modulo si attiva quando il sito è collegato. Nel frattempo scriveteci una mail.'));
      }
      invio.then(function () {
        f.reset();
        mostra('ok', f.getAttribute('data-ok'));
      }, function (err) {
        mostra('ko', err.message || 'Invio non riuscito: riprovate o scriveteci una mail.');
      }).then(function () { btn.disabled = false; btn.textContent = testoBtn; });
    });
  });
})();
