import React from 'react';
import { createRoot } from 'react-dom/client';
import SubtitleOverlay from '../components/SubtitleOverlay';
import Sidebar from '../components/Sidebar';
import './index.css';

function initExtension() {
  // Platform-independent: find any video player container or fall back to the <video> element's parent
  const videoPlayer = document.querySelector('.html5-video-player') // YouTube
    || document.querySelector('.video-player')                      // Generic
    || document.querySelector('[class*="player"]');                  // Broad fallback

  const videoElement = document.querySelector('video');

  if (!videoElement) {
    setTimeout(initExtension, 1000);
    return;
  }

  // Use the player container if available, otherwise use the video's parent
  const overlayParent = videoPlayer || videoElement.parentElement;

  // Ensure the parent has relative/absolute positioning for overlay placement
  const parentPosition = window.getComputedStyle(overlayParent).position;
  if (parentPosition === 'static') {
    overlayParent.style.position = 'relative';
  }

  // 1. Inject Subtitle Overlay
  let overlayContainer = document.getElementById('deutschtube-overlay');
  if (!overlayContainer) {
    overlayContainer = document.createElement('div');
    overlayContainer.id = "deutschtube-overlay";
    overlayParent.appendChild(overlayContainer);

    const root = createRoot(overlayContainer);
    root.render(<SubtitleOverlay videoElement={videoElement} />);
  }

  // 2. Inject Sidebar
  let sidebarContainer = document.getElementById('dt-sidebar-root');
  if (!sidebarContainer) {
    sidebarContainer = document.createElement('div');
    sidebarContainer.id = "dt-sidebar-root";
    document.body.appendChild(sidebarContainer);

    const sidebarRoot = createRoot(sidebarContainer);
    sidebarRoot.render(<Sidebar />);
  }
}

// Re-initialize if navigating to a new video in the SPA
let currentUrl = location.href;
setInterval(() => {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    setTimeout(initExtension, 2000);
  }
}, 1000);

initExtension();
