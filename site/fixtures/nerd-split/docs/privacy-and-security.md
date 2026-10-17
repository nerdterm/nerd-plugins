# Privacy and security

- **The core.** nerd sends no telemetry. Everything that can leave nerd is in [What leaves nerd](#what-leaves-nerd); report a hole as [SECURITY.md](../SECURITY.md) says, and narrow a pane with [Isolation](isolation.md).

## How it works

A server owns the panes; the window only draws them.

## What leaves nerd

Each way out starts from something you do or approved, and writes a line to `daemon.log`.

| Way out | When | Logged as |
|---|---|---|
| <!-- egress:git-fetch --> `git` | You add a plugin. | `git clone …` |
| <!-- egress:ssh --> `ssh` | You connect to another computer. | `remote: ssh …` |
| <!-- egress:plugin-network --> A plugin with network | It runs. | `plugin … proxy: …` |
| <!-- egress:pane-network --> A pane set to Only these providers | Its program starts. | `pane N proxy: …` |
| <!-- egress:link --> A link or a file | You open one. | `link opened …` |
| <!-- egress:clipboard --> The clipboard | You copy. | `copied N characters` |
| <!-- egress:agent-inbox --> Claude Code's inbox | A message is delivered. | `message … via inbox: delivered` |

- <!-- egress:pane --> **Panes.** The programs in your panes run as you unless their isolation says otherwise.
- <!-- egress:sandbox-off --> **The sandbox off.** The server is not kept off the network.

## What a program inside a pane can do

It runs as you unless its isolation says otherwise.

