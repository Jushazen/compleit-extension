'use strict';
function pad(n) {
	return String(n).padStart(2, '0');
}
function getToday() {
	const d = new Date();
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtRange(s, e) {
	if (!s || !e) return '';
	const [sh, sm] = s.split(':').map(Number),
		[eh, em] = e.split(':').map(Number);
	const sAP = sh >= 12 ? 'PM' : 'AM',
		eAP = eh >= 12 ? 'PM' : 'AM',
		sh12 = sh === 0 ? 12 : sh > 12 ? sh - 12 : sh,
		eh12 = eh === 0 ? 12 : eh > 12 ? eh - 12 : eh;
	if (sAP === eAP) return `${sh12}:${pad(sm)}–${eh12}:${pad(em)} ${eAP}`;
	return `${sh12}:${pad(sm)} ${sAP}–${eh12}:${pad(em)} ${eAP}`;
}
function esc(s) {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
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

// Check if this is a blacklist block
const params = new URLSearchParams(window.location.search);
const IS_BLACKLIST = params.get('reason') === 'blacklist';

async function loadAndRender() {
	const { tasks = [] } = await chrome.storage.local.get('tasks');
	render(tasks);
}

function render(allTasks) {
	const today = getToday();
	const badge = document.getElementById('badge'),
		title = document.getElementById('title'),
		sub = document.getElementById('subtitle');
	const fill = document.getElementById('progress-fill'),
		label = document.getElementById('progress-label'),
		list = document.getElementById('task-list');

	if (IS_BLACKLIST) {
		badge.textContent = 'Blacklisted';
		badge.className = 'badge badge-blocked';
		title.textContent = 'This URL is blocked';
		sub.textContent =
			'You have blacklisted this address. Remove it in Task Guardian to access it.';
		list.innerHTML =
			'<div class="empty">Open a new tab to manage your blacklist.</div>';
		fill.style.width = '100%';
		fill.classList.add('all-done');
		label.textContent = '';
		return;
	}

	const todayTasks = allTasks.filter((t) => {
		if (t.scheduledDate && t.scheduledDate > today) return false;
		return taskIsActiveToday(t) || taskDoneToday(t);
	});
	const total = todayTasks.length,
		done = todayTasks.filter(taskDoneToday).length,
		allDone = total > 0 && done === total;

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

	const pct = total ? (done / total) * 100 : 0;
	fill.style.width = pct + '%';
	fill.classList.toggle('all-done', allDone);
	label.textContent = `${done} / ${total}`;

	if (!todayTasks.length) {
		list.innerHTML =
			'<div class="empty">Nothing scheduled for today.</div>';
		return;
	}
	list.innerHTML = '';
	todayTasks.forEach((task) => {
		const isDone = taskDoneToday(task);
		const urls = task.urls || (task.url ? [task.url] : []);
		const li = document.createElement('li');
		li.className = `task-item${!isDone ? ' clickable' : ''}`;
		li.innerHTML = `<div class="check${isDone ? ' done' : ''}"></div><div class="task-info"><div class="task-name${isDone ? ' done' : ''}">${esc(task.name)}</div><div class="task-meta">${urls.map((u) => esc(u)).join(', ')} &middot; ${fmtRange(task.startTime, task.endTime)}</div></div>${!isDone ? '<span class="task-arrow">&#8594;</span>' : ''}`;
		if (!isDone)
			li.addEventListener('click', () => {
				if (!urls.length) {
					chrome.tabs.create({
						url:
							chrome.runtime.getURL('workspace.html') +
							'?taskId=' +
							encodeURIComponent(task.id),
					});
					return;
				}
				if (urls.length === 1) {
					chrome.tabs.create({
						url: /^https?:\/\//.test(urls[0])
							? urls[0]
							: 'https://' + urls[0],
					});
				} else {
					urls.forEach((u) =>
						chrome.tabs.create({
							url: /^https?:\/\//.test(u) ? u : 'https://' + u,
						}),
					);
				}
			});
		list.appendChild(li);
	});
}

chrome.runtime.onMessage.addListener((msg) => {
	if (msg.action === 'TASKS_UPDATED') loadAndRender();
});
chrome.storage.onChanged.addListener((changes) => {
	if (changes.tasks) render(changes.tasks.newValue || []);
});
loadAndRender();
