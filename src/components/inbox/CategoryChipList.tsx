'use client';

// ==============================================================================
// COMPONENT: src/components/inbox/CategoryChipList.tsx
// Deretan tombol kategori untuk kategorisasi 1-tap — Kontras Tinggi & Jelas
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
  selectedCategoryId?: string | null;
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
  selectedCategoryId,
  disabled = false,
}: CategoryChipListProps) {
  const targetType = transactionDirection === 'in' ? 'income' : 'expense';
  const filtered = categories.filter((c) => c.type === targetType);
  const displayList = filtered.length > 0 ? filtered : categories;

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden">
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 pr-2">
        {displayList.map((cat) => {
          const isSelected = selectedCategoryId === cat.id;
          const IconComponent = (cat.icon && iconMap[cat.icon]) || Tag;
          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              disabled={disabled}
              className={`group shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-bold transition-all border shadow-sm disabled:opacity-50 active:scale-95 ${
                isSelected
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-transparent shadow-md shadow-emerald-500/25'
                  : 'bg-white/90 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 hover:bg-gradient-to-r hover:from-sky-500 hover:to-blue-600 hover:text-white dark:hover:text-white border-slate-200/90 dark:border-white/10'
              }`}
            >
              <IconComponent
                className={`w-3.5 h-3.5 transition-transform ${
                  isSelected
                    ? 'text-white'
                    : 'text-slate-600 group-hover:text-white dark:text-slate-300'
                }`}
              />
              <span className="whitespace-nowrap">{cat.name}</span>
              {isSelected && <span className="text-[10px] ml-0.5">✨</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
