/* Reading Prep: форма, оцінка відповідності (в браузері) і потокова генерація конспекту через Worker. */
(function () {
  'use strict';
  var form = document.getElementById('pp-form');
  if (!form) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var story = $('#pp-story'), count = $('#pp-count'), go = $('#pp-go');
  var sheet = $('#pp-sheet'), out = $('#pp-out'), empty = $('#pp-empty'), err = $('#pp-error');
  var tools = $('#pp-tools'), next = $('#pp-next'), title = $('#pp-title');
  var voices = $$('.pp-voice');
  var PRIOR = { love: 'maya-r', work: 'ruth-a', change: 'leila-t', spirit: 'iris-o' };
  var locked = false;
  var busy = false;
  var raw = '';

  function endpoint() {
    var h = location.hostname;
    var local = h === '127.0.0.1' || h === 'localhost';
    if (local) {
      var m = /[?&]wp=(\d+)/.exec(location.search);
      return 'http://127.0.0.1:' + (m ? m[1] : '8793') + '/api/ai-prep/';
    }
    return (window.OPN_PREP && window.OPN_PREP.endpoint) || '/api/ai-prep/';
  }

  /* ---------- оцінка відповідності ---------- */
  function scores() {
    var area = (form.elements.area.value || 'other');
    var text = ' ' + story.value.toLowerCase() + ' ';
    return voices.map(function (v) {
      var s = PRIOR[area] === v.dataset.slug ? 3 : 0;
      v.dataset.fit.split(',').forEach(function (k) {
        if (!k) return;
        var re = new RegExp('(^|[^a-z])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(s|es|ed|ing)?([^a-z]|$)');
        if (re.test(text)) s += 1.5;
      });
      return s;
    });
  }
  function updateFit() {
    var sc = scores();
    var max = Math.max.apply(null, sc.concat([1]));
    var best = sc.indexOf(Math.max.apply(null, sc));
    var any = Math.max.apply(null, sc) > 0;
    voices.forEach(function (v, i) {
      var pct = any ? Math.max(12, Math.round(100 * sc[i] / max * (0.35 + 0.65 * Math.min(1, max / 6)))) : 12;
      $('.pp-meter-fill', v).style.width = pct + '%';
      $('.pp-badge', v).hidden = !(any && i === best);
      v.classList.toggle('is-best', any && i === best);
    });
    if (!locked && any) {
      var r = $('input', voices[best]);
      r.checked = true;
    }
  }
  var t;
  function soon() { clearTimeout(t); t = setTimeout(updateFit, 160); }
  story.addEventListener('input', function () {
    count.textContent = story.value.length + ' / 500';
    soon();
  });
  $$('input[name=area]').forEach(function (i) { i.addEventListener('change', updateFit); });
  $$('input[name=reader]').forEach(function (i) { i.addEventListener('change', function () { locked = true; }); });
  var qp = /[?&]reader=([a-z-]+)/.exec(location.search);
  if (qp) {
    var pre = $('input[value="' + qp[1] + '"]', $('#pp-voices'));
    if (pre) { pre.checked = true; locked = true; }
  }
  updateFit();

  /* ---------- розбір потоку ---------- */
  function parse(text) {
    var res = {}, re = /\[\[([A-Z]+)\]\]/g, m, last = null, idx = 0;
    while ((m = re.exec(text))) {
      if (last) res[last] = text.slice(idx, m.index).trim();
      last = m[1]; idx = re.lastIndex;
    }
    if (last) res[last] = text.slice(idx).trim();
    return res;
  }
  function lines(s) {
    return s.split(/\n+/).map(function (l) { return l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim(); }).filter(Boolean);
  }
  function fill(list, items) {
    list.innerHTML = '';
    items.forEach(function (it) { var li = document.createElement('li'); li.textContent = it; list.appendChild(li); });
  }
  function matchReader(s) {
    var found = null;
    voices.forEach(function (v) { if (!found && s.indexOf(v.dataset.name) === 0) found = v; });
    if (!found) voices.forEach(function (v) { if (!found && s.indexOf(v.dataset.name) >= 0) found = v; });
    return found;
  }
  function render(final) {
    var txt = final ? raw : raw.replace(/\[{1,2}[A-Z]*\]?$/, '');
    var p = parse(txt);
    var anyKey = Object.keys(p).length > 0;
    if (!anyKey) {
      // модель не дотрималась розмітки: показуємо текст як єдиний блок (після завершення потоку)
      if (!final) return;
      p = { REFRAME: raw.trim() };
    }
    var blocks = {};
    $$('.pp-block', out).forEach(function (b) { blocks[b.dataset.k] = b; });
    var care = p.CARE;
    Object.keys(blocks).forEach(function (k) {
      var b = blocks[k];
      if (care) { b.hidden = k !== 'CARE'; return; }
      b.hidden = k === 'CARE' || !p[k];
    });
    if (care) {
      $('p', blocks.CARE).textContent = care;
      return;
    }
    if (p.REFRAME) $('.pp-reframe', blocks.REFRAME).textContent = p.REFRAME;
    if (p.QUESTIONS) fill($('.pp-list', blocks.QUESTIONS), lines(p.QUESTIONS).slice(0, 3));
    if (p.SAY) $('.pp-say', blocks.SAY).textContent = p.SAY.replace(/^"|"$/g, '');
    if (p.SKIP) fill($('.pp-skip', blocks.SKIP), lines(p.SKIP).slice(0, 2));
    if (p.MATCH) {
      var box = $('.pp-match', blocks.MATCH);
      var v = matchReader(p.MATCH);
      var why = p.MATCH.replace(/^[^—–-]*[—–-]\s*/, '');
      box.innerHTML = '';
      if (v) {
        var a = document.createElement('a');
        a.className = 'pp-match-card';
        a.href = '/readers/' + v.dataset.slug + '/';
        a.setAttribute('data-nebula-preserve', '1');
        var av = document.createElement('span');
        av.className = 'pp-av';
        av.style.backgroundImage = $('.pp-av', v).style.backgroundImage;
        var tx = document.createElement('span');
        tx.className = 'pp-match-txt';
        var b1 = document.createElement('b'); b1.textContent = v.dataset.name;
        var em = document.createElement('i'); em.textContent = why;
        var go2 = document.createElement('u'); go2.textContent = 'View profile →';
        tx.appendChild(b1); tx.appendChild(em); tx.appendChild(go2);
        a.appendChild(av); a.appendChild(tx);
        box.appendChild(a);
      } else {
        box.textContent = p.MATCH;
      }
    }
  }

  function setBusy(b) {
    busy = b;
    go.disabled = b;
    go.textContent = b ? 'Writing your brief...' : 'Build my brief';
    sheet.classList.toggle('is-live', b);
  }
  function showError(msg) {
    err.hidden = false;
    err.textContent = msg;
  }

  function build() {
    if (busy) return;
    var s = story.value.trim();
    err.hidden = true;
    if (s.length < 15) {
      showError('Please write at least a sentence or two so the brief has something to work with.');
      story.focus();
      return;
    }
    raw = '';
    var payload = {
      reader: form.elements.reader.value,
      area: form.elements.area.value,
      goal: form.elements.goal.value,
      story: s
    };
    empty.hidden = true;
    out.hidden = false;
    $$('.pp-block', out).forEach(function (b) { b.hidden = true; });
    tools.hidden = true; next.hidden = true;
    var rd = voices.filter(function (v) { return v.dataset.slug === payload.reader; })[0];
    title.textContent = 'Brief in the voice of ' + (rd ? rd.dataset.name : 'your reader');
    setBusy(true);
    if (window.matchMedia('(max-width: 900px)').matches) sheet.scrollIntoView({ behavior: 'smooth', block: 'start' });

    fetch(endpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (j) {
            throw new Error(j.error || 'Something went wrong. Please try again.');
          });
        }
        var reader = res.body.getReader(), dec = new TextDecoder(), buf = '';
        function pump() {
          return reader.read().then(function (r) {
            if (r.done) return;
            buf += dec.decode(r.value, { stream: true });
            var nl;
            while ((nl = buf.indexOf('\n')) >= 0) {
              var line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
              if (line.indexOf('data:') !== 0) continue;
              var d = line.slice(5).trim();
              if (d === '[DONE]') continue;
              try { var j = JSON.parse(d); if (j.t) { raw += j.t; render(false); } } catch (e) { /* неповний рядок */ }
            }
            return pump();
          });
        }
        return pump();
      })
      .then(function () {
        if (!raw.trim()) throw new Error('The brief came back empty. Please try again.');
        render(true);
        var p = parse(raw);
        if (!p.CARE && !p.MATCH) showError('The brief was cut short. You can build it again for a fuller version.');
        tools.hidden = false; next.hidden = !!p.CARE;
      })
      .catch(function (e) {
        if (!raw.trim()) { out.hidden = true; empty.hidden = false; }
        showError(e && e.message ? e.message : 'Something went wrong. Please try again.');
      })
      .then(function () { setBusy(false); });
  }

  form.addEventListener('submit', function (e) { e.preventDefault(); build(); });

  /* ---------- дії ---------- */
  function plain() {
    var p = parse(raw);
    if (p.CARE) return p.CARE;
    var parts = ['SESSION BRIEF (AI-generated preparation notes)', ''];
    if (p.REFRAME) parts.push('My question: ' + p.REFRAME, '');
    if (p.QUESTIONS) parts.push('Questions to bring:', lines(p.QUESTIONS).map(function (q, i) { return (i + 1) + '. ' + q; }).join('\n'), '');
    if (p.SAY) parts.push('First minute: ' + p.SAY, '');
    if (p.SKIP) parts.push('Leave out:', lines(p.SKIP).map(function (q) { return '- ' + q; }).join('\n'), '');
    if (p.MATCH) parts.push('Best-fit reader: ' + p.MATCH);
    return parts.join('\n');
  }
  $('#pp-copy').addEventListener('click', function () {
    var btn = this, txt = plain();
    function ok() { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy brief'; }, 1800); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, ok);
    else {
      var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) { /* ignore */ }
      document.body.removeChild(ta); ok();
    }
  });
  $('#pp-print').addEventListener('click', function () { window.print(); });
  $('#pp-reset').addEventListener('click', function () {
    raw = ''; story.value = ''; count.textContent = '0 / 500';
    out.hidden = true; empty.hidden = false; tools.hidden = true; next.hidden = true; err.hidden = true;
    title.textContent = 'Your brief will appear here';
    locked = false; updateFit(); story.focus();
  });
})();
