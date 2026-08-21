---
"@bunny.net/astro-adapter": patch
---

Name the command that deploys the build: `bunny sites deploy`.

The build's last line used to say `bunny deploy`, and that command is gone. One
command deploys every shape of site now, and it is the same `bunny sites deploy`
that has always deployed a directory of files. The build writes the same
manifest, and nothing about the output changes.

`docs/writing-an-adapter.md` also says what makes an adapter discoverable. The
CLI offers an adapter only to a project that asks for a server, so a new adapter
names the signals that mean its framework was asked for one.
