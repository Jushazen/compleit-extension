'use strict';

// ── Calendar constants ─────────────────────────────────────────────────────────
const HOUR_PX = 56;
const DAY_START = 6; // 6 AM
const DAY_END = 23; // 11 PM
const TOTAL_HRS = DAY_END - DAY_START;
const TOTAL_PX = TOTAL_HRS * HOUR_PX;

// ── State ──────────────────────────────────────────────────────────────────────
let tasks = [];
let pendingDeleteId = null;
let challengeStr = '';

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

function minsToTop(mins) {
	return ((mins - DAY_START * 60) / 60) * HOUR_PX;
}

function durationToPx(mins) {
	return Math.max(22, (mins / 60) * HOUR_PX);
}

// "09:30" → "9:30 AM"
function fmtTime(timeStr) {
	if (!timeStr) return '';
	const [h, m] = timeStr.split(':').map(Number);
	const ap = h >= 12 ? 'PM' : 'AM';
	const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
	return `${h12}:${pad(m)} ${ap}`;
}

// compact range: "9:00–11:00 AM" or "11:00 AM–1:00 PM"
function fmtRange(startTime, endTime) {
	if (!startTime || !endTime) return '';
	const [sh, sm] = startTime.split(':').map(Number);
	const [eh, em] = endTime.split(':').map(Number);
	const sAP = sh >= 12 ? 'PM' : 'AM';
	const eAP = eh >= 12 ? 'PM' : 'AM';
	const sh12 = sh === 0 ? 12 : sh > 12 ? sh - 12 : sh;
	const eh12 = eh === 0 ? 12 : eh > 12 ? eh - 12 : eh;
	if (sAP === eAP) return `${sh12}:${pad(sm)}–${eh12}:${pad(em)} ${eAP}`;
	return `${sh12}:${pad(sm)} ${sAP}–${eh12}:${pad(em)} ${eAP}`;
}

// minutes back to display time (for stacked block label)
function minsToDisplay(mins) {
	const h = Math.floor(mins / 60) % 24;
	const m = mins % 60;
	return fmtTime(`${pad(h)}:${pad(m)}`);
}

function taskIsActiveToday(task) {
	const today = getToday();
	if (task.scheduledDate && task.scheduledDate > today) return false;
	const type = task.repeat?.type || 'off';
	if (type === 'off') return !task.completed;
	if (task.lastCompletedDate === today) return false;
	if (type === 'daily') return true;
	const dd = new Date().getDay();
	if (type === 'weekly')
		return (
			new Date((task.scheduledDate || today) + 'T12:00:00').getDay() ===
			dd
		);
	if (type === 'custom') return (task.repeat.days || []).includes(dd);
	return false;
}

function taskDoneToday(task) {
	const today = getToday();
	return task.repeat?.type === 'off'
		? task.completed
		: task.lastCompletedDate === today;
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

// ── Load / refresh ────────────────────────────────────────────────────────────

async function load() {
	({ tasks = [] } = await chrome.storage.local.get('tasks'));
	refresh();
}

function refresh() {
	renderToday();
	renderCalendar();
	renderStats();
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function renderStats() {
	const active = tasks.filter(taskIsActiveToday);
	const done = active.filter(taskDoneToday);
	const el = document.getElementById('stats');
	el.textContent = active.length
		? `${done.length} of ${active.length} done today`
		: tasks.length
			? 'Nothing due today'
			: '';
}

// ── Today's task list ─────────────────────────────────────────────────────────

function renderToday() {
	const list = document.getElementById('today-list');
	const today = getToday();

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
		const done = taskDoneToday(task);
		const href = /^https?:\/\//.test(task.url)
			? task.url
			: 'https://' + task.url;

		const li = document.createElement('li');
		li.className = `today-item${!done ? ' clickable' : ''}`;
		li.innerHTML = `
      <div class="today-dot${done ? ' done' : ''}"></div>
      <div class="today-time">${fmtRange(task.startTime, task.endTime)}</div>
      <div class="today-name${done ? ' done' : ''}">${esc(task.name)}</div>
      ${!done ? '<span class="today-arrow">&#8594;</span>' : ''}
      <button class="btn-remove-sm" data-id="${task.id}" title="Remove">&times;</button>
    `;

		if (!done)
			li.addEventListener('click', (e) => {
				if (e.target.classList.contains('btn-remove-sm')) return;
				chrome.tabs.create({ url: href });
			});

		li.querySelector('.btn-remove-sm').addEventListener('click', (e) => {
			e.stopPropagation();
			openDeleteModal(task.id);
		});

		list.appendChild(li);
	});
}

