// ── State ────────────────────────────────────────────────────────────
let paused       = false;
let processes    = [];
let killedPIDs   = new Set();   // PIDs confirmed killed — never show again
let killingPIDs  = new Set();   // PIDs currently mid-kill request
let stoppedProcs = [];          // Processes shown in Stopped tab after being killed
let activeFilter = 'all';
let sortKey = 'cpu_percent', sortAsc = false;
const N = 60;
const cpuHist   = Array(N).fill(0);
const memHist   = Array(N).fill(0);
const timeLabels = Array(N).fill('');   // rolling timestamp labels

// ── Charts ───────────────────────────────────────────────────────────
function mkChart(id, color, fill, thresholdColor) {
  return new Chart(document.getElementById(id), {
    type: 'line',
    data: {
      labels: [...timeLabels],
      datasets: [
        // Main data line
        {
          data: Array(N).fill(0),
          borderColor: color,
          borderWidth: 2,
          fill: true,
          backgroundColor: fill,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: color,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
          order: 1
        },
        // 80% danger threshold line
        {
          data: Array(N).fill(80),
          borderColor: 'rgba(239,68,68,0.35)',
          borderWidth: 1,
          borderDash: [4, 4],
          fill: false,
          pointRadius: 0,
          tension: 0,
          order: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(13,20,33,0.95)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#94a3b8',
          bodyColor: '#e2e8f0',
          padding: 10,
          callbacks: {
            title: ctx => '🕐 ' + ctx[0].label,
            label: ctx => {
              if (ctx.datasetIndex === 1) return null;
              return '  ' + ctx.parsed.y.toFixed(1) + '%';
            }
          }
        }
      },
      scales: {
        x: {
          display: true,
          ticks: {
            color: '#475569',
            font: { family: "'JetBrains Mono', monospace", size: 9 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 6
          },
          grid: {
            color: 'rgba(255,255,255,0.04)',
            drawBorder: false
          }
        },
        y: {
          display: true,
          min: 0,
          max: 100,
          position: 'right',
          ticks: {
            color: '#475569',
            font: { family: "'JetBrains Mono', monospace", size: 9 },
            callback: v => v + '%',
            stepSize: 25,
            maxTicksLimit: 5
          },
          grid: {
            color: 'rgba(255,255,255,0.04)',
            drawBorder: false
          }
        }
      }
    }
  });
}
const cpuChart = mkChart('cpuChart', '#3b82f6', 'rgba(59,130,246,.10)');
const memChart = mkChart('memChart', '#22c55e', 'rgba(34,197,94,.10)');

// ── Helpers ──────────────────────────────────────────────────────────
const fmtB  = b => b>=1e9?(b/1e9).toFixed(1)+' GB':b>=1e6?(b/1e6).toFixed(1)+' MB':(b/1e3).toFixed(0)+' KB';
const cpuCol = p => p>80?'#ef4444':p>55?'#f59e0b':'#3b82f6';
const barCol = p => p>80?'#ef4444':p>60?'#f59e0b':null;

let toastT;
function toast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show ' + (type || '');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.className = '', 3200);
}

// ── Clock ────────────────────────────────────────────────────────────
setInterval(() => {
  document.getElementById('clock').textContent = new Date().toTimeString().slice(0, 8);
}, 500);

// ── Stats polling — every 2s ─────────────────────────────────────────
async function fetchStats() {
  if (paused) return;
  try {
    const [sRes, cRes] = await Promise.all([fetch('/api/stats'), fetch('/api/cores')]);
    if (!sRes.ok || !cRes.ok) return;
    applyStats(await sRes.json(), await cRes.json());
  } catch(e) {}
}

