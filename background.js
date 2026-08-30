// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// Get your free Gemini API key at: https://aistudio.google.com/apikey
// Paste it below — no credit card required.
// ─────────────────────────────────────────────────────────────────────────────
const GEMINI_API_KEY = `${process.env.MY_GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY_HERE'}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getToday() {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function taskIsActiveToday(task) {
	const today = getToday();
	if (task.scheduledDate && task.scheduledDate > today) return false;

	const type = task.repeat?.type || 'off';

	if (type === 'off') return !task.completed;

	// Repeating task — check if already done today
	if (task.lastCompletedDate === today) return false;

	if (type === 'daily') return true;

	const todayDay = new Date().getDay(); // 0=Sun

	if (type === 'weekly') {
		const scheduledDay = new Date(
			(task.scheduledDate || today) + 'T12:00:00',
		).getDay();
		return todayDay === scheduledDay;
	}

	if (type === 'custom') {
		return (task.repeat.days || []).includes(todayDay);
	}

	return false;
}

function normalizeHost(urlStr) {
	try {
		const full = /^https?:\/\//.test(urlStr) ? urlStr : 'https://' + urlStr;
		return new URL(full).hostname.replace(/^www\./, '').toLowerCase();
	} catch {
		return null;
	}
}

function urlMatchesTask(navUrl, taskUrl) {
	const navHost = normalizeHost(navUrl);
	const taskHost = normalizeHost(taskUrl);
	if (!navHost || !taskHost) return false;
	return navHost === taskHost || navHost.endsWith('.' + taskHost);
}

// ── Open tasks page on startup and toolbar click ───────────────────────────

chrome.runtime.onStartup.addListener(() => {
	chrome.tabs.create({ url: chrome.runtime.getURL('tasks.html') });
});

chrome.action.onClicked.addListener(() => {
	chrome.tabs.create({ url: chrome.runtime.getURL('tasks.html') });
});

// ── Navigation interception ────────────────────────────────────────────────

const injectedTabs = new Set();

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
	if (changeInfo.url) injectedTabs.delete(tabId);

	if (changeInfo.status !== 'loading' && changeInfo.status !== 'complete')
		return;

	const url = tab.url;
	if (!url || (!url.startsWith('http://') && !url.startsWith('https://')))
		return;

	let tasks;
	try {
		({ tasks = [] } = await chrome.storage.local.get('tasks'));
	} catch {
		return;
	}

	const activeTasks = tasks.filter(taskIsActiveToday);
	if (activeTasks.length === 0) return;

	const matchingTask = activeTasks.find((t) => urlMatchesTask(url, t.url));

	if (changeInfo.status === 'loading' && !matchingTask) {
		const blockedUrl = chrome.runtime.getURL('blocked.html');
		if (!url.startsWith(blockedUrl)) {
			chrome.tabs.update(tabId, { url: blockedUrl }).catch(() => {});
		}
		return;
	}

	if (
		changeInfo.status === 'complete' &&
		matchingTask &&
		!injectedTabs.has(tabId)
	) {
		injectedTabs.add(tabId);
		chrome.scripting
			.executeScript({ target: { tabId }, files: ['overlay.js'] })
			.catch(() => injectedTabs.delete(tabId));
	}
});

chrome.tabs.onRemoved.addListener((tabId) => injectedTabs.delete(tabId));

// ── Message handler ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
	handle(msg)
		.then(sendResponse)
		.catch((err) => sendResponse({ error: String(err.message || err) }));
	return true;
});

async function handle(msg) {
	switch (msg.action) {
		case 'COMPLETE_TASK': {
			const { tasks = [] } = await chrome.storage.local.get('tasks');
			const today = getToday();

			const updated = tasks.map((t) => {
				if (t.id !== msg.taskId) return t;
				const type = t.repeat?.type || 'off';
				// One-shot task: permanent completion
				if (type === 'off') return { ...t, completed: true };
				// Repeating task: mark done for today only
				return { ...t, lastCompletedDate: today };
			});

			// Clear timer state so it resets on next occurrence
			const { timerStates = {} } =
				await chrome.storage.local.get('timerStates');
			delete timerStates[msg.taskId];
			await chrome.storage.local.set({ tasks: updated, timerStates });

			// Notify blocked tabs
			const allTabs = await chrome.tabs.query({});
			const blockedBase = chrome.runtime.getURL('blocked.html');
			allTabs
				.filter((t) => t.url?.startsWith(blockedBase))
				.forEach((t) =>
					chrome.tabs
						.sendMessage(t.id, { action: 'TASKS_UPDATED' })
						.catch(() => {}),
				);

			return { ok: true };
		}

		case 'SAVE_TIMER': {
			const { timerStates = {} } =
				await chrome.storage.local.get('timerStates');
			timerStates[msg.taskId] = msg.state;
			await chrome.storage.local.set({ timerStates });
			return { ok: true };
		}

		case 'VALIDATE_SCREENSHOT': {
			if (
				!GEMINI_API_KEY ||
				GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE'
			) {
				throw new Error(
					'Gemini API key not set. Edit background.js and add your key.',
				);
			}

			const response = await fetch(
				`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						system_instruction: {
							parts: [
								{
									text: 'You are a strict task completion validator. Answer ONLY with "yes" or "no". Do not explain.',
								},
							],
						},
						contents: [
							{
								parts: [
									{
										inline_data: {
											mime_type:
												msg.mediaType || 'image/png',
											data: msg.imageData,
										},
									},
									{
										text: `Task: "${msg.taskName}"\n\nDoes this screenshot clearly show that this task was completed?`,
									},
								],
							},
						],
						generationConfig: {
							maxOutputTokens: 5,
							temperature: 0,
						},
					}),
				},
			);

			if (!response.ok) {
				const err = await response.json().catch(() => ({}));
				throw new Error(
					err.error?.message || `Gemini API error ${response.status}`,
				);
			}

			const data = await response.json();
			const answer = (
				data.candidates?.[0]?.content?.parts?.[0]?.text || ''
			)
				.trim()
				.toLowerCase();
			return { verified: answer === 'yes' || answer.startsWith('yes') };
		}

		default:
			throw new Error(`Unknown action: ${msg.action}`);
	}
}
