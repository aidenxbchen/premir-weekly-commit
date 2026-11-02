import type { ReactNode } from 'react';
import { Navigate, useOutletContext } from 'react-router-dom';
import type { LayoutContext } from './Layout';

export function ProtectedRoute({ children, requiredRoles }: { children: ReactNode; requiredRoles: string[] }) {
  const { me } = useOutletContext<LayoutContext>();
  const hasPermission: boolean = requiredRoles.includes('admin') && me.level === 'L1';
  return hasPermission ? <>{children}</> : <Navigate to="/" replace />;
}
