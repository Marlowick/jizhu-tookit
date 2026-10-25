interface LogoProps {
  size?: number
  className?: string
}

export function Logo({ size = 58, className }: LogoProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-label="机杼工具箱"
      role="img"
    >
      <rect x="2" y="2" width="60" height="60" rx="15" fill="#2563eb" />
      <path d="M18 23.5h28M18 32h28M18 40.5h28" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
      <path
        d="M26 15.5v33M38 15.5v33"
        stroke="#fff"
        strokeOpacity="0.55"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  )
}
