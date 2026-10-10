export function AnimeMascot({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="am-hair" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset="1" stopColor="#f472b6" />
        </linearGradient>
        <linearGradient id="am-eye" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4c1d95" />
          <stop offset=".6" stopColor="#a21caf" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>

      {/* ears */}
      <g>
        <animateTransform attributeName="transform" type="rotate" values="0 18 20;-10 18 20;0 18 20;0 18 20" keyTimes="0;.06;.12;1" dur="5s" repeatCount="indefinite" />
        <path d="M9 30 L13 6 L28 20 Z" fill="url(#am-hair)" />
        <path d="M13 24 L15 12 L23 20 Z" fill="#fbcfe8" />
      </g>
      <g>
        <animateTransform attributeName="transform" type="rotate" values="0 46 20;0 46 20;10 46 20;0 46 20;0 46 20" keyTimes="0;.5;.56;.62;1" dur="5s" repeatCount="indefinite" />
        <path d="M55 30 L51 6 L36 20 Z" fill="url(#am-hair)" />
        <path d="M51 24 L49 12 L41 20 Z" fill="#fbcfe8" />
      </g>

      {/* face */}
      <ellipse cx="32" cy="37" rx="21" ry="19" fill="#fff1f2" />
      {/* bangs */}
      <path d="M11 34 C11 18 22 13 32 13 C42 13 53 18 53 34 C49 27 45 25 42 24 C41 28 38 30 35 30 C36 27 35 25 34 24 C31 28 26 30 21 30 C23 28 24 26 24 24 C19 26 14 29 11 34 Z" fill="url(#am-hair)" />

      {/* eyes */}
      <g>
        <g>
          <ellipse cx="23" cy="40" rx="5" ry="6.5" fill="url(#am-eye)">
            <animate attributeName="ry" values="6.5;6.5;.6;6.5" keyTimes="0;.9;.95;1" dur="4s" repeatCount="indefinite" />
          </ellipse>
          <ellipse cx="41" cy="40" rx="5" ry="6.5" fill="url(#am-eye)">
            <animate attributeName="ry" values="6.5;6.5;.6;6.5" keyTimes="0;.9;.95;1" dur="4s" repeatCount="indefinite" />
          </ellipse>
          <g fill="#fff">
            <animate attributeName="opacity" values="1;1;0;1" keyTimes="0;.9;.95;1" dur="4s" repeatCount="indefinite" />
            <circle cx="21.2" cy="37.5" r="2" />
            <circle cx="39.2" cy="37.5" r="2" />
            <circle cx="24.6" cy="43" r="1" />
            <circle cx="42.6" cy="43" r="1" />
          </g>
        </g>
      </g>

      {/* blush + mouth */}
      <ellipse cx="16" cy="47" rx="3.5" ry="2" fill="#f9a8d4" opacity=".8" />
      <ellipse cx="48" cy="47" rx="3.5" ry="2" fill="#f9a8d4" opacity=".8" />
      <path d="M29 48 Q30.5 50 32 48 Q33.5 50 35 48" fill="none" stroke="#9d174d" strokeWidth="1.4" strokeLinecap="round" />

      {/* sparkle */}
      <path d="M54 44 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2 Z" fill="#fde68a">
        <animate attributeName="opacity" values="0;1;0" dur="2.4s" repeatCount="indefinite" />
      </path>
    </svg>
  )
}