function applyStats(s, cores) {
  const cpu = s.cpu_percent, mem = s.memory_percent, disk = s.disk_percent;

  document.getElementById('cpu-val').textContent = cpu.toFixed(1) + '%';
  document.getElementById('cpu-sub').textContent = s.cpu_count + ' logical cores';
  setBar('cpu-bar', cpu, barCol(cpu) || '#3b82f6');

  document.getElementById('mem-val').textContent = mem.toFixed(1) + '%';
  document.getElementById('mem-sub').textContent = fmtB(s.memory_used) + ' / ' + fmtB(s.memory_total);
  setBar('mem-bar', mem, barCol(mem) || '#22c55e');

  document.getElementById('disk-val').textContent = disk.toFixed(1) + '%';
  document.getElementById('disk-sub').textContent = fmtB(s.disk_used) + ' of ' + fmtB(s.disk_total);
  setBar('disk-bar', disk, barCol(disk) || '#f59e0b');

  document.getElementById('boot-sub').textContent = 'Boot ' + s.boot_time;

  // Update rolling history + timestamps
  const nowLabel = new Date().toTimeString().slice(0, 8);
  cpuHist.push(parseFloat(cpu.toFixed(1)));   cpuHist.shift();
  memHist.push(parseFloat(mem.toFixed(1)));   memHist.shift();
  timeLabels.push(nowLabel);                  timeLabels.shift();

  cpuChart.data.labels                  = [...timeLabels];
  cpuChart.data.datasets[0].data        = [...cpuHist];
  cpuChart.data.datasets[0].borderColor = barCol(cpu) || '#3b82f6';
  cpuChart.data.datasets[0].backgroundColor = barCol(cpu)
    ? 'rgba(239,68,68,.10)' : 'rgba(59,130,246,.10)';
  cpuChart.update('none');

  memChart.data.labels                  = [...timeLabels];
  memChart.data.datasets[0].data        = [...memHist];
  memChart.data.datasets[0].borderColor = barCol(mem) || '#22c55e';
  memChart.data.datasets[0].backgroundColor = barCol(mem)
    ? 'rgba(239,68,68,.10)' : 'rgba(34,197,94,.10)';
  memChart.update('none');

  // Update stat overlays (current / min / max / avg)
  const cpuValid = cpuHist.filter(v => v > 0);
  const memValid = memHist.filter(v => v > 0);
  if (cpuValid.length) {
    document.getElementById('cpu-cur').textContent  = cpu.toFixed(1) + '%';
    document.getElementById('cpu-min').textContent  = Math.min(...cpuValid).toFixed(1) + '%';
    document.getElementById('cpu-max').textContent  = Math.max(...cpuValid).toFixed(1) + '%';
    document.getElementById('cpu-avg').textContent  = (cpuValid.reduce((a,b)=>a+b,0)/cpuValid.length).toFixed(1) + '%';
  }
  if (memValid.length) {
    document.getElementById('mem-cur').textContent  = mem.toFixed(1) + '%';
    document.getElementById('mem-min').textContent  = Math.min(...memValid).toFixed(1) + '%';
    document.getElementById('mem-max').textContent  = Math.max(...memValid).toFixed(1) + '%';
    document.getElementById('mem-avg').textContent  = (memValid.reduce((a,b)=>a+b,0)/memValid.length).toFixed(1) + '%';
  }

  document.getElementById('cores-grid').innerHTML = cores.map((p, i) => {
    const pct = Math.round(p);
    const col = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#3b82f6';
    return `<div class="core-cell">
      <div class="core-name">C${i}</div>
      <div class="core-track"><div class="core-fill" style="height:${pct}%;background:${col}"></div></div>
      <div class="core-pct">${pct}%</div>
    </div>`;
  }).join('');
}

function setBar(id, pct, col) {
  const el = document.getElementById(id);
  el.style.width = pct + '%';
  el.style.background = col;
}

