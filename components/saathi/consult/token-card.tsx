import { RELATION_LABELS, SINCE_LABELS } from '@/lib/brief';
import type { Intake, Profile } from '@/lib/saathi-store';

/** The consult token and the notes it carries. The token ties chat, call and video together. */
export function TokenCard({ profile, intake }: { profile: Profile; intake: Intake }) {
  const details = [
    intake.areas.length > 0 && { k: 'Where', v: intake.areas.join(', ') },
    intake.since && { k: 'Started', v: SINCE_LABELS[intake.since] },
    intake.severity && { k: 'Severity', v: `${intake.severity} / 10` },
    profile.medications.trim() && { k: 'Medicines', v: profile.medications },
    profile.allergies.trim() && { k: 'Allergies', v: profile.allergies },
  ].filter(Boolean) as { k: string; v: string }[];

  return (
    <article
      aria-label="Consult token"
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl shadow-gray-900/5"
    >
      <div className="bg-brand relative overflow-hidden px-6 py-6 text-white sm:px-8">
        <div
          aria-hidden
          className="absolute -top-20 -right-20 size-56 rounded-full bg-[radial-gradient(circle,rgb(255_255_255/0.12),transparent_65%)]"
        />
        <p className="relative text-sm text-gray-300">Consult token</p>
        <p className="font-display tracking-display-sm relative mt-1 text-5xl leading-none tabular-nums">
          {intake.ref || '····'}
        </p>
      </div>
      <div className="px-6 py-6 sm:px-8">
        <p className="text-sm text-gray-500">
          {RELATION_LABELS[profile.relation]}
          {profile.age && ` · ${profile.age} yrs`}
          {profile.sex && ` · ${profile.sex}`}
        </p>
        <p className="font-display tracking-display-sm mt-1 text-2xl text-gray-900">
          {profile.name}
        </p>
        <p className="mt-4 text-[15px] leading-relaxed text-gray-800">“{intake.concern.trim()}”</p>
        {details.length > 0 && (
          <dl className="mt-6 grid gap-x-6 gap-y-3 border-t border-gray-100 pt-5 text-sm sm:grid-cols-2">
            {details.map((d) => (
              <div key={d.k}>
                <dt className="text-xs text-gray-500">{d.k}</dt>
                <dd className="mt-0.5 text-gray-900">{d.v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </article>
  );
}
