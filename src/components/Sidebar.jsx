import React, { useState, useEffect, useCallback } from 'react';
import WordPopup from './WordPopup';

// ─── Constants ────────────────────────────────────────────────────────────────
const BANDS = [
  { label: 'Rank 1–1,000',     min: 1,     max: 1000 },
  { label: 'Rank 1,001–3,000', min: 1001,  max: 3000 },
  { label: 'Rank 3,001–5,000', min: 3001,  max: 5000 },
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
const PracticeTab = ({ words, language }) => {
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const now = Date.now();
    const due = words.filter(w => {
      if (w.learned) return false;
      const nextReview = w.srs?.nextReview ?? 0;
      return nextReview <= now;
    });
    const shuffled = due.sort(() => Math.random() - 0.5);
    setQueue(shuffled);
    setCurrent(shuffled[0] || null);
    setRevealed(false);
    setDone(shuffled.length === 0);
  }, [words]);

  const advance = useCallback((quality) => {
    chrome.runtime.sendMessage({ type: 'REVIEW_WORD', id: current.id, quality, language });
    const next = queue.slice(1);
    setQueue(next);
    setCurrent(next[0] || null);
    setRevealed(false);
    if (next.length === 0) setDone(true);
  }, [current, queue, language]);

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

  const dueCount = queue.length;

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '16px', textAlign: 'right' }}>
        {dueCount} word{dueCount !== 1 ? 's' : ''} remaining
      </div>
      <div style={{
        background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '16px',
        padding: '32px 24px', textAlign: 'center', minHeight: '160px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        marginBottom: '20px', position: 'relative',
      }}>
        <div style={{ fontSize: '28px', fontWeight: '800', color: '#111827', marginBottom: '8px' }}>
          {current.word}
        </div>
        {current.pos && (
          <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: '600', marginBottom: '12px' }}>
            {current.pos}
          </div>
        )}
        {revealed ? (
          <div style={{ fontSize: '18px', color: '#2563eb', fontWeight: '600', marginTop: '8px' }}>
            {current.meaning}
          </div>
        ) : (
          <button
            onClick={() => setRevealed(true)}
            style={{
              background: '#2563eb', color: 'white', border: 'none',
              padding: '10px 24px', borderRadius: '8px', fontWeight: '700',
              cursor: 'pointer', fontSize: '14px', marginTop: '8px',
            }}
          >
            Show Answer
          </button>
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

// ─── Words Tab Component ──────────────────────────────────────────────────────
const WordsTab = ({ language }) => {
  const [seenWords, setSeenWords] = useState({});
  const [popupWord, setPopupWord] = useState(null);

  useEffect(() => {
    const storageKey = `seenWords_${language}`;
    chrome.storage.local.get([storageKey], (result) => {
      setSeenWords(result[storageKey] || {});
    });
    const listener = (changes) => {
      if (changes[storageKey]) setSeenWords(changes[storageKey].newValue || {});
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [language]);

  const entries = Object.entries(seenWords);

  if (entries.length === 0) {
    return (
      <div style={{ textAlign: 'center', marginTop: '50px', color: '#9ca3af', padding: '0 16px' }}>
        <div style={{ fontSize: '48px', marginBottom: '10px' }}>📺</div>
        <p style={{ fontSize: '13px' }}>Words from this video session will appear here, grouped by frequency.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px' }} onClick={() => setPopupWord(null)}>
      {BANDS.map(band => {
        const bandWords = entries.filter(([, rank]) => rank >= band.min && rank <= band.max);
        if (bandWords.length === 0) return null;
        return (
          <div key={band.label} style={{ marginBottom: '20px' }}>
            <div style={{
              fontSize: '11px', fontWeight: '700', color: '#6b7280',
              textTransform: 'uppercase', letterSpacing: '0.05em',
              marginBottom: '8px', paddingBottom: '4px',
              borderBottom: '1px solid #e5e7eb',
            }}>
              {band.label} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({bandWords.length})</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {bandWords.map(([word, rank]) => (
                <div key={word} style={{ position: 'relative' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setPopupWord(popupWord === word ? null : word); }}
                    style={{
                      background: '#f3f4f6', border: '1px solid #e5e7eb',
                      borderRadius: '6px', padding: '4px 10px',
                      fontSize: '13px', cursor: 'pointer',
                      color: '#111827', fontWeight: '500',
                    }}
                  >
                    {word}
                    <span style={{ fontSize: '10px', color: '#9ca3af', marginLeft: '4px' }}>
                      #{rank > 10000 ? '10k+' : rank}
                    </span>
                  </button>
                  {popupWord === word && (
                    <div style={{ position: 'absolute', bottom: '110%', left: 0, zIndex: 10 }}>
                      <WordPopup
                        word={word}
                        language={language}
                        style={{ width: '220px' }}
                        onSave={() => setPopupWord(null)}
                      />
                    </div>
                  )}
                </div>
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
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(['language', 'threshold'], (result) => {
      setLanguage(result.language || 'de');
      setThreshold(result.threshold ?? 3000);
    });
  }, []);

  const handleSave = () => {
    chrome.runtime.sendMessage(
      { type: 'SAVE_SETTINGS', language, threshold: Number(threshold) },
      () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    );
  };

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      background: '#fff', zIndex: 10, padding: '20px',
      display: 'flex', flexDirection: 'column', gap: '20px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: '700', fontSize: '15px', color: '#111827' }}>Settings</span>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#6b7280' }}
        >×</button>
      </div>

      <div>
        <label style={{ fontSize: '12px', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '6px' }}>
          Video Language
        </label>
        <select
          value={language}
          onChange={e => setLanguage(e.target.value)}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: '8px',
            border: '1px solid #d1d5db', fontSize: '14px', color: '#111827',
            background: '#f9fafb', cursor: 'pointer',
          }}
        >
          {LANG_OPTIONS.map(opt => (
            <option key={opt.code} value={opt.code}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ fontSize: '12px', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '6px' }}>
          I know the top <span style={{ color: '#2563eb' }}>{Number(threshold).toLocaleString()}</span> words
        </label>
        <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 8px' }}>
          Words with a higher rank are highlighted pink in subtitles.
        </p>
        <input
          type="number"
          value={threshold}
          min={100}
          max={10000}
          step={100}
          onChange={e => setThreshold(e.target.value)}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: '8px',
            border: '1px solid #d1d5db', fontSize: '14px', color: '#111827',
            background: '#f9fafb', boxSizing: 'border-box',
          }}
        />
        <input
          type="range"
          value={threshold}
          min={100}
          max={10000}
          step={100}
          onChange={e => setThreshold(Number(e.target.value))}
          style={{ width: '100%', marginTop: '8px' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#9ca3af' }}>
          <span>100</span><span>10,000</span>
        </div>
      </div>

      <button
        onClick={handleSave}
        style={{
          background: saved ? '#10b981' : '#2563eb', color: 'white',
          border: 'none', padding: '12px', borderRadius: '10px',
          fontWeight: '700', fontSize: '14px', cursor: 'pointer',
          transition: 'background 0.2s',
        }}
      >
        {saved ? 'Saved ✓' : 'Save Settings'}
      </button>
    </div>
  );
};

// ─── Sidebar Component ────────────────────────────────────────────────────────
const Sidebar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState('saved');
  const [savedWords, setSavedWords] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [language, setLanguage] = useState('de');

  // Load language setting
  useEffect(() => {
    chrome.storage.local.get(['language'], (result) => {
      setLanguage(result.language || 'de');
    });
    const listener = (changes) => {
      if (changes.language) setLanguage(changes.language.newValue);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // Load saved words whenever language or open state changes
  useEffect(() => {
    if (!isOpen) return;
    const storageKey = `savedWords_${language}`;
    chrome.storage.local.get([storageKey, 'savedWords'], (result) => {
      let words = result[storageKey] || [];
      // One-time migration: copy legacy savedWords (German) into savedWords_de
      if (language === 'de' && words.length === 0 && result.savedWords?.length > 0) {
        words = result.savedWords;
        chrome.storage.local.set({ [storageKey]: words });
      }
      setSavedWords(words);
    });
    const listener = (changes) => {
      if (changes[storageKey]) setSavedWords(changes[storageKey].newValue || []);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [isOpen, language]);

  const deleteWord = (id) => chrome.runtime.sendMessage({ type: 'DELETE_WORD', id, language });
  const toggleLearned = (id) => chrome.runtime.sendMessage({ type: 'TOGGLE_LEARNED', id, language });

  const dueCount = savedWords.filter(w => !w.learned && (w.srs?.nextReview ?? 0) <= Date.now()).length;

  const tabDefs = [
    ['saved', `Saved (${savedWords.length})`],
    ['words', 'Words'],
    ['practice', `Practice${dueCount > 0 ? ` (${dueCount})` : ''}`],
  ];

  // Tab handle — always visible, slides with panel
  const tabHandle = (
    <button
      className="dt-tab-handle"
      style={{ right: isOpen ? '350px' : '0px' }}
      onClick={() => setIsOpen(o => !o)}
      aria-label={isOpen ? 'Close vocabulary panel' : 'Open vocabulary panel'}
    >
      <span className="dt-tab-handle__label">
        {isOpen ? '›' : 'VOCAB'}
      </span>
      {dueCount > 0 && (
        <span className="dt-tab-handle__badge">
          {dueCount > 9 ? '9+' : dueCount}
        </span>
      )}
    </button>
  );

  return (
    <>
      {tabHandle}
      {isOpen && (
      <div id="deutschtube-sidebar">
      {/* Header */}
      <div className="deutschtube-sidebar-header">
        <span style={{ fontWeight: '800', fontSize: '14px', color: '#111827' }}>DeutschTube</span>
        <button
          title="Settings"
          onClick={() => setShowSettings(true)}
          style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#6b7280', padding: '4px' }}
        >
          ⚙
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
        {tabDefs.map(([key, label]) => (
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
        {tab === 'practice' && <PracticeTab words={savedWords} language={language} />}

        {tab === 'words' && <WordsTab language={language} />}

        {tab === 'saved' && (
          savedWords.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: '50px', color: '#9ca3af' }}>
              <div style={{ fontSize: '48px', marginBottom: '10px' }}>📘</div>
              <p>Click words in subtitles to save them here!</p>
            </div>
          ) : (
            savedWords.slice().reverse().map((item) => (
              <div key={item.id} className="deutschtube-word-card" style={{ opacity: item.learned ? 0.5 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div className="deutschtube-word-card-title">{item.word}</div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {item.srs && (
                      <span style={{ fontSize: '10px', color: '#9ca3af' }}>{item.srs.interval}d</span>
                    )}
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

      {/* Settings overlay */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
      )}
    </>
  );
};

export default Sidebar;
