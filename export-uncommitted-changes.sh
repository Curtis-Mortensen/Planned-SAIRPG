#!/bin/bash

# Script to export all uncommitted changes in the current repository
# This captures staged, unstaged, and untracked files

# Get the repository path
REPO=$(git rev-parse --show-toplevel)
cd "$REPO" || exit 1

OUTPUT_FILE="$REPO/uncommitted-changes.patch"

# Clear/create the output file
> "$OUTPUT_FILE"

{
  echo "# Uncommitted Changes Export"
  echo "# Generated on: $(date)"
  echo "# Repository: $REPO"
  echo ""
} >> "$OUTPUT_FILE"

DIFF_OUTPUT=""

# 1. Get staged changes (git diff --cached)
echo "Checking staged changes..." >&2
STAGED_DIFF=$(git diff --cached 2>/dev/null)
if [ -n "$STAGED_DIFF" ]; then
  DIFF_OUTPUT+="# === STAGED CHANGES ==="$'\n'
  DIFF_OUTPUT+="$STAGED_DIFF"$'\n'
  DIFF_OUTPUT+=$'\n'
fi

# 2. Get unstaged changes (git diff)
echo "Checking unstaged changes..." >&2
UNSTAGED_DIFF=$(git diff 2>/dev/null)
if [ -n "$UNSTAGED_DIFF" ]; then
  DIFF_OUTPUT+="# === UNSTAGED CHANGES ==="$'\n'
  DIFF_OUTPUT+="$UNSTAGED_DIFF"$'\n'
  DIFF_OUTPUT+=$'\n'
fi

# 3. Get untracked files
echo "Checking untracked files..." >&2
UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null)
if [ -n "$UNTRACKED" ]; then
  DIFF_OUTPUT+="# === UNTRACKED FILES ==="$'\n'
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    
    # Skip common artifacts and the output file itself
    case "$file" in
      uncommitted-changes.patch|*.patch|export-uncommitted-changes.sh|export-worktree-diffs.sh|all-worktrees-diff.patch)
        continue
        ;;
    esac
    
    if [ -f "$file" ]; then
      DIFF_OUTPUT+="diff --git a/$file b/$file"$'\n'
      DIFF_OUTPUT+="new file mode 100644"$'\n'
      HASH=$(git hash-object "$file" 2>/dev/null | cut -c1-7 || echo "0000000")
      DIFF_OUTPUT+="index 0000000..$HASH"$'\n'
      DIFF_OUTPUT+="--- /dev/null"$'\n'
      DIFF_OUTPUT+="+++ b/$file"$'\n'
      LINE_COUNT=$(wc -l < "$file" 2>/dev/null | tr -d ' ')
      if [ "$LINE_COUNT" -gt 0 ]; then
        DIFF_OUTPUT+="@@ -0,0 +1,$LINE_COUNT @@"$'\n'
        while IFS= read -r line || [ -n "$line" ]; do
          DIFF_OUTPUT+="+$line"$'\n'
        done < "$file"
      else
        DIFF_OUTPUT+="@@ -0,0 +1 @@"$'\n'
        DIFF_OUTPUT+="+"$'\n'
      fi
      DIFF_OUTPUT+=$'\n'
    elif [ -d "$file" ]; then
      # Handle directories (though git ls-files shouldn't return directories)
      echo "Warning: Skipping directory: $file" >&2
    fi
  done <<< "$UNTRACKED"
fi

# Write output to file
if [ -n "$(echo "$DIFF_OUTPUT" | tr -d '[:space:]')" ]; then
  echo "$DIFF_OUTPUT" >> "$OUTPUT_FILE"
  echo "" >&2
  echo "Uncommitted changes exported to: $OUTPUT_FILE" >&2
  echo "File size: $(wc -l < "$OUTPUT_FILE") lines" >&2
  
  # Show summary
  STAGED_COUNT=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')
  UNSTAGED_COUNT=$(git diff --name-only 2>/dev/null | wc -l | tr -d ' ')
  UNTRACKED_COUNT=$(git ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d ' ')
  
  echo "" >&2
  echo "Summary:" >&2
  echo "  Staged files: $STAGED_COUNT" >&2
  echo "  Unstaged files: $UNSTAGED_COUNT" >&2
  echo "  Untracked files: $UNTRACKED_COUNT" >&2
else
  echo "No uncommitted changes found." >&2
  rm -f "$OUTPUT_FILE"
fi




