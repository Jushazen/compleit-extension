// Compleit — background service worker
// Blacklist blocks navigation. Tasks only inject the overlay; they do NOT block browsing.

function getToday() {
	const d = new Date();
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function pad(n) {
	return String(n).padStart(2, '0');
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
function normalizeHost(u) {
	try {
		const full = /^https?:\/\//.test(u) ? u : 'https://' + u;
		return new URL(full).hostname.replace(/^www\./, '').toLowerCase();
	} catch {
		return null;
	}
}
function urlMatchesEntry(navUrl, entryUrl) {
	const a = normalizeHost(navUrl),
		b = normalizeHost(entryUrl);
	if (!a || !b) return false;
	return a === b || a.endsWith('.' + b);
}
function taskMatchesUrl(task, navUrl) {
	const urls = task.urls || (task.url ? [task.url] : []);
	return urls.some((u) => urlMatchesEntry(navUrl, u));
}

// Open tasks page on startup and toolbar click
chrome.runtime.onStartup.addListener(() =>
	chrome.tabs.create({ url: chrome.runtime.getURL('tasks.html') }),
);
chrome.action.onClicked.addListener(() =>
	chrome.tabs.create({ url: chrome.runtime.getURL('tasks.html') }),
);

const injectedTabs = new Set();

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
	if (changeInfo.url) injectedTabs.delete(tabId);
	if (changeInfo.status !== 'loading' && changeInfo.status !== 'complete')
		return;
	const url = tab.url;
	if (!url || (!url.startsWith('http://') && !url.startsWith('https://')))
		return;

	// Only blacklist blocks navigation — tasks never block
	if (changeInfo.status === 'loading') {
		const { blacklist = [] } = await chrome.storage.local.get('blacklist');
		const isBlocked = blacklist.some((item) => {
			if (item.type === 'url') return urlMatchesEntry(url, item.value);
			if (item.type === 'keyword')
				return url.toLowerCase().includes(item.value.toLowerCase());
			return false;
		});
		if (isBlocked) {
			const dest =
				chrome.runtime.getURL('blocked.html') + '?reason=blacklist';
			if (!url.startsWith(chrome.runtime.getURL('blocked.html')))
				chrome.tabs.update(tabId, { url: dest }).catch(() => {});
		}
		return;
	}

	// Inject Pomodoro overlay when visiting a task URL
	if (changeInfo.status === 'complete') {
		let tasks;
		try {
			({ tasks = [] } = await chrome.storage.local.get('tasks'));
		} catch {
			return;
		}
		const match = tasks
			.filter(taskIsActiveToday)
			.find((t) => taskMatchesUrl(t, url));
		if (match && !injectedTabs.has(tabId)) {
			injectedTabs.add(tabId);
			chrome.scripting
				.executeScript({ target: { tabId }, files: ['overlay.js'] })
				.catch(() => injectedTabs.delete(tabId));
		}
	}
});

chrome.tabs.onRemoved.addListener((id) => injectedTabs.delete(id));
