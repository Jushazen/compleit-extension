'use strict';

const HOUR_PX = 56,
	DAY_START = 6,
	DAY_END = 23,
	TOTAL_HRS = DAY_END - DAY_START,
	TOTAL_PX = TOTAL_HRS * HOUR_PX;

let tasks = [],
	blacklist = [],
	settings = { theme: 'dark', heatmapPalette: 'green', difficulty: 'medium' };
let pendingDeleteId = null,
	pendingDeleteType = 'task',
	challengeStr = '';

// ── Helpers ────────────────────────────────────────────────────────────────────
function getToday() {
	const d = new Date();
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function pad(n) {
	return String(n).padStart(2, '0');
}
function timeToMins(t) {
	if (!t) return 0;
	const [h, m] = t.split(':').map(Number);
	return h * 60 + m;
}
function minsToTop(m) {
	return ((m - DAY_START * 60) / 60) * HOUR_PX;
}
function durationToPx(m) {
	return Math.max(22, (m / 60) * HOUR_PX);
}
function fmtTime(t) {
	if (!t) return '';
	const [h, m] = t.split(':').map(Number);
	const ap = h >= 12 ? 'PM' : 'AM',
		h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
	return `${h12}:${pad(m)} ${ap}`;
}
function fmtRange(s, e) {
	if (!s || !e) return '';
	const [sh, sm] = s.split(':').map(Number),
		[eh, em] = e.split(':').map(Number);
	const sAP = sh >= 12 ? 'PM' : 'AM',
		eAP = eh >= 12 ? 'PM' : 'AM';
	const sh12 = sh === 0 ? 12 : sh > 12 ? sh - 12 : sh,
		eh12 = eh === 0 ? 12 : eh > 12 ? eh - 12 : eh;
	if (sAP === eAP) return `${sh12}:${pad(sm)}–${eh12}:${pad(em)} ${eAP}`;
	return `${sh12}:${pad(sm)} ${sAP}–${eh12}:${pad(em)} ${eAP}`;
}
function minsToDisplay(m) {
	return fmtTime(`${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`);
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
			new Date((t.scheduledDate || today) + 'T12:00:00').getDay() === dd
		);
	if (type === 'custom') return (t.repeat.days || []).includes(dd);
	return false;
}
function taskDoneToday(t) {
	const today = getToday();
	return t.repeat?.type === 'off'
		? t.completed
		: t.lastCompletedDate === today;
}
function getTaskUrls(t) {
	return t.urls || (t.url ? [t.url] : []);
}
function esc(s) {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
function uid() {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Load ────────────────────────────────────────────────────────────────────────
async function load() {
	const data = await chrome.storage.local.get([
		'tasks',
		'blacklist',
		'settings',
	]);
	tasks = data.tasks || [];
	blacklist = data.blacklist || [];
	settings = Object.assign(
		{ theme: 'dark', heatmapPalette: 'green', difficulty: 'medium' },
		data.settings || {},
	);
	applyTheme(settings.theme);
	applyPalette(settings.heatmapPalette, settings.theme);
	refresh();
	renderHeatmap();
	syncSettingsUI();
}
function refresh() {
	renderToday();
	renderCalendar();
	renderStats();
	renderBlacklist();
}

// ── Theme / palette ─────────────────────────────────────────────────────────────
function applyTheme(theme) {
	document.documentElement.setAttribute('data-theme', theme);
	document
		.querySelectorAll('#theme-group .tog-btn')
		.forEach((b) => b.classList.toggle('active', b.dataset.val === theme));
}
const PALETTES = {
	dark: {
		green: ['#2d333b', '#0e4429', '#006d32', '#26a641', '#39d353'],
		blue: ['#2d333b', '#0d2436', '#0a5c8c', '#1088c7', '#36b3f5'],
		orange: ['#2d333b', '#3d1c00', '#874000', '#c46200', '#ff8c00'],
		purple: ['#2d333b', '#1e0a36', '#5a2d7a', '#8e44ad', '#c39bd3'],
	},
	light: {
		green: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
		blue: ['#ebedf0', '#b8d9ea', '#5ba3c9', '#1a6fa8', '#0a4a7c'],
		orange: ['#ebedf0', '#ffd5a0', '#ffa040', '#e07000', '#a04000'],
		purple: ['#ebedf0', '#d9b3f5', '#a960e0', '#7a2db5', '#4a1080'],
	},
};
function applyPalette(pal, theme) {
	const colors =
		(PALETTES[theme] || PALETTES.dark)[pal] || PALETTES.dark.green;
	const r = document.documentElement;
	colors.forEach((c, i) => r.style.setProperty(`--heat-${i}`, c));
	document
		.querySelectorAll('#palette-group .pal-btn')
		.forEach((b) => b.classList.toggle('active', b.dataset.pal === pal));
}
function syncSettingsUI() {
	applyTheme(settings.theme);
	applyPalette(settings.heatmapPalette, settings.theme);
	document
		.querySelectorAll('#difficulty-group .tog-btn')
		.forEach((b) =>
			b.classList.toggle('active', b.dataset.val === settings.difficulty),
		);
}
async function saveSettings() {
	await chrome.storage.local.set({ settings });
	applyTheme(settings.theme);
	applyPalette(settings.heatmapPalette, settings.theme);
}

document.getElementById('theme-group').addEventListener('click', async (e) => {
	const b = e.target.closest('.tog-btn');
	if (!b) return;
	settings.theme = b.dataset.val;
	await saveSettings();
	renderHeatmap();
});
document
	.getElementById('palette-group')
	.addEventListener('click', async (e) => {
		const b = e.target.closest('.pal-btn');
		if (!b) return;
		settings.heatmapPalette = b.dataset.pal;
		await saveSettings();
		renderHeatmap();
	});
document
	.getElementById('difficulty-group')
	.addEventListener('click', async (e) => {
		const b = e.target.closest('.tog-btn');
		if (!b) return;
		settings.difficulty = b.dataset.val;
		await saveSettings();
	});

// ── Stats ────────────────────────────────────────────────────────────────────────
function renderStats() {
	const active = tasks.filter(taskIsActiveToday),
		done = active.filter(taskDoneToday);
	const el = document.getElementById('stats');
	el.textContent = active.length
		? `${done.length} of ${active.length} done today`
		: tasks.length
			? 'Nothing due today'
			: '';
}

// ── Today list ──────────────────────────────────────────────────────────────────
function renderToday() {
	const list = document.getElementById('today-list'),
		today = getToday();
	const todayTasks = tasks
		.filter((t) => {
			if (t.scheduledDate && t.scheduledDate > today) return false;
			return taskIsActiveToday(t) || taskDoneToday(t);
		})
		.sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));
	if (!todayTasks.length) {
		list.innerHTML =
			'<div class="today-empty">Nothing scheduled for today.</div>';
		return;
	}
	list.innerHTML = '';
	todayTasks.forEach((task) => {
		const done = taskDoneToday(task),
			urls = getTaskUrls(task);
		const li = document.createElement('li');
		li.className = `today-item${!done ? ' clickable' : ''}`;
		li.innerHTML = `<div class="today-dot${done ? ' done' : ''}"></div><div class="today-time">${fmtRange(task.startTime, task.endTime)}</div><div class="today-name${done ? ' done' : ''}">${esc(task.name)}</div>${!done ? '<span class="today-arrow">&#8594;</span>' : ''}<button class="btn-remove-sm" data-id="${task.id}" title="Remove">&times;</button>`;
		if (!done)
			li.addEventListener('click', (e) => {
				if (e.target.classList.contains('btn-remove-sm')) return;
				if (!urls.length) {
					chrome.tabs.create({
						url:
							chrome.runtime.getURL('workspace.html') +
							'?taskId=' +
							encodeURIComponent(task.id),
					});
					return;
				}
				openUrlsModal(task.name, urls);
			});
		li.querySelector('.btn-remove-sm').addEventListener('click', (e) => {
			e.stopPropagation();
			openDeleteModal(task.id, 'task');
		});
		list.appendChild(li);
	});
}

