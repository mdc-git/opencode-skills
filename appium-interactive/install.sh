#!/usr/bin/env bash
set -euo pipefail

skill_name='appium-interactive'
base_url="https://raw.githubusercontent.com/mdc-git/opencode-skills/refs/heads/master/${skill_name}"
home="${HOME:?HOME must be set}"
install_dir="$home/.config/opencode/skills/$skill_name"
temp_dir=$(mktemp -d)
trap 'rm -rf "$temp_dir"' EXIT

files=(
  README.md
  SKILL.md
  install.sh
)

for file in "${files[@]}"; do
  mkdir -p "$temp_dir/$(dirname "$file")"
  curl -fsSL "$base_url/$file" -o "$temp_dir/$file"
done

mkdir -p "$home/.config/opencode/skills"
rm -rf "$install_dir"
mv "$temp_dir" "$install_dir"
trap - EXIT

printf 'Installed %s at %s\n' "$skill_name" "$install_dir"
