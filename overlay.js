(function () {
	'use strict';
	if (document.getElementById('__tg_host__')) return;

	// ── Shared helpers ──────────────────────────────────────────────────────────

	function getToday() {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	function taskIsActiveToday(task) {
		const today = getToday();
		if (task.scheduledDate && task.scheduledDate > today) return false;
		const type = task.repeat?.type || 'off';
		if (type === 'off') return !task.completed;
		if (task.lastCompletedDate === today) return false;
		if (type === 'daily') return true;
		const todayDay = new Date().getDay();
		if (type === 'weekly') {
			return (
				new Date(
					(task.scheduledDate || today) + 'T12:00:00',
				).getDay() === todayDay
			);
		}
		if (type === 'custom')
			return (task.repeat.days || []).includes(todayDay);
		return false;
	}

	// ── Styles (shadow DOM — fully isolated) ────────────────────────────────────

	const CSS = `
    .panel {
      position: relative;
      width: 252px;
      background: #111;
      border: 1px solid #232323;
      border-radius: 10px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: 13px;
      color: #ddd;
      box-shadow: 0 20px 56px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.04);
      overflow: hidden;
      user-select: none;
    }

    .hdr {
      display: flex; align-items: center; justify-content: space-between;
      padding: 9px 12px 9px 14px;
      border-bottom: 1px solid #1a1a1a;
      cursor: grab;
    }
    .hdr:active { cursor: grabbing; }

    .hdr-label {
      font-size: 9px; font-weight: 700; letter-spacing: 0.13em;
      text-transform: uppercase; color: #353535;
    }

    .min-btn {
      display: flex; align-items: center; justify-content: center;
      width: 20px; height: 20px;
      background: none; border: none; color: #3a3a3a;
      cursor: pointer; border-radius: 4px; font-size: 14px; line-height: 1;
      transition: color 0.15s;
    }
    .min-btn:hover { color: #aaa; }

    .body {
      padding: 14px;
      display: flex; flex-direction: column; gap: 12px;
    }

    .task-title {
      font-size: 13px; font-weight: 500; color: #eee;
      line-height: 1.4; word-break: break-word;
    }

    .repeat-pill {
      display: inline-block;
      font-size: 9px; font-weight: 700; letter-spacing: 0.08em;
      text-transform: uppercase; padding: 2px 7px; border-radius: 20px;
      background: rgba(79,126,255,0.1); color: #4f7eff;
      border: 1px solid rgba(79,126,255,0.2);
    }

    .divider { height: 1px; background: #1a1a1a; }

    /* Timer */
    .timer-block { display: flex; flex-direction: column; align-items: center; gap: 10px; }

    .digits {
      font-size: 40px; font-weight: 300; font-variant-numeric: tabular-nums;
      letter-spacing: 0.01em; color: #eee; line-height: 1;
      font-family: 'SF Mono', 'Fira Code', 'Courier New', monospace;
    }
    .digits.running  { color: #4f7eff; }
    .digits.finished { color: #3ecf76; }

    .timer-btn {
      width: 100%; padding: 8px 12px;
      background: #191919; border: 1px solid #262626;
      border-radius: 6px; color: #aaa;
      font-size: 12px; font-weight: 500; cursor: pointer;
      font-family: inherit; transition: all 0.15s;
    }
    .timer-btn:hover { background: #1f1f1f; color: #eee; }
    .timer-btn.running { border-color: #4f7eff; color: #4f7eff; }
    .timer-btn:disabled { opacity: 0.32; cursor: default; pointer-events: none; }

    /* Screenshot */
    .sub-label {
      font-size: 9px; font-weight: 700; letter-spacing: 0.1em;
      text-transform: uppercase; color: #353535;
    }

    .upload-zone {
      border: 1px dashed #262626; border-radius: 6px;
      padding: 13px 10px; text-align: center; cursor: pointer;
      font-size: 12px; color: #454545; line-height: 1.4; transition: all 0.15s;
    }
    .upload-zone:hover { border-color: #4f7eff; color: #4f7eff; background: rgba(79,126,255,0.04); }
    .upload-zone.filled { border-style: solid; border-color: #262626; color: #666; background: #161616; }

    .validate-btn {
      display: none; width: 100%; padding: 8px 12px;
      background: #4f7eff; border: none; border-radius: 6px;
      color: #fff; font-size: 12px; font-weight: 500; cursor: pointer;
      font-family: inherit; transition: opacity 0.15s;
    }
    .validate-btn:hover { opacity: 0.84; }
    .validate-btn:disabled { opacity: 0.36; cursor: default; }

    .status { font-size: 11px; color: #454545; text-align: center; min-height: 14px; line-height: 1.4; }
    .status.ok   { color: #3ecf76; }
    .status.err  { color: #e05555; }
    .status.info { color: #4f7eff; }

    /* Complete banner */
    .done-banner {
      position: absolute; inset: 0;
      background: rgba(8, 20, 12, 0.96);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 6px; padding: 20px; border-radius: 10px; text-align: center;
    }
    .done-title { font-size: 14px; font-weight: 600; color: #3ecf76; }
    .done-sub   { font-size: 11px; color: #2d5c3d; }
  `;

	// ── Build shadow DOM ─────────────────────────────────────────────────────────

	const host = document.createElement('div');
	host.id = '__tg_host__';
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
    <div class="hdr" id="tg-hdr">
      <span class="hdr-label">Complit</span>
      <button class="min-btn" id="tg-min">&#x2014;</button>
    </div>
    <div class="body" id="tg-body">
      <div>
        <div class="task-title" id="tg-title">Loading...</div>
        <div style="margin-top:6px;" id="tg-repeat-row"></div>
      </div>
      <div class="divider"></div>
      <div class="timer-block">
        <div class="digits" id="tg-digits">00:00</div>
        <button class="timer-btn" id="tg-tbtn">Start Timer</button>
      </div>
      <div class="divider"></div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div class="sub-label">Verify via screenshot</div>
        <div class="upload-zone" id="tg-zone">Click to upload screenshot</div>
        <input type="file" id="tg-file" accept="image/*" style="display:none">
        <button class="validate-btn" id="tg-vbtn">Validate with AI</button>
        <div class="status" id="tg-status"></div>
      </div>
    </div>
  `;
	shadow.appendChild(panel);
	document.body.appendChild(host);

	// ── Refs ─────────────────────────────────────────────────────────────────────

	const $ = (id) => shadow.getElementById(id);
	const digitsEl = $('tg-digits');
	const timerBtn = $('tg-tbtn');
	const titleEl = $('tg-title');
	const repeatRow = $('tg-repeat-row');
	const uploadZone = $('tg-zone');
	const fileInput = $('tg-file');
	const vBtn = $('tg-vbtn');
	const statusEl = $('tg-status');
	const bodyEl = $('tg-body');
	const minBtn = $('tg-min');
	const hdrEl = $('tg-hdr');

	// ── State ─────────────────────────────────────────────────────────────────────

	let task = null;
	let remaining = 0;
	let running = false;
	let ticker = null;
	let file = null;
	let minimized = false;
	let isDone = false;

	// ── Helpers ───────────────────────────────────────────────────────────────────

	function fmt(s) {
		s = Math.max(0, Math.floor(s));
		return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
	}

	function setStatus(msg, type = '') {
		statusEl.textContent = msg;
		statusEl.className = 'status' + (type ? ' ' + type : '');
	}

	function getRepeatLabel(task) {
		const type = task.repeat?.type || 'off';
		const map = {
			daily: 'Repeats daily',
			weekly: 'Repeats weekly',
			off: null,
		};
		if (map[type] !== undefined) return map[type];
		if (type === 'custom') {
			const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
			return (task.repeat.days || [])
				.sort((a, b) => a - b)
				.map((d) => names[d])
				.join(' / ');
		}
		return null;
	}

	async function persistTimer() {
		if (!task) return;
		chrome.runtime
			.sendMessage({
				action: 'SAVE_TIMER',
				taskId: task.id,
				state: { remaining: Math.max(0, remaining), running: false },
			})
			.catch(() => {});
	}

	async function markComplete() {
		if (isDone) return;
		isDone = true;
		clearInterval(ticker);
		running = false;
		await persistTimer();

		chrome.runtime
			.sendMessage({ action: 'COMPLETE_TASK', taskId: task.id })
			.catch(() => {});

		const isRepeat = task.repeat?.type !== 'off';
		const banner = document.createElement('div');
		banner.className = 'done-banner';
		banner.innerHTML = `
      <div class="done-title">${isRepeat ? 'Done for today' : 'Task complete'}</div>
      <div class="done-sub">${isRepeat ? 'Resets tomorrow' : 'Marked as complete'}</div>
    `;
		panel.style.position = 'relative';
		panel.appendChild(banner);
	}

	// ── Timer ─────────────────────────────────────────────────────────────────────

	function startTimer() {
		if (running || remaining <= 0 || isDone) return;
		running = true;
		digitsEl.classList.add('running');
		timerBtn.textContent = 'Pause';
		timerBtn.classList.add('running');

		ticker = setInterval(async () => {
			remaining = Math.max(0, remaining - 1);
			digitsEl.textContent = fmt(remaining);
			if (remaining <= 0) {
				clearInterval(ticker);
				running = false;
				digitsEl.classList.remove('running');
				digitsEl.classList.add('finished');
				timerBtn.disabled = true;
				timerBtn.textContent = 'Time used up';
				setStatus('Timer complete', 'ok');
				await markComplete();
			}
		}, 1000);
	}

	function pauseTimer() {
		if (!running) return;
		running = false;
		clearInterval(ticker);
		digitsEl.classList.remove('running');
		timerBtn.textContent = 'Resume';
		timerBtn.classList.remove('running');
		persistTimer();
	}

	timerBtn.addEventListener('click', () => {
		running ? pauseTimer() : startTimer();
	});

	// ── Minimize ──────────────────────────────────────────────────────────────────

	minBtn.addEventListener('click', () => {
		minimized = !minimized;
		bodyEl.style.display = minimized ? 'none' : 'flex';
		minBtn.innerHTML = minimized ? '+' : '&#x2014;';
	});

	// ── File upload ───────────────────────────────────────────────────────────────

	uploadZone.addEventListener('click', () => fileInput.click());

	fileInput.addEventListener('change', (e) => {
		file = e.target.files[0];
		if (!file) return;
		const label =
			file.name.length > 26 ? file.name.slice(0, 23) + '...' : file.name;
		uploadZone.textContent = label;
		uploadZone.classList.add('filled');
		vBtn.style.display = 'block';
		setStatus('');
	});

	// ── Validate screenshot ───────────────────────────────────────────────────────

	vBtn.addEventListener('click', async () => {
		if (!file || !task) return;
		vBtn.disabled = true;
		setStatus('Sending to AI...', 'info');

		try {
			const imageData = await toBase64(file);
			const resp = await chrome.runtime.sendMessage({
				action: 'VALIDATE_SCREENSHOT',
				taskName: task.name,
				imageData,
				mediaType: file.type || 'image/png',
			});

			if (!resp || resp.error)
				throw new Error(resp?.error || 'No response from extension');

			if (resp.verified) {
				setStatus('AI confirmed', 'ok');
				await markComplete();
			} else {
				setStatus(
					'AI could not confirm. Try a clearer screenshot.',
					'err',
				);
				vBtn.disabled = false;
			}
		} catch (e) {
			setStatus(e.message || 'Unexpected error', 'err');
			vBtn.disabled = false;
		}
	});

	function toBase64(f) {
		return new Promise((res, rej) => {
			const r = new FileReader();
			r.onload = () => res(r.result.split(',')[1]);
			r.onerror = rej;
			r.readAsDataURL(f);
		});
	}

	// ── Drag ──────────────────────────────────────────────────────────────────────

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

	// ── Save on unload ────────────────────────────────────────────────────────────

	window.addEventListener('beforeunload', () => {
		if (task && running) persistTimer();
	});

	// ── Init ──────────────────────────────────────────────────────────────────────

	async function init() {
		const { tasks = [], timerStates = {} } = await chrome.storage.local.get(
			['tasks', 'timerStates'],
		);
		const pageHost = window.location.hostname
			.replace(/^www\./, '')
			.toLowerCase();

		task = tasks.find((t) => {
			if (!taskIsActiveToday(t)) return false;
			try {
				const u = /^https?:\/\//.test(t.url)
					? t.url
					: 'https://' + t.url;
				const th = new URL(u).hostname
					.replace(/^www\./, '')
					.toLowerCase();
				return pageHost === th || pageHost.endsWith('.' + th);
			} catch {
				return false;
			}
		});

		if (!task) {
			host.style.display = 'none';
			return;
		}

		titleEl.textContent = task.name;

		const rl = getRepeatLabel(task);
		if (rl) {
			const pill = document.createElement('span');
			pill.className = 'repeat-pill';
			pill.textContent = rl;
			repeatRow.appendChild(pill);
		}

		const saved = timerStates[task.id];
		remaining = saved ? Math.max(0, saved.remaining) : task.duration * 60;
		digitsEl.textContent = fmt(remaining);

		if (remaining <= 0) {
			digitsEl.classList.add('finished');
			timerBtn.disabled = true;
			timerBtn.textContent = 'Time used up';
			await markComplete();
		}
	}

	init();
})();
