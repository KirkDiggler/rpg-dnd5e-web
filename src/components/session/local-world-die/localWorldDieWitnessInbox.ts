import { clone } from '@bufbuild/protobuf';
import {
  DiceThrowPlanSchema,
  type DiceThrowPlan,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/presentation/v1alpha1/service_pb';
import {
  admitLocalWorldDieWitnessPlan,
  type LocalWorldDieWitnessExpectation,
  type LocalWorldDieWitnessPlan,
} from './localWorldDieWitnessPlan';

interface BufferedPlan {
  readonly identity: string;
  readonly receivedAt: number;
  readonly plan: DiceThrowPlan;
}

function identity(plan: DiceThrowPlan) {
  return `${plan.session.length}:${plan.session}:${plan.presentationId.length}:${plan.presentationId}:${plan.authoritySeq}:${plan.roller.length}:${plan.roller}:${plan.attempt}`;
}

/** A live-only, receipt-relative buffer for the independent Story/plan streams. */
export class LocalWorldDieWitnessInbox {
  readonly #ttlMs: number;
  readonly #capacity: number;
  readonly #onExpired: ((plan: DiceThrowPlan) => void) | undefined;
  #plans: BufferedPlan[] = [];

  /**
   * `onExpired` is called once for each buffered plan whose receipt window
   * closed without it ever being matched.
   *
   * This is the only observable symptom of a broken correlation between a
   * roller and a witness. Every other outcome on this path is indistinguishable
   * from normal operation: an unmatched plan is SUPPOSED to sit here while the
   * authoritative event catches up, so a rejection is not news. Expiry is.
   *
   * It cost a week to learn that. Shared dice broke the day after they shipped
   * — recipient-local sequence numbers made the roller's and the witness's
   * presentation ids permanently unequal — and nothing anywhere said so. The
   * plans arrived, failed to match, and were dropped in silence.
   *
   * Deliberately NOT a timer: expiry is noticed on the next prune, so a single
   * unmatched throw in an otherwise idle session is reported late or not at
   * all. That is the honest trade — a systematic break (every throw failing,
   * which is what this class of bug looks like) reports on the very next
   * throw, and no wall-clock machinery has to run to say nothing happened.
   */
  constructor(
    options: Readonly<{
      ttlMs: number;
      capacity: number;
      onExpired?: (plan: DiceThrowPlan) => void;
    }>
  ) {
    this.#ttlMs = Math.max(0, options.ttlMs);
    this.#capacity = Math.max(1, Math.floor(options.capacity));
    this.#onExpired = options.onExpired;
  }

  get size() {
    return this.#plans.length;
  }

  offer(
    wirePlan: DiceThrowPlan,
    expected: LocalWorldDieWitnessExpectation | undefined,
    now: number
  ): LocalWorldDieWitnessPlan | undefined {
    this.#prune(now);
    if (expected) {
      const admitted = admitLocalWorldDieWitnessPlan(wirePlan, expected);
      if (admitted) return admitted;
    }

    const planIdentity = identity(wirePlan);
    this.#plans = this.#plans.filter(
      (candidate) => candidate.identity !== planIdentity
    );
    this.#plans.push(
      Object.freeze({
        identity: planIdentity,
        receivedAt: now,
        plan: clone(DiceThrowPlanSchema, wirePlan),
      })
    );
    if (this.#plans.length > this.#capacity) {
      this.#plans = this.#plans.slice(-this.#capacity);
    }
    return undefined;
  }

  reconsider(
    expected: LocalWorldDieWitnessExpectation,
    now: number
  ): LocalWorldDieWitnessPlan | undefined {
    this.#prune(now);
    for (let index = 0; index < this.#plans.length; index += 1) {
      const admitted = admitLocalWorldDieWitnessPlan(
        this.#plans[index]!.plan,
        expected
      );
      if (!admitted) continue;
      this.#plans.splice(index, 1);
      return admitted;
    }
    return undefined;
  }

  clear() {
    this.#plans = [];
  }

  #prune(now: number) {
    const kept: BufferedPlan[] = [];
    const expired: BufferedPlan[] = [];
    for (const candidate of this.#plans) {
      if (now - candidate.receivedAt <= this.#ttlMs) kept.push(candidate);
      else expired.push(candidate);
    }
    // Drop first, report second: a listener that throws must not leave this
    // inbox still holding plans it has already decided are gone.
    this.#plans = kept;
    if (!this.#onExpired) return;
    for (const candidate of expired) this.#onExpired(candidate.plan);
  }
}