// ── URL modal (multiple URLs) ───────────────────────────────────────────────────
function openUrlsModal(taskName, urls) {
	if (urls.length === 1) {
		chrome.tabs.create({
			url: /^https?:\/\//.test(urls[0]) ? urls[0] : 'https://' + urls[0],
		});
		return;
	}
	document.getElementById('group-modal-title').textContent = taskName;
	const list = document.getElementById('group-list');
	list.innerHTML = urls
		.map((u) => {
			const href = /^https?:\/\//.test(u) ? u : 'https://' + u;
			return `<div class="group-item"><div class="group-item-url" data-url="${esc(href)}">${esc(u)}</div></div>`;
		})
		.join('');
	list.querySelectorAll('.group-item-url').forEach((el) =>
		el.addEventListener('click', () => {
			chrome.tabs.create({ url: el.dataset.url });
			closeGroupModal();
		}),
	);
	document.getElementById('group-modal').classList.remove('hidden');
}
function closeGroupModal() {
	document.getElementById('group-modal').classList.add('hidden');
}
document
	.getElementById('group-close')
	.addEventListener('click', closeGroupModal);
document.getElementById('group-modal').addEventListener('click', (e) => {
	if (e.target === document.getElementById('group-modal')) closeGroupModal();
});

// ── Calendar ────────────────────────────────────────────────────────────────────
function getWeekDates() {
	const today = new Date(),
		dow = today.getDay(),
		diff = dow === 0 ? -6 : 1 - dow,
		mon = new Date(today);
	mon.setDate(today.getDate() + diff);
	return Array.from({ length: 7 }, (_, i) => {
		const d = new Date(mon);
		d.setDate(mon.getDate() + i);
		return d;
	});
}
function dateStr(d) {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function getTasksForDay(dayDate) {
	const ds = dateStr(dayDate),
		dow = dayDate.getDay(),
		today = getToday();
	return tasks.filter((t) => {
		const type = t.repeat?.type || 'off',
			start = t.scheduledDate || today;
		if (type === 'off') return (t.scheduledDate || today) === ds;
		if (ds < start) return false;
		if (type === 'daily') return true;
		if (type === 'weekly')
			return (
				new Date((t.scheduledDate || today) + 'T12:00:00').getDay() ===
				dow
			);
		if (type === 'custom') return (t.repeat.days || []).includes(dow);
		return false;
	});
}
function findOverlapGroups(dayTasks) {
	if (!dayTasks.length) return [];
	const items = dayTasks
		.map((t) => ({
			task: t,
			start: timeToMins(t.startTime || '00:00'),
			end: timeToMins(t.endTime || '01:00'),
		}))
		.sort((a, b) => a.start - b.start);
	const groups = [];
	let cur = [items[0]],
		curEnd = items[0].end;
	for (let i = 1; i < items.length; i++) {
		if (items[i].start < curEnd) {
			cur.push(items[i]);
			curEnd = Math.max(curEnd, items[i].end);
		} else {
			groups.push(cur);
			cur = [items[i]];
			curEnd = items[i].end;
		}
	}
	groups.push(cur);
	return groups;
}
function renderCalendar() {
	const weekDates = getWeekDates(),
		todayStr = getToday(),
		dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const heads = document.getElementById('cal-day-heads');
	heads.innerHTML = weekDates
		.map((d, i) => {
			const isT = dateStr(d) === todayStr;
			return `<div class="cal-day-head${isT ? ' is-today' : ''}">${dayNames[i]}<span class="day-num">${d.getDate()}</span></div>`;
		})
		.join('');
	const timeCol = document.getElementById('cal-time-col');
	timeCol.style.height = TOTAL_PX + 'px';
	timeCol.innerHTML = '';
	for (let h = DAY_START; h <= DAY_END; h++) {
		const el = document.createElement('div');
		el.className = 'cal-time-label';
		el.style.top = (h - DAY_START) * HOUR_PX + 'px';
		el.textContent = `${h === 0 ? 12 : h > 12 ? h - 12 : h} ${h >= 12 ? 'PM' : 'AM'}`;
		timeCol.appendChild(el);
	}
	const grid = document.getElementById('cal-days-grid');
	grid.style.height = TOTAL_PX + 'px';
	grid.innerHTML = '';
	weekDates.forEach((dayDate) => {
		const isT = dateStr(dayDate) === todayStr,
			col = document.createElement('div');
		col.className = `cal-day-col${isT ? ' is-today' : ''}`;
		col.style.backgroundImage = `repeating-linear-gradient(to bottom,var(--border) 0px,var(--border) 1px,transparent 1px,transparent ${HOUR_PX}px)`;
		if (isT) {
			const now = new Date(),
				nowTop = minsToTop(now.getHours() * 60 + now.getMinutes());
			if (nowTop >= 0 && nowTop <= TOTAL_PX) {
				const line = document.createElement('div');
				line.className = 'now-line';
				line.id = 'now-line';
				line.style.top = nowTop + 'px';
				line.innerHTML = '<div class="now-dot"></div>';
				col.appendChild(line);
			}
		}
		findOverlapGroups(getTasksForDay(dayDate)).forEach((group) => {
			const gStart = Math.min(...group.map((g) => g.start)),
				gEnd = Math.max(...group.map((g) => g.end));
			const top = minsToTop(gStart),
				height = durationToPx(gEnd - gStart);
			if (group.length === 1) {
				const { task } = group[0],
					done = taskDoneToday(task),
					block = document.createElement('div');
				block.className = `cal-block${done ? ' done-block' : ''}`;
				block.style.cssText = `top:${top}px;height:${height}px;`;
				block.innerHTML = `<div class="cal-block-title">${esc(task.name)}</div><div class="cal-block-time">${fmtRange(task.startTime, task.endTime)}</div>`;
				col.appendChild(block);
			} else {
				const layers = Math.min(group.length, 3);
				for (let i = layers - 1; i >= 1; i--) {
					const s = document.createElement('div');
					s.className = 'cal-stack-shadow';
					s.style.cssText = `top:${top + i * 3}px;left:${i * 3}px;right:${-(i * 3)}px;height:${height}px;background:rgba(79,126,255,${0.55 - i * 0.15});z-index:${4 - i};`;
					col.appendChild(s);
				}
				const block = document.createElement('div');
				block.className = 'cal-block clickable';
				block.style.cssText = `top:${top}px;height:${height}px;z-index:5;`;
				block.innerHTML = `<div class="cal-block-title">Multiple tasks (${group.length})</div><div class="cal-block-time">${minsToDisplay(gStart)} – ${minsToDisplay(gEnd)}</div>`;
				block.addEventListener('click', () => openGroupModal(group));
				col.appendChild(block);
			}
		});
		grid.appendChild(col);
	});
	scrollToNow();
}
function openGroupModal(group) {
	document.getElementById('group-modal-title').textContent =
		'Tasks at this time';
	const list = document.getElementById('group-list');
	list.innerHTML = group
		.map(({ task }) => {
			const urls = getTaskUrls(task);
			return `<div class="group-item"><strong style="font-size:12px">${esc(task.name)}</strong><div style="font-size:10px;color:var(--text3);margin:2px 0">${fmtRange(task.startTime, task.endTime)}</div>${urls.map((u) => `<div class="group-item-url" data-url="${esc(/^https?:\/\//.test(u) ? u : 'https://' + u)}">${esc(u)}</div>`).join('')}</div>`;
		})
		.join('');
	list.querySelectorAll('.group-item-url').forEach((el) =>
		el.addEventListener('click', () => {
			chrome.tabs.create({ url: el.dataset.url });
			closeGroupModal();
		}),
	);
	document.getElementById('group-modal').classList.remove('hidden');
}
function scrollToNow() {
	const body = document.getElementById('cal-body');
	if (!body) return;
	const px = minsToTop(new Date().getHours() * 60 + new Date().getMinutes());
	body.scrollTop = Math.max(0, px - body.clientHeight * 0.33);
}
setInterval(() => {
	const l = document.getElementById('now-line');
	if (l)
		l.style.top =
			minsToTop(new Date().getHours() * 60 + new Date().getMinutes()) +
			'px';
}, 60000);

// ── Heatmap ─────────────────────────────────────────────────────────────────────
async function renderHeatmap() {
	const { completionHistory = {} } =
		await chrome.storage.local.get('completionHistory');
	const wrap = document.getElementById('heatmap-wrap');
	if (!wrap) return;

	const CELL = 14,
		GAP = 3,
		STEP = CELL + GAP,
		MONTH_GAP = 10;
	const YEAR = new Date().getFullYear();
	const MNAMES = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec',
	];

	// Mon=0 … Sun=6
	function getDow(d) {
		return (d.getDay() + 6) % 7;
	}
	function daysInMon(y, m) {
		return new Date(y, m + 1, 0).getDate();
	}
	function level(n) {
		if (!n) return 0;
		if (n === 1) return 1;
		if (n <= 3) return 2;
		if (n <= 5) return 3;
		return 4;
	}

	wrap.innerHTML = '';
	const outer = document.createElement('div');
	outer.style.cssText = `display:flex;align-items:flex-start;width:max-content;padding-bottom:28px;`;

	// Day labels (M W F only to save room)
	const lblCol = document.createElement('div');
	lblCol.style.cssText = `flex-shrink:0;display:flex;flex-direction:column;gap:${GAP}px;margin-top:${STEP + 2}px;margin-right:5px;`;
	['M', '', 'W', '', 'F', '', ''].forEach((l) => {
		const el = document.createElement('div');
		el.style.cssText = `height:${CELL}px;width:10px;font-size:8px;color:var(--text3);text-align:right;line-height:${CELL}px;`;
		el.textContent = l;
		lblCol.appendChild(el);
	});
	outer.appendChild(lblCol);

	for (let m = 0; m < 12; m++) {
		const firstDay = new Date(YEAR, m, 1);
		const firstDow = getDow(firstDay); // which row the 1st lands on
		const numDays = daysInMon(YEAR, m);
		const numCols = Math.ceil((firstDow + numDays) / 7);
		const groupW = numCols * STEP - GAP;

		const group = document.createElement('div');
		group.style.cssText = `display:flex;flex-direction:column;gap:${GAP}px;${m > 0 ? `margin-left:${MONTH_GAP}px;` : ''}`;

		// Centered month label
		const lbl = document.createElement('div');
		lbl.style.cssText = `width:${groupW}px;height:${CELL}px;font-size:9px;color:var(--text3);text-align:center;line-height:${CELL}px;`;
		lbl.textContent = MNAMES[m];
		group.appendChild(lbl);

		// CSS Grid: numCols columns × 7 rows, cells placed explicitly
		const grid = document.createElement('div');
		grid.style.cssText = `display:grid;grid-template-columns:repeat(${numCols},${CELL}px);grid-template-rows:repeat(7,${CELL}px);gap:${GAP}px;`;

		for (let d = 1; d <= numDays; d++) {
			const date = new Date(YEAR, m, d);
			const dow = getDow(date); // row  (0=Mon)
			const col = Math.floor((d - 1 + firstDow) / 7); // col within month group
			const ds = `${YEAR}-${pad(m + 1)}-${pad(d)}`;
			const count = completionHistory[ds] || 0;

			const cell = document.createElement('div');
			cell.className = 'heatmap-cell';
			cell.setAttribute('data-level', String(level(count)));
			// All empty cells (past and future) use the same heat-0 color — no opacity trick
			cell.style.cssText = `grid-column:${col + 1};grid-row:${dow + 1};`;
			cell.setAttribute(
				'data-tip',
				`${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${count} task${count !== 1 ? 's' : ''} done`,
			);
			grid.appendChild(cell);
		}

		group.appendChild(grid);
		outer.appendChild(group);
	}

	wrap.appendChild(outer);
}

