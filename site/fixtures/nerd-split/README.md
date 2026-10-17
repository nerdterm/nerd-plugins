<div align="center">

<h1>nerd</h1>

**A terminal multiplexer that knows what your AI agents are doing.**

</div>

nerd runs your shells and coding agents side by side in panes and tabs, and shows in a sidebar which one is working.

- **Knows your agents.** Recognises agents from the process table by name.
- **You decide.** A plugin shows what it can do before it is installed ([its network](docs/plugins.md#network)).
- **Every way out.** Each is in [What leaves nerd](docs/privacy-and-security.md#what-leaves-nerd).
- **Survives restarts.** Layout and pane text come back after a reboot ([requirements](#requirements)).

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

## Requirements

- **macOS only, for now.** nerd relies on macOS for its sandbox.
- Any terminal with mouse support and 24-bit colour.

## Limitations

- nerd is early software (0.x).

## Documentation

- [Usage](docs/usage.md): the keys and updating.
- [Isolation](docs/isolation.md): what a pane may reach.
- [Messages between agents](docs/messages-between-agents.md): how panes message each other.
- [Plugins](docs/plugins.md): writing one.
- [Privacy and security](docs/privacy-and-security.md): every way out of nerd.
- [Troubleshooting](docs/troubleshooting.md): common problems.
- [Uninstall](docs/uninstall.md): removing nerd.
- [Menus, settings and windows](docs/menus.md): the rules every menu follows.

## License

MIT, see [LICENSE](LICENSE).
