#!/bin/bash
# Safe push script that always runs CI checks first

echo "🔍 Running CI checks before push..."
echo ""

# Run CI check
npm run ci-check

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ CI checks failed!"
    echo ""
    echo "Options:"
    echo "1. Fix the issues and try again"
    echo "2. Run 'npm run ci-fix' to auto-fix what's possible"
    echo ""
    read -p "Would you like to run ci-fix now? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm run ci-fix
        echo ""
        echo "🔄 Re-running CI check..."
        npm run ci-check
        if [ $? -ne 0 ]; then
            echo "❌ Still have issues. Please fix manually."
            exit 1
        fi
    else
        exit 1
    fi
fi

echo ""
echo "✅ All checks passed! Pushing to remote..."
echo ""

# Push with the provided arguments
git push "$@"