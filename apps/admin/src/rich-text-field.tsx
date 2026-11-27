import { lazy, Suspense, useState } from 'react';
import { Type } from 'lucide-react';
import { richTextToPlainText, type RichText } from '@wordpressjs/core';

const TextEditor = lazy(() => import('./rich-text-editor'));

export function RichTextField({
  value,
  onChange,
  readOnly,
}: {
  value: string | RichText;
  onChange: (value: string | RichText) => void;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const preview = typeof value === 'string' ? value : richTextToPlainText(value);
  return (
    <div>
      <p className="media-help">
        {preview.slice(0, 160) || 'Start with a few words.'}
        {preview.length > 160 ? '…' : ''}
      </p>
      <button
        type="button"
        className="button compact"
        disabled={readOnly}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Type size={16} />
        Edit text
      </button>
      {open && (
        <Suspense fallback={<p role="status">Opening text editor…</p>}>
          <TextEditor
            value={value}
            onClose={() => setOpen(false)}
            onApply={(next) => {
              onChange(next);
              setOpen(false);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
