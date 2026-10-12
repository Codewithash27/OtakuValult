export function AnimeMascot({ className = '' }: { className?: string }) {
  return (
    <img
      src="/kimetsu-avatar.png"
      alt="Kimetsu"
      className={`w-full h-full object-contain select-none pointer-events-none drop-shadow-md ${className}`}
      draggable={false}
    />
  )
}
