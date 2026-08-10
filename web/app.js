(function () {
  const startButton = document.getElementById('start-button');
  const nextButton = document.getElementById('next-button');
  const statusEl = document.getElementById('status');

  let scenarios = [];
  let answeredIndices = [];
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

  function showEnded() {
    setStatus('すべての問題が終わりました。お疲れさまでした！');
    nextButton.classList.add('hidden');
    startButton.textContent = 'もう一度あそぶ';
    startButton.classList.remove('hidden');
  }

  async function handleNext() {
    if (busy) {
      return;
    }
    busy = true;
    nextButton.disabled = true;

    const result = pickNextScenario();

    if (!result) {
      showEnded();
      busy = false;
      return;
    }

    setStatus(`${answeredIndices.length}問目 / 全${scenarios.length}問`);

    await new Promise((resolve) => setTimeout(resolve, 1000));
    await speak(result.scenario.script);

    if (result.isLast) {
      showEnded();
      busy = false;
      return;
    }

    busy = false;
    nextButton.disabled = false;
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

    startButton.classList.add('hidden');
    startButton.disabled = false;
    nextButton.classList.remove('hidden');
    nextButton.disabled = false;
    setStatus(`全${scenarios.length}問`);

    busy = false;
  }

  if (!('speechSynthesis' in window)) {
    setStatus('お使いのブラウザは音声読み上げに対応していません。');
    startButton.disabled = true;
  } else {
    startButton.addEventListener('click', handleStart);
    nextButton.addEventListener('click', handleNext);
  }
})();
