'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QR({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toString(value, {
      type: 'svg',
      margin: 0,
      errorCorrectionLevel: 'L',
      color: { dark: '#2b3534', light: '#0000' },
    })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(null));
    return () => {
      alive = false;
    };
  }, [value]);

  return (
    <div
      role="img"
      aria-label={label}
      className={className}
      // qrcode returns a self-contained <svg>; nothing user-controlled is interpolated as markup.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
