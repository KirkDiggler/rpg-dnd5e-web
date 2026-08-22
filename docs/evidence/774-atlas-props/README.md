# #774 — Atlas props on the session route

Captured from `feat/774-render-atlas-props` at `http://localhost:3003` against
the healthy local `rpg-api` dev container and its reference tomb.

`01-reference-tomb-props.png` shows the server-declared entrance braziers and
the first hall pillars rendered from their `dnd5e:props:*` references. These
are the same cells whose movement and sight blocking were already enforced;
they are no longer invisible.

The local API still reports its known `ListDungeons` and authoring endpoints as
unimplemented. Neither error affects the running session route or this render.
