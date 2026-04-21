#!/usr/bin/env python3
"""
Normalize existing installed skills by creating skill.yaml from SKILL.md frontmatter.

Run this script once to ensure all existing skills have the required skill.yaml file.
"""

import yaml
from pathlib import Path
from hermes_constants import get_hermes_home

def normalize_skill(skill_dir: Path) -> bool:
    """Normalize a single skill directory."""
    skill_md = skill_dir / "SKILL.md"
    skill_yaml = skill_dir / "skill.yaml"
    description_md = skill_dir / "DESCRIPTION.md"

    # If skill.yaml already exists, skip
    if skill_yaml.exists():
        print(f"✓ {skill_dir.name}: skill.yaml already exists")
        return False

    # Try SKILL.md first (individual skills)
    if skill_md.exists():
        try:
            with open(skill_md, "r", encoding="utf-8") as f:
                content = f.read()

            if not content.startswith("---"):
                print(f"⚠ {skill_dir.name}: SKILL.md has no frontmatter")
                return False

            parts = content.split("---", 2)
            if len(parts) < 3:
                print(f"⚠ {skill_dir.name}: invalid SKILL.md frontmatter format")
                return False

            frontmatter = yaml.safe_load(parts[1]) or {}

            # Write skill.yaml
            with open(skill_yaml, "w", encoding="utf-8") as f:
                yaml.safe_dump(frontmatter, f, allow_unicode=True, sort_keys=False)

            print(f"✅ {skill_dir.name}: created skill.yaml from SKILL.md")
            return True

        except Exception as e:
            print(f"✗ {skill_dir.name}: failed to process SKILL.md - {e}")
            return False

    # Try DESCRIPTION.md (category directories)
    elif description_md.exists():
        try:
            with open(description_md, "r", encoding="utf-8") as f:
                content = f.read()

            if content.startswith("---"):
                parts = content.split("---", 2)
                if len(parts) >= 3:
                    frontmatter = yaml.safe_load(parts[1]) or {}
                else:
                    frontmatter = {}
            else:
                # Plain text description
                frontmatter = {"description": content.strip()}

            # Add name if missing
            if "name" not in frontmatter:
                frontmatter["name"] = skill_dir.name

            # Write skill.yaml
            with open(skill_yaml, "w", encoding="utf-8") as f:
                yaml.safe_dump(frontmatter, f, allow_unicode=True, sort_keys=False)

            print(f"✅ {skill_dir.name}: created skill.yaml from DESCRIPTION.md")
            return True

        except Exception as e:
            print(f"✗ {skill_dir.name}: failed to process DESCRIPTION.md - {e}")
            return False

    else:
        print(f"⚠ {skill_dir.name}: no SKILL.md or DESCRIPTION.md found")
        return False


def main():
    """Normalize all installed skills."""
    skills_dir = get_hermes_home() / "skills"

    if not skills_dir.exists():
        print(f"Skills directory not found: {skills_dir}")
        return

    print(f"Normalizing skills in: {skills_dir}\n")

    total = 0
    normalized = 0

    for skill_path in sorted(skills_dir.iterdir()):
        if skill_path.is_dir() and not skill_path.name.startswith("."):
            total += 1
            if normalize_skill(skill_path):
                normalized += 1

    print(f"\n📊 Summary: normalized {normalized}/{total} skills")


if __name__ == "__main__":
    main()
