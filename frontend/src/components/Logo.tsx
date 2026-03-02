"use client";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: 32,
  md: 56,
  lg: 96,
};

export default function Logo({ size = "md", className = "" }: LogoProps) {
  const px = sizeMap[size];

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Valeon logo"
    >
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0d9488" />
          <stop offset="100%" stopColor="#1e40af" />
        </linearGradient>
        <linearGradient id="logoGradLight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#14b8a6" />
          <stop offset="50%" stopColor="#0d9488" />
          <stop offset="100%" stopColor="#1e40af" />
        </linearGradient>
      </defs>
      {/* Outer circle */}
      <circle cx="60" cy="60" r="56" stroke="url(#logoGrad)" strokeWidth="3" opacity="0.3" />
      {/* Elegant curved V */}
      <path
        d="M32 30 C36 30, 40 34, 44 44 L58 78 C59 80.5, 59.5 82, 60 82 C60.5 82, 61 80.5, 62 78 L76 44 C80 34, 84 30, 88 30"
        stroke="url(#logoGradLight)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Inner accent stroke for depth */}
      <path
        d="M38 36 C41 36, 44 40, 48 48 L58 74 C59 76, 59.5 77, 60 77 C60.5 77, 61 76, 62 74 L72 48 C76 40, 79 36, 82 36"
        stroke="url(#logoGrad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.5"
      />
      {/* Subtle dot accent at the base of V */}
      <circle cx="60" cy="88" r="3" fill="url(#logoGrad)" opacity="0.6" />
    </svg>
  );
}
