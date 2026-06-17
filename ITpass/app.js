console.log('hello')

// ===============================
// CSV読み込み & プール構築
// ===============================
function el(id) { return document.getElementById(id); }
function setText(id, text) { el(id).textContent = text; }

async function loadCsv(url) {
	try {
		const res = await fetch(url, { cache: 'no-store' });
		if (!res.ok) throw new Error(`CSV読み込み失敗: ${res.status}`);
		return await res.text();
	} catch (e) {
		// 代替の相対パスも試行
		const candidates = [ './' + url, '/' + url, `${url}?t=${Date.now()}` ];
		for (const u of candidates) {
			try {
				const res = await fetch(u, { cache: 'no-store' });
				if (!res.ok) continue;
				return await res.text();
			} catch (_) {}
		}
		throw e;
	}
}

	function parseCsv(text) {
		// ダブルクオート内のカンマ/改行に対応した簡易CSVパーサ
		function csvToRows(str) {
			const rows = [];
			let row = [];
			let cell = '';
			let inQuotes = false;
			for (let i = 0; i < str.length; i++) {
				const ch = str[i];
				if (inQuotes) {
					if (ch === '"') {
						if (str[i + 1] === '"') { cell += '"'; i++; }
						else { inQuotes = false; }
					} else {
						cell += ch;
					}
				} else {
					if (ch === '"') {
						inQuotes = true;
					} else if (ch === ',') {
						row.push(cell);
						cell = '';
					} else if (ch === '\n') {
						row.push(cell);
						rows.push(row);
						row = [];
						cell = '';
					} else if (ch === '\r') {
						// ignore
					} else {
						cell += ch;
					}
				}
			}
			row.push(cell);
			rows.push(row);
			return rows.filter(r => r.some(v => (v ?? '').trim() !== ''));
		}

		const rows = csvToRows(text);
		if (rows.length === 0) return [];
		let start = 0;
		const header = rows[0].map(s => (s ?? '').trim().toLowerCase());
		if (header[0] === 'id') start = 1; // ヘッダ行スキップ

		const out = [];
		for (let i = start; i < rows.length; i++) {
			const cols = rows[i];
			if (!cols || cols.length < 8) continue;
			const id = (cols[0] ?? '').trim();
			const question = (cols[1] ?? '').trim();
			const choices = [2,3,4,5,6,7].map(idx => (cols[idx] ?? '').trim());
			if (!question) continue;
			while (choices.length < 6) choices.push('');
			const correctIndex = 0; // choiceA が正解
			out.push({ id, text: question, choices, correctIndex });
		}
		return out;
}

function createSeededRandom(seed) {
	let state = seed >>> 0;
	return function next() {
		state = (state * 1103515245 + 12345) >>> 0;
		return state / 2**32;
	};
}

function pickRandomN(array, n, seed = Date.now()) {
	const rnd = createSeededRandom(seed);
	const idx = Array.from({ length: array.length }, (_, i) => i);
	for (let i = idx.length - 1; i > 0; i--) {
		const j = Math.floor(rnd() * (i + 1));
		[idx[i], idx[j]] = [idx[j], idx[i]];
	}
	return idx.slice(0, n).map(i => array[i]);
}

function shuffleChoicesWithSeed(choices, rnd) {
	const order = [0,1,2,3,4,5];
	for (let i = order.length - 1; i > 0; i--) {
		const j = Math.floor(rnd() * (i + 1));
		[order[i], order[j]] = [order[j], order[i]];
	}
	const shuffled = order.map(i => choices[i]);
	const newCorrectIndex = order.indexOf(0); // 元のA(0)がどこへ移動したか
	return { shuffled, newCorrectIndex };
}

// ===============================
// 状態
// ===============================
const state = {
	seed: Date.now(),
	pool: [], // CSVからの全問題
	questions: [], // 今回の出題
	currentIndex: 0,
	answers: [],
	submitted: false,
	score: 0,
	numQuestions: 20
};

function updateProgress() {
	const answered = state.answers.filter(v => v !== null && v !== undefined).length;
	setText('progress', `未回答 ${state.answers.length - answered}`);
	setText('stat-answered', String(answered));
	el('btn-submit').disabled = answered === 0;
}

function renderDots() {
	const grid = el('grid');
	grid.innerHTML = '';
	state.questions.forEach((_, idx) => {
		const d = document.createElement('button');
		d.className = 'dot' + (idx === state.currentIndex ? ' current' : '') + (state.answers[idx] != null ? ' answered' : '');
		d.textContent = String(idx + 1);
		d.onclick = () => {
			state.currentIndex = idx;
			renderQuestion();
		};
		grid.appendChild(d);
	});
}

function renderQuestion() {
	const q = state.questions[state.currentIndex];
	setText('q-index', `Q ${state.currentIndex + 1} / ${state.questions.length}`);
	setText('q-text', q.text);

	const choices = el('choices');
	choices.innerHTML = '';
	const labels = ['A', 'B', 'C', 'D', 'E', 'F'];

	q.choices.forEach((choice, idx) => {
		const wrap = document.createElement('label');
		wrap.className = 'choice';

		const input = document.createElement('input');
		input.type = 'radio';
		input.name = 'choice';
		input.checked = state.answers[state.currentIndex] === idx;
		input.onchange = () => {
			state.answers[state.currentIndex] = idx;
			updateProgress();
			renderDots();
		};

		const lab = document.createElement('div');
		lab.className = 'label';
		lab.textContent = `${labels[idx]}. ${choice}`;

		const hint = document.createElement('div');
		hint.className = 'hint';
		hint.textContent = '';

		wrap.appendChild(input);
		wrap.appendChild(lab);
		wrap.appendChild(hint);
		choices.appendChild(wrap);
	});

	el('btn-prev').disabled = state.currentIndex === 0;
	el('btn-next').disabled = state.currentIndex === state.questions.length - 1;

	if (state.submitted) {
		Array.from(choices.children).forEach((node, idx) => {
			if (idx === state.questions[state.currentIndex].correctIndex) node.classList.add('correct');
			const ans = state.answers[state.currentIndex];
			if (ans != null && ans === idx && ans !== state.questions[state.currentIndex].correctIndex) node.classList.add('wrong');
		});
	}

	renderDots();
	updateProgress();
}

