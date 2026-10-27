import React from 'react';

export interface BulkActionBarProps {
  selectedCount: number;
  className: string;
  children: React.ReactNode;
}

/** Shared selection chrome. Hosts keep their own actions and styling. */
export function BulkActionBar({
  selectedCount,
  className,
  children,
}: BulkActionBarProps): React.JSX.Element | null {
  if (selectedCount === 0) return null;
  return <div className={className}>{children}</div>;
}
