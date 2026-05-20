import React, { useState, useEffect, useCallback } from 'react';

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
      const nextReview = w.srs?.nextReview ?? 0;
      return nextReview <= now;
    });
    // Shuffle due words
    const shuffled = due.sort(() => Math.random() - 0.5);
    setQueue(shuffled);
    setCurrent(shuffled[0] || null);
    setRevealed(false);
    setDone(shuffled.length === 0);
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

  const dueCount = queue.length;

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '16px', textAlign: 'right' }}>
        {dueCount} word{dueCount !== 1 ? 's' : ''} remaining
      </div>

      {/* Flash card */}
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

      {/* Rating buttons */}
      {revealed && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => advance(1)} style={ratingBtn('#fee2e2', '#ef4444')}>
            ✗ Wrong
          </button>
          <button onClick={() => advance(3)} style={ratingBtn('#fef9c3', '#ca8a04')}>
            ~ Hard
          </button>
          <button onClick={() => advance(5)} style={ratingBtn('#dcfce7', '#16a34a')}>
            ✓ Easy
          </button>
        </div>
      )}

      {/* Next review preview */}
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

// ─── Sidebar Component ────────────────────────────────────────────────────────
const Sidebar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState('vocab'); // 'vocab' | 'practice'
  const [savedWords, setSavedWords] = useState([]);

  useEffect(() => {
    const loadWords = () => {
      chrome.storage.local.get(['savedWords'], (result) => {
        setSavedWords(result.savedWords || []);
      });
    };
    if (isOpen) loadWords();

    const listener = (changes) => {
      if (changes.savedWords) setSavedWords(changes.savedWords.newValue || []);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [isOpen]);

  const deleteWord = (id) => chrome.runtime.sendMessage({ type: 'DELETE_WORD', id });
  const toggleLearned = (id) => chrome.runtime.sendMessage({ type: 'TOGGLE_LEARNED', id });

  const dueCount = savedWords.filter(w => !w.learned && (w.srs?.nextReview ?? 0) <= Date.now()).length;

  if (!isOpen) {
    return (
      <div
        style={{
          position: 'fixed', top: '50%', right: '0',
          transform: 'translateY(-50%)',
          background: '#2563eb', color: 'white',
          padding: '20px 10px', borderTopLeftRadius: '12px',
          borderBottomLeftRadius: '12px', cursor: 'pointer',
          zIndex: 999999, fontWeight: '800', writingMode: 'vertical-rl',
          boxShadow: '-4px 0 15px rgba(0,0,0,0.1)',
        }}
        onClick={() => setIsOpen(true)}
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

  return (
    <div id="deutschtube-sidebar">
      <div className="deutschtube-sidebar-header">
        <span>{tab === 'vocab' ? `My Vocab (${savedWords.length})` : 'Practice'}</span>
        <button
          style={{ background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#6b7280' }}
          onClick={() => setIsOpen(false)}
        >×</button>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
        {[['vocab', 'Vocabulary'], ['practice', `Practice${dueCount > 0 ? ` (${dueCount})` : ''}`]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              flex: 1, padding: '12px', border: 'none', cursor: 'pointer',
              fontWeight: '700', fontSize: '13px',
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
        {tab === 'practice' ? (
          <PracticeTab words={savedWords} />
        ) : (
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
                      <span style={{ fontSize: '10px', color: '#9ca3af' }}>
                        {item.srs.interval}d
                      </span>
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
    </div>
  );
};

export default Sidebar;
