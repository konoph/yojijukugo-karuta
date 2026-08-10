(function () {
  const startButton = document.getElementById('start-button');
  const nextButton = document.getElementById('next-button');
  const repeatButton = document.getElementById('repeat-button');
  const statusEl = document.getElementById('status');

  let scenarios = [];
  let answeredIndices = [];
  let currentScenario = null;
  let busy = false;

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function loadScenarios() {
    return fetch('data/scenarios.json').then((res) => res.json());
  }

  function pickNextScenario() {
    const remaining = scenarios
      .map((_, index) => index)
      .filter((index) => !answeredIndices.includes(index));

    if (remaining.length === 0) {
      return null;
    }

    const pickedIndex = remaining[Math.floor(Math.random() * remaining.length)];
    answeredIndices.push(pickedIndex);

    return {
      scenario: scenarios[pickedIndex],
      isLast: answeredIndices.length === scenarios.length
    };
  }

  function speak(text) {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ja-JP';
      utterance.onend = resolve;
      utterance.onerror = resolve;
      window.speechSynthesis.speak(utterance);
    });
  }

  // 読み間違いを避けるため、表示用の漢字混じりscriptではなく
  // 全文ひらがなのscriptReadingを読み上げに使う。
  // SpeechSynthesisUtteranceはSSMLを解釈しないため、答えの
  // 四字熟語の手前で間を置きたい場合は前後半に分けて発話し、
  // 間にタイマー待機を挟む。
  async function speakScenario(item) {
    const idx = item.scriptReading.lastIndexOf(item.reading);
    if (idx === -1) {
      await speak(item.scriptReading);
      return;
    }

    const before = item.scriptReading.slice(0, idx);
    const after = item.scriptReading.slice(idx);

    await speak(before);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await speak(after);
  }

  function showEnded() {
    setStatus('すべての問題が終わりました。お疲れさまでした！');
    currentScenario = null;
    nextButton.classList.add('hidden');
    repeatButton.classList.add('hidden');
    startButton.textContent = 'もう一度あそぶ';
    startButton.classList.remove('hidden');
  }

  function setBusy(isBusy) {
    busy = isBusy;
    nextButton.disabled = isBusy;
    repeatButton.disabled = isBusy;
  }

  async function handleNext() {
    if (busy) {
      return;
    }
    setBusy(true);

    const result = pickNextScenario();

    if (!result) {
      showEnded();
      setBusy(false);
      return;
    }

    currentScenario = result.scenario;
    repeatButton.classList.remove('hidden');
    setStatus(`${answeredIndices.length}問目 / 全${scenarios.length}問`);

    await new Promise((resolve) => setTimeout(resolve, 1000));
    await speakScenario(currentScenario);

    if (result.isLast) {
      showEnded();
      setBusy(false);
      return;
    }

    setBusy(false);
  }

  async function handleRepeat() {
    if (busy || !currentScenario) {
      return;
    }
    setBusy(true);
    await speakScenario(currentScenario);
    setBusy(false);
  }

  async function handleStart() {
    if (busy) {
      return;
    }
    busy = true;
    startButton.disabled = true;

    if (scenarios.length === 0) {
      scenarios = await loadScenarios();
    }
    answeredIndices = [];
    currentScenario = null;

    startButton.classList.add('hidden');
    startButton.disabled = false;
    nextButton.classList.remove('hidden');
    repeatButton.classList.add('hidden');
    setStatus(`全${scenarios.length}問`);

    setBusy(false);
  }

  if (!('speechSynthesis' in window)) {
    setStatus('お使いのブラウザは音声読み上げに対応していません。');
    startButton.disabled = true;
  } else {
    startButton.addEventListener('click', handleStart);
    nextButton.addEventListener('click', handleNext);
    repeatButton.addEventListener('click', handleRepeat);
  }
})();