// ── Blacklist ───────────────────────────────────────────────────────────────────
function renderBlacklist() {
	const list = document.getElementById('bl-list');
	if (!blacklist.length) {
		list.innerHTML = '<li class="empty-msg">No blocked items.</li>';
		return;
	}
	list.innerHTML = '';
	blacklist.forEach((item) => {
		const li = document.createElement('li');
		li.className = 'bl-item';
		li.innerHTML = `<span class="bl-badge ${item.type}">${item.type}</span><span class="bl-value" title="${esc(item.value)}">${esc(item.value)}</span><button class="bl-del" data-id="${item.id}" title="Remove">&times;</button>`;
		li.querySelector('.bl-del').addEventListener('click', () =>
			openDeleteModal(item.id, 'blacklist'),
		);
		list.appendChild(li);
	});
}
document.getElementById('btn-bl-add').addEventListener('click', async () => {
	const type = document.getElementById('bl-type').value,
		value = document.getElementById('bl-value').value.trim();
	const err = document.getElementById('bl-error');
	if (!value) {
		err.textContent = 'Enter a URL or keyword.';
		return;
	}
	err.textContent = '';
	blacklist = [
		...blacklist,
		{ id: uid(), type, value, createdAt: Date.now() },
	];
	await chrome.storage.local.set({ blacklist });
	document.getElementById('bl-value').value = '';
	renderBlacklist();
});
document.getElementById('bl-value').addEventListener('keydown', (e) => {
	if (e.key === 'Enter') document.getElementById('btn-bl-add').click();
});

