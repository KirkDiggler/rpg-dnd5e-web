import type { NpcActivityProfile } from './activityTypes';

export type ActivityPhase = 'stopped' | 'enter' | 'sustain' | 'exit';
export interface ActivityState {
  readonly activity: string;
  readonly requested: string;
  readonly phase: ActivityPhase;
  readonly serial: number;
  readonly walkingReady: boolean;
}
export interface ActivityPlay {
  readonly clip: string;
  readonly phase: Exclude<ActivityPhase, 'stopped'>;
  readonly serial: number;
}
interface SequencerInput {
  readonly profile: NpcActivityProfile;
  readonly play: (input: ActivityPlay) => void;
  readonly changed?: (state: ActivityState) => void;
}

/** Presentation only. The mixer supplies boundaries; no clock or game queue. */
export class ActivitySequencer {
  private activity = '';
  private requested = '';
  private phase: ActivityPhase = 'stopped';
  private serial = 0;
  constructor(private readonly input: SequencerInput) {}

  get state(): ActivityState {
    return {
      activity: this.activity,
      requested: this.requested,
      phase: this.phase,
      serial: this.serial,
      walkingReady:
        this.phase === 'sustain' &&
        this.activity === this.input.profile.walkActivityRef,
    };
  }

  reset(activity: string): void {
    this.require(activity);
    this.activity = activity;
    this.requested = activity;
    this.begin('sustain');
  }

  stop(): void {
    this.phase = 'stopped';
    this.requested = this.activity;
    this.serial++;
    this.changed();
  }

  request(activity: string): void {
    this.require(activity);
    if (this.phase === 'stopped') return;
    this.requested = activity;
    if (
      this.phase === 'sustain' &&
      this.activity !== activity &&
      this.require(this.activity).leaveAt === 'any-time'
    )
      this.leave();
    this.changed();
  }

  finished(serial: number): void {
    if (serial !== this.serial) return;
    if (this.phase === 'enter') {
      if (this.requested !== this.activity) this.leave();
      else this.begin('sustain');
    } else if (this.phase === 'exit') this.arrive();
  }

  loop(serial: number): void {
    if (
      serial === this.serial &&
      this.phase === 'sustain' &&
      this.activity !== this.requested
    )
      this.leave();
  }

  private require(activity: string) {
    if (!Object.hasOwn(this.input.profile.activities, activity))
      throw new Error(`Unknown activity: ${activity}`);
    return this.input.profile.activities[activity];
  }

  private changed(): void {
    this.input.changed?.(this.state);
  }

  private begin(phase: Exclude<ActivityPhase, 'stopped'>): void {
    const clip = this.require(this.activity)[phase];
    if (!clip) throw new Error(`Missing ${phase} clip: ${this.activity}`);
    this.phase = phase;
    this.serial++;
    this.input.play({ clip, phase, serial: this.serial });
    this.changed();
  }

  private leave(): void {
    if (this.require(this.activity).exit) this.begin('exit');
    else this.arrive();
  }

  private arrive(): void {
    const from = this.require(this.activity);
    const to = this.require(this.requested);
    if (
      from.exitPose !== to.entryPose &&
      !this.input.profile.poseBridges.includes(
        `${from.exitPose}→${to.entryPose}`
      )
    )
      throw new Error(`No pose bridge: ${from.exitPose}→${to.entryPose}`);
    this.activity = this.requested;
    this.begin(to.enter ? 'enter' : 'sustain');
  }
}
