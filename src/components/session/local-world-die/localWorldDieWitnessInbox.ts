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
  #plans: BufferedPlan[] = [];

  constructor(options: Readonly<{ ttlMs: number; capacity: number }>) {
    this.#ttlMs = Math.max(0, options.ttlMs);
    this.#capacity = Math.max(1, Math.floor(options.capacity));
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
    this.#plans = this.#plans.filter(
      (candidate) => now - candidate.receivedAt <= this.#ttlMs
    );
  }
}
