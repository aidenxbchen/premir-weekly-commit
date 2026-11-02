import { useState } from 'react';

// 独立于 business-ui 的 UserDisplay/UserWithAvatar——那套组件的头像固定在
// 16/20/24px（给行内 @提及 chip 用的），套再大的外层容器也放不大。这里按原版
// Avatar.tsx 的写法：调用方直接给像素尺寸，图片加载失败时退回姓名首字的纯色圆。
export function BigAvatar({ name, avatarUrl, size = 40 }: { name: string; avatarUrl?: string; size?: number }) {
  const [broken, setBroken] = useState(false);

  if (avatarUrl && !broken) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setBroken(true)}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  const initial = name.trim().charAt(0) || '?';
  return (
    <div
      className="rounded-full bg-brand-blue text-white flex items-center justify-center font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </div>
  );
}
