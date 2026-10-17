---
name: openclaude-skill-author
description: Create or improve a reusable personal workflow skill when repeated work needs specific instructions beyond ordinary model knowledge.
---

Discover skills_list first; load and reuse an appropriate installed skill instead of duplicating it. Create a skill when a repeatable workflow, user preference or verified procedure would help future tasks. A one-off request usually needs an answer or artifact instead.

Use skill_create with name, description and instructions. The description explains when the skill applies. Instructions give the essential steps, the real tool names to discover, required inputs, checks and actual failure handling. Keep secrets and private task data out. A skill grants no permissions and adds no runtime capabilities. Tools execute work; skill text guides it.

For changes, skill_load returns the current version. Use skill_update with skill_id and expected_version; reread on conflicts. Only personal skills are editable. Created skills install immediately and remain available across chats and restarts. Test the workflow on harmless sample inputs using actual tools before claiming it works. Report the saved skill name and any unverified parts.