// ── Process polling — continuous loop (no setInterval lag) ───────────
let procLoopRunning = false;
async function procLoop() {
  if (procLoopRunning) return;
  procLoopRunning = true;
  while (true) {
    if (!paused) {
      try {
        const res = await fetch('/api/processes');
        if (res.ok) {
          const fresh = await res.json();
          // Never restore a PID we have confirmed killed or are mid-killing
          processes = fresh.filter(p => !killedPIDs.has(p.pid) && !killingPIDs.has(p.pid));
          renderTable();
        }
      } catch(e) {}
    }
    await new Promise(r => setTimeout(r, 1500));
  }
}

// ── Display status (mirrors Task Manager logic) ──────────────────────
// Windows psutil reports almost everything as 'running'.
// running + cpu>0  → running
// running + cpu=0  → sleeping
// killed by us     → stopped  (stored in stoppedProcs)
function displayStatus(p) {
  if (p.status === 'stopped')    return 'stopped';
  if (p.status === 'zombie')     return 'zombie';
  if (p.status === 'sleeping')   return 'sleeping';
  if (p.status === 'stopped_by_user') return 'stopped';
  if (p.status === 'running') {
    return p.cpu_percent > 0 ? 'running' : 'sleeping';
  }
  return p.status;
}

// ── Render Table ─────────────────────────────────────────────────────
function renderTable() {
  const q = document.getElementById('search').value.toLowerCase();

  // Combine live processes + stopped ones for the stopped filter
  const allProcs = activeFilter === 'stopped'
    ? stoppedProcs
    : processes;

  let list = allProcs.filter(p => {
    const ds = displayStatus(p);
    const stateMatch = activeFilter === 'all' ? true : ds === activeFilter;
    const textMatch  = p.name.toLowerCase().includes(q) || (p.username || '').toLowerCase().includes(q);
    return stateMatch && textMatch;
  });

  list.sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey];
    if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
    return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });

  const running = processes.filter(p => displayStatus(p) === 'running').length;
  document.getElementById('proc-val').textContent = processes.length;
  document.getElementById('proc-sub').textContent = running + ' running';
  document.getElementById('visible-count').textContent = list.length + ' shown';

  // High CPU alert
  const hi = processes.filter(p => p.cpu_percent > 80);
  const ab = document.getElementById('alert-bar');
  if (hi.length) {
    ab.style.display = 'flex';
    document.getElementById('alert-text').textContent = hi.map(p => `${p.name} (${p.cpu_percent}%)`).join(', ');
  } else {
    ab.style.display = 'none';
  }

  document.getElementById('proc-body').innerHTML = list.map(p => {
    const cc  = cpuCol(p.cpu_percent);
    const mc  = p.memory_percent > 10 ? '#f59e0b' : '#64748b';
    const ds  = displayStatus(p);
    // Stopped processes have no kill button — they're already dead
    const actionCell = ds === 'stopped'
      ? `<span style="font-size:10px;color:var(--muted)">—</span>`
      : `<button class="kill-btn" id="kb-${p.pid}" onclick="killProcess(${p.pid},'${p.name.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">✕ Kill</button>`;

    return `<tr id="row-${p.pid}">
      <td class="pid">${p.pid}</td>
      <td><div class="pname" title="${p.name}">${p.name}</div></td>
      <td><span class="sbadge sb-${ds}">${ds}</span></td>
      <td><div class="cpu-cell">
        <span class="cpu-num" style="color:${cc}">${p.cpu_percent.toFixed(1)}</span>
        <div class="cpu-mini"><div class="cpu-mini-fill" style="width:${Math.min(p.cpu_percent, 100)}%;background:${cc}"></div></div>
      </div></td>
      <td style="color:${mc};font-family:var(--mono);font-size:11px">${p.memory_percent.toFixed(2)}</td>
      <td class="tmono">${p.threads}</td>
      <td class="tmono" style="max-width:100px;overflow:hidden;text-overflow:ellipsis">${p.username || '—'}</td>
      <td class="tmono">${p.started}</td>
      <td>${actionCell}</td>
    </tr>`;
  }).join('');
}

