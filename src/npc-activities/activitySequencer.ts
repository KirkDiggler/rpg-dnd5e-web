import type { ActivityCueRequest, NpcActivityProfile } from './activityTypes';

export type ActivityPhase = 'stopped' | 'enter' | 'sustain' | 'exit';
export interface ActivityState {
  readonly activity: string;
  readonly requested: string;
  readonly phase: ActivityPhase;
  readonly serial: number;
  readonly walkingReady: boolean;
  readonly cueId: string | undefined;
}
export interface ActivityPlay {
  readonly clip: string;
  readonly phase: Exclude<ActivityPhase, 'stopped'>;
  readonly serial: number;
  readonly cycles?: number;
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
  private cue:
    | (ActivityCueRequest & { returnTo: string; started: boolean })
    | undefined;
  constructor(private readonly input: SequencerInput) {}

  get state(): ActivityState {
    return {
      activity: this.activity,
      requested: this.requested,
      phase: this.phase,
      serial: this.serial,
      cueId: this.cue?.id,
      walkingReady:
        this.phase === 'sustain' &&
        this.activity === this.input.profile.walkActivityRef,
    };
  }

  reset(activity: string): void {
    this.require(activity);
    this.cue = undefined;
    this.activity = activity;
    this.requested = activity;
    this.begin('sustain');
  }

  stop(): void {
    this.cue = undefined;
    this.phase = 'stopped';
    this.requested = this.activity;
    this.serial++;
    this.changed();
  }

  /** Counted intent shares the same transitions and never holds movement. */
  requestCue(cue: ActivityCueRequest, returnTo: string): void {
    const activity = this.input.profile.activities[cue.activityRef];
    if (
      !Object.hasOwn(this.input.profile.activities, cue.activityRef) ||
      activity.moving ||
      !cue.id ||
      !Number.isInteger(cue.cycles) ||
      cue.cycles < 1 ||
      cue.cycles > 4294967295
    )
      throw new Error(`Unsupported activity cue: ${cue.activityRef}`);
    this.require(returnTo);
    if (this.phase === 'stopped' || this.cue?.id === cue.id) return;
    this.cue = { ...cue, returnTo, started: false };
    this.requested = cue.activityRef;
    if (
      this.phase === 'sustain' &&
      this.activity !== this.requested &&
      this.require(this.activity).leaveAt === 'any-time'
    )
      this.leave();
    this.changed();
  }

  request(activity: string): void {
    this.require(activity);
    this.cue = undefined;
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
    else if (this.phase === 'sustain') {
      if (this.requested !== this.activity) this.leave();
      else if (this.cue && !this.cue.started) this.begin('sustain');
      else {
        const target = this.cue?.returnTo ?? this.requested;
        this.cue = undefined;
        this.requested = target;
        if (target === this.activity) this.begin('sustain');
        else this.leave();
      }
    }
  }

  loop(serial: number): void {
    if (serial !== this.serial || this.phase !== 'sustain') return;
    if (this.activity !== this.requested) this.leave();
    // A replacement for the same activity starts a full new budget at a
    // boundary, rather than counting the partial cycle of the old response.
    else if (this.cue && !this.cue.started) this.begin('sustain');
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
    const counted =
      phase === 'sustain' && this.cue?.activityRef === this.activity;
    if (counted && this.cue) this.cue.started = true;
    this.input.play({
      clip,
      phase,
      serial: this.serial,
      ...(counted ? { cycles: this.cue!.cycles } : {}),
    });
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
