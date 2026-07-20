#!/bin/bash

# CI Pre-flight Check Script
# Run this before pushing to catch CI failures early

set -e

echo "🚀 Running CI pre-flight checks..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track if any check fails
FAILED=0

# Run format check
echo "📝 Checking code formatting..."
if npm run format:check > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Format check passed${NC}"
else
  echo -e "${RED}✗ Format check failed${NC}"
  echo -e "${YELLOW}  Run 'npm run format' to fix${NC}"
  FAILED=1
fi

# Run linter
echo ""
echo "🔍 Running linter..."
if npm run lint > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Lint check passed${NC}"
else
  echo -e "${RED}✗ Lint check failed${NC}"
  echo -e "${YELLOW}  Run 'npm run lint' to see errors${NC}"
  FAILED=1
fi

# Run type check
echo ""
echo "🔧 Running TypeScript type check..."
if npm run typecheck > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Type check passed${NC}"
else
  echo -e "${RED}✗ Type check failed${NC}"
  echo -e "${YELLOW}  Run 'npm run typecheck' to see errors${NC}"
  FAILED=1
fi

# Run build
echo ""
echo "🏗️  Running build..."
if npm run build > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Build passed${NC}"
  # Guard (web#563): the built theme CSS must carry the combat-HUD block —
  # a stale copy shipping in its place is exactly how prod went unstyled twice.
  if grep -q '\.hud-skin' dist/themes/base.css 2>/dev/null; then
    echo -e "${GREEN}✓ Built theme CSS carries the combat-HUD block${NC}"
  else
    echo -e "${RED}✗ dist/themes/base.css is missing the combat-HUD styles (web#563 regression)${NC}"
    FAILED=1
  fi
else
  echo -e "${RED}✗ Build failed${NC}"
  echo -e "${YELLOW}  Run 'npm run build' to see errors${NC}"
  FAILED=1
fi

# Run tests (if test script exists)
echo ""
echo "🧪 Running tests..."
if npm run | grep -q "test"; then
  if npm test -- --run > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Tests passed${NC}"
  else
    echo -e "${RED}✗ Tests failed${NC}"
    echo -e "${YELLOW}  Run 'npm test' to see failures${NC}"
    FAILED=1
  fi
else
  echo -e "${YELLOW}⚠ No test script found, skipping tests${NC}"
fi

# Summary
echo ""
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All CI checks passed! Safe to push.${NC}"
  exit 0
else
  echo -e "${RED}❌ Some CI checks failed. Fix issues before pushing.${NC}"
  echo ""
  echo "💡 Tip: Run 'npm run ci-checks' to see detailed output"
  exit 1
fi