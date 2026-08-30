'use strict';

let tasks = [];
let pendingDeleteId = null;
let challengeStr = '';

// ── Shared helpers (duplicated from background.js — no module sharing in MV3) ──

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
			new Date((task.scheduledDate || today) + 'T12:00:00').getDay() ===
			todayDay
		);
	}
	if (type === 'custom') return (task.repeat.days || []).includes(todayDay);
	return false;
}

// ── Load ─────────────────────────────────────────────────────────────────────

async function load() {
	({ tasks = [] } = await chrome.storage.local.get('tasks'));
	render();
	renderStats();
}

// ── Render task list ──────────────────────────────────────────────────────────

function render() {
	const list = document.getElementById('task-list');

	if (!tasks.length) {
		list.innerHTML =
			'<div class="empty">No tasks yet. Add one above.</div>';
		return;
	}

	// Sort: active today first, then by scheduled date
	const sorted = [...tasks].sort((a, b) => {
		const aActive = taskIsActiveToday(a) ? 0 : 1;
		const bActive = taskIsActiveToday(b) ? 0 : 1;
		if (aActive !== bActive) return aActive - bActive;
		return (a.scheduledDate || '').localeCompare(b.scheduledDate || '');
	});

	list.innerHTML = sorted
		.map((task) => {
			const { label, cls } = getStatusBadge(task);
			const repeatLabel = getRepeatLabel(task);
			const dateLabel = formatDate(task.scheduledDate);
			const isDone = cls === 'badge-done';

			return `
      <li class="task-item">
        <div class="task-info">
          <div class="task-name${isDone ? ' done-text' : ''}">
            ${esc(task.name)}
            <span class="badge ${cls}">${label}</span>
          </div>
          <div class="task-meta">
            ${esc(task.url)}&ensp;&middot;&ensp;${task.duration} min&ensp;&middot;&ensp;${dateLabel}&ensp;&middot;&ensp;${repeatLabel}
          </div>
        </div>
        <button class="btn-remove" data-id="${task.id}">Remove</button>
      </li>
    `;
		})
		.join('');

	list.querySelectorAll('.btn-remove').forEach((btn) =>
		btn.addEventListener('click', () => openDeleteModal(btn.dataset.id)),
	);
}

function renderStats() {
	const today = getToday();
	const activeToday = tasks.filter(taskIsActiveToday);
	const doneToday = tasks
		.filter((t) =>
			t.repeat?.type === 'off'
				? t.completed
				: t.lastCompletedDate === today,
		)
		.filter((t) => {
			// Only count tasks that were scheduled to be done today
			if (t.scheduledDate && t.scheduledDate > today) return false;
			return true;
		});

	const el = document.getElementById('stats');
	if (!tasks.length) {
		el.textContent = '';
		return;
	}
	const pending = activeToday.length;
	const done = activeToday.filter((t) =>
		t.repeat?.type === 'off' ? t.completed : t.lastCompletedDate === today,
	).length;
	el.textContent =
		pending === 0
			? 'Nothing due today'
			: `${done} of ${pending} done today`;
}

// ── Status / label helpers ────────────────────────────────────────────────────

function getStatusBadge(task) {
	const today = getToday();
	if (task.scheduledDate && task.scheduledDate > today)
		return { label: 'Scheduled', cls: 'badge-scheduled' };

	const type = task.repeat?.type || 'off';

	if (type === 'off') {
		if (task.completed) return { label: 'Complete', cls: 'badge-done' };
		return { label: 'Active today', cls: 'badge-active' };
	}

	if (task.lastCompletedDate === today)
		return { label: 'Done today', cls: 'badge-done' };

	if (taskIsActiveToday(task))
		return { label: 'Active today', cls: 'badge-active' };

	return { label: 'Not today', cls: 'badge-scheduled' };
}

function getRepeatLabel(task) {
	const type = task.repeat?.type || 'off';
	const map = { off: 'Once', daily: 'No limit', weekly: 'Weekly' };
	if (map[type]) return map[type];
	const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	return (task.repeat.days || [])
		.sort((a, b) => a - b)
		.map((d) => names[d])
		.join(', ');
}

function formatDate(dateStr) {
	if (!dateStr) return '';
	return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
}

// ── Form: repeat radio pills ──────────────────────────────────────────────────

const customDaysEl = document.getElementById('custom-days');

document.querySelectorAll('.repeat-option').forEach((label) => {
	label.addEventListener('click', () => {
		document
			.querySelectorAll('.repeat-option')
			.forEach((l) => l.classList.remove('selected'));
		label.classList.add('selected');
		label.querySelector('input').checked = true;
		customDaysEl.classList.toggle('hidden', label.dataset.val !== 'custom');
	});
});

document
	.querySelectorAll('.day-pill')
	.forEach((pill) =>
		pill.addEventListener('click', () => pill.classList.toggle('active')),
	);

// Set today as the default scheduled date
document.getElementById('f-date').value = getToday();

// ── Add task ──────────────────────────────────────────────────────────────────

