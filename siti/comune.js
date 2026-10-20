// Siti pubblici: menu, collegamenti dalla configurazione, moduli, tracciamento.
// Pubblicato: ogni pagina è un file vero (/servizi/trasporto/). Anteprima (un solo file, dentro il pannello di prova):
// tutte le pagine sono nello stesso documento e questo script le mostra una alla volta.
(function () {
  var cfg = window.MESSINA || {};
  var incorporato = window.parent !== window;
  var anteprima = document.body.hasAttribute('data-anteprima');

  // menu su telefono e tablet
  var top = document.querySelector('.top'), apri = document.querySelector('.apri');
  function chiudiMenu() { if (top) { top.classList.remove('aperto'); apri && apri.setAttribute('aria-expanded', 'false'); } }
  if (apri) apri.addEventListener('click', function () {
    var on = !top.classList.contains('aperto');
    top.classList.toggle('aperto', on); apri.setAttribute('aria-expanded', on ? 'true' : 'false');
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') chiudiMenu(); });

  // collegamenti verso gli altri siti (negozio, area clienti, società sorella)
  document.querySelectorAll('[data-link]').forEach(function (a) {
    var u = cfg[a.getAttribute('data-link')];
    if (u) a.setAttribute('href', u);
  });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a'); if (!a) return;
    var l = a.getAttribute('data-link');
    if (l && !cfg[l]) {
      e.preventDefault();
      if (incorporato) parent.postMessage({ tipo: 'messina-vai', dove: l }, '*');
      return;
    }
    if (!anteprima) return;
    var h = a.getAttribute('href') || '';
    if (h.charAt(0) === '#' && h.length > 1) { chiudiMenu(); return; }      // ancora nella stessa pagina
    if (h.charAt(0) !== '/') return;
    e.preventDefault(); chiudiMenu();
    vai(h);
  });

  // anteprima: una pagina alla volta
  function vai(h) {
    var parti = h.split('#'), path = parti[0] || '/', ancora = parti[1];
    var pag = document.querySelector('main[data-path="' + path + '"]') || document.querySelector('main[data-path="/"]');
    document.querySelectorAll('main[data-path]').forEach(function (m) { m.hidden = m !== pag; });
    document.querySelectorAll('.menu a[href^="/"]').forEach(function (a) {
      var p = a.getAttribute('href');
      if (p !== '/' && path.indexOf(p) === 0) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = pag.getAttribute('data-titolo');
    if (incorporato) parent.postMessage({ tipo: 'messina-pagina', path: path }, '*');
    var el = ancora && pag.querySelector('#' + ancora);
    if (el) el.scrollIntoView(); else window.scrollTo(0, 0);
  }
  if (anteprima) vai('/');

  // moduli: preventivo, ritiro, candidatura, contatto, lotto
  document.querySelectorAll('form[data-sito]').forEach(function (f) {
    var esito = f.querySelector('.esito'), btn = f.querySelector('button[type=submit]'), testoBtn = btn.textContent;
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
        sito: f.getAttribute('data-sito'), tipo: f.getAttribute('data-tipo'), nome: d.get('nome'), azienda: d.get('azienda'), email: d.get('email'),
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
      invio.then(function () { f.reset(); mostra('ok', f.getAttribute('data-ok')); },
        function (err) { mostra('ko', err.message || 'Invio non riuscito: riprovate o scriveteci una mail.'); })
        .then(function () { btn.disabled = false; btn.textContent = testoBtn; });
    });
  });

  // tracciamento: nell'anteprima mostra un esempio; pubblicato si attiva con il servizio di tracciamento del sistema
  document.querySelectorAll('form[data-traccia]').forEach(function (f) {
    var out = f.querySelector('.traccia-esito');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!f.reportValidity()) return;
      var n = String(new FormData(f).get('numero')).trim().replace(/[<>&"]/g, '');
      out.hidden = false;
      if (!incorporato && !anteprima) {
        out.className = 'traccia-esito esito ko';
        out.textContent = 'Il tracciamento online si attiva con il nuovo sistema. Nel frattempo trovate le spedizioni nell\'area clienti o chiamateci.';
        return;
      }
      var fatta = /[02468]$/.test(n);
      var righe = [['Ritirata', 'Lacchiarella (MI)', '08:10'], ['In magazzino', 'Controllata con lo scanner', '09:02'], ['Partita', 'Nel giro del mattino', '10:15'],
        [fatta ? 'Consegnata' : 'In consegna', fatta ? 'Firmata, con foto della bolla e posizione' : 'Arrivo previsto entro le 13', fatta ? '11:42' : '']];
      out.className = 'traccia-esito';
      out.innerHTML = '<b style="font-size:18px">Spedizione ' + n + '</b><ol class="tl">' + righe.map(function (r, i) {
        return '<li' + (!fatta && i === 3 ? ' class="dopo"' : '') + '><span></span><span><b>' + r[0] + '</b><br><small>' + r[1] + '</small></span><small>' + r[2] + '</small></li>';
      }).join('').replace(/<li([^>]*)><span><\/span>/g, '<li$1>') + '</ol><p class="muted" style="font-size:14px;margin-top:8px">Esempio: nella prova ogni numero dà un risultato di prova.</p>';
      out.focus();
    });
  });
})();
