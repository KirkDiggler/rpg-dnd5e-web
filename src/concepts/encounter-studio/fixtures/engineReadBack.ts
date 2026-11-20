/**
 * THE ENGINE'S READ-BACK OF THE SERVED CASTLE (rpg-project#968, #978),
 * recorded from rpg-toolkit `main` cdc616bd: `readback.Of` on rpg-api
 * `dev`'s `content/the-mad-king.yaml` (the same bytes as
 * `the-mad-king-served.yaml`), marshalled with `folded` set to
 * `rb.Folded()`, as the api maps it. The JSON is the engine's exported shape
 * (snake_case `not_yet_said`), which `ReadBack` mirrors field for field, so
 * it parses with the proto's own JSON reader.
 *
 * Trimmed to what the tests read. Statements: the Guard Captain's group and
 * the routine he uses (`captain-policy`); gate-1's first twelve statements
 * and its `troupe` line; Knight keep-1, Knight keep-2 and the Mad King, whose
 * "No lines of its own" entries share one path; from the place, the statements about the grate, the
 * altar, the gate door and the kitchen passage, and the two joins set at the
 * grate's relocate paths. Folded: the captain's, gate-1's (cut to the
 * entries over those statements), keep-1's, keep-2's and the king's entries, `captain-policy`, and the
 * place's entries over the kept statements. Every kept sentence and entry
 * text is the engine's, unedited.
 *
 * THE RENAME (rpg-project#1005), FIRST PASS. In every pinned file below, each
 * sentence, entry text and path the rename changed is re-taken from
 * `rulebooks/dnd5e/encounter` v0.221.0 (rpg-toolkit 79bcc525, the same tree;
 * `readback.Of` with `folded` as `rb.Folded()`, on the castle at the tag): the old engine's read-back and the new one's, on the castle before
 * and after the rename, align string for string, and each string that differs
 * replaced its old form here. Strings the rename did not touch are as recorded.
 *
 * THE CAPTAIN GOES BACK TO HIS GATE (rpg-project#1000), at
 * `rulebooks/dnd5e/encounter` v0.222.0 (rpg-toolkit aef9cc40), the castle that
 * adds the captain's `back-to-gate` state and his step to it on `heard`. The
 * read-backs at v0.221.0 and v0.222.0 were compared statement by statement
 * (by kind, path and subject) and entry by entry (by paths): a group or list
 * a file kept whole is the v0.222.0 one whole (machines.json's
 * `captain-policy` still without its rows); in a trimmed one each kept
 * statement or entry is its v0.222.0 form, and the captain's post entry is
 * the v0.222.0 one, which folds both his posts. Nothing here is hand-written.
 *
 * THE NOTED WORDS (rpg-project#1005, as re-ruled), at
 * `rulebooks/dnd5e/encounter` v0.222.1 (rpg-toolkit 5d612401). The read-backs
 * at v0.222.0 and v0.222.1 align string for string (the castle changed in
 * words only); each of the 59 strings that differ replaced its v0.222.0 form
 * wherever it appears here (58 places).
 */