document.getElementById('btn-add').addEventListener('click', async () => {
	const errEl = document.getElementById('form-error');

	const name = document.getElementById('f-name').value.trim();
	const url = document.getElementById('f-url').value.trim();
	const dur = parseInt(document.getElementById('f-dur').value, 10);
	const date = document.getElementById('f-date').value;
	const repeatType = document.querySelector(
		'input[name="repeat"]:checked',
	).value;

	if (!name || !url) {
		errEl.textContent = 'Name and URL are required.';
		return;
	}
	if (!dur || dur < 1) {
		errEl.textContent = 'Enter a valid time in minutes.';
		return;
	}
	if (!date) {
		errEl.textContent = 'Please select a date.';
		return;
	}

	let repeatDays = [];
	if (repeatType === 'custom') {
		repeatDays = [...document.querySelectorAll('.day-pill.active')].map(
			(p) => parseInt(p.dataset.day, 10),
		);
		if (!repeatDays.length) {
			errEl.textContent = 'Select at least one day for custom repeat.';
			return;
		}
	}
	if (repeatType === 'weekly') {
		repeatDays = [new Date(date + 'T12:00:00').getDay()];
	}

	errEl.textContent = '';

	const task = {
		id: uid(),
		name,
		url,
		duration: dur,
		scheduledDate: date,
		repeat: { type: repeatType, days: repeatDays },
		completed: false,
		lastCompletedDate: null,
		createdAt: Date.now(),
	};

	tasks = [...tasks, task];
	await chrome.storage.local.set({ tasks });

	// Reset form
	document.getElementById('f-name').value = '';
	document.getElementById('f-url').value = '';
	document.getElementById('f-dur').value = '';
	document.getElementById('f-date').value = getToday();
	document.querySelector('input[name="repeat"][value="off"]').checked = true;
	document
		.querySelectorAll('.repeat-option')
		.forEach((l) => l.classList.remove('selected'));
	document
		.querySelector('.repeat-option[data-val="off"]')
		.classList.add('selected');
	customDaysEl.classList.add('hidden');
	document
		.querySelectorAll('.day-pill.active')
		.forEach((p) => p.classList.remove('active'));
	document.getElementById('f-name').focus();

	render();
	renderStats();
});

// Enter key submits from any field
['f-name', 'f-url', 'f-dur', 'f-date'].forEach((id) =>
	document.getElementById(id).addEventListener('keydown', (e) => {
		if (e.key === 'Enter') document.getElementById('btn-add').click();
	}),
);

// ── Delete challenge modal ────────────────────────────────────────────────────

const CHALLENGE_LEN = 120;
const CHALLENGE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

function generateChallenge() {
	return Array.from(
		{ length: CHALLENGE_LEN },
		() =>
			CHALLENGE_CHARS[Math.floor(Math.random() * CHALLENGE_CHARS.length)],
	).join('');
}

function openDeleteModal(taskId) {
	pendingDeleteId = taskId;
	challengeStr = generateChallenge();

	// Display in rows of 24 for readability
	const display = document.getElementById('challenge-display');
	display.innerHTML = challengeStr
		.match(/.{1,24}/g)
		.map((chunk) => `<div>${chunk}</div>`)
		.join('');

	const input = document.getElementById('challenge-input');
	input.value = '';
	input.style.borderColor = '';
	document.getElementById('challenge-fill').style.width = '0%';
	document.getElementById('challenge-fill').classList.remove('complete');
	document.getElementById('challenge-status').textContent = '';
	document.getElementById('challenge-status').className = 'challenge-status';
	document.getElementById('modal-confirm').disabled = true;
	document.getElementById('delete-modal').classList.remove('hidden');

	setTimeout(() => input.focus(), 60);
}

document.getElementById('challenge-input').addEventListener('input', (e) => {
	const typed = e.target.value;
	const pct = Math.min(100, Math.round((typed.length / CHALLENGE_LEN) * 100));
	const fill = document.getElementById('challenge-fill');
	const status = document.getElementById('challenge-status');
	const confirm = document.getElementById('modal-confirm');

	fill.style.width = pct + '%';

	if (typed === challengeStr) {
		fill.classList.add('complete');
		e.target.style.borderColor = '#3ecf76';
		status.textContent = 'Match confirmed — you may delete.';
		status.className = 'challenge-status ok';
		confirm.disabled = false;
	} else {
		fill.classList.remove('complete');
		// Show mismatch only once they've typed enough to know
		if (typed.length >= challengeStr.length) {
			e.target.style.borderColor = '#e05555';
			status.textContent = 'Does not match. Check and retype.';
			status.className = 'challenge-status err';
		} else {
			e.target.style.borderColor = '';
			status.textContent = '';
			status.className = 'challenge-status';
		}
		confirm.disabled = true;
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

	closeModal();
	render();
	renderStats();
});

function closeModal() {
	document.getElementById('delete-modal').classList.add('hidden');
	pendingDeleteId = null;
	challengeStr = '';
}

document.getElementById('modal-cancel').addEventListener('click', closeModal);

// Close on backdrop click
document.getElementById('delete-modal').addEventListener('click', (e) => {
	if (e.target === document.getElementById('delete-modal')) closeModal();
});

// Escape key closes modal
document.addEventListener('keydown', (e) => {
	if (
		e.key === 'Escape' &&
		!document.getElementById('delete-modal').classList.contains('hidden')
	) {
		closeModal();
	}
});

// ── Live updates from other tabs ──────────────────────────────────────────────

chrome.storage.onChanged.addListener((changes) => {
	if (changes.tasks) {
		tasks = changes.tasks.newValue || [];
		render();
		renderStats();
	}
});

// ── Utilities ─────────────────────────────────────────────────────────────────

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

load();