// ── Add task form ───────────────────────────────────────────────────────────────
function addUrlRow(value = '') {
	const container = document.getElementById('url-inputs');
	const row = document.createElement('div');
	row.className = 'url-row';
	row.innerHTML = `<input type="text" class="input url-input" placeholder="e.g. leetcode.com" value="${esc(value)}"><button type="button" class="url-del" title="Remove">&times;</button>`;
	row.querySelector('.url-del').addEventListener('click', () => {
		row.remove();
		updateUrlDels();
	});
	container.appendChild(row);
	updateUrlDels();
	if (!value) row.querySelector('.url-input').focus();
}
function updateUrlDels() {
	const rows = document.querySelectorAll('#url-inputs .url-row');
	rows.forEach(
		(r) => (r.querySelector('.url-del').disabled = rows.length === 1),
	);
}
document
	.getElementById('btn-add-url')
	.addEventListener('click', () => addUrlRow());
addUrlRow(); // initial row

document.querySelectorAll('.repeat-pill').forEach((label) => {
	label.addEventListener('click', () => {
		document
			.querySelectorAll('.repeat-pill')
			.forEach((l) => l.classList.remove('selected'));
		label.classList.add('selected');
		label.querySelector('input').checked = true;
		document
			.getElementById('custom-days')
			.classList.toggle('hidden', label.dataset.val !== 'custom');
	});
});
document
	.querySelectorAll('.day-pill')
	.forEach((p) =>
		p.addEventListener('click', () => p.classList.toggle('active')),
	);

