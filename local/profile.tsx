import React from 'react';
import { useQuery } from '@tanstack/react-query';
export function UserProfile({ value, userId, user_id }: any) {
  const id = typeof value === 'string' ? value : value?.user_id || userId || user_id;
  const { data } = useQuery({ queryKey: ['local-profile', id], queryFn: async () => (await fetch('/api/local/users').then(r => r.json())).find((u: any) => u.user_id === id) });
  return <div className="p-6 flex flex-col items-center gap-3">{data?.avatar && <img src={data.avatar} className="w-16 h-16 rounded-full" alt={data.name} />}<strong>{data?.name || '加载中…'}</strong><span>{data?.email}</span></div>;
}
