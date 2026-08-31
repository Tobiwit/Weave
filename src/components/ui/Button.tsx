import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './ui.css';

type Variant = 'primary' | 'tinted' | 'quiet' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
  size?: 'md' | 'sm';
  children: ReactNode;
}

export function Button({
  variant = 'quiet',
  block = false,
  size = 'md',
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    `btn--${variant}`,
    block ? 'btn--block' : '',
    size === 'sm' ? 'btn--sm' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
