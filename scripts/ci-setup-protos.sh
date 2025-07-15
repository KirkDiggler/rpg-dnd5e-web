#!/bin/bash
# Setup stub rpg-api-protos for CI environment

if [ ! -d "../rpg-api-protos" ]; then
  echo "Creating stub rpg-api-protos package for CI..."
  
  # Create directory structure
  mkdir -p ../rpg-api-protos/gen/ts/dnd5e/api/v1alpha1
  
  # Create minimal package.json
  cat > ../rpg-api-protos/package.json << 'EOF'
{
  "name": "@kirkdiggler/rpg-api-protos",
  "version": "0.1.0",
  "main": "gen/ts/dnd5e/api/v1alpha1/character_pb.js",
  "types": "gen/ts/dnd5e/api/v1alpha1/character_pb.d.ts"
}
EOF

  # Create stub TypeScript files with minimal exports
  cat > ../rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb.ts << 'EOF'
// CI Stub file
// @ts-nocheck
export const CharacterService = {
  typeName: "dnd5e.api.v1alpha1.CharacterService",
  methods: {
    getCharacter: { name: "GetCharacter", input: {}, output: {} },
    listCharacters: { name: "ListCharacters", input: {}, output: {} },
    getDraft: { name: "GetDraft", input: {}, output: {} },
    listDrafts: { name: "ListDrafts", input: {}, output: {} },
    createDraft: { name: "CreateDraft", input: {}, output: {} },
    updateName: { name: "UpdateName", input: {}, output: {} },
    updateRace: { name: "UpdateRace", input: {}, output: {} },
    updateClass: { name: "UpdateClass", input: {}, output: {} },
    updateBackground: { name: "UpdateBackground", input: {}, output: {} },
    updateAbilityScores: { name: "UpdateAbilityScores", input: {}, output: {} },
    updateSkills: { name: "UpdateSkills", input: {}, output: {} },
    validateDraft: { name: "ValidateDraft", input: {}, output: {} },
    finalizeDraft: { name: "FinalizeDraft", input: {}, output: {} },
    deleteDraft: { name: "DeleteDraft", input: {}, output: {} },
    deleteCharacter: { name: "DeleteCharacter", input: {}, output: {} }
  }
};
export type Character = any;
export type CharacterDraft = any;
export type CreateDraftRequest = any;
export type GetCharacterRequest = any;
export type GetDraftRequest = any;
export type ListCharactersRequest = any;
export type ListDraftsRequest = any;
export type UpdateNameRequest = any;
export type UpdateRaceRequest = any;
export type UpdateClassRequest = any;
export type UpdateBackgroundRequest = any;
export type UpdateAbilityScoresRequest = any;
export type UpdateSkillsRequest = any;
export type ValidateDraftRequest = any;
export type FinalizeDraftRequest = any;
export type DeleteDraftRequest = any;
export type DeleteCharacterRequest = any;
export type AbilityScores = any;
export type CreationProgress = any;
export type CreationStep = any;
EOF

  cat > ../rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb.ts << 'EOF'
// CI Stub file
// @ts-nocheck
export const Race = { UNSPECIFIED: 0 };
export const Class = { UNSPECIFIED: 0 };
export const Background = { UNSPECIFIED: 0 };
export const Skill = { UNSPECIFIED: 0 };
export const Ability = { UNSPECIFIED: 0 };
export const Alignment = { UNSPECIFIED: 0 };
export const Language = { UNSPECIFIED: 0 };
EOF

  cat > ../rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb.ts << 'EOF'
// CI Stub file
export type ValidationError = any;
export type ValidationWarning = any;
EOF

  echo "Stub rpg-api-protos created successfully"
else
  echo "rpg-api-protos directory already exists"
fi