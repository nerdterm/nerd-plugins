# Plugins

## Manifest

A plugin is a folder with a `plugin.json`. How far it reaches is under [Network](#network), and what it adds is in
[Quick start](../README.md#quick-start); start from the [template](../templates/plugin/).

### Network

A plugin reaches nothing unless its manifest says so.

## Sandbox

A plugin runs in its own sandbox.

**What a plugin can read.** Every file the user can, except `~/.ssh`, `~/.aws`, the shell histories, the whole of
`~/Library` (keychains, cookies) and nerd's state root (sessions, logs); inside the state root it reads only its own
folder. **It can read the command line and the environment of every program you run.**

## Roles and authorization

A plugin reads most of your files and the environments of your other programs, as any program you run does.
