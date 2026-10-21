import React, { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Scan, Move } from 'lucide-react';
import { Modal } from './Modal';

export function ImageViewer({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [natural, setNatural] = useState({ width: 1, height: 1 });
  const [size, setSize] = useState({ width: 600, height: 500 });
  const [error, setError] = useState(false);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setSize({ width: element.clientWidth - 24, height: element.clientHeight - 24 }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const fit = Math.min(size.width / natural.width, size.height / natural.height);
  const changeZoom = (value: number) => setZoom(Math.min(5, Math.max(0.5, value)));
  return <Modal title={title} onClose={onClose} wide>
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <p className="flex items-center gap-2 text-xs text-slate-500"><Move size={15} />放大后可拖动或滚动查看，Esc 关闭</p>
      <div className="flex items-center gap-2">
        <button aria-label="缩小图片" disabled={zoom <= 0.5} onClick={() => changeZoom(zoom - 0.25)} className="rounded-xl bg-white p-2 disabled:opacity-30"><ZoomOut size={20} /></button>
        <span className="w-14 text-center text-sm font-bold text-night-royal" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button aria-label="放大图片" disabled={zoom >= 5} onClick={() => changeZoom(zoom + 0.25)} className="rounded-xl bg-white p-2 disabled:opacity-30"><ZoomIn size={20} /></button>
        <button onClick={() => { setZoom(1); viewport.current?.scrollTo(0, 0); }} className="flex items-center gap-1 rounded-xl bg-night-royal px-3 py-2 text-xs font-bold text-white"><Scan size={16} />适应窗口</button>
      </div>
    </div>
    <div ref={viewport} tabIndex={0} aria-label="图片查看区域" className="relative h-[70dvh] min-h-48 overflow-auto overscroll-contain bg-slate-950 p-3 touch-none"
      style={{ cursor: zoom > 1 ? 'grab' : 'default' }}
      onPointerDown={event => {
        if (event.button !== 0 || zoom <= 1) return;
        const el = event.currentTarget;
        drag.current = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop };
        el.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const start = drag.current;
        if (!start) return;
        event.currentTarget.scrollLeft = start.left - (event.clientX - start.x);
        event.currentTarget.scrollTop = start.top - (event.clientY - start.y);
      }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      {error ? <p role="alert" className="p-8 text-white">图片加载失败，请关闭后重试。</p> :
        <img src={src} alt={title} draggable={false} onError={() => setError(true)}
          onLoad={event => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          className="mx-auto block max-w-none select-none" style={{ width: natural.width * fit * zoom, height: natural.height * fit * zoom }} />}
    </div>
  </Modal>;
}
