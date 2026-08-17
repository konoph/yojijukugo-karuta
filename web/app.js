(function () {
  const startButton = document.getElementById('start-button');
  const nextButton = document.getElementById('next-button');
  const repeatButton = document.getElementById('repeat-button');
  const backButton = document.getElementById('back-button');
  const statusEl = document.getElementById('status');

  let cards = [];
  let history = [];      // 読み上げ済みの札 { card, index } のリスト
  let currentCard = null; // 現在再生中/直前の札
  let busy = false;

  function setStatus(text) {
    statusEl.textContent = text;
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
  function playCard(item) {
    return new Promise((resolve) => {
      const audio = new Audio(`data/${item.audio}`);
      audio.onended = resolve;
      audio.onerror = resolve;
      audio.play().catch(resolve);
    });
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

  function setBusy(isBusy) {
    busy = isBusy;
    nextButton.disabled = isBusy;
    repeatButton.disabled = isBusy;
    backButton.disabled = isBusy || history.length <= 1;
  }

  async function handleNext() {
    if (busy) {
      return;
    }
    setBusy(true);

    const result = pickNextCard();

    if (!result) {
      showEnded();
      setBusy(false);
      return;
    }

    currentCard = result.card;
    history.push({ card: result.card, index: result.index });
    repeatButton.classList.remove('hidden');
    backButton.classList.remove('hidden');
    setStatus(`${history.length}問目 / 全${cards.length}問`);

    await new Promise((resolve) => setTimeout(resolve, 1000));
    await playCard(currentCard);

    if (result.isLast) {
      showEnded();
      setBusy(false);
      return;
    }

    setBusy(false);
  }

  async function handleRepeat() {
    if (busy || !currentCard) {
      return;
    }
    setBusy(true);
    await playCard(currentCard);
    setBusy(false);
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

    // 現在の札を履歴から取り除く
    history.pop();

    if (history.length === 0) {
      // 最初の札より前には戻れない
      currentCard = null;
      repeatButton.classList.add('hidden');
      backButton.classList.add('hidden');
      setStatus(`全${cards.length}問`);
      return;
    }

    const previous = history[history.length - 1];
    currentCard = previous.card;
    setStatus(`${history.length}問目 / 全${cards.length}問`);

    setBusy(true);
    await playCard(currentCard);
    setBusy(false);
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

    setBusy(false);
  }

  startButton.addEventListener('click', handleStart);
  nextButton.addEventListener('click', handleNext);
  repeatButton.addEventListener('click', handleRepeat);
  backButton.addEventListener('click', handleBack);
})();
