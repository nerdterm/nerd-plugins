**What a plugin can read.** Every file the user can, except `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.netrc`, `~/.npmrc`,
`~/.pypirc`, `~/.docker`, `~/.kube`, `~/.azure`, `~/.config/gh`, `~/.config/gcloud`, the shell histories, the whole of
`~/Library` (keychains, cookies, browsers, mail) and nerd's state root (sessions, screens, logs, other plugins and their
data); inside the state root it reads only its own folder and data folder. It never opens a terminal device, so what you
type into a pane or into nerd stays out of its reach. **It can read the command line and the environment of every
program you run**: macOS gives those to any process of the same user, and the sandbox has no rule against it, so a key
in a pane's environment (`ANTHROPIC_API_KEY`, `GH_TOKEN`) is readable by any plugin. **With any network it could send anything it can
read**: with hosts and ports to those hosts, which may pass it on; with `"localhost"`, to any service on this Mac, which
may pass it on too. A `write` path is a way out too, when that folder is synced or shared. A program that later reads a written
file may act on what the plugin put there, which is why the paths above are refused.