// ── Kill ─────────────────────────────────────────────────────────────
async function killProcess(pid, name) {
  if (killingPIDs.has(pid) || killedPIDs.has(pid)) return;
  if (!confirm(`Terminate "${name}" (PID ${pid})?`)) return;

  // 1. Mark as killing
  killingPIDs.add(pid);

  // 2. Fade row, disable button immediately
  const row = document.getElementById(`row-${pid}`);
  const btn = document.getElementById(`kb-${pid}`);
  if (row) row.classList.add('killing');
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }

  // 3. Snapshot process info before removing it (needed for stopped list)
  const proc = processes.find(p => p.pid === pid);

  // 4. Remove from live list instantly
  processes = processes.filter(p => p.pid !== pid);
  renderTable();

  // 5. Call backend
  try {
    const res  = await fetch(`/api/kill/${pid}`, { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      killedPIDs.add(pid);
      killingPIDs.delete(pid);

      // Add to stoppedProcs so it appears in the Stopped tab
      if (proc) {
        stoppedProcs.unshift({
          ...proc,
          status:      'stopped_by_user',
          cpu_percent: 0,
          killed_at:   new Date().toTimeString().slice(0, 8)
        });
        // Keep stopped list max 50 entries
        if (stoppedProcs.length > 50) stoppedProcs.pop();
      }

      toast('✓ ' + data.message, 'ok');
      renderTable();
    } else {
      killingPIDs.delete(pid);
      toast('✗ ' + data.message, 'err');
      // Restore on failure
      const r2 = await fetch('/api/processes');
      if (r2.ok) {
        const fresh = await r2.json();
        processes = fresh.filter(p => !killedPIDs.has(p.pid) && !killingPIDs.has(p.pid));
        renderTable();
      }
    }
  } catch(e) {
    killingPIDs.delete(pid);
    toast('✗ Network error', 'err');
  }
}

// ── Sort / Filter / Pause ─────────────────────────────────────────────
function sortBy(k) {
  sortAsc = sortKey === k ? !sortAsc : false;
  sortKey = k;
  renderTable();
}

function setFilter(f, el) {
  activeFilter = f;
  document.querySelectorAll('.fbtn[data-f]').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
  renderTable();
}

function togglePause() {
  paused = !paused;
  document.getElementById('pause-btn').textContent  = paused ? '▶ Resume' : '⏸ Pause';
  document.getElementById('live-label').textContent = paused ? 'PAUSED'   : 'LIVE';
  const col = paused ? '#f59e0b' : '#22c55e';
  document.getElementById('dot').style.background   = col;
  document.getElementById('dot').style.boxShadow    = `0 0 7px ${col}`;
  document.getElementById('live-pill').style.background   = paused ? 'rgba(245,158,11,.08)' : 'rgba(34,197,94,.08)';
  document.getElementById('live-pill').style.borderColor  = paused ? 'rgba(245,158,11,.2)'  : 'rgba(34,197,94,.2)';
  document.getElementById('live-pill').style.color        = col;
}

// ── Theme toggle ─────────────────────────────────────────────────────
function toggleTheme() {
  const isLight = document.body.classList.toggle('light');
  const btn = document.getElementById('theme-btn');
  btn.textContent = isLight ? '☀️' : '🌙';
  btn.title = isLight ? 'Switch to dark mode' : 'Switch to light mode';
  localStorage.setItem('procmon-theme', isLight ? 'light' : 'dark');
}

// Restore saved theme on load
(function() {
  if (localStorage.getItem('procmon-theme') === 'light') {
    document.body.classList.add('light');
    const btn = document.getElementById('theme-btn');
    if (btn) { btn.textContent = '☀️'; btn.title = 'Switch to dark mode'; }
  }
})();

// ── Boot ──────────────────────────────────────────────────────────────
fetchStats();
setInterval(fetchStats, 2000);
procLoop();
