export function PermivioMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="permivioGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#93C5FD" />
          <stop offset="50%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <path
        d="M14 8 L14 56 L24 56 L24 40 L34 40 C44 40 52 32 52 22 C52 14 46 8 36 8 Z M24 18 L34 18 C39 18 42 20 42 24 C42 28 39 30 34 30 L24 30 Z"
        fill="url(#permivioGrad)"
      />
    </svg>
  );
}

export function PermivioLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <PermivioMark className="h-6 w-6" />
      <span className="text-base font-semibold tracking-tight bg-gradient-to-b from-white to-blue-300 bg-clip-text text-transparent">
        Permivio
      </span>
    </div>
  );
}
