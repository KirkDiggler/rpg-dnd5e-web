# #856 remaining modular Elf class models

Status: **production-route verified** against merged provider PR #86.

## Provider authority

The ignored runtime tree was synced from exact merged provider commit `b62c1e55c0a419e25a5a412f9bf3dccf0421df07` through a detached provider worktree. The generated race/class manifest SHA-256 is `30efda1002b6cc9bd0286c18fd2e3275f25e8505f4ebf524236dd7eff33217cd`.

| Public combination | Model SHA-256 |
|---|---|
| `elf:barbarian` | `e436883e6adf7e9912bffafc8734351cd970fb6154263e0fe96e842f490ef80d` |
| `elf:fighter` | `3060e6bc2712c3699c3abceb78480fd24007d628ef9c928c5bcffcd53ca7aa39` |
| `elf:monk` | `4167695e5268a84dfdbf202a883c6012825216902afa60f7b88bbc6349236206` |
| `elf:rogue` | `939e38fbb1121a6b185e7edf427f6b0a7867597a004e94c41f0982db3df82365` |

All four exact entries use `modular-fantasy-hero-v1`, `modular-fantasy-hero-main-hand-v1`, opaque `Chr_Hair_01`, `Idle_Relaxed`, and `Walk_Forward`. Synced GLBs and the provider manifest remain ignored and untracked.

## Real route

Three characters were created through the normal character flow under isolated dev identities and joined one Reference Tomb session:

- `B856 Elf Barbarian`
- `B856 Elf Monk`
- `B856 Elf Rogue`

Fresh browser contexts observed HTTP `200` and exact response hashes for all three new race/class GLBs. The characters rendered together from public roster identity. The Barbarian moved through the real session route (`B856 Elf Barbarian moves — Position -1, 4.`), and `Walking…` was observed.

Each character equipped an authoritative carried weapon through the production Equipment UI:

- Barbarian — Greataxe
- Monk — Shortsword
- Rogue — Rapier

Fresh owner contexts observed HTTP `200` for each weapon model. The screenshots show the shared modular socket applied without a class-specific transform.

## Captures

- `three-elf-classes-close-real-route.png` — all three new Elf class silhouettes together.
- `three-elf-classes-rotated-real-route.png` — the same party after a production-camera rotation.
- `barbarian-walk-real-route.png` — real movement story plus attached Greataxe.
- `monk-shortsword-real-route.png` — authoritative Monk Shortsword attachment.
- `rogue-rapier-real-route.png` — authoritative Rogue Rapier attachment.

The zero error counts in `receipt.json` apply only to the captured proof window after the session route and model responses settled. Known route-transition aborts and the lab image's unimplemented authoring-gate probe occurred outside the captured proof window and are not represented as product-route errors.

## Fallback scope

Automated tests preserve exact standing resolution, class-specific Townfolk downed fallback, class fallback for unavailable combinations, `MediumHumanoid` recovery, local public identity, visible-peer public identity, and the one modular rig-family socket. No API, proto, toolkit, renderer, runtime assembly, customization, downed model, or portrait change is included.
