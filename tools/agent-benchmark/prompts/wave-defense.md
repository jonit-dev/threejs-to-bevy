# Prompt: Wave Defense

Build a small browser wave-defense game rendered in a nonblank WebGL canvas.
The player controls a visible defender with keyboard movement and pointer aim or
attack input while visible enemies spawn in successive waves and advance toward
a visible base. Enemy attacks reduce base health, surviving a wave advances
visible wave or score progress, and later waves become meaningfully harder.
Include a clear failure state when the base health reaches zero and a keyboard
or pointer-driven retry path that restarts active play.

Visual bar: the defender, enemies, base, attacks, base health, wave progress,
failure state, and retry transition must be readable without inspecting code.
