(function () {
  const startButton = document.getElementById('start-button');
  const nextButton = document.getElementById('next-button');
  const repeatButton = document.getElementById('repeat-button');
  const statusEl = document.getElementById('status');

  let cards = [];
  let answeredIndices = [];
  let currentCard = null;
  let busy = false;

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function loadCards() {
    return fetch('data/cards.json').then((res) => res.json());
  }

  function pickNextCard() {
    const remaining = cards
      .map((_, index) => index)
      .filter((index) => !answeredIndices.includes(index));

    if (remaining.length === 0) {
      return null;
    }

    const pickedIndex = remaining[Math.floor(Math.random() * remaining.length)];
    answeredIndices.push(pickedIndex);

    return {
      card: cards[pickedIndex],
      isLast: answeredIndices.length === cards.length
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

    const result = pickNextCard();

    if (!result) {
      showEnded();
      setBusy(false);
      return;
    }

    currentCard = result.card;
    repeatButton.classList.remove('hidden');
    setStatus(`${answeredIndices.length}問目 / 全${cards.length}問`);

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

  async function handleStart() {
    if (busy) {
      return;
    }
    busy = true;
    startButton.disabled = true;

    if (cards.length === 0) {
      cards = await loadCards();
    }
    answeredIndices = [];
    currentCard = null;

    startButton.classList.add('hidden');
    startButton.disabled = false;
    nextButton.classList.remove('hidden');
    repeatButton.classList.add('hidden');
    setStatus(`全${cards.length}問`);

    setBusy(false);
  }

  startButton.addEventListener('click', handleStart);
  nextButton.addEventListener('click', handleNext);
  repeatButton.addEventListener('click', handleRepeat);
})();
