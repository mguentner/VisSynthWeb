# /sessions

This directory is used to store and serve
sessions created using `session.html`

When a new session is created, all chains from `/chains/`
will be copied to `/sessions/SESSION_NAME/chains`.

If a chain is created/changed in a sessions the updated
chain can be move back to `/chains/` to make it available
for new sessions.

If no session is used (i.e. `session.html` was not used),
a session will be created nonetheless with the name 'default'.
