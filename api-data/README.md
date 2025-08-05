# API Data Snapshots

This directory contains snapshot responses from the rpg-api server, captured during development to aid in offline work and understanding the data structures.

## ⚠️ IMPORTANT: These are Development Artifacts

**These files are NOT the source of truth** - they are point-in-time captures for reference only.

## Files

- `classesResponse.json` - Sample response from ListClasses API
- `getDraftResponse.json` - Sample response from GetDraft API with a fighter character

## When to Update

These snapshots should be updated when:

1. The API proto definitions change significantly
2. The structure of the response changes
3. You need examples of new features/fields

## How to Update

```bash
# Start your local rpg-api server
# Then capture new responses:

# For classes response:
curl -X POST http://localhost:8080/dnd5e.api.v1alpha1.CharacterService/ListClasses \
  -H "Content-Type: application/json" \
  -d '{"page_size": 50}' | jq > api-data/classesResponse.json

# For draft response (replace with actual draft ID):
curl -X POST http://localhost:8080/dnd5e.api.v1alpha1.CharacterService/GetDraft \
  -H "Content-Type: application/json" \
  -d '{"draft_id": "your-draft-id"}' | jq > api-data/getDraftResponse.json
```

## When to Delete

Consider removing these files when:

- They become significantly out of sync with the current API
- They cause confusion about the actual data structure
- The project has stable integration tests that capture real responses

## Why We Keep Them

1. **Offline Development** - Work on UI without running the full stack
2. **Structure Reference** - Quick reference for data shapes during development
3. **Journey Artifacts** - They document what the API looked like at this point in time
4. **Type Safety** - Help TypeScript understand the shape of API responses

## Last Updated

- 2025-08-05: Initial snapshots during ChoiceData migration

Remember: **Always verify against the live API** when implementing features.
