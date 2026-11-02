import { useEffect, useState } from 'react';
import { usePersonInfo } from '@/hooks/usePersonInfo';
import type { RankedPerson } from '@/utils/ranking';
import { BigAvatar } from './BigAvatar';
import { RankCrown, RANK_BORDER_COLOR } from './RankCrown';

const RANK_LABEL: Record<1 | 2 | 3, { gradient: string; title: string }> = {
  1: { gradient: 'bg-gradient-to-br from-[#ffd76a] to-[#c98600]', title: '金角大王' },
  2: { gradient: 'bg-gradient-to-br from-[#e8edf2] to-[#8a97a3]', title: '银角大王' },
  3: { gradient: 'bg-gradient-to-br from-[#e3a97a] to-[#8a4b1f]', title: '铜角大王' },
};

// 领奖台方块高度——第一名最高居中，二三名两侧稍矮，模拟真实领奖台的比例。
// 比原来高一截，因为名次数字放大了，姓名还要挪进方块内部一起放下。
const BLOCK_HEIGHT: Record<1 | 2 | 3, number> = { 1: 195, 2: 145, 3: 120 };
// 名次数字的字号——第一名比二三名更大一级，呼应头像/皇冠的尺寸层级。
const RANK_DIGIT_SIZE: Record<1 | 2 | 3, number> = { 1: 64, 2: 52, 3: 52 };
const PODIUM_ORDER: Array<1 | 2 | 3> = [2, 1, 3];

// 进度条不是离散跳变、也不是脱离真实进度的假定时器——而是持续朝调用方设置的
// ceiling（每完成一个真实步骤就抬高一次）缓动逼近，永不超过 ceiling，读起来
// 像连续的动作，不管背后真实步骤快慢。
function useSmoothProgress(ceiling: number): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setValue((v) => {
        if (v >= ceiling) return v;
        const gap = ceiling - v;
        return Math.min(ceiling, v + Math.max(0.6, gap * 0.1));
      });
    }, 40);
    return () => clearInterval(id);
  }, [ceiling]);
  return value;
}

export function LoadingScreen({
  ceiling,
  label,
  topThree,
}: {
  // 进度条当前允许爬到多高——等待身份识别时 35，拉取排行榜数据时 90，两者都
  // 完成后 100。
  ceiling: number;
  label: string;
  // 排行榜数据到位前为 null——领奖台先渲染空占位，不要等数据齐了才突然出现
  // 造成布局跳动。
  topThree: RankedPerson[] | null;
}) {
  const progress = useSmoothProgress(ceiling);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div
        className="text-[#c98600] text-8xl sm:text-9xl mb-12 select-none"
        style={{ fontFamily: '"XiZhiQu Ximai", cursive', textShadow: '0 4px 0 rgba(201,134,0,0.18)' }}
      >
        算你厉害！
      </div>

      <div className="flex items-end gap-8 sm:gap-14 mb-14">
        {PODIUM_ORDER.map((rank) => (
          <PodiumSlot key={rank} rank={rank} person={topThree?.[rank - 1]} />
        ))}
      </div>

      <div className="w-96 sm:w-[36rem]">
        <div className="h-5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-[#1abcfe] transition-[width] duration-150 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-3 text-center text-lg text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

// 写意字体的字号——和"金角大王"这类徽章文字一致（text-sm ≈ 14px）。
const HANDWRITTEN_FONT = { fontFamily: '"XiZhiQu Ximai", cursive' };

function PodiumSlot({ rank, person }: { rank: 1 | 2 | 3; person?: RankedPerson }) {
  const label = RANK_LABEL[rank];
  const avatarSize = rank === 1 ? 122 : 96;
  const crownSize = rank === 1 ? 56 : 42;
  // 皇冠图形本身在 24x24 视窗里没有贴满、又转了 -45deg，视觉重心会往里缩；
  // 固定像素的偏移量在小尺寸皇冠上占比更大，看起来就成了"皇冠飘在头像外面"。
  // 改成跟皇冠尺寸成比例的偏移，金/银/铜三个尺寸才会贴得一样紧。
  const crownOffset = -Math.round(crownSize * 0.38);
  const { name, avatarUrl } = usePersonInfo(person?.person.userId);
  return (
    <div className="flex flex-col items-center">
      <div className="relative mb-4">
        {person ? (
          <BigAvatar name={name} avatarUrl={avatarUrl} size={avatarSize} />
        ) : (
          <div className="rounded-full bg-muted animate-pulse" style={{ width: avatarSize, height: avatarSize }} />
        )}
        <span className="absolute" style={{ top: crownOffset, left: crownOffset }}>
          <RankCrown rank={rank} size={crownSize} />
        </span>
      </div>
      <div
        className={`rounded-xl px-5 py-2.5 text-center leading-tight shadow-sm mb-4 ${label.gradient} ${
          person ? 'opacity-100' : 'opacity-40'
        }`}
      >
        <div className="text-white text-base font-bold whitespace-nowrap">{label.title}</div>
      </div>
      <div
        className="w-32 sm:w-44 rounded-t-md bg-gradient-to-b from-brand-pale to-border flex flex-col items-center justify-start gap-2 pt-4 pb-3"
        style={{ height: BLOCK_HEIGHT[rank] }}
      >
        <span
          className="font-bold leading-none"
          style={{ ...HANDWRITTEN_FONT, fontSize: RANK_DIGIT_SIZE[rank], color: RANK_BORDER_COLOR[rank] }}
        >
          {rank}
        </span>
        {person && (
          <div
            className="text-base text-center truncate max-w-28 sm:max-w-36"
            style={{ ...HANDWRITTEN_FONT, color: RANK_BORDER_COLOR[rank] }}
          >
            {name}
          </div>
        )}
      </div>
    </div>
  );
}
