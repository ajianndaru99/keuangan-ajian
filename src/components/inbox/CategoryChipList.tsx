'use client';

// ==============================================================================
// COMPONENT: src/components/inbox/CategoryChipList.tsx
// Deretan tombol kategori untuk kategorisasi 1-tap dengan scrolling mulus
// ==============================================================================

import {
  ShoppingCart,
  Utensils,
  Fuel,
  Zap,
  Baby,
  HeartPulse,
  Film,
  ShoppingBag,
  Send,
  MoreHorizontal,
  Wallet,
  Tag,
} from 'lucide-react';

export interface Category {
  id: string;
  name: string;
  type: 'expense' | 'income';
  icon?: string;
  sort_order?: number;
}

interface CategoryChipListProps {
  categories: Category[];
  transactionDirection: 'out' | 'in';
  onSelect: (categoryId: string) => void;
  disabled?: boolean;
}

const iconMap: Record<string, React.ElementType> = {
  'shopping-cart': ShoppingCart,
  utensils: Utensils,
  fuel: Fuel,
  zap: Zap,
  baby: Baby,
  'heart-pulse': HeartPulse,
  film: Film,
  'shopping-bag': ShoppingBag,
  send: Send,
  'more-horizontal': MoreHorizontal,
  wallet: Wallet,
};

export default function CategoryChipList({
  categories,
  transactionDirection,
  onSelect,
  disabled = false,
}: CategoryChipListProps) {
  // Filter kategori berdasarkan arah transaksi (pengeluaran vs pemasukan)
  const targetType = transactionDirection === 'in' ? 'income' : 'expense';
  const filtered = categories.filter((c) => c.type === targetType);
  const displayList = filtered.length > 0 ? filtered : categories;

  return (
    <div className="w-full">
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 pr-2">
        {displayList.map((cat) => {
          const IconComponent = (cat.icon && iconMap[cat.icon]) || Tag;
          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              disabled={disabled}
              className="group shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100/80 hover:bg-blue-600 hover:text-white dark:bg-[#1a2333] dark:hover:bg-blue-600 text-slate-700 dark:text-slate-200 dark:hover:text-white border border-slate-200/80 dark:border-slate-700/80 active:scale-95 transition-all disabled:opacity-50"
            >
              <IconComponent className="w-3.5 h-3.5 group-hover:scale-105 transition-transform text-slate-500 group-hover:text-white dark:text-slate-400" />
              <span className="whitespace-nowrap">{cat.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