import { fromJson, type JsonValue } from '@bufbuild/protobuf';
import {
  GetMachineWordsResponseSchema,
  ReadBackSchema,
  ReadBackStatementSchema,
  type GetMachineWordsResponse,
  type ReadBack,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import castleJson from './engineReadBack.castle.json?raw';
import castleConversationsJson from './engineReadBack.castleConversations.json?raw';
import claimStepJson from './engineReadBack.claimStep.json?raw';
import conversationsJson from './engineReadBack.conversations.json?raw';
import machinesJson from './engineReadBack.machines.json?raw';
import machines225Json from './engineReadBack.machines225.json?raw';
import machines228Json from './engineReadBack.machines228.json?raw';
import placesJson from './engineReadBack.places.json?raw';
import routinesJson from './engineReadBack.routines.json?raw';
import threadsJson from './engineReadBack.threads.json?raw';
import machineWordsJson from './machineWords.v0.225.0.json?raw';

export function castleEngineReadBack(): ReadBack {
  return fromJson(ReadBackSchema, JSON.parse(castleJson) as JsonValue);
}

/**
 * THE CASTLE'S JOINS AND WAYS (rpg-project#972, #974), recorded the same way
 * from rpg-toolkit `main` f3deb20f (`rulebooks/dnd5e/encounter` v0.218.1:
 * the bar model, and a check's tool said as a `with` part of its approach,
 * rpg-toolkit#2444) on the same castle bytes: the site group "Where the
 * places join" whole — 12 joins and their 29 ways — and nothing else. Every
 * sentence and connection is the engine's, unedited.
 */
export function castlePlacesReadBack(): ReadBack {
  return fromJson(ReadBackSchema, JSON.parse(placesJson) as JsonValue);
}

/**
 * THE CASTLE'S HUBS (rpg-project#973), recorded the same way from
 * rpg-toolkit `main` cdefe89a on the same castle bytes: the "Topics" and
 * "Facts" sections cut to the topics `admitted` and `jailed` and the facts
 * `feast-tonight`, `guards-turned`, `king-is-cultist` and
 * `party-recognized` and `throne-taken`, the scullion's group, the whole
 * "Records" and "Secrets" sections, and the site's own statements about the
 * record `kitchen-way` and the secret `kitchen-passage` (re-recorded from
 * `main` bb5806f7, encounter v0.219.0), with their folded entries. Every
 * sentence and entry is the engine's, unedited.
 */
export function castleThreadsReadBack(): ReadBack {
  return fromJson(ReadBackSchema, JSON.parse(threadsJson) as JsonValue);
}

/**
 * THE CASTLE'S BEHAVIOURS (rpg-project#970), recorded the same way from
 * rpg-toolkit `main` bb5806f7 on the same castle bytes: the "Routines"
 * section, each of the ten groups cut to its first three statements (the
 * routine's own, with who runs it, and its first states), and the folded
 * Routines entries without their sub-entries. Every sentence is the
 * engine's, unedited.
 */
export function castleRoutinesReadBack(): ReadBack {
  return fromJson(ReadBackSchema, JSON.parse(routinesJson) as JsonValue);
}

/**
 * THE CASTLE'S MACHINES, WITH THEIR SHAPE (rpg-project#994, #995), recorded
 * from `rulebooks/dnd5e/encounter` v0.220.0 (the tag rpg-api `dev` pins at
 * 7a5d8313): `readback.Of` on rpg-api `dev`'s `content/the-mad-king.yaml`,
 * marshalled with `folded` set to `rb.Folded()`, as the api maps it.
 * Trimmed to the "Routines" section (every routine row cut but
 * `gate-1-policy`'s), from "Creatures" each creature's `creature.routine`,
 * `creature.post` and `creature.blocking` statements, and the folded
 * "Routines" section. Every kept sentence, connection and entry is the
 * engine's, unedited.
 */
export function castleMachinesReadBack(): ReadBack {
  return fromJson(ReadBackSchema, JSON.parse(machinesJson) as JsonValue);
}

/**
 * THE CAPTAIN'S STEP ON A LIE, WITH THE CLAIM IT ASKS (rpg-project#1000,
 * #1012), recorded from `rulebooks/dnd5e/encounter` v0.222.2 (rpg-toolkit
 * a53258e4, the first tag that says a step's heard claim as a connection):
 * `readback.Of` on the toolkit's own castle,
 * `dungeonspec/testdata/world-builder-v4-castle.yaml`, the one
 * `routine.wake` at `behaviorDefinitions.captain-policy.recipe.states.in-hall.transitions[1]`,
 * marshalled as the engine exports it. Its sentence is the one
 * `castleMachinesReadBack` already holds at that path, word for word; the
 * tag adds the `{claim, failed, asks}` connection. Unedited.
 *
 * `castleMachinesReadBack` with that statement in place of the pinned one:
 * the castle's machines as the engine says them from v0.222.2 on.
 */
export function castleMachinesWithClaimReadBack(): ReadBack {
  const readBack = castleMachinesReadBack();
  const step = fromJson(
    ReadBackStatementSchema,
    JSON.parse(claimStepJson) as JsonValue
  );
  let replaced = false;
  for (const group of readBack.sections.flatMap((section) => section.groups))
    group.statements = group.statements.map((statement) => {
      if (statement.kind !== step.kind || statement.path !== step.path)
        return statement;
      replaced = true;
      return step;
    });
  if (!replaced) throw new Error(`no statement at ${step.path} to replace`);
  return readBack;
}

/**
 * THE CASTLE'S MACHINES WITH EVERY STEP'S WHOLE CONDITION (rpg-project#1015,
 * #1001 items 12 and 16), recorded at rpg-api `dev` e0fe69a8 (encounter
 * v0.225.0, protos v0.1.282): a throwaway test in rpg-api's authoring
 * handler package ran `readback.Of` on `content/the-mad-king.yaml` and
 * mapped it with the handler's own `readBackToProto(rb, rb.Folded())`,
 * marshalled with `protojson` (proto field names): the read-back as the
 * wire carries it. Trimmed as `castleMachinesReadBack` is: the "Routines"
 * section (every routine row cut but `gate-1-policy`'s), from "Creatures"
 * each creature's `creature.routine`, `creature.post` and
 * `creature.blocking` statements, and the folded "Routines" section. Every
 * kept sentence, connection and entry is the engine's, unedited.
 *
 * A second file beside the v0.220.0 one, not in its place: that one is the
 * shape an engine with no condition connections sends, which the drawing
 * still falls back to and the watch's tests pin.
 */
export function castleMachinesV225ReadBack(): ReadBack {
  return fromJson(ReadBackSchema, JSON.parse(machines225Json) as JsonValue);
}

/**
 * THE ENGINE'S MACHINE WORDS (rpg-project#1015), recorded the same way:
 * the handler's own `machineWordsToProto(encounter.MachineWords(),
 * "v0.225.0")`, marshalled with `protojson`: the answer `GetMachineWords`
 * gives at encounter v0.225.0. Unedited.
 */
export function machineWordsV225(): GetMachineWordsResponse {
  return fromJson(
    GetMachineWordsResponseSchema,
    JSON.parse(machineWordsJson) as JsonValue
  );
}

/**
 * THE CASTLE'S MACHINES WITH EVERY ACT OF A STEP (rpg-project#1015, #1001
 * item 4), recorded the same way as `castleMachinesV225ReadBack` at rpg-api
 * `dev` abf88ba5 (encounter v0.228.0, protos unchanged at v0.1.282) and
 * trimmed the same way. Each step's acts are `{act, <word>, does, is?, at}`
 * connections beside the unchanged `to` and `picks` edges. The castle
 * declares no flag, so it has no `routine.flag` statement and no `flag`
 * connection. The `GetMachineWords` answer at v0.228.0 is the v0.225.0
 * one but for its `encounter_version`. Unedited.
 */
export function castleMachinesV228ReadBack(): ReadBack {
  return fromJson(ReadBackSchema, JSON.parse(machines228Json) as JsonValue);
}

/**
 * THE CONVERSATIONS SITE'S READ-BACK (rpg-project#1025, #1027), taken from
 * rpg-toolkit's golden `rulebooks/dnd5e/encounter/dungeonspec/readback/
 * testdata/conversations-site.readback.json` at `rulebooks/dnd5e/encounter`
 * v0.232.1 (rpg-toolkit d223f26a), the engine's read-back of
 * `conversations-site.yaml` (copied beside it). Trimmed to the three
 * creatures' groups and the group "The lines of `gate-claims`"; every kept
 * statement is the engine's, unedited.
 */
export function conversationsSiteReadBack(): ReadBack {
  return fromJson(ReadBackSchema, JSON.parse(conversationsJson) as JsonValue);
}

/** THE CASTLE'S CONVERSATIONS (rpg-project#1030): `readback.Of` at
 * `rulebooks/dnd5e/encounter` v0.234.0 on rpg-api `dev` cf3b4125's
 * `content/the-mad-king.yaml` (`the-mad-king-conversations.yaml`), trimmed
 * to the statements at `conversations.*` paths and at every `…options[i]`
 * path (the conversations' lines, every carrier's own lines and `use:`
 * entries, and the ways, hubs and per-carrier statements the engine also
 * sets at those paths), and each conversation's `conversation.transition`
 * statements (its steps). Every kept statement is the
 * engine's, unedited, but for a connection's `not`, renamed `negated` as the
 * api maps it. */
export function castleConversationsReadBack(): ReadBack {
  return fromJson(
    ReadBackSchema,
    JSON.parse(castleConversationsJson) as JsonValue
  );
}
