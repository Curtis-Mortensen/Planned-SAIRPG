#!/bin/bash

# Script to export all diffs from git worktrees
# This captures uncommitted changes that are UNIQUE to each worktree

# Get the main repository path first
MAIN_REPO=$(git rev-parse --show-toplevel)
cd "$MAIN_REPO" || exit 1

OUTPUT_FILE="$MAIN_REPO/all-worktrees-diff.patch"

# Clear/create the output file
> "$OUTPUT_FILE"

{
  echo "# Combined Diff of All Git Worktrees"
  echo "# Generated on: $(date)"
  echo ""
} >> "$OUTPUT_FILE"

# Build a list of untracked files in main repo (to exclude from worktrees)
MAIN_UNTRACKED_FILES=$(git ls-files --others --exclude-standard 2>/dev/null | sort)

# Process each worktree
while IFS= read -r line; do
  # Extract worktree path (first field)
  WORKTREE_PATH=$(echo "$line" | awk '{print $1}')
  
  # Skip if it's the main worktree (current directory)
  if [ "$WORKTREE_PATH" = "$MAIN_REPO" ]; then
    continue
  fi
  
  # Check if worktree path exists
  if [ ! -d "$WORKTREE_PATH" ]; then
    echo "Warning: Worktree path does not exist: $WORKTREE_PATH" >&2
    continue
  fi
  
  WORKTREE_NAME=$(basename "$WORKTREE_PATH")
  echo "Processing worktree: $WORKTREE_NAME" >&2
  
  # Get the diff output for this worktree
  WORKTREE_OUTPUT=$(
    cd "$WORKTREE_PATH" || exit 1
    
    DIFF_OUTPUT=""
    
    # 1. Get tracked file changes (staged + unstaged) compared to HEAD
    TRACKED_DIFF=$(git diff HEAD 2>/dev/null)
    if [ -n "$TRACKED_DIFF" ]; then
      DIFF_OUTPUT+="$TRACKED_DIFF"$'\n'
    fi
    
    # 2. Get untracked files that are UNIQUE to this worktree
    # (i.e., don't exist in main repo OR have different content)
    UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null)
    if [ -n "$UNTRACKED" ]; then
      UNIQUE_UNTRACKED=""
      while IFS= read -r file; do
        # Skip common artifacts
        case "$file" in
          all-worktrees-diff.patch|*.patch|export-worktree-diffs.sh)
            continue
            ;;
        esac
        
        # Check if this file exists in main repo
        MAIN_FILE="$MAIN_REPO/$file"
        if [ -f "$MAIN_FILE" ]; then
          # File exists in main - check if content is different
          if ! cmp -s "$file" "$MAIN_FILE"; then
            # Different content - include it
            UNIQUE_UNTRACKED+="$file"$'\n'
          fi
          # Same content - skip it (it's a shared file)
        else
          # File doesn't exist in main - it's unique to this worktree
          UNIQUE_UNTRACKED+="$file"$'\n'
        fi
      done <<< "$UNTRACKED"
      
      # Generate diff format for unique untracked files
      if [ -n "$UNIQUE_UNTRACKED" ]; then
        while IFS= read -r file; do
          [ -z "$file" ] && continue
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
          fi
        done <<< "$UNIQUE_UNTRACKED"
      fi
    fi
    
    echo "$DIFF_OUTPUT"
  )
  
  # Only add worktree to output if it has actual changes
  if [ -n "$(echo "$WORKTREE_OUTPUT" | tr -d '[:space:]')" ]; then
    {
      echo ""
      echo "========================================"
      echo "Worktree: $WORKTREE_NAME"
      echo "========================================"
      echo ""
      echo "$WORKTREE_OUTPUT"
    } >> "$OUTPUT_FILE"
  else
    echo "  (no unique changes, skipping)" >&2
  fi
  
done < <(git worktree list)

echo "" >&2
echo "Diff exported to: $OUTPUT_FILE" >&2
echo "File size: $(wc -l < "$OUTPUT_FILE") lines" >&2
