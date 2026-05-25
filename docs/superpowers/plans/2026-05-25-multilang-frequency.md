# Multi-Language Frequency System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CEFR word levels with frequency-rank pink highlighting, add French/Korean/Arabic support, add a Words tab showing session words grouped by frequency band.

**Architecture:** Four bundled JS frequency maps (word→rank, top 10k words) replace `germanWordLevels.js`. SubtitleOverlay imports all four maps, reads active language + threshold from `chrome.storage.local`, and highlights words pink when rank > threshold. Sidebar gains a gear-icon Settings panel (language + threshold) and a Words tab reading `seenWords` from storage. A shared `WordPopup` component handles translation + save in both subtitle and Words-tab contexts.

**Tech Stack:** React 18, Vite/CRXJS, Chrome Extension MV3, `chrome.storage.local`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| DELETE | `src/data/germanWordLevels.js` | Removed — replaced by freq maps |
| CREATE | `src/data/freq_de.js` | German word→rank (10k entries) |
| CREATE | `src/data/freq_fr.js` | French word→rank (10k entries) |
| CREATE | `src/data/freq_ko.js` | Korean word→rank (10k entries) |
| CREATE | `src/data/freq_ar.js` | Arabic word→rank (10k entries) |
| CREATE | `src/components/WordPopup.jsx` | Shared translation popup + save button |
| MODIFY | `src/background/background.js` | Add SAVE_SETTINGS, RESET_SEEN_WORDS handlers |
| MODIFY | `src/components/SubtitleOverlay.jsx` | Frequency coloring, seenWords tracking, dynamic lang |
| MODIFY | `src/components/Sidebar.jsx` | Settings panel, Words tab |
| MODIFY | `src/content/content.jsx` | Send RESET_SEEN_WORDS on URL change |

---

### Task 1: Create Frequency Data Files

**Files:**
- Create: `src/data/freq_de.js`
- Create: `src/data/freq_fr.js`
- Create: `src/data/freq_ko.js`
- Create: `src/data/freq_ar.js`
- Delete: `src/data/germanWordLevels.js`

Each file exports a plain object `{ [word_lowercase]: rank }` where rank 1 = most common. Words absent from the map are treated as rank >10,000 (highlighted pink when threshold <10,000).

- [ ] **Step 1: Create `src/data/freq_de.js`**

Compile from SUBTLEX-DE / OpenSubtitles German frequency data. File structure:

```js
// German word frequency. word (lowercase) → rank (1 = most common).
// Absent words = rank >10,000 (rare).
const freq = {
  "die": 1, "der": 2, "und": 3, "in": 4, "den": 5,
  "von": 6, "zu": 7, "das": 8, "mit": 9, "sich": 10,
  // ... full 10,000 entries
};
export default freq;
```

- [ ] **Step 2: Create `src/data/freq_fr.js`**

```js
// French word frequency. word (lowercase) → rank (1 = most common).
const freq = {
  "de": 1, "la": 2, "le": 3, "les": 4, "et": 5,
  "des": 6, "en": 7, "un": 8, "une": 9, "du": 10,
  // ... full 10,000 entries
};
export default freq;
```

- [ ] **Step 3: Create `src/data/freq_ko.js`**

```js
// Korean word frequency. word (lowercase) → rank (1 = most common).
const freq = {
  "이": 1, "그": 2, "에": 3, "을": 4, "를": 5,
  "은": 6, "는": 7, "이다": 8, "하다": 9, "있다": 10,
  // ... full 10,000 entries
};
export default freq;
```

- [ ] **Step 4: Create `src/data/freq_ar.js`**

```js
// Arabic word frequency. word → rank (1 = most common).
const freq = {
  "في": 1, "من": 2, "على": 3, "أن": 4, "إلى": 5,
  "هذا": 6, "هو": 7, "كان": 8, "ما": 9, "مع": 10,
  // ... full 10,000 entries
};
export default freq;
```

