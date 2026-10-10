'use client';

import { useState } from 'react';
import { Button, Field, Segmented, inputClass } from '@/components/saathi/ui';
import { RELATION_LABELS } from '@/lib/brief';
import { type Profile, type Relation, type Sex, actions } from '@/lib/saathi-store';

const BLANK: Omit<Profile, 'id'> = {
  name: '',
  relation: 'self',
  age: '',
  sex: '',
  phone: '',
  conditions: '',
  medications: '',
  allergies: '',
};

export function ProfileForm({
  initial,
  submitLabel,
  onDone,
  onCancel,
}: {
  initial?: Profile;
  submitLabel: string;
  onDone?: (id: string) => void;
  onCancel?: () => void;
}) {
  const [p, setP] = useState<Omit<Profile, 'id'> & { id?: string }>(initial ?? BLANK);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((cur) => ({ ...cur, [k]: v }));
  const valid = p.name.trim().length > 0;
  const isSelf = p.relation === 'self';

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onDone?.(actions.saveProfile({ ...p, name: p.name.trim() }));
      }}
    >
      <Segmented<Relation>
        label="Who is this profile for?"
        value={p.relation}
        onChange={(v) => set('relation', v)}
        options={(Object.keys(RELATION_LABELS) as Relation[]).map((r) => ({
          value: r,
          label: RELATION_LABELS[r],
        }))}
      />

      <div className="grid gap-5 sm:grid-cols-[1fr_120px]">
        <Field label={isSelf ? 'Your name' : 'Their name'}>
          {(id) => (
            <input
              id={id}
              required
              autoComplete={isSelf ? 'name' : 'off'}
              className={inputClass}
              value={p.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder={isSelf ? 'Ayesha Khan' : 'Ammi'}
            />
          )}
        </Field>
        <Field label="Age">
          {(id) => (
            <input
              id={id}
              inputMode="numeric"
              className={inputClass}
              value={p.age}
              onChange={(e) => set('age', e.target.value.replace(/\D/g, '').slice(0, 3))}
              placeholder="34"
            />
          )}
        </Field>
      </div>

      <Segmented<Exclude<Sex, ''>>
        label="Sex"
        value={p.sex || null}
        onChange={(v) => set('sex', v)}
        options={[
          { value: 'female', label: 'Female' },
          { value: 'male', label: 'Male' },
          { value: 'other', label: 'Other' },
        ]}
      />

      <Field
        label="WhatsApp number"
        hint="The number you will call Saathi from, with country code."
      >
        {(id) => (
          <input
            id={id}
            type="tel"
            autoComplete="tel"
            className={inputClass}
            value={p.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="+92 300 1234567"
          />
        )}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Ongoing conditions">
          {(id) => (
            <textarea
              id={id}
              rows={3}
              className={inputClass}
              value={p.conditions}
              onChange={(e) => set('conditions', e.target.value)}
              placeholder="Type 2 diabetes, high blood pressure"
            />
          )}
        </Field>
        <Field label="Medicines taken regularly">
          {(id) => (
            <textarea
              id={id}
              rows={3}
              className={inputClass}
              value={p.medications}
              onChange={(e) => set('medications', e.target.value)}
              placeholder="Metformin 500mg twice a day"
            />
          )}
        </Field>
      </div>

      <Field label="Allergies">
        {(id) => (
          <input
            id={id}
            className={inputClass}
            value={p.allergies}
            onChange={(e) => set('allergies', e.target.value)}
            placeholder="Penicillin, peanuts. Leave blank if none."
          />
        )}
      </Field>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button type="submit" disabled={!valid}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
