import { AnimatePresence, motion } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import './ui.css';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Names the dialog when it has no visible title. */
  label?: string;
  children: ReactNode;
}

/** A lightweight bottom sheet; on wide screens it becomes a centred dialog. */
export function Sheet({ open, onClose, title, label, children }: SheetProps) {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Rendered at the document root, above the page and the tab bar alike.
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="sheet-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.3 }}
            onClick={onClose}
          />
          <div className="sheet-wrap">
          <motion.div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={title ?? label}
            initial={reducedMotion ? { opacity: 0 } : { y: '100%' }}
            animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { y: '100%' }}
            transition={{
              duration: reducedMotion ? 0 : 0.5,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <div className="sheet__grip" aria-hidden="true" />
            {title && <h2 className="u-section sheet__title">{title}</h2>}
            <div className="sheet__body u-scroll">{children}</div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
