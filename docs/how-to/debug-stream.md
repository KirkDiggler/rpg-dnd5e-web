---
name: debugging stream events with Chrome DevTools
description: How to verify whether RoomRevealed and other events reach the browser
updated: 2026-05-02
---

# Debugging stream events with Chrome DevTools

The blocking investigation for issue #380 is: does a `RoomRevealed` event reach the browser when a door is opened?

## Launch Chrome with DevTools MCP

```bash
/home/kirk/personal/scripts/rpg-chrome.sh
```

This opens Chrome on port 9222 with remote debugging enabled (see `ref_chrome_devtools_mcp.md`).

## Watch gRPC-Web stream events

1. Open DevTools → Network tab
2. Filter by `Fetch/XHR`
3. Find the `StreamEncounterEvents` request (type: `fetch`, stays open)
4. Click it → EventStream tab
5. Open a door in the game
6. Look for a `roomRevealed` event in the event stream

If you see the event in the network tab but not in the browser state, the bug is in the dispatch handler. If the event does not appear in the network tab, the issue is upstream (gRPC-Web transport, server-side emission, or the open-door RPC path).

## Console logging in useEncounterStream

`useEncounterStream.ts` has `console.log` calls at key points (line 246, 252). In development, the auth interceptor also logs every request/response. To isolate stream events:

```javascript
// In browser console, filter for stream messages:
// Filter: useEncounterStream
```

The `dispatchEvent` function at line 93 does not currently log which events it handles. A temporary `console.log('dispatchEvent:', eventPayload.case)` at the top of the switch would confirm which events are arriving.

## Confirming the RoomRevealed fix

PR #377 changes `handleRoomRevealed` to call `allRoomsFromEncounterState` instead of `roomFromEncounterState`. Before merging PR #377:

1. Confirm `RoomRevealed` arrives via network tab (above)
2. Confirm `onRoomRevealed` is called by adding a console.log to `handleRoomRevealed` in LobbyView
3. Confirm `addRoomToMap` is called with the new rooms
4. Verify the second room appears on the hex grid

Do not merge PR #377 until steps 1-4 are confirmed. The transform code is correct; the unknown is delivery.

## React StrictMode noise

In development, expect to see two `StreamEncounterEvents` requests open simultaneously (StrictMode double-mount). Both receive events. The second connection's events may be processed twice in the LobbyView event handlers if callbacks are not idempotent. When debugging, close one connection manually (abort the request in DevTools) to isolate a single stream.
