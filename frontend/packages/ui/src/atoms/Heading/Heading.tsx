import React, { createElement } from 'react';
import type { HeadingProps } from './Heading.types';

const sizeMap: Record<number, string> = {
  1: 'var(--font-size-2xl)',
  2: 'var(--font-size-xl)',
  3: 'var(--font-size-lg)',
  4: 'var(--font-size-md)',
  5: 'var(--font-size-sm)',
  6: 'var(--font-size-xs)',
};

export function Heading({ children, level = 2, className = '', style }: HeadingProps): React.ReactElement {
  return createElement(
    `h${level}`,
    {
      className,
      style: {
        fontSize: sizeMap[level],
        fontWeight: 'var(--font-weight-bold)',
        lineHeight: 1.3,
        margin: 0,
        ...style,
      },
    },
    children,
  );
}
