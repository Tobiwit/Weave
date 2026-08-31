import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import './layout.css';

interface PageHeaderProps {
  title?: ReactNode;
  eyebrow?: string;
  back?: boolean;
  backTo?: string;
  action?: ReactNode;
}

export function PageHeader({ title, eyebrow, back, backTo, action }: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="page-head">
      {back && (
        <button
          type="button"
          className="page-head__back"
          onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
          aria-label="Go back"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M12.5 4.5 7 10l5.5 5.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      <div className="page-head__title">
        {eyebrow && <p className="u-eyebrow">{eyebrow}</p>}
        {title && <h1 className="u-title">{title}</h1>}
      </div>
      {action}
    </div>
  );
}