// ── Weekly calendar ───────────────────────────────────────────────────────────

function getWeekDates() {
	const today = new Date();
	const dow = today.getDay();
	const diff = dow === 0 ? -6 : 1 - dow;
	const mon = new Date(today);
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
	const ds = dateStr(dayDate);
	const dow = dayDate.getDay();
	const today = getToday();

	return tasks.filter((task) => {
		const type = task.repeat?.type || 'off';
		const start = task.scheduledDate || today;
		if (type === 'off') return (task.scheduledDate || today) === ds;
		if (ds < start) return false;
		if (type === 'daily') return true;
		if (type === 'weekly')
			return (
				new Date(
					(task.scheduledDate || today) + 'T12:00:00',
				).getDay() === dow
			);
		if (type === 'custom') return (task.repeat.days || []).includes(dow);
		return false;
	});
}

// Merge tasks whose time ranges overlap
function findOverlapGroups(dayTasks) {
	if (!dayTasks.length) return [];

	const items = dayTasks
		.map((task) => ({
			task,
			start: timeToMins(task.startTime || '00:00'),
			end: timeToMins(task.endTime || '01:00'),
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
	const weekDates = getWeekDates();
	const todayStr = getToday();
	const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	// ── Day headers ───────────────────────────────
	const heads = document.getElementById('cal-day-heads');
	heads.innerHTML = weekDates
		.map((d, i) => {
			const isToday = dateStr(d) === todayStr;
			return `<div class="cal-day-head${isToday ? ' is-today' : ''}">
      ${dayNames[i]}<span class="day-num">${d.getDate()}</span>
    </div>`;
		})
		.join('');

	// ── Time labels ───────────────────────────────
	const timeCol = document.getElementById('cal-time-col');
	timeCol.style.height = TOTAL_PX + 'px';
	timeCol.innerHTML = '';
	for (let h = DAY_START; h <= DAY_END; h++) {
		const label = document.createElement('div');
		label.className = 'cal-time-label';
		label.style.top = (h - DAY_START) * HOUR_PX + 'px';
		const ap = h >= 12 ? 'PM' : 'AM';
		const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
		label.textContent = `${h12} ${ap}`;
		timeCol.appendChild(label);
	}

	// ── Day columns ───────────────────────────────
	const grid = document.getElementById('cal-days-grid');
	grid.style.height = TOTAL_PX + 'px';
	grid.innerHTML = '';

	weekDates.forEach((dayDate) => {
		const isToday = dateStr(dayDate) === todayStr;
		const col = document.createElement('div');
		col.className = `cal-day-col${isToday ? ' is-today' : ''}`;
		col.style.backgroundImage = `repeating-linear-gradient(to bottom, var(--border) 0px, var(--border) 1px, transparent 1px, transparent ${HOUR_PX}px)`;

		// "Now" line
		if (isToday) {
			const now = new Date();
			const nowMins = now.getHours() * 60 + now.getMinutes();
			const nowTop = minsToTop(nowMins);
			if (nowTop >= 0 && nowTop <= TOTAL_PX) {
				const line = document.createElement('div');
				line.className = 'now-line';
				line.id = 'now-line';
				line.style.top = nowTop + 'px';
				line.innerHTML = '<div class="now-dot"></div>';
				col.appendChild(line);
			}
		}

		// Tasks → overlap groups → blocks
		const groups = findOverlapGroups(getTasksForDay(dayDate));

		groups.forEach((group) => {
			const groupStart = Math.min(...group.map((g) => g.start));
			const groupEnd = Math.max(...group.map((g) => g.end));
			const top = minsToTop(groupStart);
			const height = durationToPx(groupEnd - groupStart);

			if (group.length === 1) {
				// ── Single block ───────────────────────
				const { task } = group[0];
				const done = taskDoneToday(task);
				const block = document.createElement('div');
				block.className = `cal-block${done ? ' done-block' : ''}`;
				block.style.cssText = `top:${top}px;height:${height}px;`;
				block.innerHTML = `
          <div class="cal-block-title">${esc(task.name)}</div>
          <div class="cal-block-time">${fmtRange(task.startTime, task.endTime)}</div>
        `;
				col.appendChild(block);
			} else {
				// ── Stacked block ──────────────────────
				const layers = Math.min(group.length, 3);

				// Shadow layers behind
				for (let i = layers - 1; i >= 1; i--) {
					const shadow = document.createElement('div');
					shadow.className = 'cal-stack-shadow';
					shadow.style.cssText = `
            top:${top + i * 3}px;
            left:${i * 3}px;
            right:${-(i * 3)}px;
            height:${height}px;
            background:rgba(79,126,255,${0.55 - i * 0.15});
            z-index:${4 - i};
          `;
					col.appendChild(shadow);
				}

				// Front block
				const block = document.createElement('div');
				block.className = 'cal-block clickable';
				block.style.cssText = `top:${top}px;height:${height}px;z-index:5;`;
				block.innerHTML = `
          <div class="cal-block-title">Multiple tasks (${group.length})</div>
          <div class="cal-block-time">${minsToDisplay(groupStart)} – ${minsToDisplay(groupEnd)}</div>
        `;
				block.addEventListener('click', () => openGroupModal(group));
				col.appendChild(block);
			}
		});

		grid.appendChild(col);
	});

	scrollToNow();
}

function scrollToNow() {
	const body = document.getElementById('cal-body');
	if (!body) return;
	const now = new Date();
	const px = minsToTop(now.getHours() * 60 + now.getMinutes());
	body.scrollTop = Math.max(0, px - body.clientHeight * 0.33);
}

setInterval(() => {
	const line = document.getElementById('now-line');
	if (!line) return;
	line.style.top =
		minsToTop(new Date().getHours() * 60 + new Date().getMinutes()) + 'px';
}, 60000);

// ── Group modal ───────────────────────────────────────────────────────────────

function openGroupModal(group) {
	document.getElementById('group-list').innerHTML = group
		.map(
			({ task }) => `
    <div class="group-item">
      <div class="group-item-time">${fmtRange(task.startTime, task.endTime)}</div>
      <div class="group-item-name">${esc(task.name)}</div>
      <div class="group-item-url">${esc(task.url)}</div>
    </div>
  `,
		)
		.join('');
	document.getElementById('group-modal').classList.remove('hidden');
}

document
	.getElementById('group-close')
	.addEventListener('click', () =>
		document.getElementById('group-modal').classList.add('hidden'),
	);
document.getElementById('group-modal').addEventListener('click', (e) => {
	if (e.target === document.getElementById('group-modal'))
		document.getElementById('group-modal').classList.add('hidden');
});

// ── Add task form ─────────────────────────────────────────────────────────────

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
	const url = document.getElementById('f-url').value.trim();
	const start = document.getElementById('f-start').value;
	const end = document.getElementById('f-end').value;
	const date = document.getElementById('f-date').value || null;
	const rtype = document.querySelector('input[name="repeat"]:checked').value;

	if (!name || !url) {
		errEl.textContent = 'Name and URL are required.';
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
			errEl.textContent = 'Select at least one day for custom repeat.';
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
			url,
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
	document.getElementById('f-url').value = '';
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
});

['f-name', 'f-url', 'f-start', 'f-end', 'f-date'].forEach((id) =>
	document.getElementById(id).addEventListener('keydown', (e) => {
		if (e.key === 'Enter') document.getElementById('btn-add').click();
	}),
);

// ── Clear completed ───────────────────────────────────────────────────────────

document
	.getElementById('btn-clear-done')
	.addEventListener('click', async () => {
		tasks = tasks.filter((t) => !(t.repeat?.type === 'off' && t.completed));
		await chrome.storage.local.set({ tasks });
		refresh();
	});

// ── Delete modal ──────────────────────────────────────────────────────────────

const CHAL_LEN = 120;
const CHAL_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

function generateChallenge() {
	return Array.from(
		{ length: CHAL_LEN },
		() => CHAL_CHARS[Math.floor(Math.random() * CHAL_CHARS.length)],
	).join('');
}

function openDeleteModal(taskId) {
	pendingDeleteId = taskId;
	challengeStr = generateChallenge();

	const display = document.getElementById('challenge-display');
	display.innerHTML = challengeStr
		.match(/.{1,24}/g)
		.map((c) => `<div>${c}</div>`)
		.join('');

	// Block all copy mechanisms on the display
	['copy', 'cut', 'dragstart', 'contextmenu'].forEach((ev) =>
		display.addEventListener(ev, (e) => e.preventDefault(), true),
	);

	const input = document.getElementById('challenge-input');
	input.value = '';
	input.style.borderColor = '';
	document.getElementById('chal-fill').style.width = '0%';
	document.getElementById('chal-fill').classList.remove('ok');
	document.getElementById('challenge-msg').textContent = '';
	document.getElementById('challenge-msg').className = 'challenge-msg';
	document.getElementById('modal-confirm').disabled = true;
	document.getElementById('delete-modal').classList.remove('hidden');
	setTimeout(() => input.focus(), 60);
}

// Block paste on the input
const chalInput = document.getElementById('challenge-input');
chalInput.addEventListener('paste', (e) => e.preventDefault());
chalInput.addEventListener('contextmenu', (e) => e.preventDefault());
chalInput.addEventListener('drop', (e) => e.preventDefault());
chalInput.addEventListener('keydown', (e) => {
	if ((e.ctrlKey || e.metaKey) && ['v', 'V', 'x', 'X'].includes(e.key))
		e.preventDefault();
});

chalInput.addEventListener('input', (e) => {
	const typed = e.target.value;
	const pct = Math.min(100, Math.round((typed.length / CHAL_LEN) * 100));
	const fill = document.getElementById('chal-fill');
	const msg = document.getElementById('challenge-msg');
	const confirm = document.getElementById('modal-confirm');

	fill.style.width = pct + '%';

	if (typed === challengeStr) {
		fill.classList.add('ok');
		e.target.style.borderColor = '#3ecf76';
		msg.textContent = 'Match confirmed.';
		msg.className = 'challenge-msg ok';
		confirm.disabled = false;
	} else {
		fill.classList.remove('ok');
		confirm.disabled = true;
		if (typed.length >= CHAL_LEN) {
			e.target.style.borderColor = '#e05555';
			msg.textContent = 'Does not match. Keep typing.';
			msg.className = 'challenge-msg err';
		} else {
			e.target.style.borderColor = '';
			msg.textContent = '';
			msg.className = 'challenge-msg';
		}
	}
});

document.getElementById('modal-confirm').addEventListener('click', async () => {
	if (
		!pendingDeleteId ||
		document.getElementById('challenge-input').value !== challengeStr
	)
		return;
	tasks = tasks.filter((t) => t.id !== pendingDeleteId);
	const { timerStates = {} } = await chrome.storage.local.get('timerStates');
	delete timerStates[pendingDeleteId];
	await chrome.storage.local.set({ tasks, timerStates });
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

// ── Live storage updates ──────────────────────────────────────────────────────
chrome.storage.onChanged.addListener((changes) => {
	if (changes.tasks) {
		tasks = changes.tasks.newValue || [];
		refresh();
	}
});

// ── Wider time column in today list ──────────────────────────────────────────
// (handled in CSS — .today-time width is set to auto)

load();