function startTest() {
	state.seed = Date.now();
	const picked = pickRandomN(state.pool, state.numQuestions, state.seed);
	// 選択肢を各設問ごとにシャッフル（正解は元のAの移動先）
	state.questions = picked.map((q, i) => {
		const rnd = createSeededRandom((state.seed ^ i) >>> 0);
		const { shuffled, newCorrectIndex } = shuffleChoicesWithSeed(q.choices, rnd);
		return { id: q.id, text: q.text, choices: shuffled, correctIndex: newCorrectIndex };
	});
	state.currentIndex = 0;
	state.answers = Array.from({ length: state.numQuestions }, () => null);
	state.submitted = false;
	state.score = 0;

	el('result').classList.remove('show');
	el('result').innerHTML = '';
	el('score').classList.remove('show');
	setText('score', '');

	el('btn-prev').disabled = true;
	el('btn-next').disabled = false;
	el('btn-submit').disabled = true;

	renderQuestion();
}

function submitTest() {
	if (state.submitted) return;
	state.submitted = true;

	let correct = 0;
	state.questions.forEach((q, i) => {
		if (state.answers[i] === q.correctIndex) correct++;
	});
	state.score = correct;

	const percent = Math.round((correct / state.questions.length) * 100);
	const rank = percent >= 90 ? 'S' : percent >= 80 ? 'A' : percent >= 70 ? 'B' : percent >= 60 ? 'C' : 'D';
	const msg = percent >= 80 ? 'すばらしい！' : percent >= 60 ? '合格ラインです' : 'もう少し！';
	el('score').classList.add('show');
	el('score').innerHTML = `
		<div style="display:flex; align-items:center; gap:10px;">
			<div style="font-size:28px; font-weight:800; color: var(--accent)">${correct} / ${state.questions.length}</div>
			<div style="color: var(--text-dim)">${percent}% ・ ランク ${rank}</div>
		</div>
		<div style="margin-top:6px; color: var(--text-dim)">${msg}</div>
	`;

	const result = el('result');
	result.classList.add('show');
	result.innerHTML = '';

	state.questions.forEach((q, i) => {
		const user = state.answers[i];
		const ok = user === q.correctIndex;
		const labels = ['A','B','C','D','E','F'];
		const item = document.createElement('div');
		item.className = 'result-item';
		item.innerHTML = `
			<div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
				<div style="font-weight:700; color:${ok ? '#34d399' : '#f87171'}">${ok ? '正解' : '不正解'}</div>
				<div class="small">Q${i+1}</div>
			</div>
			<div style="margin:4px 0 6px 0">${q.text}</div>
			<div class="small">あなたの回答: ${user != null ? labels[user] + '. ' + q.choices[user] : '未回答'}</div>
			<div class="small">正解: ${labels[q.correctIndex]}. ${q.choices[q.correctIndex]}</div>
		`;
		result.appendChild(item);
	});

	renderQuestion();
}

// イベント
el('btn-start').addEventListener('click', startTest);
el('btn-submit').addEventListener('click', submitTest);

el('btn-prev').addEventListener('click', () => {
	if (state.currentIndex > 0) {
		state.currentIndex--;
		renderQuestion();
	}
});

el('btn-next').addEventListener('click', () => {
	if (state.currentIndex < state.questions.length - 1) {
		state.currentIndex++;
		renderQuestion();
	}
});

// 起動時にCSVを読み込み
(async function bootstrap() {
	try {
		const csv = await loadCsv('data.csv');
		state.pool = parseCsv(csv);
		setText('pool-size', String(state.pool.length));

		// 出題数セレクト生成（5問刻み、プール上限を超えない）
		const sel = el('num-select');
		const maxSelectable = Math.max(5, Math.floor(state.pool.length / 5) * 5);
		sel.innerHTML = '';
		for (let n = 5; n <= maxSelectable; n += 5) {
			const opt = document.createElement('option');
			opt.value = String(n);
			opt.textContent = `${n}問`;
			sel.appendChild(opt);
		}
		// 既定は最小の5問。ただし20問以上あれば20問を既定に
		let defaultN = state.pool.length >= 20 ? 20 : 5;
		defaultN = Math.min(defaultN, maxSelectable || 5);
		state.numQuestions = defaultN;
		sel.value = String(defaultN);
		sel.disabled = maxSelectable < 5;
		sel.onchange = () => {
			state.numQuestions = parseInt(sel.value, 10);
			setText('test-count', String(state.numQuestions));
			if (!state.submitted && state.questions.length > 0) {
				// 数変更時は未開始なら次回開始に反映。開始後は案内のみ。
			}
		};

		// UI有効化
		if (state.pool.length >= 5) {
			el('btn-start').disabled = false;
			el('num-select').disabled = false;
			setText('q-text', '「テスト開始」を押してください。');
		} else {
			setText('q-text', 'データが5問以上必要です。data.csvを確認してください。');
		}
	} catch (e) {
		console.error(e);
		setText('q-text', 'CSVの読み込みに失敗しました。（ブラウザで直接開いている場合は、ローカルHTTPサーバを使ってください）');
	}
	// 初期UI
	setText('test-count', String(state.numQuestions));
	renderDots();
	updateProgress();
})();