- [ ] **Step 5: Delete `src/data/germanWordLevels.js`**

```bash
git rm src/data/germanWordLevels.js
```

- [ ] **Step 6: Commit**

```bash
git add src/data/freq_de.js src/data/freq_fr.js src/data/freq_ko.js src/data/freq_ar.js
git commit -m "feat: add word frequency maps for de/fr/ko/ar (10k words each)"
```

---

### Task 2: Update background.js

**Files:**
- Modify: `src/background/background.js`

Add two new message handlers at the end of the existing `onMessage` listener block.

- [ ] **Step 1: Add SAVE_SETTINGS and RESET_SEEN_WORDS handlers**

Append inside the `chrome.runtime.onMessage.addListener` callback, after the existing `REVIEW_WORD` block:

```js
  if (request.type === 'SAVE_SETTINGS') {
    chrome.storage.local.set(
      { language: request.language, threshold: request.threshold },
      () => sendResponse({ success: true })
    );
    return true;
  }

  if (request.type === 'RESET_SEEN_WORDS') {
    chrome.storage.local.set({ seenWords: {} }, () => sendResponse({ success: true }));
    return true;
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/background/background.js
git commit -m "feat: add SAVE_SETTINGS and RESET_SEEN_WORDS message handlers"
```

---

### Task 3: Create WordPopup Component

**Files:**
- Create: `src/components/WordPopup.jsx`

Shared component for translating and saving a word. Used by both SubtitleOverlay (inline) and Sidebar Words tab (on chip click). Handles its own fetch logic.

- [ ] **Step 1: Create `src/components/WordPopup.jsx`**

```jsx
import React, { useState, useEffect } from 'react';

const WordPopup = ({ word, language, onSave, style = {} }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${language}&tl=en&dt=t&dt=bd&dt=md&q=${encodeURIComponent(word)}`
    )
      .then(r => r.json())
      .then(raw => {
        let meaning = 'N/A', pos = '', synonyms = [];
        if (raw[0]?.[0]?.[0]) meaning = raw[0][0][0];
        if (raw[1]) {
          synonyms = raw[1].flatMap(g => g[1] || []).slice(0, 3);
          pos = raw[1][0]?.[0] || '';
        }
        setData({ primary: meaning, display: synonyms.length ? synonyms.join(', ') : meaning, pos });
      })
      .catch(() => setData({ primary: 'Error', display: 'Connection failed', pos: '' }))
      .finally(() => setLoading(false));
  }, [word, language]);

  const handleSave = () => {
    const wordData = { word, meaning: data?.display || data?.primary || '', pos: data?.pos || '' };
    chrome.runtime.sendMessage({ type: 'SAVE_WORD', wordData });
    if (onSave) onSave(wordData);
  };

  return (
    <div className="deutschtube-expanded-popup" style={style} onClick={e => e.stopPropagation()}>
      <div className="popup-header">
        <span className="popup-word">{word}</span>
        <span className="popup-pos">{data?.pos}</span>
      </div>
      <div className="popup-body">
        {loading ? (
          <div className="loader">Loading meanings...</div>
        ) : (
          <>
            <div className="popup-meanings">{data?.display}</div>
            <button className="popup-save-btn" onClick={handleSave}>Save Word</button>
          </>
        )}
      </div>
    </div>
  );
};

export default WordPopup;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/WordPopup.jsx
git commit -m "feat: extract shared WordPopup component with translation fetch"
```

---

### Task 4: Update SubtitleOverlay.jsx

**Files:**
- Modify: `src/components/SubtitleOverlay.jsx`

Replace CEFR logic with frequency-rank pink highlight. Track seenWords. Use dynamic language for translation. Listen to storage changes for settings.

- [ ] **Step 1: Replace full file content**

```jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import freqDe from '../data/freq_de';
import freqFr from '../data/freq_fr';
import freqKo from '../data/freq_ko';
import freqAr from '../data/freq_ar';
import WordPopup from './WordPopup';

