/* ConditionTone — dot + word (never color-only). Ported from app/shared.jsx ToneDot + TONE_LABEL. */
import * as React from "react";
import { TONE_LABEL, type Tone } from "./constants";

export interface ConditionToneProps {
  tone: Tone;
  /** pill style (.pc-tone) instead of inline dot + word */
  chip?: boolean;
}

export function ConditionTone({ tone, chip }: ConditionToneProps) {
  if (chip) {
    return (
      <span className={"pc-tone " + tone}>
        <span className={"tone-dot tone-" + tone} aria-hidden="true" />
        {TONE_LABEL[tone]}
      </span>
    );
  }
  return (
    <span className="condition-tone">
      <span className={"tone-dot tone-" + tone} aria-hidden="true" /> {TONE_LABEL[tone]}
    </span>
  );
}
