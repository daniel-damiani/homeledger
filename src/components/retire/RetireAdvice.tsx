"use client";

import type { RetirementAdviceTip } from "@/lib/retirement";

export function RetireAdvice({ tips }: { tips: RetirementAdviceTip[] }) {
  if (tips.length === 0) return null;
  return (
    <section className="panel retire-advice">
      <h2 style={{ marginTop: 0 }}>What to change first</h2>
      {tips.map((t) => (
        <div key={t.id} className={`tip retire-tip ${t.severity}`}>
          <strong>{t.title}</strong>
          <p style={{ margin: "0.25rem 0 0" }}>{t.body}</p>
        </div>
      ))}
    </section>
  );
}