const FREQ_MAPS = { de: freqDe, fr: freqFr, ko: freqKo, ar: freqAr };
const PINK = '#f472b6';

// ─── YouTube Provider ─────────────────────────────────────────────────────────
class YouTubeSubtitleProvider {
  constructor() { this._intervalId = null; this._last = ""; }
  getName() { return "youtube"; }

  start(callback) {
    let chunkOffset = 0;
    let prevTotalWords = 0;
    const CHUNK_SIZE = 10;

    this._intervalId = setInterval(() => {
      let text = '';
      const windows = document.querySelectorAll('.caption-window');
      if (windows.length > 0) {
        const lastWin = windows[windows.length - 1];
        const segs = lastWin.querySelectorAll('.ytp-caption-segment');
        const parts = [];
        segs.forEach(seg => { const t = seg.textContent.trim(); if (t) parts.push(t); });
        text = parts.join(' ');
      }
      if (!text) {
        const container = document.querySelector('.ytp-caption-window-container');
        if (container) text = container.textContent.trim();
      }
      if (!text) {
        if (this._last !== '') { this._last = ''; callback(''); }
        return;
      }
      const words = text.trim().split(/\s+/).filter(Boolean);
      const total = words.length;
      if (total < prevTotalWords * 0.6 || chunkOffset >= total) chunkOffset = 0;
      prevTotalWords = total;
      const chunkWords = words.slice(chunkOffset);
      if (chunkWords.length >= CHUNK_SIZE) { chunkOffset = total; return; }
      if (chunkWords.length === 0) return;
      const display = chunkWords.join(' ');
      if (display !== this._last) { this._last = display; callback(display); }
    }, 50);
  }

  stop() { clearInterval(this._intervalId); }
}

// ─── TextTrack Provider ───────────────────────────────────────────────────────
class TextTrackSubtitleProvider {
  constructor(videoElement) { this._video = videoElement; this._track = null; this._onCueChange = null; }
  getName() { return "texttrack"; }

  start(callback) {
    const tracks = this._video.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].kind === 'subtitles' || tracks[i].kind === 'captions') {
        this._track = tracks[i];
        if (this._track.mode === 'disabled') this._track.mode = 'hidden';
        break;
      }
    }
    if (!this._track) return;
    this._onCueChange = () => {
      const cues = this._track.activeCues;
      if (!cues || cues.length === 0) { callback(""); return; }
      const text = Array.from(cues).map(c => c.text).join(' ').replace(/<[^>]*>/g, '').trim();
      callback(text);
    };
    this._track.addEventListener('cuechange', this._onCueChange);
  }

  stop() { if (this._track && this._onCueChange) this._track.removeEventListener('cuechange', this._onCueChange); }
}

// ─── Generic Provider ─────────────────────────────────────────────────────────
class GenericSubtitleProvider {
  constructor() { this._observer = null; this._last = ""; this._timer = null; }
  getName() { return "generic"; }

  static SELECTORS = [
    '[class*="subtitle"]','[class*="caption"]','[class*="closed-caption"]',
    '.vp-captions-line','.jw-text-track-cue','.vjs-text-track-cue','.plyr__captions span',
    '[data-testid="subtitle"]',
  ];

  start(callback) {
    this._observer = new MutationObserver(() => {
      let text = "";
      for (const sel of GenericSubtitleProvider.SELECTORS) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          const parts = new Set();
          els.forEach(el => { const t = el.textContent.trim(); if (t) parts.add(t); });
          text = Array.from(parts).join(' ');
          break;
        }
      }
      if (text !== this._last) {
        this._last = text;
        clearTimeout(this._timer);
        this._timer = setTimeout(() => callback(text), 300);
      }
    });
    this._observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  stop() { if (this._observer) this._observer.disconnect(); clearTimeout(this._timer); }
}

