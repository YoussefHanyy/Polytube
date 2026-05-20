import React, { useState, useEffect, useRef, useCallback } from 'react';
import wordLevels from '../data/germanWordLevels';

// ─── YouTube Provider ─────────────────────────────────────────────────────────
// Reads directly from YouTube's hidden caption container — mirrors exactly
// what YouTube shows, replaces each time (no accumulation).
class YouTubeSubtitleProvider {
  constructor() { this._intervalId = null; this._last = ""; }
  getName() { return "youtube"; }

  start(callback) {
    this._intervalId = setInterval(() => {
      let text = '';

      // Try caption windows first (most reliable — one window = one subtitle line)
      const windows = document.querySelectorAll('.caption-window');
      if (windows.length > 0) {
        const lastWin = windows[windows.length - 1];
        const segs = lastWin.querySelectorAll('.ytp-caption-segment');
        const parts = [];
        segs.forEach(seg => { const t = seg.textContent.trim(); if (t) parts.push(t); });
        text = parts.join(' ');
      }

      // Fallback: read full container (covers layout variants)
      if (!text) {
        const container = document.querySelector('.ytp-caption-window-container');
        if (container) text = container.textContent.trim();
      }

      if (text !== this._last) {
        this._last = text;
        callback(text);
      }
    }, 80);
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

// ─── Level colors ─────────────────────────────────────────────────────────────
const LEVEL_COLORS = {
  A1: null,              // white (default)
  A2: '#86efac',         // green
  B1: '#fde047',         // yellow
  B2: '#fb923c',         // orange
  C1: '#f87171',         // red
};

// ─── SubtitleOverlay Component ────────────────────────────────────────────────
const SubtitleOverlay = ({ videoElement }) => {
  const [subtitle, setSubtitle] = useState("");
  const [visible, setVisible] = useState(false);
  const [hoveredWord, setHoveredWord] = useState(null);
  const [clickedWord, setClickedWord] = useState(null);
  const [translationData, setTranslationData] = useState(null);
  const [loading, setLoading] = useState(false);

  const providerRef = useRef(null);
  const clearTimerRef = useRef(null);
  const videoRef = useRef(videoElement);
  const pausedByHoverRef = useRef(false);

  useEffect(() => { videoRef.current = videoElement; }, [videoElement]);

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

  // ─── Pause on hover ───
  const handleSubtitleMouseEnter = () => {
    const video = videoRef.current;
    if (video && !video.paused) {
      video.pause();
      pausedByHoverRef.current = true;
    }
  };

  const handleSubtitleMouseLeave = () => {
    if (pausedByHoverRef.current) {
      videoRef.current?.play();
      pausedByHoverRef.current = false;
    }
  };

  // ─── Translation ───
  const fetchMeanings = async (word) => {
    setLoading(true);
    setTranslationData(null);
    try {
      const res = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=de&tl=en&dt=t&dt=bd&dt=md&q=${encodeURIComponent(word)}`
      );
      const data = await res.json();
      let meaning = 'N/A', pos = '', synonyms = [];
      if (data[0]?.[0]?.[0]) meaning = data[0][0][0];
      if (data[1]) { synonyms = data[1].flatMap(g => g[1] || []).slice(0, 3); pos = data[1][0]?.[0] || ''; }
      setTranslationData({ primary: meaning, synonyms: synonyms.length ? synonyms.join(", ") : meaning, pos });
    } catch {
      setTranslationData({ primary: 'Error', synonyms: 'Connection failed', pos: '' });
    } finally {
      setLoading(false);
    }
  };

  const handleWordHover = (word) => {
    if (clickedWord) return;
    setHoveredWord(word);
    if (!translationData || hoveredWord !== word) fetchMeanings(word);
  };

  const handleWordClick = (word, e) => {
    e.stopPropagation();
    setClickedWord(word);
    setHoveredWord(null);
    fetchMeanings(word);
  };

  const handleSaveWord = (word) => {
    const data = { word, meaning: translationData?.synonyms || translationData?.primary || '', pos: translationData?.pos || '' };
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'SAVE_WORD', wordData: data });
    } else {
      window.dispatchEvent(new CustomEvent('deutschtube-save-word', { detail: data }));
    }
  };

  if (!subtitle) return null;

  const tokens = subtitle.match(/[\p{L}äöüßÄÖÜẞ]+|[^\p{L}\s]/gu) || [];

  return (
    <div
      className={`deutschtube-subtitle-box ${visible ? 'subtitle-visible' : 'subtitle-hidden'}`}
      onClick={() => setClickedWord(null)}
      onMouseEnter={handleSubtitleMouseEnter}
      onMouseLeave={handleSubtitleMouseLeave}
    >
      {tokens.map((token, index) => {
        const isWord = /[\p{L}äöüßÄÖÜẞ]/u.test(token);
        if (!isWord) return <span key={index} className="deutschtube-punctuation">{token}</span>;

        const level = wordLevels[token.toLowerCase()];
        const levelColor = level ? LEVEL_COLORS[level] : '#9ca3af';
        const levelStyle = levelColor ? { color: levelColor } : {};

        return (
          <span
            key={`${token}-${index}`}
            className={`deutschtube-word-wrapper ${hoveredWord === token ? 'is-hovered' : ''} ${clickedWord === token ? 'is-active' : ''}`}
            style={!hoveredWord && !clickedWord ? levelStyle : {}}
            onMouseEnter={() => handleWordHover(token)}
            onMouseLeave={() => setHoveredWord(null)}
            onClick={(e) => handleWordClick(token, e)}
          >
            {(level === 'B2' || level === 'C1') && <span className={`dt-level-badge dt-level-${level.toLowerCase()}`}>{level}</span>}
            {token}

            {hoveredWord === token && !clickedWord && (
              <div className="deutschtube-mini-tooltip">
                {loading ? '...' : (translationData?.primary || '...')}
              </div>
            )}

            {clickedWord === token && (
              <div className="deutschtube-expanded-popup" onClick={(e) => e.stopPropagation()}>
                <div className="popup-header">
                  <span className="popup-word">{token}</span>
                  <span className="popup-pos">{translationData?.pos}</span>
                </div>
                <div className="popup-body">
                  {loading ? (
                    <div className="loader">Loading meanings...</div>
                  ) : (
                    <>
                      <div className="popup-meanings">{translationData?.synonyms}</div>
                      <button className="popup-save-btn" onClick={() => handleSaveWord(token)}>Save Word</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </span>
        );
      })}
    </div>
  );
};

export default SubtitleOverlay;
