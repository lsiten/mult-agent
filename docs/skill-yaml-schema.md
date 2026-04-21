# Skill YAML Schema Specification

## Overview

This document defines the schema for `SKILL.md` (or `skill.yaml`) files used in Hermes Agent skills.

## Current Format: SKILL.md with YAML Frontmatter

Existing skills use Markdown files with YAML frontmatter. This format is maintained for compatibility.

## Schema Definition

### Required Fields

```yaml
name: string            # Skill identifier (kebab-case, alphanumeric + hyphens)
description: string     # One-line description (max 200 chars)
version: string         # SemVer format (e.g., "1.0.0")
author: string          # Author name or organization
```

### Optional Fields

```yaml
license: string         # License identifier (e.g., "MIT", "Apache-2.0")
platforms: [string]     # Supported platforms: macos, linux, windows, all
tags: [string]          # Searchable tags for discovery

# Hermes-specific metadata
metadata:
  hermes:
    tags: [string]      # Alternative tag location (deprecated, use top-level tags)
    trust_level: string # builtin | trusted | community (auto-assigned by hub)
    
# Prerequisites
prerequisites:
  commands: [string]    # Required shell commands (e.g., ["imsg", "jq"])
  packages: [string]    # Required Python packages (not enforced, just documentation)
  env_vars: [string]    # Required environment variables
  
# Permissions (for future sandboxing)
permissions:
  network: boolean      # Requires network access
  filesystem:
    read: [string]      # Allowed read paths (globs)
    write: [string]     # Allowed write paths (globs)
  exec_commands: [string]  # Allowed shell commands to execute
```

## Validation Rules

### 1. Field Types
- `name`: Must match `^[a-z0-9][a-z0-9-]*[a-z0-9]$` (kebab-case)
- `version`: Must match SemVer pattern `^\d+\.\d+\.\d+(-[a-z0-9.]+)?$`
- `platforms`: Must be subset of `["macos", "linux", "windows", "all"]`
- `license`: Recommended SPDX identifier

### 2. Name Collision
- Skill name must be unique within installation directory
- Installation will prompt for overwrite/keep-both/cancel if collision detected

### 3. Security Constraints
- `permissions.exec_commands`: If declared, limits which commands can be executed
- If not declared, skill runs under full `skills_guard.py` monitoring
- `permissions.filesystem.write`: Paths outside skills/ directory require explicit declaration

### 4. File Structure Requirements

A valid skill package must contain:
- `SKILL.md` OR `skill.yaml` in root directory (SKILL.md preferred)
- At least one implementation file (`.py`, `.js`, `.sh`, or executable)
- No path traversal attempts (`../` forbidden)
- No symlinks pointing outside skill directory

## Example: Minimal Valid Skill

```yaml
---
name: hello-world
description: A simple greeting skill
version: 1.0.0
author: Hermes Team
---

# Hello World Skill

Says hello!
```

## Example: Full Featured Skill

```yaml
---
name: imessage
description: Send and receive iMessages/SMS via the imsg CLI on macOS.
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [macos]
tags: [messaging, apple, sms]
metadata:
  hermes:
    trust_level: builtin
prerequisites:
  commands: [imsg]
  env_vars: []
permissions:
  network: false
  exec_commands: [imsg]
  filesystem:
    read: [~/Library/Messages/**]
    write: []
---

# iMessage Skill

Full documentation here...
```

## Python Validation Module

Location: `tools/skill_validator.py` (to be created)

```python
import yaml
import re
from typing import Dict, Any, List, Optional
from dataclasses import dataclass

@dataclass
class ValidationResult:
    valid: bool
    errors: List[str]
    warnings: List[str]

def validate_skill_yaml(content: str) -> ValidationResult:
    """Validate skill YAML frontmatter or standalone YAML file."""
    errors = []
    warnings = []
    
    try:
        # Parse YAML (handle frontmatter if present)
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 2:
                yaml_content = parts[1]
            else:
                errors.append("Invalid YAML frontmatter format")
                return ValidationResult(False, errors, warnings)
        else:
            yaml_content = content
            
        data = yaml.safe_load(yaml_content)
        
        # Required fields
        for field in ["name", "description", "version", "author"]:
            if field not in data:
                errors.append(f"Missing required field: {field}")
                
        # Validate name format
        if "name" in data:
            if not re.match(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$", data["name"]):
                errors.append(f"Invalid name format: {data['name']}")
                
        # Validate version format
        if "version" in data:
            if not re.match(r"^\d+\.\d+\.\d+(-[a-z0-9.]+)?$", data["version"]):
                errors.append(f"Invalid version format: {data['version']}")
                
        # Validate platforms
        if "platforms" in data:
            valid_platforms = {"macos", "linux", "windows", "all"}
            invalid = set(data["platforms"]) - valid_platforms
            if invalid:
                errors.append(f"Invalid platforms: {invalid}")
                
        # Warnings
        if "license" not in data:
            warnings.append("No license specified")
            
        if "tags" not in data and "metadata" not in data:
            warnings.append("No tags specified (reduces discoverability)")
            
        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings
        )
        
    except yaml.YAMLError as e:
        errors.append(f"YAML parsing error: {e}")
        return ValidationResult(False, errors, warnings)
```

## Migration Strategy

### Existing Skills (SKILL.md)
- Current format is valid and supported
- No migration required
- Parser handles both `SKILL.md` and `skill.yaml`

### New Skills
- Can use either `SKILL.md` (Markdown with frontmatter) or `skill.yaml` (standalone)
- `SKILL.md` recommended for better readability

### ZIP Upload Validation
1. Check for `SKILL.md` or `skill.yaml` in root
2. Parse YAML frontmatter/content
3. Run validation rules
4. Integrate with `skills_guard.py` for code scanning
5. Accept if validation passes

## Future Extensions

### V2: Skill Dependencies
```yaml
dependencies:
  skills: [web-access, browser-use]  # Required skill names
  min_hermes_version: "2.0.0"        # Minimum Hermes version
```

### V3: Auto-Update Support
```yaml
update:
  auto_check: boolean
  source_url: string   # GitHub repo or registry URL
  release_channel: stable | beta | nightly
```

---

**Status**: Schema defined  
**Next**: Implement validation in tools/skill_validator.py
