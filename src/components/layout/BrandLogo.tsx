// ==============================================================================
// COMPONENT: src/components/layout/BrandLogo.tsx
// Identitas Visual (Logo Monogram 'A' + Pilar Finansial) Keluarga Ajian
// ==============================================================================

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-8 h-8 rounded-lg',
  md: 'w-9 h-9 rounded-xl',
  lg: 'w-14 h-14 rounded-2xl',
};

export default function BrandLogo({ size = 'md', className = '' }: BrandLogoProps) {
  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 overflow-hidden shadow-xs select-none ${SIZE_CLASSES[size]} ${className}`}
      aria-hidden="true"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 512 512"
        className="w-full h-full"
      >
        <defs>
          <linearGradient id="ajianBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0b132b" />
            <stop offset="55%" stopColor="#0f2442" />
            <stop offset="100%" stopColor="#093834" />
          </linearGradient>
          <linearGradient id="ajianCrestGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
          <linearGradient id="ajianGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>

        <rect
          x="16"
          y="16"
          width="480"
          height="480"
          rx="112"
          fill="url(#ajianBgGrad)"
          stroke="#1e3a5f"
          strokeWidth="12"
        />

        <rect
          x="46"
          y="46"
          width="420"
          height="420"
          rx="88"
          fill="none"
          stroke="#38bdf8"
          strokeOpacity="0.18"
          strokeWidth="4"
        />

        <path
          d="M256 108 L136 376 H192 L256 224 L320 376 H376 L256 108 Z"
          fill="url(#ajianCrestGrad)"
        />

        <rect x="184" y="286" width="144" height="34" rx="12" fill="#f8fafc" />

        <rect x="208" y="344" width="22" height="32" rx="6" fill="#38bdf8" opacity="0.9" />
        <rect x="245" y="330" width="22" height="46" rx="6" fill="#10b981" />
        <rect x="282" y="316" width="22" height="60" rx="6" fill="#34d399" />

        <circle cx="256" cy="100" r="15" fill="url(#ajianGoldGrad)" />
      </svg>
    </div>
  );
}

