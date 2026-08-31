import { AnimatePresence, motion } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import './ui.css';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/** A lightweight bottom sheet; on wide screens it becomes a centred dialog. */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
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
            aria-label={title}
            initial={reducedMotion ? { opacity: 0 } : { y: '100%' }}
            animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { y: '100%' }}
            transition={{
              duration: reducedMotion ? 0 : 0.42,
              ease: [0.16, 0.84, 0.28, 1],
            }}
          >
            <div className="sheet__grip" aria-hidden="true" />
            {title && <h2 className="u-section sheet__title">{title}</h2>}
            <div className="sheet__body u-scroll">{children}</div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
