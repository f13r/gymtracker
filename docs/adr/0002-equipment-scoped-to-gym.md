# Equipment is scoped to a Gym, not owned by a User

Equipment belongs to a Gym entity, not directly to a User. This introduces a Gym table as a prerequisite for Equipment management.

User-owned Equipment was rejected because in the coach-trainee model, a coach and their trainees all work at the same gym. If Equipment were user-owned, the coach would need to duplicate or explicitly share Equipment records with each trainee — which is effectively gym-scoped ownership with extra steps.

For the current prototyping phase, each User is associated with exactly one Gym (created implicitly on first Equipment upload). Multi-Gym support and Gym management UI are deferred until the coach-trainee feature ships.
