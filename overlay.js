(function () {
	'use strict';
	if (document.getElementById('__compleit_host__')) return;

	const CSS = `
    .panel{position:relative;width:244px;background:#111;border:1px solid #232323;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;font-size:13px;color:#ddd;box-shadow:0 16px 48px rgba(0,0,0,.8),0 0 0 1px rgba(255,255,255,.04);user-select:none;}
    .hdr{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-bottom:1px solid #1a1a1a;cursor:grab;}
    .hdr:active{cursor:grabbing;}
    .hdr-label{font-size:9px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:#353535;}
    .min-btn{display:flex;align-items:center;justify-content:center;width:20px;height:20px;background:none;border:none;color:#3a3a3a;cursor:pointer;border-radius:4px;font-size:14px;line-height:1;transition:color .15s;}
    .min-btn:hover{color:#aaa;}
    .body{padding:14px;display:flex;flex-direction:column;gap:11px;}
    .task-title{font-size:12px;font-weight:500;color:#999;line-height:1.4;word-break:break-word;padding-bottom:2px;}
    .divider{height:1px;background:#1a1a1a;}
    .pomo-block{display:flex;flex-direction:column;align-items:center;gap:10px;}
    .pomo-header{display:flex;align-items:center;gap:8px;}
    .phase-lbl{font-size:9px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:#4f7eff;}
    .phase-lbl.brk{color:#3ecf76;} .phase-lbl.lbrk{color:#f5a623;}
    .pomo-cnt{font-size:9px;color:#303030;}
    .pomo-time{font-size:38px;font-weight:200;font-variant-numeric:tabular-nums;letter-spacing:-.01em;color:#eee;font-family:'SF Mono','Fira Code','Courier New',monospace;line-height:1;}
    .pomo-time.run{color:#4f7eff;} .pomo-time.brk{color:#3ecf76;} .pomo-time.lbrk{color:#f5a623;}
    .pomo-dots{display:flex;gap:5px;}
    .p-dot{width:6px;height:6px;border-radius:50%;border:1.5px solid #2a2a2a;transition:all .2s;}
    .p-dot.filled{background:#4f7eff;border-color:#4f7eff;}
    .p-dot.cur{border-color:#555;}
    .pomo-ctrl{display:flex;align-items:center;gap:8px;width:100%;justify-content:center;}
    .pctrl-sm{width:30px;height:30px;border-radius:50%;background:#1a1a1a;border:1px solid #252525;color:#555;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;font-family:inherit;}
    .pctrl-sm:hover{color:#aaa;border-color:#333;}
    .pctrl-main{width:76px;height:30px;border-radius:15px;background:#4f7eff;border:none;color:#fff;font-size:11px;font-weight:600;cursor:pointer;letter-spacing:.03em;transition:all .15s;font-family:inherit;}
    .pctrl-main:hover{opacity:.85;}
    .pctrl-main.paused{background:#1a1a1a;border:1px solid #4f7eff;color:#4f7eff;}
    .pctrl-main.brk{background:#3ecf76;border:none;}
    .pctrl-main.lbrk{background:#f5a623;border:none;}
    .pset{margin-top:2px;}
    .pset-sum{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#2a2a2a;cursor:pointer;list-style:none;padding:2px 0;transition:color .15s;}
    .pset-sum::-webkit-details-marker{display:none;}
    .pset-sum:hover{color:#555;}
    .pset[open] .pset-sum{color:#555;}
    .pset-grid{display:grid;grid-template-columns:1fr auto auto;gap:6px 8px;align-items:center;margin-top:8px;}
    .pset-grid label{font-size:10px;color:#555;}
    .pset-grid span{font-size:10px;color:#3a3a3a;}
    .pset-inp{width:42px;padding:4px 6px;background:#191919;border:1px solid #252525;border-radius:4px;color:#ddd;font-size:11px;font-family:inherit;outline:none;text-align:center;-webkit-appearance:none;-moz-appearance:textfield;}
    .pset-inp:focus{border-color:#4f7eff;}
    .pset-inp::-webkit-inner-spin-button{-webkit-appearance:none;}
    .pset-save{margin-top:8px;width:100%;padding:6px;background:#1a1a1a;border:1px solid #252525;border-radius:5px;color:#555;font-size:10px;cursor:pointer;font-family:inherit;transition:all .15s;}
    .pset-save:hover{border-color:#4f7eff;color:#4f7eff;}
  `;

	const host = document.createElement('div');
	host.id = '__compleit_host__';
	Object.assign(host.style, {
		position: 'fixed',
		top: '16px',
		right: '16px',
		zIndex: '2147483647',
		pointerEvents: 'none',
	});
	const shadow = host.attachShadow({ mode: 'open' });
	const styleEl = document.createElement('style');
	styleEl.textContent = CSS;
	shadow.appendChild(styleEl);
	const panel = document.createElement('div');
	panel.className = 'panel';
	panel.style.pointerEvents = 'auto';
	panel.innerHTML = `
    <div class="hdr" id="tg-hdr"><span class="hdr-label">Compleit</span><button class="min-btn" id="tg-min">&#x2014;</button></div>
    <div class="body" id="tg-body">
      <div class="task-title" id="tg-title">Loading...</div>
      <div class="divider"></div>
      <div class="pomo-block">
        <div class="pomo-header">
          <span class="phase-lbl" id="tg-phase">Work</span>
          <span class="pomo-cnt" id="tg-cnt"></span>
        </div>
        <div class="pomo-time" id="tg-time">25:00</div>
        <div class="pomo-dots" id="tg-dots"></div>
        <div class="pomo-ctrl">
          <button class="pctrl-sm" id="tg-reset" title="Reset">&#8635;</button>
          <button class="pctrl-main" id="tg-start">Start</button>
          <button class="pctrl-sm" id="tg-skip" title="Skip to next">&#8677;</button>
        </div>
      </div>
      <details class="pset" id="tg-pset">
        <summary class="pset-sum">Timer settings</summary>
        <div class="pset-grid">
          <label>Work</label><input type="number" id="tg-pw" class="pset-inp" min="1" max="120" value="25"><span>min</span>
          <label>Short break</label><input type="number" id="tg-ps" class="pset-inp" min="1" max="60" value="5"><span>min</span>
          <label>Long break</label><input type="number" id="tg-pl" class="pset-inp" min="1" max="120" value="15"><span>min</span>
        </div>
        <button class="pset-save" id="tg-psave">Save</button>
      </details>
    </div>`;
	shadow.appendChild(panel);
	document.body.appendChild(host);

	const $ = (id) => shadow.getElementById(id);
	const titleEl = $('tg-title'),
		phaseEl = $('tg-phase'),
		cntEl = $('tg-cnt'),
		timeEl = $('tg-time');
	const dotsEl = $('tg-dots'),
		startBtn = $('tg-start'),
		resetBtn = $('tg-reset'),
		skipBtn = $('tg-skip');
	const pwInp = $('tg-pw'),
		psInp = $('tg-ps'),
		plInp = $('tg-pl'),
		saveBtn = $('tg-psave');
	const bodyEl = $('tg-body'),
		minBtn = $('tg-min'),
		hdrEl = $('tg-hdr');

	let pS = { work: 25, shortBreak: 5, longBreak: 15 };
	let pT = { phase: 'work', startedAt: null, remaining: 25 * 60, count: 0 };
	let ticker = null,
		minimized = false;

	function pad(n) {
		return String(n).padStart(2, '0');
	}
	function fmt(s) {
		s = Math.max(0, Math.floor(s));
		return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
	}
	function phaseDur(ph) {
		if (ph === 'shortBreak') return pS.shortBreak * 60;
		if (ph === 'longBreak') return pS.longBreak * 60;
		return pS.work * 60;
	}
	function phaseLabel(ph) {
		if (ph === 'shortBreak') return 'Short Break';
		if (ph === 'longBreak') return 'Long Break';
		return 'Work';
	}
	function phaseCls(ph) {
		if (ph === 'shortBreak') return 'brk';
		if (ph === 'longBreak') return 'lbrk';
		return '';
	}
	function actualRem() {
		if (!pT.startedAt) return pT.remaining;
		return Math.max(0, pT.remaining - (Date.now() - pT.startedAt) / 1000);
	}
	function isRun() {
		return pT.startedAt !== null;
	}

	function nextPhase() {
		if (pT.phase === 'work') {
			const c = pT.count + 1;
			const next = c % 4 === 0 ? 'longBreak' : 'shortBreak';
			pT = {
				phase: next,
				startedAt: null,
				remaining: phaseDur(next),
				count: c,
			};
		} else {
			pT = {
				phase: 'work',
				startedAt: null,
				remaining: phaseDur('work'),
				count: pT.count,
			};
		}
	}
	async function savePom() {
		chrome.storage.local
			.set({ pomodoroState: pT, pomodoroSettings: pS })
			.catch(() => {});
	}

	function renderPom() {
		const rem = actualRem(),
			cls = phaseCls(pT.phase);
		timeEl.textContent = fmt(rem);
		timeEl.className = `pomo-time${cls ? ' ' + cls : ''}${isRun() ? ' run' : ''}`;
		phaseEl.textContent = phaseLabel(pT.phase);
		phaseEl.className = `phase-lbl${cls ? ' ' + cls : ''}`;
		cntEl.textContent = pT.count ? `${pT.count} done` : '';
		startBtn.textContent = isRun()
			? 'Pause'
			: rem < phaseDur(pT.phase)
				? 'Resume'
				: 'Start';
		startBtn.className = `pctrl-main${isRun() ? ' paused' : ''}${cls ? ' ' + cls : ''}`;
		dotsEl.innerHTML = '';
		for (let i = 0; i < 4; i++) {
			const d = document.createElement('div');
			const sess = pT.count % 4;
			d.className =
				'p-dot' +
				(i < sess ? ' filled' : '') +
				(i === sess && pT.phase === 'work' ? ' cur' : '');
			dotsEl.appendChild(d);
		}
		pwInp.value = pS.work;
		psInp.value = pS.shortBreak;
		plInp.value = pS.longBreak;
	}

	function startTick() {
		if (ticker) return;
		ticker = setInterval(async () => {
			const rem = actualRem();
			renderPom();
			if (rem <= 0) {
				clearInterval(ticker);
				ticker = null;
				await new Promise((r) => setTimeout(r, 300));
				nextPhase();
				await savePom();
				renderPom();
			}
		}, 250);
	}
	function stopTick() {
		clearInterval(ticker);
		ticker = null;
	}

	startBtn.addEventListener('click', async () => {
		if (isRun()) {
			pT.remaining = actualRem();
			pT.startedAt = null;
			stopTick();
		} else {
			pT.startedAt = Date.now();
			startTick();
		}
		await savePom();
		renderPom();
	});
	resetBtn.addEventListener('click', async () => {
		stopTick();
		pT.remaining = phaseDur(pT.phase);
		pT.startedAt = null;
		await savePom();
		renderPom();
	});
	skipBtn.addEventListener('click', async () => {
		stopTick();
		nextPhase();
		await savePom();
		renderPom();
	});
	saveBtn.addEventListener('click', async () => {
		const w = parseInt(pwInp.value, 10),
			s = parseInt(psInp.value, 10),
			l = parseInt(plInp.value, 10);
		if (!w || !s || !l) return;
		pS = { work: w, shortBreak: s, longBreak: l };
		if (!isRun()) {
			pT.remaining = phaseDur(pT.phase);
			pT.startedAt = null;
		}
		await savePom();
		renderPom();
	});

	minBtn.addEventListener('click', () => {
		minimized = !minimized;
		bodyEl.style.display = minimized ? 'none' : 'flex';
		minBtn.innerHTML = minimized ? '+' : '&#x2014;';
	});

	let dsx, dsy, dsTop, dsRight;
	hdrEl.addEventListener('mousedown', (e) => {
		if (e.target === minBtn) return;
		e.preventDefault();
		dsx = e.clientX;
		dsy = e.clientY;
		dsTop = parseInt(host.style.top, 10) || 16;
		dsRight = parseInt(host.style.right, 10) || 16;
		const move = (e) => {
			host.style.top = Math.max(0, dsTop + (e.clientY - dsy)) + 'px';
			host.style.right = Math.max(0, dsRight - (e.clientX - dsx)) + 'px';
		};
		const up = () => {
			window.removeEventListener('mousemove', move);
			window.removeEventListener('mouseup', up);
		};
		window.addEventListener('mousemove', move);
		window.addEventListener('mouseup', up);
	});

	window.addEventListener('beforeunload', () => {
		if (isRun()) {
			pT.remaining = actualRem();
			pT.startedAt = null;
			savePom();
		}
	});

	async function init() {
		const {
			tasks = [],
			pomodoroState,
			pomodoroSettings,
		} = await chrome.storage.local.get([
			'tasks',
			'pomodoroState',
			'pomodoroSettings',
		]);
		if (pomodoroSettings) pS = { ...pS, ...pomodoroSettings };
		if (pomodoroState) {
			pT = pomodoroState;
			if (pT.startedAt) {
				const rem = actualRem();
				if (rem <= 0) nextPhase();
				else {
					pT.remaining = rem;
					pT.startedAt = null;
				}
			}
		} else {
			pT.remaining = phaseDur(pT.phase);
		}

		const pageHost = window.location.hostname
			.replace(/^www\./, '')
			.toLowerCase();
		function getToday() {
			const d = new Date();
			return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		}
		function taskIsActiveToday(t) {
			const today = getToday();
			if (t.scheduledDate && t.scheduledDate > today) return false;
			const type = t.repeat?.type || 'off';
			if (type === 'off') return !t.completed;
			if (t.lastCompletedDate === today) return false;
			if (type === 'daily') return true;
			const dd = new Date().getDay();
			if (type === 'weekly')
				return (
					new Date(
						(t.scheduledDate || today) + 'T12:00:00',
					).getDay() === dd
				);
			if (type === 'custom') return (t.repeat.days || []).includes(dd);
			return false;
		}
		const task = tasks.find((t) => {
			if (!taskIsActiveToday(t)) return false;
			const urls = t.urls || (t.url ? [t.url] : []);
			return urls.some((u) => {
				try {
					const th = new URL(
						/^https?:\/\//.test(u) ? u : 'https://' + u,
					).hostname
						.replace(/^www\./, '')
						.toLowerCase();
					return pageHost === th || pageHost.endsWith('.' + th);
				} catch {
					return false;
				}
			});
		});
		if (!task) {
			host.style.display = 'none';
			return;
		}
		titleEl.textContent = task.name;
		renderPom();
		if (isRun()) startTick();
	}
	init();
})();
