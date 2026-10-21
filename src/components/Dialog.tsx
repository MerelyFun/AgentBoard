import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Dialog({ title, children, onClose, wide = false }: {
  title: string; children: ReactNode; onClose: () => void; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);
  return <dialog ref={ref} className={`dialog ${wide ? 'dialog-wide' : ''}`}
    aria-labelledby="dialog-heading" onCancel={onClose}
    onClick={(event) => { if (event.target === ref.current) onClose(); }}>
    <div className="dialog-body">
      <header className="dialog-header"><h2 id="dialog-heading">{title}</h2>
        <button className="icon-button" aria-label="关闭" onClick={onClose}><X size={19} /></button>
      </header>
      {children}
    </div>
  </dialog>;
}