document.getElementById('btn-add').addEventListener('click', async () => {
	const errEl = document.getElementById('form-error');
	const name = document.getElementById('f-name').value.trim();
	const urls = [...document.querySelectorAll('#url-inputs .url-input')]
		.map((i) => i.value.trim())
		.filter(Boolean);
	const start = document.getElementById('f-start').value,
		end = document.getElementById('f-end').value;
	const date = document.getElementById('f-date').value || null;
	const rtype = document.querySelector('input[name="repeat"]:checked').value;
	if (!name) {
		errEl.textContent = 'Task name is required.';
		return;
	}
	if (!urls.length) {
		errEl.textContent = 'At least one URL is required.';
		return;
	}
	if (!start || !end) {
		errEl.textContent = 'Start and end time are required.';
		return;
	}
	if (timeToMins(end) <= timeToMins(start)) {
		errEl.textContent = 'End time must be after start time.';
		return;
	}
	let rdays = [];
	if (rtype === 'custom') {
		rdays = [...document.querySelectorAll('.day-pill.active')].map((p) =>
			parseInt(p.dataset.day, 10),
		);
		if (!rdays.length) {
			errEl.textContent = 'Select at least one day.';
			return;
		}
	}
	if (rtype === 'weekly') {
		const base = date ? new Date(date + 'T12:00:00') : new Date();
		rdays = [base.getDay()];
	}
	errEl.textContent = '';
	tasks = [
		...tasks,
		{
			id: uid(),
			name,
			urls,
			startTime: start,
			endTime: end,
			scheduledDate: date,
			repeat: { type: rtype, days: rdays },
			completed: false,
			lastCompletedDate: null,
			createdAt: Date.now(),
		},
	];
	await chrome.storage.local.set({ tasks });
	document.getElementById('f-name').value = '';
	document.getElementById('url-inputs').innerHTML = '';
	addUrlRow();
	document.getElementById('f-start').value = '09:00';
	document.getElementById('f-end').value = '10:00';
	document.getElementById('f-date').value = '';
	document.querySelector('input[name="repeat"][value="off"]').checked = true;
	document
		.querySelectorAll('.repeat-pill')
		.forEach((l) => l.classList.remove('selected'));
	document
		.querySelector('.repeat-pill[data-val="off"]')
		.classList.add('selected');
	document.getElementById('custom-days').classList.add('hidden');
	document
		.querySelectorAll('.day-pill.active')
		.forEach((p) => p.classList.remove('active'));
	document.getElementById('f-name').focus();
	refresh();
	renderHeatmap();
});
['f-name', 'f-start', 'f-end', 'f-date'].forEach((id) =>
	document.getElementById(id).addEventListener('keydown', (e) => {
		if (e.key === 'Enter') document.getElementById('btn-add').click();
	}),
);

