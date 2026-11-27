import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './dialog.css';

export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const invoker = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      // React removes the dialog before cleanup, so restore keyboard focus explicitly.
      if (invoker instanceof HTMLElement && invoker.isConnected)
        invoker.focus({ preventScroll: true });
    };
  }, []);
  // Fields may already be inside a form. Keep dialogs out of that DOM and isolate
  // their interactions from the canvas while preserving React context and focus.
  return createPortal(
    <dialog
      ref={ref}
      className="workspace-dialog"
      aria-labelledby={titleId}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onSubmit={(event) => event.stopPropagation()}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="workspace-dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>,
    document.body,
  );
}
