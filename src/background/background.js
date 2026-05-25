function sm2(card, quality) {
  let { repetitions = 0, interval = 1, ef = 2.5 } = card.srs || {};
  if (quality >= 3) {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * ef);
    repetitions++;
  } else {
    repetitions = 0;
    interval = 1;
  }
  ef = Math.max(1.3, ef + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  const nextReview = Date.now() + interval * 86400000;
  return { repetitions, interval, ef, nextReview };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SAVE_WORD') {
    const lang = request.language || 'de';
    const key = `savedWords_${lang}`;
    chrome.storage.local.get([key], (result) => {
      let words = result[key] || [];
      if (words.some(w => w.word === request.wordData.word)) {
        sendResponse({ success: true, duplicate: true });
        return;
      }
      const newWord = {
        ...request.wordData,
        learned: false,
        id: Date.now(),
        srs: { repetitions: 0, interval: 1, ef: 2.5, nextReview: Date.now() },
      };
      words.push(newWord);
      chrome.storage.local.set({ [key]: words }, () => sendResponse({ success: true, duplicate: false }));
    });
    return true;
  }

  if (request.type === 'DELETE_WORD') {
    const lang = request.language || 'de';
    const key = `savedWords_${lang}`;
    chrome.storage.local.get([key], (result) => {
      const words = (result[key] || []).filter(w => w.id !== request.id);
      chrome.storage.local.set({ [key]: words }, () => sendResponse({ success: true }));
    });
    return true;
  }

  if (request.type === 'TOGGLE_LEARNED') {
    const lang = request.language || 'de';
    const key = `savedWords_${lang}`;
    chrome.storage.local.get([key], (result) => {
      const words = (result[key] || []).map(w => w.id === request.id ? { ...w, learned: !w.learned } : w);
      chrome.storage.local.set({ [key]: words }, () => sendResponse({ success: true }));
    });
    return true;
  }

  if (request.type === 'REVIEW_WORD') {
    const lang = request.language || 'de';
    const key = `savedWords_${lang}`;
    chrome.storage.local.get([key], (result) => {
      const words = (result[key] || []).map(w => {
        if (w.id !== request.id) return w;
        return { ...w, srs: sm2(w, request.quality) };
      });
      chrome.storage.local.set({ [key]: words }, () => sendResponse({ success: true }));
    });
    return true;
  }

  if (request.type === 'SAVE_SETTINGS') {
    chrome.storage.local.set(
      { language: request.language, threshold: request.threshold },
      () => sendResponse({ success: true })
    );
    return true;
  }

  if (request.type === 'RESET_SEEN_WORDS') {
    const lang = request.language || 'de';
    const key = `seenWords_${lang}`;
    chrome.storage.local.set({ [key]: {} }, () => sendResponse({ success: true }));
    return true;
  }
});
