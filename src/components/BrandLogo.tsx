import React from 'react';
import vaultCrestImg from '../assets/images/sabaa_vault_crest_1795219098899.jpg';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showBadge?: boolean;
  variant?: 'vector' | 'crest';
  className?: string;
}

const SIZE_MAP = {
  sm: 'w-8 h-8 rounded-lg',
  md: 'w-10 h-10 rounded-xl',
  lg: 'w-12 h-12 rounded-xl',
  xl: 'w-16 h-16 rounded-2xl',
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showBadge = false,
  variant = 'vector',
  className = '',
}) => {
  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      <div
        className={`${SIZE_MAP[size]} overflow-hidden border border-amber-400/30 bg-[#05080F] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_25px_-8px_rgba(0,0,0,0.85)] flex items-center justify-center`}
      >
        {variant === 'crest' ? (
          <img
            src={vaultCrestImg}
            alt="SABAA QUANT"
            className="w-full h-full object-cover scale-105"
            draggable={false}
          />
        ) : (
          <svg
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full p-1.5"
            aria-label="SABAA QUANT"
          >
            <defs>
              <linearGradient id="sqGold" x1="10" y1="54" x2="54" y2="10" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#D97706" />
                <stop offset="50%" stopColor="#FBBF24" />
                <stop offset="100%" stopColor="#FEF3C7" />
              </linearGradient>
              <linearGradient id="sqEmerald" x1="14" y1="48" x2="50" y2="16" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#059669" />
                <stop offset="100%" stopColor="#34D399" />
              </linearGradient>
            </defs>
            {/* Outer Precision Hexagonal Architectural Frame */}
            <polygon
              points="32,4 56,18 56,46 32,60 8,46 8,18"
              stroke="url(#sqGold)"
              strokeOpacity="0.65"
              strokeWidth="2"
              fill="#070B14"
            />
            {/* Institutional Candlestick Silhouette Bars */}
            <rect x="17" y="33" width="5" height="13" rx="1.5" fill="#1E293B" stroke="#475569" strokeWidth="1" />
            <rect x="27" y="25" width="5" height="21" rx="1.5" fill="#064E3B" stroke="#10B981" strokeWidth="1.2" />
            {/* Ascending Quantitative Vector */}
            <path
              d="M16 42L27.5 31.5L35.5 36.5L47.5 19.5"
              stroke="url(#sqEmerald)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Gold Apex Vector Head */}
            <path
              d="M40.5 19H48.5V27"
              stroke="url(#sqGold)"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Core Calibration Diamond */}
            <polygon points="35.5,33 39,36.5 35.5,40 32,36.5" fill="#04060A" stroke="#FBBF24" strokeWidth="1.8" />
          </svg>
        )}
      </div>
      {showBadge && (
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#04060A]" />
      )}
    </div>
  );
};
