import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    __BASENAME__?: string;
  }
}

export function SketchbookWelcome({ ready, label, onEnter }: { ready: boolean; label: string; onEnter: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const hostedAppPath = window.location.pathname.match(/^\/app\/[^/]+/u)?.[0] ?? '';
  const basePath: string = (window.__BASENAME__ || hostedAppPath).replace(/\/$/u, '');
  useEffect(() => {
    const send = () => frame.current?.contentWindow?.postMessage({ type: 'anever:status', ready, label }, location.origin);
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== location.origin) return;
      if (event.data?.type === 'anever:sketchbook-ready') send();
      if (event.data?.type === 'anever:enter' && ready) onEnter();
    };
    window.addEventListener('message', receive); send();
    return () => window.removeEventListener('message', receive);
  }, [ready, label, onEnter]);
  return <iframe ref={frame} src={`${basePath}/sketchbook/index.html`} title="ANEVER 伙伴手记：翻阅伙伴的原话" style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 0, background: '#eaf4ff', zIndex: 1000 }} />;
}
