(function () {
  const startButton = document.getElementById('start-button');
  const nextButton = document.getElementById('next-button');
  const repeatButton = document.getElementById('repeat-button');
  const backButton = document.getElementById('back-button');
  const statusEl = document.getElementById('status');

  const ARROW_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const PAUSE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5" width="3.5" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="3.5" height="14" rx="1.2" fill="currentColor"/></svg>';
  const PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l12 7-12 7z" fill="currentColor"/></svg>';

  let cards = [];
  let history = [];      // 読み上げ済みの札 { card, index } のリスト
  let currentCard = null; // 現在再生中/直前の札
  let busy = false;      // 音声セッション中（再生・一時停止・準備中含む）
  let audioEl = null;    // 現在の Audio 要素
  let audioResolve = null; // 再生完了時に呼ぶ resolve
  let isPaused = false;

  function setStatus(text) {
    statusEl.textContent = text;
  }

  // メインボタン（次の札を読む）の表示を切り替える。
  // 'next'           → 右矢印（次の札を読む）
  // 'next-disabled'  → 右矢印・無効（読み上げ前の待機中）
  // 'pause'          → 一時停止アイコン（再生中）
  // 'resume'         → 再生アイコン（一時停止中）
  function setMainButton(mode) {
    if (mode === 'next') {
      nextButton.innerHTML = ARROW_SVG;
      nextButton.setAttribute('aria-label', '次の札を読む');
      nextButton.title = '次の札を読む';
      nextButton.disabled = false;
    } else if (mode === 'next-disabled') {
      nextButton.innerHTML = ARROW_SVG;
      nextButton.setAttribute('aria-label', '次の札を読む');
      nextButton.title = '次の札を読む';
      nextButton.disabled = true;
    } else if (mode === 'pause') {
      nextButton.innerHTML = PAUSE_SVG;
      nextButton.setAttribute('aria-label', '一時停止');
      nextButton.title = '一時停止';
      nextButton.disabled = false;
      nextButton.classList.remove('is-paused');
    } else if (mode === 'resume') {
      nextButton.innerHTML = PLAY_SVG;
      nextButton.setAttribute('aria-label', '再生');
      nextButton.title = '再生';
      nextButton.disabled = false;
      nextButton.classList.add('is-paused');
    }
    if (mode !== 'resume' && mode !== 'pause') {
      nextButton.classList.remove('is-paused');
    }
  }

  function loadCards() {
    return fetch('data/cards.json').then((res) => res.json());
  }

  function pickNextCard() {
    const answeredIndices = history.map((h) => h.index);
    const remaining = cards
      .map((_, index) => index)
      .filter((index) => !answeredIndices.includes(index));

    if (remaining.length === 0) {
      return null;
    }

    const pickedIndex = remaining[Math.floor(Math.random() * remaining.length)];

    return {
      card: cards[pickedIndex],
      index: pickedIndex,
      isLast: history.length + 1 === cards.length
    };
  }

  // 事前生成済みの音声ファイル（音読さん Advanced TTS API）を再生する。
  // すでに再生中の音声があれば停止してから開始する。
  function startPlayback(card) {
    stopPlayback();
    return new Promise((resolve) => {
      const audio = new Audio(`data/${card.audio}`);
      audioEl = audio;
      audioResolve = resolve;
      isPaused = false;
      audio.onended = () => finishPlayback(resolve);
      audio.onerror = () => finishPlayback(resolve);
      audio.play().catch(() => finishPlayback(resolve));
      setMainButton('pause');
      updateSecondaryButtons();
    });
  }

  function finishPlayback(resolve) {
    if (audioEl) {
      audioEl.onended = null;
      audioEl.onerror = null;
      audioEl = null;
    }
    audioResolve = null;
    isPaused = false;
    resolve();
  }

  // 現在の再生をキャンセルし、対応する Promise を解決する。
  function stopPlayback() {
    if (!audioEl) {
      return;
    }
    const resolve = audioResolve;
    audioEl.onended = null;
    audioEl.onerror = null;
    audioEl.pause();
    try {
      audioEl.currentTime = 0;
    } catch (e) {
      // 一部環境では currentTime のリセットが例外を投げるので無視する
    }
    audioEl = null;
    audioResolve = null;
    isPaused = false;
    if (resolve) {
      resolve();
    }
  }

  function pausePlayback() {
    if (audioEl && !isPaused) {
      audioEl.pause();
      isPaused = true;
      setMainButton('resume');
      updateSecondaryButtons();
    }
  }

  function resumePlayback() {
    if (audioEl && isPaused) {
      isPaused = false;
      audioEl.play().catch(() => {});
      setMainButton('pause');
      updateSecondaryButtons();
    }
  }

  // repeat / back ボタンの有効・無効を現在の状態に合わせて更新する。
  // 音声セッション中（再生中・一時停止中・準備中）はどちらも無効。
  function updateSecondaryButtons() {
    const disable = busy;
    repeatButton.disabled = disable || !currentCard;
    backButton.disabled = disable || history.length <= 1;
  }

  function showEnded() {
    setStatus('すべての問題が終わりました。お疲れさまでした！');
    currentCard = null;
    nextButton.classList.add('hidden');
    repeatButton.classList.add('hidden');
    backButton.classList.add('hidden');
    startButton.textContent = 'もう一度あそぶ';
    startButton.classList.remove('hidden');
  }

  async function handleNext() {
    if (busy) {
      // 再生中 → 一時停止、一時停止中 → 再生
      if (isPaused) {
        resumePlayback();
      } else if (audioEl) {
        pausePlayback();
      }
      return;
    }
    busy = true;

    const result = pickNextCard();

    if (!result) {
      showEnded();
      busy = false;
      return;
    }

    currentCard = result.card;
    history.push({ card: result.card, index: result.index });
    repeatButton.classList.remove('hidden');
    backButton.classList.remove('hidden');
    setStatus(`${history.length}問目 / 全${cards.length}問`);

    setMainButton('next-disabled');
    updateSecondaryButtons();

    await new Promise((resolve) => setTimeout(resolve, 1000));
    await startPlayback(currentCard);

    if (result.isLast) {
      showEnded();
      busy = false;
      return;
    }

    busy = false;
    setMainButton('next');
    updateSecondaryButtons();
  }

  async function handleRepeat() {
    if (busy || !currentCard) {
      return;
    }
    busy = true;
    updateSecondaryButtons();
    await startPlayback(currentCard);
    busy = false;
    setMainButton('next');
    updateSecondaryButtons();
  }

  // ひとつ前の札に戻る。
  // history の末尾から1つ削除し、その1つ前の札を currentCard に設定する。
  // 連続して戻れるが、history が空（最初の札より前）になると無効化する。
  async function handleBack() {
    if (busy) {
      return;
    }
    if (history.length === 0) {
      return;
    }

    history.pop();

    if (history.length === 0) {
      currentCard = null;
      repeatButton.classList.add('hidden');
      backButton.classList.add('hidden');
      setStatus(`全${cards.length}問`);
      return;
    }

    const previous = history[history.length - 1];
    currentCard = previous.card;
    setStatus(`${history.length}問目 / 全${cards.length}問`);

    busy = true;
    updateSecondaryButtons();
    await startPlayback(currentCard);
    busy = false;
    setMainButton('next');
    updateSecondaryButtons();
  }

  async function handleStart() {
    if (busy) {
      return;
    }
    busy = true;
    startButton.disabled = true;

    if (cards.length === 0) {
      cards = await loadCards();
    }
    history = [];
    currentCard = null;

    startButton.classList.add('hidden');
    startButton.disabled = false;
    nextButton.classList.remove('hidden');
    repeatButton.classList.add('hidden');
    backButton.classList.add('hidden');
    setStatus(`全${cards.length}問`);
    setMainButton('next');

    busy = false;
    updateSecondaryButtons();
  }

  startButton.addEventListener('click', handleStart);
  nextButton.addEventListener('click', handleNext);
  repeatButton.addEventListener('click', handleRepeat);
  backButton.addEventListener('click', handleBack);
})();
