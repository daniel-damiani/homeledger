import type { CoachTip } from "@/lib/coaching";

export function CoachPanel({ tips }: { tips: CoachTip[] }) {
  return (
    <section className="panel">
      <h2>Coach</h2>
      {tips.map((t) => (
        <div key={t.id} className={`tip ${t.severity}`}>
          <strong>{t.title}</strong>
          <span>{t.body}</span>
        </div>
      ))}
    </section>
  );
}