// ─── SubtitleOverlay ──────────────────────────────────────────────────────────
const SubtitleOverlay = ({ videoElement }) => {
  const [subtitle, setSubtitle] = useState("");
  const [visible, setVisible] = useState(false);
  const [hoveredWord, setHoveredWord] = useState(null);
  const [clickedWord, setClickedWord] = useState(null);
  const [settings, setSettings] = useState({ language: 'de', threshold: 3000 });

  const providerRef = useRef(null);
  const clearTimerRef = useRef(null);
  const videoRef = useRef(videoElement);
  const pausedByHoverRef = useRef(false);
  const seenWordsRef = useRef({});

  useEffect(() => { videoRef.current = videoElement; }, [videoElement]);

  // Load settings from storage and listen for changes
  useEffect(() => {
    chrome.storage.local.get(['language', 'threshold'], r => {
      setSettings({ language: r.language || 'de', threshold: r.threshold ?? 3000 });
    });
    const listener = changes => {
      if (changes.language || changes.threshold) {
        chrome.storage.local.get(['language', 'threshold'], r => {
          setSettings({ language: r.language || 'de', threshold: r.threshold ?? 3000 });
        });
      }
      if (changes.seenWords && changes.seenWords.newValue) {
        seenWordsRef.current = changes.seenWords.newValue;
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const showSubtitle = useCallback((text) => {
    clearTimeout(clearTimerRef.current);
    if (!text) {
      clearTimerRef.current = setTimeout(() => {
        setVisible(false);
        setTimeout(() => setSubtitle(""), 250);
      }, 200);
      return;
    }
    setSubtitle(text);
    setVisible(true);
    setClickedWord(null);
    setHoveredWord(null);
  }, []);

  useEffect(() => {
    const isYouTube = !!document.querySelector('.html5-video-player');
    const hasTextTracks = videoElement?.textTracks?.length > 0;
    let provider;
    if (isYouTube) provider = new YouTubeSubtitleProvider();
    else if (hasTextTracks) provider = new TextTrackSubtitleProvider(videoElement);
    else provider = new GenericSubtitleProvider();
    providerRef.current = provider;
    provider.start(showSubtitle);
    const onTrackAdded = () => {
      if (provider.getName() !== 'texttrack' && videoElement?.textTracks?.length > 0) {
        provider.stop();
        const p = new TextTrackSubtitleProvider(videoElement);
        providerRef.current = p;
        p.start(showSubtitle);
      }
    };
    if (videoElement?.textTracks) videoElement.textTracks.addEventListener('addtrack', onTrackAdded);
    return () => {
      provider.stop();
      if (videoElement?.textTracks) videoElement.textTracks.removeEventListener('addtrack', onTrackAdded);
      clearTimeout(clearTimerRef.current);
    };
  }, [videoElement, showSubtitle]);

  const handleSubtitleMouseEnter = () => {
    const video = videoRef.current;
    if (video && !video.paused) { video.pause(); pausedByHoverRef.current = true; }
  };

  const handleSubtitleMouseLeave = () => {
    if (pausedByHoverRef.current) { videoRef.current?.play(); pausedByHoverRef.current = false; }
  };

  const trackWord = useCallback((word, rank) => {
    if (seenWordsRef.current[word] !== undefined) return;
    seenWordsRef.current = { ...seenWordsRef.current, [word]: rank };
    chrome.storage.local.get(['seenWords'], r => {
      const seen = r.seenWords || {};
      if (seen[word] === undefined) {
        chrome.storage.local.set({ seenWords: { ...seen, [word]: rank } });
      }
    });
  }, []);

  if (!subtitle) return null;

  const freqMap = FREQ_MAPS[settings.language] || freqDe;
  const isRTL = settings.language === 'ar';
  const tokens = subtitle.match(/[\p{L}؀-ۿ가-힣]+|[^\p{L}\s]/gu) || [];

  return (
    <div
      className={`deutschtube-subtitle-box ${visible ? 'subtitle-visible' : 'subtitle-hidden'}`}
      style={isRTL ? { direction: 'rtl' } : {}}
      onClick={() => setClickedWord(null)}
      onMouseEnter={handleSubtitleMouseEnter}
      onMouseLeave={handleSubtitleMouseLeave}
    >
      {tokens.map((token, index) => {
        const isWord = /[\p{L}؀-ۿ가-힣]/u.test(token);
        if (!isWord) return <span key={index} className="deutschtube-punctuation">{token}</span>;

        const rank = freqMap[token.toLowerCase()] ?? 99999;
        const isUnknown = rank > settings.threshold;

        trackWord(token.toLowerCase(), rank);

        return (
          <span
            key={`${token}-${index}`}
            className={`deutschtube-word-wrapper ${hoveredWord === token ? 'is-hovered' : ''} ${clickedWord === token ? 'is-active' : ''}`}
            style={isUnknown && !hoveredWord && !clickedWord ? { color: PINK } : {}}
            onMouseEnter={() => { if (!clickedWord) setHoveredWord(token); }}
            onMouseLeave={() => setHoveredWord(null)}
            onClick={e => { e.stopPropagation(); setClickedWord(token); setHoveredWord(null); }}
          >
            {token}

            {hoveredWord === token && !clickedWord && (
              <div className="deutschtube-mini-tooltip">...</div>
            )}

            {clickedWord === token && (
              <WordPopup
                word={token}
                language={settings.language}
                onSave={() => setClickedWord(null)}
              />
            )}
          </span>
        );
      })}
    </div>
  );
};

export default SubtitleOverlay;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SubtitleOverlay.jsx
git commit -m "feat: replace CEFR coloring with frequency-rank pink highlight"
```

---

### Task 5: Update Sidebar.jsx

**Files:**
- Modify: `src/components/Sidebar.jsx`

Add gear icon → settings panel (language + threshold). Add Words tab between Vocabulary and Practice. Words tab reads `seenWords`, groups into 5 bands, renders clickable chips with WordPopup.

- [ ] **Step 1: Replace full file content**

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import WordPopup from './WordPopup';

const BANDS = [
  { label: 'Rank 1–1,000',    min: 1,     max: 1000  },
  { label: 'Rank 1,001–3,000', min: 1001,  max: 3000  },
  { label: 'Rank 3,001–5,000', min: 3001,  max: 5000  },
  { label: 'Rank 5,001–10,000',min: 5001,  max: 10000 },
  { label: 'Above 10,000',     min: 10001, max: Infinity },
];

const LANG_OPTIONS = [
  { code: 'de', label: 'German' },
  { code: 'fr', label: 'French' },
  { code: 'ko', label: 'Korean' },
  { code: 'ar', label: 'Arabic' },
];

// ─── SM-2 Quiz Component ──────────────────────────────────────────────────────
const PracticeTab = ({ words }) => {
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const now = Date.now();
    const due = words.filter(w => {
      if (w.learned) return false;
      return (w.srs?.nextReview ?? 0) <= now;
    }).sort(() => Math.random() - 0.5);
    setQueue(due);
    setCurrent(due[0] || null);
    setRevealed(false);
    setDone(due.length === 0);
  }, [words]);

  const advance = useCallback((quality) => {
    chrome.runtime.sendMessage({ type: 'REVIEW_WORD', id: current.id, quality });
    const next = queue.slice(1);
    setQueue(next);
    setCurrent(next[0] || null);
    setRevealed(false);
    if (next.length === 0) setDone(true);
  }, [current, queue]);

  if (done || !current) {
    return (
      <div style={{ textAlign: 'center', marginTop: '60px', color: '#6b7280' }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
        <div style={{ fontWeight: '700', fontSize: '16px', color: '#111827', marginBottom: '8px' }}>
          {words.filter(w => !w.learned && (w.srs?.nextReview ?? 0) <= Date.now()).length === 0
            ? 'No words due!' : 'Session complete!'}
        </div>
        <div style={{ fontSize: '13px' }}>Come back later for more reviews.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '16px', textAlign: 'right' }}>
        {queue.length} word{queue.length !== 1 ? 's' : ''} remaining
      </div>
      <div style={{
        background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '16px',
        padding: '32px 24px', textAlign: 'center', minHeight: '160px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        marginBottom: '20px',
      }}>
        <div style={{ fontSize: '28px', fontWeight: '800', color: '#111827', marginBottom: '8px' }}>{current.word}</div>
        {current.pos && (
          <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: '600', marginBottom: '12px' }}>
            {current.pos}
          </div>
        )}
        {revealed ? (
          <div style={{ fontSize: '18px', color: '#2563eb', fontWeight: '600', marginTop: '8px' }}>{current.meaning}</div>
        ) : (
          <button onClick={() => setRevealed(true)} style={{
            background: '#2563eb', color: 'white', border: 'none',
            padding: '10px 24px', borderRadius: '8px', fontWeight: '700',
            cursor: 'pointer', fontSize: '14px', marginTop: '8px',
          }}>Show Answer</button>
        )}
      </div>
      {revealed && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => advance(1)} style={ratingBtn('#fee2e2', '#ef4444')}>✗ Wrong</button>
          <button onClick={() => advance(3)} style={ratingBtn('#fef9c3', '#ca8a04')}>~ Hard</button>
          <button onClick={() => advance(5)} style={ratingBtn('#dcfce7', '#16a34a')}>✓ Easy</button>
        </div>
      )}
      {current.srs && (
        <div style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center', marginTop: '12px' }}>
          Interval: {current.srs.interval}d · EF: {(current.srs.ef || 2.5).toFixed(2)}
        </div>
      )}
    </div>
  );
};

const ratingBtn = (bg, color) => ({
  flex: 1, background: bg, color, border: 'none',
  padding: '12px 8px', borderRadius: '10px', fontWeight: '700',
  cursor: 'pointer', fontSize: '13px',
});

// ─── Words Tab ────────────────────────────────────────────────────────────────
const WordsTab = ({ language }) => {
  const [seenWords, setSeenWords] = useState({});
  const [activeWord, setActiveWord] = useState(null);

  useEffect(() => {
    chrome.storage.local.get(['seenWords'], r => setSeenWords(r.seenWords || {}));
    const listener = changes => {
      if (changes.seenWords) setSeenWords(changes.seenWords.newValue || {});
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const wordList = Object.entries(seenWords); // [[word, rank], ...]

  if (wordList.length === 0) {
    return (
      <div style={{ textAlign: 'center', marginTop: '50px', color: '#9ca3af' }}>
        <div style={{ fontSize: '48px', marginBottom: '10px' }}>📺</div>
        <p>Play a video with subtitles — words appear here.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '12px', position: 'relative' }} onClick={() => setActiveWord(null)}>
      {BANDS.map(band => {
        const bandWords = wordList.filter(([, rank]) => rank >= band.min && rank <= band.max);
        if (bandWords.length === 0) return null;
        return (
          <div key={band.label} style={{ marginBottom: '16px' }}>
            <div style={{
              fontSize: '11px', fontWeight: '700', color: '#9ca3af',
              textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em',
            }}>{band.label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {bandWords.map(([word]) => (
                <span
                  key={word}
                  onClick={e => { e.stopPropagation(); setActiveWord(activeWord === word ? null : word); }}
                  style={{
                    background: activeWord === word ? '#ede9fe' : '#f3f4f6',
                    color: activeWord === word ? '#7c3aed' : '#374151',
                    padding: '4px 10px', borderRadius: '999px', fontSize: '13px',
                    cursor: 'pointer', fontWeight: '500', position: 'relative',
                    border: activeWord === word ? '1px solid #c4b5fd' : '1px solid transparent',
                  }}
                >
                  {word}
                  {activeWord === word && (
                    <WordPopup
                      word={word}
                      language={language}
                      onSave={() => setActiveWord(null)}
                      style={{ left: 0, top: '110%', right: 'auto' }}
                    />
                  )}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Settings Panel ───────────────────────────────────────────────────────────
const SettingsPanel = ({ onClose }) => {
  const [language, setLanguage] = useState('de');
  const [threshold, setThreshold] = useState(3000);

  useEffect(() => {
    chrome.storage.local.get(['language', 'threshold'], r => {
      setLanguage(r.language || 'de');
      setThreshold(r.threshold ?? 3000);
    });
  }, []);

  const save = () => {
    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', language, threshold: Number(threshold) });
    onClose();
  };

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      background: 'white', zIndex: 10, padding: '20px', overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <span style={{ fontWeight: '800', fontSize: '16px' }}>Settings</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#6b7280' }}>×</button>
      </div>

      <label style={{ display: 'block', marginBottom: '20px' }}>
        <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '6px', textTransform: 'uppercase' }}>
          Learning Language
        </div>
        <select
          value={language}
          onChange={e => setLanguage(e.target.value)}
          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
        >
          {LANG_OPTIONS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </label>

      <label style={{ display: 'block', marginBottom: '24px' }}>
        <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '6px', textTransform: 'uppercase' }}>
          I know the top ___ words
        </div>
        <input
          type="number"
          min={100}
          max={10000}
          step={100}
          value={threshold}
          onChange={e => setThreshold(e.target.value)}
          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }}
        />
        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
          Words ranked above this number will be highlighted pink.
        </div>
      </label>

      <button onClick={save} style={{
        width: '100%', background: '#2563eb', color: 'white', border: 'none',
        padding: '12px', borderRadius: '10px', fontWeight: '700', fontSize: '14px', cursor: 'pointer',
      }}>
        Save Settings
      </button>
    </div>
  );
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const Sidebar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState('vocab');
  const [showSettings, setShowSettings] = useState(false);
  const [savedWords, setSavedWords] = useState([]);
  const [language, setLanguage] = useState('de');

  useEffect(() => {
    chrome.storage.local.get(['language'], r => setLanguage(r.language || 'de'));
    const listener = changes => {
      if (changes.language) setLanguage(changes.language.newValue || 'de');
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  useEffect(() => {
    const loadWords = () => chrome.storage.local.get(['savedWords'], r => setSavedWords(r.savedWords || []));
    if (isOpen) loadWords();
    const listener = changes => { if (changes.savedWords) setSavedWords(changes.savedWords.newValue || []); };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [isOpen]);

  const deleteWord = id => chrome.runtime.sendMessage({ type: 'DELETE_WORD', id });
  const toggleLearned = id => chrome.runtime.sendMessage({ type: 'TOGGLE_LEARNED', id });
  const dueCount = savedWords.filter(w => !w.learned && (w.srs?.nextReview ?? 0) <= Date.now()).length;

  if (!isOpen) {
    return (
      <div
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed', top: '50%', right: '0', transform: 'translateY(-50%)',
          background: '#2563eb', color: 'white', padding: '20px 10px',
          borderTopLeftRadius: '12px', borderBottomLeftRadius: '12px',
          cursor: 'pointer', zIndex: 999999, fontWeight: '800',
          writingMode: 'vertical-rl', boxShadow: '-4px 0 15px rgba(0,0,0,0.1)',
        }}
      >
        VOCABULARY
        {dueCount > 0 && (
          <span style={{
            background: '#ef4444', color: 'white', borderRadius: '50%',
            width: '18px', height: '18px', fontSize: '11px', fontWeight: '800',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            writingMode: 'horizontal-tb', margin: '6px auto 0',
          }}>
            {dueCount > 9 ? '9+' : dueCount}
          </span>
        )}
      </div>
    );
  }

  const TABS = [
    ['vocab', 'Saved'],
    ['words', 'Words'],
    ['practice', `Practice${dueCount > 0 ? ` (${dueCount})` : ''}`],
  ];

  return (
    <div id="deutschtube-sidebar" style={{ position: 'relative' }}>
      <div className="deutschtube-sidebar-header">
        <span style={{ fontWeight: '800', fontSize: '15px' }}>DeutschTube</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setShowSettings(true)}
            style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#6b7280' }}
            title="Settings"
          >⚙</button>
          <button
            onClick={() => setIsOpen(false)}
            style={{ background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#6b7280' }}
          >×</button>
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              flex: 1, padding: '10px 4px', border: 'none', cursor: 'pointer',
              fontWeight: '700', fontSize: '12px',
              background: tab === key ? '#fff' : 'transparent',
              color: tab === key ? '#2563eb' : '#6b7280',
              borderBottom: tab === key ? '2px solid #2563eb' : '2px solid transparent',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="deutschtube-sidebar-content">
        {tab === 'practice' && <PracticeTab words={savedWords} />}
        {tab === 'words' && <WordsTab language={language} />}
        {tab === 'vocab' && (
          savedWords.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: '50px', color: '#9ca3af' }}>
              <div style={{ fontSize: '48px', marginBottom: '10px' }}>📘</div>
              <p>Click words in subtitles to save them here!</p>
            </div>
          ) : (
            savedWords.slice().reverse().map(item => (
              <div key={item.id} className="deutschtube-word-card" style={{ opacity: item.learned ? 0.5 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div className="deutschtube-word-card-title">{item.word}</div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {item.srs && <span style={{ fontSize: '10px', color: '#9ca3af' }}>{item.srs.interval}d</span>}
                    <div style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 'bold' }}>{item.pos}</div>
                  </div>
                </div>
                <div className="deutschtube-word-card-meaning">{item.meaning}</div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button
                    onClick={() => toggleLearned(item.id)}
                    style={{ background: item.learned ? '#10b981' : '#e5e7eb', color: item.learned ? 'white' : '#4b5563', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', flex: 1, fontWeight: '700' }}
                  >
                    {item.learned ? 'Learned ✓' : 'Learned?'}
                  </button>
                  <button
                    onClick={() => deleteWord(item.id)}
                    style={{ background: '#fee2e2', color: '#ef4444', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )
        )}
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
};

export default Sidebar;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Sidebar.jsx
git commit -m "feat: add Settings panel, Words tab, and language support to sidebar"
```

---

### Task 6: Update content.jsx

**Files:**
- Modify: `src/content/content.jsx`

Send `RESET_SEEN_WORDS` when URL changes (navigating to new video).

- [ ] **Step 1: Add RESET_SEEN_WORDS call on URL change**

Replace the existing URL-change interval:

```js
let currentUrl = location.href;
setInterval(() => {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    chrome.runtime.sendMessage({ type: 'RESET_SEEN_WORDS' });
    setTimeout(initExtension, 2000);
  }
}, 1000);
```

- [ ] **Step 2: Commit**

```bash
git add src/content/content.jsx
git commit -m "feat: reset seenWords on video navigation"
```

---

### Task 7: Build and Verify

- [ ] **Step 1: Build**

```bash
npm run build
```

Expected: no errors, `dist/` updated.

- [ ] **Step 2: Load in Chrome**

Open `chrome://extensions` → reload the extension → navigate to a YouTube video with subtitles in German.

Verify:
- Pink words appear on unknown words above threshold (default 3000)
- No A1/C2 badges visible
- Sidebar gear ⚙ opens Settings panel with language dropdown + threshold input
- Changing language to French and playing a French video highlights unknown French words pink
- Words tab populates as subtitles play, grouped by frequency band
- Clicking a word chip in Words tab shows translation popup with Save button
- Navigating to a new video clears the Words tab

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: final build artifacts"
```
