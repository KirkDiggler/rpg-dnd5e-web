/** Provider-owned presentation vocabulary; never a gameplay command. */
export interface NpcActivity {
  readonly label: string;
  readonly entryPose: string;
  readonly exitPose: string;
  readonly enter: string | null;
  readonly sustain: string;
  readonly exit: string | null;
  readonly leaveAt: 'any-time' | 'loop-boundary';
  readonly moving: boolean;
}

export interface NpcActivityProfile {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly jointCount: number;
  readonly library: {
    readonly url: string;
    readonly sha256: string;
    readonly clips: readonly string[];
  };
  readonly defaultActivityRef: string;
  readonly walkActivityRef: string;
  readonly activities: Readonly<Record<string, NpcActivity>>;
  readonly poseBridges: readonly string[];
  readonly appearances: readonly {
    readonly assetRef: string;
    readonly standingSha256: string;
  }[];
}
