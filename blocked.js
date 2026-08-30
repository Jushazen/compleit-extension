'use strict';

// ── Shared helpers ────────────────────────────────────────────────────────────

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

function taskDoneToday(task) {
	const today = getToday();
	if (task.repeat?.type === 'off') return task.completed;
	return task.lastCompletedDate === today;
}

function esc(s) {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

// ── Render ────────────────────────────────────────────────────────────────────

async function loadAndRender() {
	const { tasks = [] } = await chrome.storage.local.get('tasks');
	render(tasks);
}

function render(allTasks) {
	// Only show tasks that are due today (active or done)
	const todayTasks = allTasks.filter((t) => {
		const today = getToday();
		if (t.scheduledDate && t.scheduledDate > today) return false;
		// Include if active today OR if it was supposed to be done today (repeat type check)
		if (taskIsActiveToday(t)) return true;
		// Also show tasks done today so user can see progress
		return taskDoneToday(t);
	});

	const list = document.getElementById('task-list');
	const badge = document.getElementById('badge');
	const title = document.getElementById('title');
	const sub = document.getElementById('subtitle');
	const fill = document.getElementById('progress-fill');
	const label = document.getElementById('progress-label');

	const total = todayTasks.length;
	const done = todayTasks.filter(taskDoneToday).length;
	const allDone = total > 0 && done === total;

	// Header
	if (allDone) {
		badge.textContent = 'Complete';
		badge.className = 'badge badge-done';
		title.textContent = 'All done for today';
		sub.textContent = 'Browsing is unlocked. You can navigate freely.';
	} else {
		badge.textContent = 'Blocked';
		badge.className = 'badge badge-blocked';
		title.textContent = "Complete today's tasks to continue";
		sub.textContent =
			'Browsing is locked. Click a pending task below to work on it.';
	}

	// Progress
	const pct = total ? (done / total) * 100 : 0;
	fill.style.width = pct + '%';
	fill.classList.toggle('all-done', allDone);
	label.textContent = `${done} / ${total}`;

	// List
	if (!todayTasks.length) {
		list.innerHTML =
			'<div class="empty">Nothing scheduled for today.</div>';
		return;
	}

	list.innerHTML = '';
	todayTasks.forEach((task) => {
		const done = taskDoneToday(task);
		const href = /^https?:\/\//.test(task.url)
			? task.url
			: 'https://' + task.url;

		const li = document.createElement('li');
		li.className = `task-item${!done ? ' clickable' : ''}`;
		li.innerHTML = `
      <div class="check${done ? ' done' : ''}"></div>
      <div class="task-info">
        <div class="task-name${done ? ' done' : ''}">${esc(task.name)}</div>
        <div class="task-meta">${esc(task.url)} &middot; ${task.duration} min</div>
      </div>
      ${!done ? '<span class="task-arrow">&#8594;</span>' : ''}
    `;

		if (!done) {
			li.addEventListener('click', () =>
				chrome.tabs.create({ url: href }),
			);
		}

		list.appendChild(li);
	});
}

// ── Live updates ──────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
	if (msg.action === 'TASKS_UPDATED') loadAndRender();
});

chrome.storage.onChanged.addListener((changes) => {
	if (changes.tasks) render(changes.tasks.newValue || []);
});

loadAndRender();
