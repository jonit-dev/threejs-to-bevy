# Prompt: Turn-Based Tactics

Build a small browser turn-based tactics game rendered in a nonblank WebGL
canvas. The player uses pointer or keyboard input to select a visible unit and
move it between visible grid cells toward an objective. After the player acts,
at least one visible enemy takes a distinct turn that changes the board or
threatens the player. Show objective or turn progress, a clear success state,
and a clear failure state caused by enemy play. Include a keyboard or
pointer-driven retry path that resets the encounter.

Visual bar: selectable units, grid cells, legal movement, enemy turns,
objective progress, success/failure state, and retry transition must be
readable without inspecting code.
