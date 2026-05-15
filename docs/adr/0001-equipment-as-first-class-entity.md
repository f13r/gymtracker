# Equipment introduced as a first-class entity

Previously "Equipment" was only an enum attribute on Exercise (`barbell`, `dumbbell`, `machine`, etc.), not a DB entity. We are introducing Equipment as a standalone table representing a physical piece of gym apparatus photographed by the user.

The enum attribute is renamed to **Equipment Type** to free up the term. The new Equipment entity stores a photo, name, description, tags, and Equipment Type, and is linked to Exercises via a many-to-many join. Sets and TemplateExercises may optionally reference a specific Equipment instance so users and coaches can track which physical machine was used.

This was chosen over keeping Equipment as a pure enum because the photo-based identification feature requires a persistent record of the physical machine, and the coach use case requires prescribing a specific machine (not just a type) in Templates.

## Considered Options

- Keep Equipment as enum only, link exercises to a photo via a separate "EquipmentPhoto" entity — rejected because this produces the same schema complexity with worse semantics.
- Treat each Exercise as machine-specific (no join table, duplicate exercises per machine) — rejected because it fragments PR and Volume history across duplicate Exercise rows.