document
	.getElementById('btn-clear-done')
	.addEventListener('click', async () => {
		tasks = tasks.filter((t) => !(t.repeat?.type === 'off' && t.completed));
		await chrome.storage.local.set({ tasks });
		refresh();
	});

// ── Delete modal ─────────────────────────────────────────────────────────────────
const CHAL_LEN = 120,
	CHAL_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
function genChallenge() {
	return Array.from(
		{ length: CHAL_LEN },
		() => CHAL_CHARS[Math.floor(Math.random() * CHAL_CHARS.length)],
	).join('');
}
function openDeleteModal(id, type) {
	pendingDeleteId = id;
	pendingDeleteType = type;
	challengeStr = genChallenge();
	const disp = document.getElementById('challenge-display');
	disp.innerHTML = challengeStr
		.match(/.{1,24}/g)
		.map((c) => `<div>${c}</div>`)
		.join('');
	['copy', 'cut', 'dragstart', 'contextmenu'].forEach((ev) =>
		disp.addEventListener(ev, (e) => e.preventDefault(), {
			capture: true,
			once: false,
		}),
	);
	const inp = document.getElementById('challenge-input');
	inp.value = '';
	inp.style.borderColor = '';
	document.getElementById('chal-fill').style.width = '0%';
	document.getElementById('chal-fill').classList.remove('ok');
	document.getElementById('challenge-msg').textContent = '';
	document.getElementById('challenge-msg').className = 'challenge-msg';
	document.getElementById('modal-confirm').disabled = true;
	document.getElementById('delete-modal').classList.remove('hidden');
	setTimeout(() => inp.focus(), 60);
}
const chalInp = document.getElementById('challenge-input');
chalInp.addEventListener('paste', (e) => e.preventDefault());
chalInp.addEventListener('contextmenu', (e) => e.preventDefault());
chalInp.addEventListener('drop', (e) => e.preventDefault());
chalInp.addEventListener('keydown', (e) => {
	if ((e.ctrlKey || e.metaKey) && 'vVxX'.includes(e.key)) e.preventDefault();
});
chalInp.addEventListener('input', (e) => {
	const typed = e.target.value,
		pct = Math.min(100, Math.round((typed.length / CHAL_LEN) * 100));
	const fill = document.getElementById('chal-fill'),
		msg = document.getElementById('challenge-msg'),
		conf = document.getElementById('modal-confirm');
	fill.style.width = pct + '%';
	if (typed === challengeStr) {
		fill.classList.add('ok');
		e.target.style.borderColor = '#3ecf76';
		msg.textContent = 'Match confirmed.';
		msg.className = 'challenge-msg ok';
		conf.disabled = false;
	} else {
		fill.classList.remove('ok');
		conf.disabled = true;
		if (typed.length >= CHAL_LEN) {
			e.target.style.borderColor = '#e05555';
			msg.textContent = 'Does not match.';
			msg.className = 'challenge-msg err';
		} else {
			e.target.style.borderColor = '';
			msg.textContent = '';
			msg.className = 'challenge-msg';
		}
	}
});
document.getElementById('modal-confirm').addEventListener('click', async () => {
	if (!pendingDeleteId || chalInp.value !== challengeStr) return;
	if (pendingDeleteType === 'task') {
		tasks = tasks.filter((t) => t.id !== pendingDeleteId);
		const { timerStates = {} } =
			await chrome.storage.local.get('timerStates');
		delete timerStates[pendingDeleteId];
		await chrome.storage.local.set({ tasks, timerStates });
	} else {
		blacklist = blacklist.filter((b) => b.id !== pendingDeleteId);
		await chrome.storage.local.set({ blacklist });
	}
	closeDeleteModal();
	refresh();
});
function closeDeleteModal() {
	document.getElementById('delete-modal').classList.add('hidden');
	pendingDeleteId = null;
	challengeStr = '';
}
document
	.getElementById('modal-cancel')
	.addEventListener('click', closeDeleteModal);
document.getElementById('delete-modal').addEventListener('click', (e) => {
	if (e.target === document.getElementById('delete-modal'))
		closeDeleteModal();
});
document.addEventListener('keydown', (e) => {
	if (
		e.key === 'Escape' &&
		!document.getElementById('delete-modal').classList.contains('hidden')
	)
		closeDeleteModal();
});

chrome.storage.onChanged.addListener((changes) => {
	if (changes.tasks) {
		tasks = changes.tasks.newValue || [];
		refresh();
	}
	if (changes.blacklist) {
		blacklist = changes.blacklist.newValue || [];
		renderBlacklist();
	}
	if (changes.completionHistory) renderHeatmap();
});

// ── Settings gear dropdown ────────────────────────────────────────────────────
const gearBtn = document.getElementById('btn-gear');
const settingsDD = document.getElementById('settings-dropdown');
gearBtn.addEventListener('click', (e) => {
	e.stopPropagation();
	settingsDD.classList.toggle('hidden');
});
settingsDD.addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', () => settingsDD.classList.add('hidden'));

load();
