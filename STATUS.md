# Motif build update

**Done (software):** everything approved for this build works in automated tests:
- Find a comfortable movement, or let Motif suggest some after you move freely.
- Each movement is practised and checked, including a check that ordinary moving doesn't trigger it, before you approve it.
- With the approved movement you can build and speak messages, pause, change speed and recalibrate.
- Up to four movements can work together.
- A setup can be saved on this computer and restored after a quick re-check.
- Plain counts show what Motif saw, it suggests controls, and you can say a movement is tiring.
- A Space-bar mode helps people who can't use a face movement.
- Two people can share one computer.

**Privacy fix made today:** the face-tracking library had hidden usage reporting to Google. Motif now blocks it, so nothing leaves the computer.

**Still needs a person:** the camera was covered, so nobody has tried real face tracking, comfort, spoken audio or hands-free use yet. `ACCEPTANCE.md` lists exactly what to try and what should happen.

How to run it: `README.md`. Nothing has been pushed; all work is in small local commits.
