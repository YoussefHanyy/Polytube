import React, { useState, useEffect } from 'react';

const WordPopup = ({ word, language, onSave, style = {} }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!word) return;
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
        setData({
          primary: meaning,
          display: synonyms.length ? synonyms.join(', ') : meaning,
          pos,
        });
      })
      .catch(() => setData({ primary: 'Error', display: 'Connection failed', pos: '' }))
      .finally(() => setLoading(false));
  }, [word, language]);

  const handleSave = () => {
    const wordData = {
      word,
      meaning: data?.display || data?.primary || '',
      pos: data?.pos || '',
    };
    chrome.runtime.sendMessage({ type: 'SAVE_WORD', wordData, language });
    if (onSave) onSave(wordData);
  };

  return (
    <div
      className="deutschtube-expanded-popup"
      style={style}
      onClick={e => e.stopPropagation()}
    >
      <div className="popup-header">
        <span className="popup-word">{word}</span>
        {data?.pos && <span className="popup-pos">{data.pos}</span>}
      </div>
      <div className="popup-body">
        {loading ? (
          <div className="loader">Loading meanings...</div>
        ) : (
          <>
            <div className="popup-meanings">{data?.display}</div>
            <button className="popup-save-btn" onClick={handleSave}>
              Save Word
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default WordPopup;
