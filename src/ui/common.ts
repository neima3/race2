export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export function formatTime(ms: number): string {
  if (ms == null) return '--:--.---';
  const totalTenths = Math.floor(ms / 100);
  const m = Math.floor(totalTenths / 600);
  const s = Math.floor((totalTenths % 600) / 10);
  const t = totalTenths % 10;
  return `${m}:${String(s).padStart(2, '0')}.${t}`;
}

export function formatTimePrecise(ms: number): string {
  if (ms == null) return '--:--.---';
  const totalMs = Math.max(0, Math.floor(ms));
  const m = Math.floor(totalMs / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const milli = totalMs % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
}

export function medalIcon(kind: 'author' | 'gold' | 'silver' | 'bronze' | 'none'): string {
  if (kind === 'none') return '';
  const label = kind === 'author' ? 'AUTHOR' : kind.toUpperCase();
  return `<span class="medal medal-${kind}">${label}</span>`;
}
