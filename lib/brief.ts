import type { Intake, Profile, Relation, Since } from '@/lib/saathi-store';

export const BODY_AREAS = [
  'Head',
  'Eyes',
  'Ear, nose, throat',
  'Mouth & teeth',
  'Chest',
  'Stomach',
  'Back',
  'Arms & hands',
  'Legs & feet',
  'Skin',
  'Whole body',
] as const;

export const SINCE_LABELS: Record<Exclude<Since, ''>, string> = {
  today: 'Today',
  'few-days': '1–3 days',
  'this-week': 'This week',
  longer: 'Longer than a week',
};

export const RELATION_LABELS: Record<Relation, string> = {
  self: 'Me',
  parent: 'My parent',
  child: 'My child',
  spouse: 'My spouse',
  other: 'Someone else',
};

/** Symptoms that mean "get emergency care now", not "talk to Saathi". */
export const RED_FLAGS = [
  'Chest pain or pressure',
  'Trouble breathing',
  'Heavy bleeding that will not stop',
  'Fainting, seizure or sudden confusion',
  'Face drooping, arm weakness or slurred speech',
  'Thoughts of harming yourself',
] as const;

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? '';
}

/**
 * The brief Saathi receives before a consult. The same text is pre-filled into the WhatsApp
 * message and sent to the video agent as the `saathi.brief` participant attribute, so both
 * channels start from identical notes.
 */
export function buildBrief(profile: Profile, intake: Intake) {
  const who =
    profile.relation === 'self'
      ? profile.name
      : `${profile.name} (${RELATION_LABELS[profile.relation].replace('My ', 'my ')})`;
  const lines = [
    `Saathi consult ${intake.ref || ''}`.trim(),
    `Patient: ${who}${profile.age ? `, ${profile.age}` : ''}${profile.sex ? `, ${profile.sex}` : ''}`,
    `Concern: ${intake.concern.trim()}`,
  ];
  if (intake.areas.length) lines.push(`Where: ${intake.areas.join(', ')}`);
  if (intake.since) lines.push(`Started: ${SINCE_LABELS[intake.since]}`);
  if (intake.severity) lines.push(`Severity: ${intake.severity}/10`);
  if (intake.redFlags.length) lines.push(`Red flags reported: ${intake.redFlags.join('; ')}`);
  if (profile.conditions.trim()) lines.push(`Conditions: ${profile.conditions.trim()}`);
  if (profile.medications.trim()) lines.push(`Medicines: ${profile.medications.trim()}`);
  if (profile.allergies.trim()) lines.push(`Allergies: ${profile.allergies.trim()}`);
  return lines.join('\n');
}

/** Digits only, the form wa.me links expect (country code, no plus). */
export function waDigits(number: string) {
  return number.replace(/\D/g, '');
}

export function waChatLink(number: string, text: string) {
  return `https://wa.me/${waDigits(number)}?text=${encodeURIComponent(text)}`;
}

/** WhatsApp Business calling deep link. Opens a call on phones; not supported on desktop apps. */
export function waCallLink(number: string) {
  return `https://wa.me/call/${waDigits(number)}`;
}
