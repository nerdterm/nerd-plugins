<div align="center">

<h1>nerd</h1>

**A terminal multiplexer that knows what your AI agents are doing.**

</div>

nerd runs your shells and coding agents side by side in panes and tabs, and shows in a sidebar which one is working.

- **Knows your agents.** Recognises agents from the process table by name.
- **You decide.** A plugin shows what it can do before it is installed ([its network](docs/plugins.md#network)).
- **Survives restarts.** Layout and pane text come back after a reboot.
- **Mouse first.** Every action is in a right-click menu.
- **File tree and preview.** Git status, content search, images.
- **Updates in place.** Switch to a new build from the menu.

## Requirements

- **macOS only, for now.** nerd relies on macOS for its sandbox.
- Any terminal with mouse support and 24-bit colour.

## Limitations

- nerd is early software (0.x).

## Installation

```sh
curl -fsSL https://raw.githubusercontent.com/nerdterm/nerd/master/install.sh | sh
```

## Quick start

```sh
cd ~/code/my-project
nerd
```

- Right click a pane and choose **Split right**.
- Close the window whenever you like. `nerd --resume` brings the desktop back.

### Supported agents

```sh
nerd --install-hook
```

| Agent | Config | States and needs you | Subagents | Resumes after a restart with |
|---|---|---|---|---|
| Claude Code | `~/.claude/settings.json` | Yes, with the tool it asks for | Rows with their tools and runs | `claude --resume=<id>` |

Other agents are recognised by name, and their state is read from what they print.

## Usage

### Updating

After installing a new version, a card says **Update available**.

## Messages between agents

Panes send each other messages with `nerd send`.

## Privacy and security

- **The core.** nerd sends no telemetry. Everything that can leave nerd is in [What leaves nerd](#what-leaves-nerd).

### What leaves nerd

Each way out starts from something you do, says where it goes before it goes, and writes a line to `daemon.log`.

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

### What a program inside a pane can do

It runs as you unless its isolation says otherwise.

## Uninstall

```sh
nerd --uninstall
```

## License

MIT, see [LICENSE](LICENSE).
