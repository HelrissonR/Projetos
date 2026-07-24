export default function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="card flex flex-col items-center justify-center py-16 text-center text-slate-400">
      <div className="mb-3 text-4xl">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  )
}
