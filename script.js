/* =====================================================================
   Smart Attendance Portal – Automated Student Attendance Monitoring & Analytics System
   Pure HTML + CSS + JavaScript (no libraries). Data lives in localStorage.
   ===================================================================== */
(function () {
  'use strict';

  /* ------------------------------ Constants ------------------------------ */
  var KEY = 'attendiq_data_v1';
  var SESSION_KEY = 'attendiq_user_v1';
  var USERS = {
    admin:   { pass: 'admin123',   role: 'Admin',   name: 'Administrator' },
    faculty: { pass: 'faculty123', role: 'Faculty', name: 'Faculty Member' }
  };
  var DEMO_SUBJECTS = {
    CSE: [['CS301', 'Data Structures'], ['CS302', 'Database Systems'], ['CS303', 'Operating Systems'], ['CS304', 'Web Technologies']],
    ECE: [['EC301', 'Signals & Systems'], ['EC302', 'Digital Electronics'], ['EC303', 'VLSI Design'], ['EC304', 'Communication Systems']],
    ME:  [['ME301', 'Thermodynamics'], ['ME302', 'Fluid Mechanics'], ['ME303', 'Machine Design'], ['ME304', 'CAD / CAM']]
  };
  var DEMO_NAMES = [
    'Aarav Sharma', 'Priya Singh', 'Rohan Verma', 'Ananya Gupta', 'Karan Mehta', 'Simran Kaur', 'Vikram Rao', 'Neha Joshi',
    'Arjun Nair', 'Isha Kapoor', 'Manav Bhatia', 'Riya Malhotra', 'Harsh Patel', 'Divya Iyer', 'Sahil Khanna', 'Pooja Reddy',
    'Aditya Chauhan', 'Meera Das', 'Yash Agarwal', 'Tanvi Bansal', 'Gurpreet Gill', 'Kavya Menon', 'Nikhil Saxena', 'Jasleen Dhillon'
  ];
  var COLORS = {};
  // Chart colours are read from the CSS theme variables so charts follow light/dark mode
  function refreshColors() {
    var cs = getComputedStyle(document.documentElement);
    function v(n) { return cs.getPropertyValue(n).trim(); }
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    COLORS.good = v('--good'); COLORS.warn = v('--warn'); COLORS.bad = v('--bad');
    COLORS.primary = v('--primary'); COLORS.grid = v('--border'); COLORS.text = v('--muted');
    COLORS.ink = v('--text'); COLORS.track = v('--track'); COLORS.surface = v('--surface');
    COLORS.areaFill = hexToRgba(COLORS.primary, dark ? 0.24 : 0.12);
    COLORS.marker = hexToRgba(COLORS.ink, 0.55);
    COLORS.noData = dark ? '#4a5170' : '#cbd0de';
  }
  function hexToRgba(hex, a) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  var THEME_KEY = 'attendiq_theme';
  function currentTheme() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function applyTheme(t, persist) {
    document.documentElement.setAttribute('data-theme', t);
    if (persist) { try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* ignore */ } }
    $$('[data-theme-toggle]').forEach(function (b) {
      var label = t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
      b.title = label; b.setAttribute('aria-label', label);
    });
    refreshColors();
    if (currentUser && (currentView === 'dashboard' || currentView === 'reports')) renderCurrent();
  }

  /* ------------------------------ Helpers ------------------------------ */
  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function initials(name) {
    var p = String(name).trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }
  function who(name) {
    var h = 0; for (var i = 0; i < name.length; i++) h += name.charCodeAt(i);
    return '<div class="who"><span class="av av' + (h % 5) + '"><b>' + esc(initials(name)) + '</b></span><span>' + esc(name) + '</span></div>';
  }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function todayISO() { return iso(new Date()); }
  function fmtShort(isoDate) { var p = isoDate.split('-'); return p[2] + '/' + p[1]; }
  function uid() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function pct1(n) { return n === null ? '—' : n.toFixed(1) + '%'; }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  var toastTimer;
  function toast(msg, type) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast ' + (type || '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ------------------------------ Data layer ------------------------------ */
  var S = loadData();

  function emptyData() { return { students: [], subjects: [], records: {}, threshold: 75 }; }

  function loadData() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY));
      if (d && d.students && d.subjects && d.records) { d.threshold = d.threshold || 75; return d; }
    } catch (e) { /* ignore */ }
    var seeded = seedData();
    try { localStorage.setItem(KEY, JSON.stringify(seeded)); } catch (e) { /* ignore */ }
    return seeded;
  }
  function saveData() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { toast('Could not save – browser storage is blocked or full', 'err'); }
  }

  // Builds realistic demo data: ~8 weeks of weekday sessions with varied student behaviour
  function seedData() {
    var d = emptyData();
    var rnd = mulberry32(2024);
    var n = 0;
    Object.keys(DEMO_SUBJECTS).forEach(function (dept) {
      DEMO_SUBJECTS[dept].forEach(function (s) { d.subjects.push({ code: s[0], name: s[1], dept: dept }); });
      for (var i = 1; i <= 8; i++) {
        d.students.push({
          id: 's_demo_' + n,
          roll: dept + '21' + String(i).padStart(3, '0'),
          name: DEMO_NAMES[n % DEMO_NAMES.length],
          dept: dept,
          sem: 5,
          base: 0.55 + rnd() * 0.43          // personal attendance tendency (demo only)
        });
        n++;
      }
    });
    var day = new Date();
    for (var back = 1; back <= 56; back++) {
      var dt = new Date(day.getFullYear(), day.getMonth(), day.getDate() - back);
      var dow = dt.getDay();
      if (dow === 0 || dow === 6) continue;
      var ds = iso(dt);
      d.subjects.forEach(function (sub, idx) {
        var sidx = idx % 4;
        if ((dow + sidx) % 5 >= 3) return;    // each subject runs on ~3 of 5 weekdays
        var rec = {};
        d.students.forEach(function (st) {
          if (st.dept !== sub.dept) return;
          var r = rnd();
          rec[st.id] = r < st.base ? (rnd() < 0.08 ? 'L' : 'P') : 'A';
        });
        d.records[ds + '|' + sub.code] = rec;
      });
    }
    d.students.forEach(function (st) { delete st.base; });
    return d;
  }

  function depts() {
    var seen = {}, out = [];
    S.subjects.forEach(function (s) { if (!seen[s.dept]) { seen[s.dept] = 1; out.push(s.dept); } });
    S.students.forEach(function (s) { if (!seen[s.dept]) { seen[s.dept] = 1; out.push(s.dept); } });
    return out;
  }
  function subjectsOf(dept) { return S.subjects.filter(function (s) { return !dept || s.dept === dept; }); }
  function subjectName(code) { var s = S.subjects.filter(function (x) { return x.code === code; })[0]; return s ? s.name : code; }

  /* ------------------------------ Analytics engine ------------------------------ */
  // Attendance for one student (optionally limited to a subject). Late counts as attended.
  function calc(sid, code) {
    var p = 0, t = 0;
    for (var k in S.records) {
      if (code && k.split('|')[1] !== code) continue;
      var v = S.records[k][sid];
      if (!v) continue;
      t++;
      if (v !== 'A') p++;
    }
    return { p: p, t: t, pct: t ? (p / t) * 100 : null };
  }
  // How many consecutive classes must be attended to reach the threshold
  function needed(p, t) {
    var th = S.threshold;
    if (t === 0 || (p / t) * 100 >= th) return 0;
    if (th >= 100) return Infinity;
    return Math.ceil((th * t - 100 * p) / (100 - th));
  }
  function statusOf(pct) {
    if (pct === null) return { key: 'none', label: 'No data' };
    if (pct < S.threshold) return { key: 'bad', label: 'Shortage' };
    if (pct < S.threshold + 5) return { key: 'warn', label: 'Borderline' };
    return { key: 'good', label: 'Good' };
  }
  function colorOf(pct) { return pct === null ? COLORS.noData : pct < S.threshold ? COLORS.bad : pct < S.threshold + 5 ? COLORS.warn : COLORS.good; }

  function aggregate(filterFn) {
    var p = 0, t = 0;
    for (var k in S.records) {
      var parts = k.split('|');
      if (filterFn && !filterFn(parts[0], parts[1])) continue;
      var rec = S.records[k];
      for (var sid in rec) { t++; if (rec[sid] !== 'A') p++; }
    }
    return { p: p, t: t, pct: t ? (p / t) * 100 : null };
  }

  /* ------------------------------ Charts (canvas) ------------------------------ */
  function setupCanvas(canvas, h) {
    var w = canvas.parentElement.clientWidth || 300;
    var dpr = window.devicePixelRatio || 1;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }
  function emptyChart(c, msg) {
    ctx = c.ctx; ctx.fillStyle = COLORS.text; ctx.font = '13px IBM Plex Sans, Segoe UI, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(msg, c.w / 2, c.h / 2);
  }
  var ctx;

  function drawHBar(canvas, labels, values) {
    var rowH = 30, h = Math.max(80, labels.length * rowH + 14);
    var c = setupCanvas(canvas, h); ctx = c.ctx;
    if (!labels.length) { emptyChart(c, 'No data yet'); return; }
    ctx.font = '12px IBM Plex Sans, Segoe UI, sans-serif';
    var labelW = 0;
    labels.forEach(function (l) { labelW = Math.max(labelW, ctx.measureText(l).width); });
    labelW = Math.min(labelW, c.w * 0.42) + 12;
    var x0 = labelW, x1 = c.w - 48;
    labels.forEach(function (l, i) {
      var y = 6 + i * rowH, v = values[i];
      ctx.fillStyle = COLORS.ink; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      var txt = l;
      while (ctx.measureText(txt).width > labelW - 12 && txt.length > 3) txt = txt.slice(0, -2);
      if (txt !== l) txt += '…';
      ctx.fillText(txt, labelW - 8, y + 11);
      ctx.fillStyle = COLORS.track; roundRect(ctx, x0, y + 3, x1 - x0, 16, 5); ctx.fill();
      if (v !== null) {
        ctx.fillStyle = colorOf(v);
        roundRect(ctx, x0, y + 3, Math.max(3, (x1 - x0) * v / 100), 16, 5); ctx.fill();
      }
      ctx.fillStyle = COLORS.ink; ctx.textAlign = 'left';
      ctx.fillText(v === null ? '—' : v.toFixed(0) + '%', x1 + 6, y + 11);
    });
    // threshold marker
    var tx = x0 + (x1 - x0) * S.threshold / 100;
    ctx.strokeStyle = COLORS.marker; ctx.setLineDash([4, 3]); ctx.beginPath();
    ctx.moveTo(tx, 2); ctx.lineTo(tx, h - 2); ctx.stroke(); ctx.setLineDash([]);
  }

  function drawLine(canvas, labels, values) {
    var h = 285, c = setupCanvas(canvas, h); ctx = c.ctx;
    if (!labels.length) { emptyChart(c, 'No sessions recorded yet'); return; }
    var L = 38, R = 14, T = 14, B = 30, W = c.w - L - R, H = h - T - B;
    ctx.font = '11px IBM Plex Sans, Segoe UI, sans-serif'; ctx.textBaseline = 'middle';
    for (var g = 0; g <= 100; g += 25) {
      var gy = T + H - H * g / 100;
      ctx.strokeStyle = COLORS.grid; ctx.beginPath(); ctx.moveTo(L, gy); ctx.lineTo(L + W, gy); ctx.stroke();
      ctx.fillStyle = COLORS.text; ctx.textAlign = 'right'; ctx.fillText(g + '%', L - 6, gy);
    }
    var ty = T + H - H * S.threshold / 100;
    ctx.strokeStyle = COLORS.bad; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(L, ty); ctx.lineTo(L + W, ty); ctx.stroke(); ctx.setLineDash([]);
    var n = labels.length;
    function px(i) { return n === 1 ? L + W / 2 : L + W * i / (n - 1); }
    function py(v) { return T + H - H * v / 100; }
    ctx.beginPath(); ctx.moveTo(px(0), T + H);
    values.forEach(function (v, i) { ctx.lineTo(px(i), py(v)); });
    ctx.lineTo(px(n - 1), T + H); ctx.closePath(); ctx.fillStyle = COLORS.areaFill; ctx.fill();
    ctx.beginPath();
    values.forEach(function (v, i) { if (i) ctx.lineTo(px(i), py(v)); else ctx.moveTo(px(i), py(v)); });
    ctx.strokeStyle = COLORS.primary; ctx.lineWidth = 2.5; ctx.stroke(); ctx.lineWidth = 1;
    values.forEach(function (v, i) {
      ctx.beginPath(); ctx.arc(px(i), py(v), 3.5, 0, 7); ctx.fillStyle = COLORS.surface; ctx.fill();
      ctx.strokeStyle = COLORS.primary; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
    });
    ctx.fillStyle = COLORS.text; ctx.textAlign = 'center';
    var step = Math.ceil(n / 8);
    labels.forEach(function (l, i) { if (i % step === 0 || i === n - 1) ctx.fillText(l, px(i), h - 12); });
  }

  function drawDonut(canvas, parts) {
    var size = canvas.parentElement.clientWidth || 200;
    var c = setupCanvas(canvas, size); ctx = c.ctx;
    var total = parts.reduce(function (a, p) { return a + p.value; }, 0);
    var cx = size / 2, cy = size / 2, r = size / 2 - 8, ir = r * 0.62;
    if (!total) { emptyChart(c, 'No data'); return; }
    var a = -Math.PI / 2;
    parts.forEach(function (p) {
      if (!p.value) return;
      var da = (p.value / total) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, a, a + da); ctx.arc(cx, cy, ir, a + da, a, true); ctx.closePath();
      ctx.fillStyle = p.color; ctx.fill(); a += da;
    });
    ctx.fillStyle = COLORS.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 30px "Source Serif 4", Georgia, serif'; ctx.fillText(String(total), cx, cy - 8);
    ctx.font = '12px IBM Plex Sans, Segoe UI, sans-serif'; ctx.fillStyle = COLORS.text; ctx.fillText('students', cx, cy + 14);
  }

  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  /* ------------------------------ Navigation / auth ------------------------------ */
  var currentUser = null, currentView = 'dashboard';
  var TITLES = { dashboard: 'Dashboard', mark: 'Mark attendance', reports: 'Reports and analytics', students: 'Students', settings: 'Settings' };
  var SUBS = {
    dashboard: 'How attendance is looking across departments and subjects.',
    mark: 'Record who was present for a class session.',
    reports: 'Find shortages, compare subjects and export reports.',
    students: 'Add or remove students from the register.',
    settings: 'Set the minimum attendance and manage stored data.'
  };

  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var u = $('#loginUser').value.trim().toLowerCase(), p = $('#loginPass').value;
    var acc = USERS[u];
    if (!acc || acc.pass !== p) {
      $('#loginErr').textContent = 'Invalid username or password.';
      $('#loginErr').hidden = false;
      var lc = $('#loginForm'); lc.classList.remove('shake'); void lc.offsetWidth; lc.classList.add('shake');
      $('#loginPass').select();
      return;
    }
    currentUser = { username: u, role: acc.role, name: acc.name };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(currentUser)); } catch (err) { /* ignore */ }
    startApp();
  });
  $('#logoutBtn').addEventListener('click', function () {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (err) { /* ignore */ }
    currentUser = null;
    $('#app').hidden = true; $('#login').hidden = false;
    $('#loginPass').value = ''; $('#loginErr').hidden = true;
    $$('[data-fill]').forEach(function (t) { t.classList.remove('selected'); });
  });
  $('#nav').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-view]');
    if (b) showView(b.getAttribute('data-view'));
  });

  function startApp() {
    $('#login').hidden = true; $('#app').hidden = false;
    $('#userName').textContent = currentUser.name;
    $('#userRole').textContent = currentUser.role;
    $('#userAvatar').textContent = initials(currentUser.name);
    $$('#nav [data-admin]').forEach(function (b) { b.hidden = currentUser.role !== 'Admin'; });
    $('#todayLabel').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    initMark(); initReports(); initStudentForm();
    showView('dashboard');
  }

  function showView(v) {
    if ((v === 'students' || v === 'settings') && currentUser.role !== 'Admin') v = 'dashboard';
    currentView = v;
    $$('.view').forEach(function (el) { el.hidden = el.id !== 'view-' + v; });
    $$('#nav button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === v); });
    $('#viewTitle').textContent = TITLES[v];
    $('#viewSub').textContent = SUBS[v];
    renderCurrent();
  }
  function renderCurrent() {
    if (currentView === 'dashboard') renderDashboard();
    else if (currentView === 'mark') renderMark();
    else if (currentView === 'reports') renderReports();
    else if (currentView === 'students') renderStudents();
    else if (currentView === 'settings') $('#thInput').value = S.threshold;
  }
  var rzTimer;
  window.addEventListener('resize', function () {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(function () { if (currentUser && (currentView === 'dashboard' || currentView === 'reports')) renderCurrent(); }, 150);
  });

  /* ------------------------------ Dashboard ------------------------------ */
  function renderDashboard() {
    var th = S.threshold;
    var all = aggregate();
    var today = aggregate(function (d) { return d === todayISO(); });
    var rows = S.students.map(function (s) { var c = calc(s.id); return { s: s, c: c }; });
    var low = rows.filter(function (r) { return r.c.pct !== null && r.c.pct < th; });

    $('#stTotal').textContent = S.students.length;
    $('#stOverall').textContent = all.pct === null ? '—' : all.pct.toFixed(1) + '%';
    $('#stToday').textContent = today.pct === null ? '—' : today.pct.toFixed(1) + '%';
    $('#stTodaySub').textContent = today.pct === null ? 'Not marked yet today' : today.p + ' of ' + today.t + ' present';
    $('#stLow').textContent = low.length;
    $('#stLowSub').textContent = 'under the ' + th + '% minimum';

    // Trend: last 14 session days
    var byDate = {};
    for (var k in S.records) {
      var d = k.split('|')[0], rec = S.records[k];
      byDate[d] = byDate[d] || { p: 0, t: 0 };
      for (var sid in rec) { byDate[d].t++; if (rec[sid] !== 'A') byDate[d].p++; }
    }
    var days = Object.keys(byDate).sort().slice(-14);
    drawLine($('#chTrend'), days.map(fmtShort), days.map(function (d) { return byDate[d].p / byDate[d].t * 100; }));

    // Distribution
    var good = 0, warn = 0, bad = 0;
    rows.forEach(function (r) { var k2 = statusOf(r.c.pct).key; if (k2 === 'good') good++; else if (k2 === 'warn') warn++; else if (k2 === 'bad') bad++; });
    var parts = [
      { label: 'Good (≥ ' + (th + 5) + '%)', value: good, color: COLORS.good },
      { label: 'Borderline (' + th + '–' + (th + 5) + '%)', value: warn, color: COLORS.warn },
      { label: 'Shortage (< ' + th + '%)', value: bad, color: COLORS.bad }
    ];
    drawDonut($('#chDonut'), parts);
    $('#donutLegend').innerHTML = parts.map(function (p) { return '<li><i style="background:' + p.color + '"></i>' + esc(p.label) + ' — <b>' + p.value + '</b></li>'; }).join('');

    // Department & subject
    var ds = depts();
    var deptVals = ds.map(function (dp) {
      var codes = subjectsOf(dp).map(function (s) { return s.code; });
      return aggregate(function (d, c) { return codes.indexOf(c) !== -1; }).pct;
    });
    var subLabels = S.subjects.map(function (s) { return s.code + ' · ' + s.name; });
    var subVals = S.subjects.map(function (s) { return aggregate(function (d, c) { return c === s.code; }).pct; });
    drawHBar($('#chDept'), ds, deptVals);
    drawHBar($('#chSubject'), subLabels, subVals);

    // Key insights
    function extreme(labels, vals, wantMax) {
      var bi = -1;
      vals.forEach(function (v, i) { if (v === null) return; if (bi < 0 || (wantMax ? v > vals[bi] : v < vals[bi])) bi = i; });
      return bi < 0 ? null : { label: labels[bi], v: vals[bi] };
    }
    var hi = extreme(subLabels, subVals, true), lo = extreme(subLabels, subVals, false), bd = extreme(ds, deptVals, true);
    var perfect = rows.filter(function (r) { return r.c.pct === 100; }).length;
    var items = [];
    if (hi) items.push(['good', 'Strongest subject', hi.label, hi.v.toFixed(0) + '%']);
    if (lo) items.push(['bad', 'Weakest subject', lo.label, lo.v.toFixed(0) + '%']);
    if (bd) items.push(['info', 'Best department', bd.label, bd.v.toFixed(0) + '%']);
    items.push(['warn', 'Students at risk', low.length + ' of ' + S.students.length + ' below ' + th + '%', S.students.length ? Math.round(low.length / S.students.length * 100) + '%' : '0%']);
    if (perfect) items.push(['good', 'Full attendance', perfect + (perfect === 1 ? ' student' : ' students') + ' at 100%', String(perfect)]);
    $('#insights').innerHTML = S.students.length ? items.map(function (i) {
      return '<li><span class="ins-dot ' + i[0] + '"></span><div class="ins-main"><div class="ins-k">' + i[1] + '</div><div class="ins-v">' + esc(i[2]) + '</div></div><span class="ins-n">' + i[3] + '</span></li>';
    }).join('') : '<li class="muted">Add students and mark attendance to see insights.</li>';

    // Alerts
    low.sort(function (a, b) { return a.c.pct - b.c.pct; });
    $('#alertBody').innerHTML = low.length ? low.slice(0, 10).map(function (r) {
      var n = needed(r.c.p, r.c.t);
      return '<tr><td>' + esc(r.s.roll) + '</td><td>' + who(r.s.name) + '</td><td>' + esc(r.s.dept) + '</td><td>' + pctBar(r.c.pct) + '</td><td>' + r.c.p + ' / ' + r.c.t + '</td><td>' + (n === Infinity ? '—' : n) + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="empty">Every student is meeting the minimum attendance.</td></tr>';
  }

  function pctBar(pct) {
    if (pct === null) return '<span class="muted">—</span>';
    return '<div class="pct"><div class="bar"><span style="width:' + Math.min(100, pct) + '%;background:' + colorOf(pct) + '"></span></div><b>' + pct.toFixed(1) + '%</b></div>';
  }
  function tag(pct) { var s = statusOf(pct); return '<span class="tag ' + s.key + '">' + s.label + '</span>'; }

  /* ------------------------------ Mark attendance ------------------------------ */
  var M = { dept: '', code: '', date: '', marks: {}, existing: false };

  function fillSelect(sel, items, selected) {
    sel.innerHTML = items.map(function (i) { return '<option value="' + esc(i[0]) + '"' + (i[0] === selected ? ' selected' : '') + '>' + esc(i[1]) + '</option>'; }).join('');
  }

  function initMark() {
    var ds = depts();
    fillSelect($('#mDept'), ds.map(function (d) { return [d, d]; }), M.dept || ds[0]);
    M.dept = $('#mDept').value;
    refreshMarkSubjects();
    $('#mDate').max = todayISO();
    $('#mDate').value = M.date || todayISO();
    M.date = $('#mDate').value;
    loadMarks();
  }
  function refreshMarkSubjects() {
    var subs = subjectsOf(M.dept);
    fillSelect($('#mSubject'), subs.map(function (s) { return [s.code, s.code + ' – ' + s.name]; }), M.code);
    M.code = $('#mSubject').value || '';
  }
  function loadMarks() {
    var list = S.students.filter(function (s) { return s.dept === M.dept; });
    var ex = S.records[M.date + '|' + M.code];
    M.existing = !!ex;
    M.marks = {};
    list.forEach(function (s) { M.marks[s.id] = ex && ex[s.id] ? ex[s.id] : 'P'; });
    renderMark();
  }

  $('#mDept').addEventListener('change', function () { M.dept = this.value; M.code = ''; refreshMarkSubjects(); loadMarks(); });
  $('#mSubject').addEventListener('change', function () { M.code = this.value; loadMarks(); });
  $('#mDate').addEventListener('change', function () {
    if (!this.value) { this.value = todayISO(); }
    if (this.value > todayISO()) { this.value = todayISO(); toast('Future dates are not allowed', 'err'); }
    M.date = this.value; loadMarks();
  });
  $('#mSearch').addEventListener('input', renderMark);
  $('#allP').addEventListener('click', function () { setAll('P'); });
  $('#allA').addEventListener('click', function () { setAll('A'); });
  function setAll(v) { Object.keys(M.marks).forEach(function (id) { M.marks[id] = v; }); renderMark(); }

  $('#markBody').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-sid]');
    if (!b) return;
    M.marks[b.getAttribute('data-sid')] = b.getAttribute('data-v');
    renderMark();
  });

  $('#mCheckin').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var roll = this.value.trim().toLowerCase();
    if (!roll) return;
    var st = S.students.filter(function (s) { return s.dept === M.dept && s.roll.toLowerCase() === roll; })[0];
    if (!st) { toast('No student "' + this.value.trim() + '" in ' + M.dept, 'err'); return; }
    M.marks[st.id] = 'P';
    this.value = '';
    $('#mSearch').value = '';
    renderMark();
    var row = $('#markBody tr[data-sid="' + st.id + '"]');
    if (row) { row.classList.add('flash'); row.scrollIntoView({ block: 'nearest' }); }
    toast(st.name + ' checked in', 'ok');
  });

  $('#saveAtt').addEventListener('click', function () {
    if (!M.code) { toast('Choose a subject first', 'err'); return; }
    if (!Object.keys(M.marks).length) { toast('No students in this department', 'err'); return; }
    var d = new Date(M.date + 'T00:00:00').getDay();
    if ((d === 0 || d === 6) && !confirm('The selected date is a weekend. Save anyway?')) return;
    S.records[M.date + '|' + M.code] = JSON.parse(JSON.stringify(M.marks));
    saveData();
    M.existing = true;
    renderMark();
    toast('Attendance saved for ' + subjectName(M.code) + ' on ' + M.date, 'ok');
  });

  function renderMark() {
    if (!currentUser) return;
    var q = $('#mSearch').value.trim().toLowerCase();
    var list = S.students.filter(function (s) { return s.dept === M.dept; });
    var shown = list.filter(function (s) { return !q || s.name.toLowerCase().indexOf(q) !== -1 || s.roll.toLowerCase().indexOf(q) !== -1; });
    $('#markBody').innerHTML = shown.length ? shown.map(function (s) {
      var v = M.marks[s.id] || 'P';
      function b(code, label) { return '<button data-sid="' + s.id + '" data-v="' + code + '" class="' + (v === code ? 'on-' + code : '') + '">' + label + '</button>'; }
      return '<tr data-sid="' + s.id + '"><td>' + esc(s.roll) + '</td><td>' + who(s.name) + '</td><td>' + esc(s.sem) + '</td><td><div class="seg">' + b('P', 'Present') + b('L', 'Late') + b('A', 'Absent') + '</div></td></tr>';
    }).join('') : '<tr><td colspan="4" class="empty">No students found.</td></tr>';
    var cnt = { P: 0, L: 0, A: 0 };
    Object.keys(M.marks).forEach(function (id) { cnt[M.marks[id]]++; });
    $('#cP').textContent = cnt.P; $('#cL').textContent = cnt.L; $('#cA').textContent = cnt.A;
    var badge = $('#mBadge');
    badge.textContent = M.existing ? 'Editing saved session' : 'New session (not saved yet)';
    badge.className = 'badge' + (M.existing ? ' edit' : '');
  }

  /* ------------------------------ Reports ------------------------------ */
  var reportRows = [];

  function initReports() {
    var ds = depts();
    fillSelect($('#rDept'), [['', 'All departments']].concat(ds.map(function (d) { return [d, d]; })), '');
    refreshReportSubjects();
  }
  function refreshReportSubjects() {
    var subs = subjectsOf($('#rDept').value);
    fillSelect($('#rSubject'), [['', 'All subjects (overall)']].concat(subs.map(function (s) { return [s.code, s.code + ' – ' + s.name]; })), '');
  }
  $('#rDept').addEventListener('change', function () { refreshReportSubjects(); renderReports(); });
  ['#rSubject', '#rStatus', '#rSort'].forEach(function (id) { $(id).addEventListener('change', renderReports); });
  $('#rSearch').addEventListener('input', renderReports);

  function buildReport() {
    var dept = $('#rDept').value, code = $('#rSubject').value, status = $('#rStatus').value, sort = $('#rSort').value;
    var q = $('#rSearch').value.trim().toLowerCase();
    var codes = code ? [code] : null;
    var rows = S.students.filter(function (s) {
      return (!dept || s.dept === dept) && (!q || s.name.toLowerCase().indexOf(q) !== -1 || s.roll.toLowerCase().indexOf(q) !== -1);
    }).map(function (s) {
      var c;
      if (codes || !dept) c = calc(s.id, code || null);
      else c = calc(s.id, null);
      return { s: s, c: c };
    }).filter(function (r) {
      if (status === 'short') return r.c.pct !== null && r.c.pct < S.threshold;
      if (status === 'ok') return r.c.pct !== null && r.c.pct >= S.threshold;
      return true;
    });
    if (sort === 'low') rows.sort(function (a, b) { return (a.c.pct === null ? 999 : a.c.pct) - (b.c.pct === null ? 999 : b.c.pct); });
    else if (sort === 'high') rows.sort(function (a, b) { return (b.c.pct === null ? -1 : b.c.pct) - (a.c.pct === null ? -1 : a.c.pct); });
    else rows.sort(function (a, b) { return a.s.roll.localeCompare(b.s.roll); });
    return rows;
  }

  function renderReports() {
    reportRows = buildReport();
    var short = reportRows.filter(function (r) { return r.c.pct !== null && r.c.pct < S.threshold; }).length;
    var avgP = 0, avgT = 0;
    reportRows.forEach(function (r) { avgP += r.c.p; avgT += r.c.t; });
    $('#rSummary').innerHTML = '<b>' + reportRows.length + '</b> students · average <b>' + (avgT ? (avgP / avgT * 100).toFixed(1) + '%' : '—') + '</b> · <b style="color:' + COLORS.bad + '">' + short + '</b> below ' + S.threshold + '%';
    $('#reportBody').innerHTML = reportRows.length ? reportRows.map(function (r, i) {
      var n = needed(r.c.p, r.c.t);
      return '<tr class="clickable" data-i="' + i + '" title="Click for subject-wise breakdown"><td>' + esc(r.s.roll) + '</td><td>' + who(r.s.name) + '</td><td>' + esc(r.s.dept) + '</td><td>' + r.c.p + '</td><td>' + r.c.t + '</td><td>' + pctBar(r.c.pct) + '</td><td>' + tag(r.c.pct) + '</td><td>' + (r.c.pct === null ? '—' : n === Infinity ? '—' : n) + '</td></tr>';
    }).join('') : '<tr><td colspan="8" class="empty">No students match the filters.</td></tr>';
    $('#detailCard').hidden = true;
  }

  $('#reportBody').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-i]');
    if (!tr) return;
    var r = reportRows[+tr.getAttribute('data-i')];
    if (!r) return;
    var subs = subjectsOf(r.s.dept);
    $('#detailCard').hidden = false;
    $('#detailTitle').textContent = r.s.name + ' (' + r.s.roll + ') – subject-wise attendance';
    drawHBar($('#chDetail'), subs.map(function (s) { return s.code + ' · ' + s.name; }), subs.map(function (s) { return calc(r.s.id, s.code).pct; }));
    $('#detailCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  $('#exportCsv').addEventListener('click', function () {
    var sub = $('#rSubject').value;
    var lines = [['Roll No', 'Name', 'Department', 'Semester', 'Subject', 'Attended', 'Held', 'Attendance %', 'Status', 'Classes needed']];
    reportRows.forEach(function (r) {
      var n = needed(r.c.p, r.c.t);
      lines.push([r.s.roll, r.s.name, r.s.dept, r.s.sem, sub ? subjectName(sub) : 'All subjects', r.c.p, r.c.t, r.c.pct === null ? '' : r.c.pct.toFixed(1), statusOf(r.c.pct).label, n === Infinity ? '' : n]);
    });
    var csv = lines.map(function (l) { return l.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    download('attendance-report-' + todayISO() + '.csv', csv, 'text/csv');
    toast('CSV exported', 'ok');
  });

  $('#exportNotices').addEventListener('click', function () {
    var sub = $('#rSubject').value;
    var list = reportRows.filter(function (r) { return r.c.pct !== null && r.c.pct < S.threshold; });
    if (!list.length) { toast('No students below threshold in this view', 'ok'); return; }
    var text = list.map(function (r) {
      var n = needed(r.c.p, r.c.t);
            return 'To: ' + r.s.name + ' (' + r.s.roll + ', ' + r.s.dept + ')\n' +
        'Subject: Attendance shortage notice\n\n' +
        'Dear ' + r.s.name.split(' ')[0] + ',\n' +
        'Your attendance in ' + (sub ? subjectName(sub) : 'your courses overall') + ' is ' + r.c.pct.toFixed(1) + '% (' + r.c.p + ' of ' + r.c.t + ' classes), which is below the required ' + S.threshold + '%. ' +
        (n === Infinity ? '' : 'You need to attend the next ' + n + ' consecutive classes to reach the minimum.\n') +
        'Please meet your class coordinator.\n\nRegards,\nAttendance Cell\n' + '----------------------------------------\n';
          }).join('\n');
    download('shortage-notices-' + todayISO() + '.txt', text);
    toast(list.length + ' notices generated', 'ok');
  });

  $('#printBtn').addEventListener('click', function () { window.print(); });

  /* ------------------------------ Students ------------------------------ */
  function initStudentForm() {
    var ds = depts();
    fillSelect($('#sDept'), ds.map(function (d) { return [d, d]; }), ds[0]);
    fillSelect($('#sSem'), [1, 2, 3, 4, 5, 6, 7, 8].map(function (n) { return [String(n), 'Semester ' + n]; }), '5');
  }
  $('#studentForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var roll = $('#sRoll').value.trim(), name = $('#sName').value.trim();
    if (!roll || !name) return;
    if (S.students.some(function (s) { return s.roll.toLowerCase() === roll.toLowerCase(); })) { toast('Roll number already exists', 'err'); return; }
    S.students.push({ id: uid(), roll: roll, name: name, dept: $('#sDept').value, sem: +$('#sSem').value });
    saveData();
    this.reset(); initStudentForm();
    renderStudents();
    toast('Student added', 'ok');
  });
  $('#stuSearch').addEventListener('input', renderStudents);
  $('#stuBody').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-del]');
    if (!b) return;
    var id = b.getAttribute('data-del');
    var st = S.students.filter(function (s) { return s.id === id; })[0];
    if (!st || !confirm('Delete ' + st.name + ' and all their attendance records?')) return;
    S.students = S.students.filter(function (s) { return s.id !== id; });
    for (var k in S.records) delete S.records[k][id];
    saveData(); renderStudents(); toast('Student deleted');
  });
  function renderStudents() {
    var q = $('#stuSearch').value.trim().toLowerCase();
    var list = S.students.filter(function (s) { return !q || s.name.toLowerCase().indexOf(q) !== -1 || s.roll.toLowerCase().indexOf(q) !== -1; });
    $('#stuCount').textContent = 'Students (' + list.length + ')';
    $('#stuBody').innerHTML = list.length ? list.map(function (s) {
      return '<tr><td>' + esc(s.roll) + '</td><td>' + who(s.name) + '</td><td>' + esc(s.dept) + '</td><td>' + esc(s.sem) + '</td><td><button class="btn danger small" data-del="' + s.id + '">Delete</button></td></tr>';
    }).join('') : '<tr><td colspan="5" class="empty">No students found.</td></tr>';
  }

  /* ------------------------------ Settings ------------------------------ */
  $('#thSave').addEventListener('click', function () {
    var v = parseInt($('#thInput').value, 10);
    if (!(v >= 1 && v <= 99)) { toast('Enter a value between 1 and 99', 'err'); return; }
    S.threshold = v; saveData(); toast('Threshold set to ' + v + '%', 'ok');
  });
  $('#backupBtn').addEventListener('click', function () { download('smart-attendance-backup-' + todayISO() + '.json', JSON.stringify(S, null, 2), 'application/json'); });
  $('#resetBtn').addEventListener('click', function () {
    if (!confirm('Replace ALL data with fresh demo data?')) return;
    S = seedData(); saveData(); initMark(); initReports(); initStudentForm(); toast('Demo data restored', 'ok');
  });
  $('#wipeBtn').addEventListener('click', function () {
    if (!confirm('Delete ALL students and attendance records? This cannot be undone.')) return;
    var keep = S.subjects;
    S = emptyData(); S.subjects = keep; saveData(); initMark(); initReports(); initStudentForm(); toast('All data cleared');
  });

  /* ------------------------------ Login extras ------------------------------ */
  var gh = new Date().getHours();
  $('#greet').textContent = gh < 12 ? 'Good morning' : gh < 17 ? 'Good afternoon' : 'Good evening';
  $('#pwToggle').addEventListener('click', function () {
    var box = this.parentElement, show = !box.classList.contains('show');
    box.classList.toggle('show', show);
    $('#loginPass').type = show ? 'text' : 'password';
    this.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    this.title = show ? 'Hide password' : 'Show password';
  });
  $$('[data-fill]').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('[data-fill]').forEach(function (t) { t.classList.remove('selected'); });
      b.classList.add('selected');
      var p = b.getAttribute('data-fill').split('|');
      $('#loginUser').value = p[0]; $('#loginPass').value = p[1]; $('#loginErr').hidden = true;
      $('#loginPass').focus();
    });
  });

  /* ------------------------------ Theme ------------------------------ */
  $$('[data-theme-toggle]').forEach(function (b) {
    b.addEventListener('click', function () { applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true); });
  });
  // Follow the OS setting live, unless the user has picked a theme explicitly
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    var onSys = function (e) {
      var saved = null; try { saved = localStorage.getItem(THEME_KEY); } catch (err) { /* ignore */ }
      if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
    };
    if (mq.addEventListener) mq.addEventListener('change', onSys);
  }
  // Always print in light colours
  var printTheme = null;
  window.addEventListener('beforeprint', function () { printTheme = currentTheme(); if (printTheme === 'dark') applyTheme('light', false); });
  window.addEventListener('afterprint', function () { if (printTheme === 'dark') applyTheme('dark', false); printTheme = null; });

  /* ------------------------------ Boot ------------------------------ */
  applyTheme(currentTheme(), false);

  try {
    var saved = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (saved && USERS[saved.username]) { currentUser = saved; startApp(); }
  } catch (e) { /* show login */ }

})();
