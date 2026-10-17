**What a plugin can read.** Every file the user can, except the folders `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.docker`,
`~/.kube`, `~/.azure`, `~/.config/gh`, `~/.config/gcloud`, the whole of `~/Library` (keychains, cookies, browsers, mail)
and nerd's state root (sessions, screens, logs, other plugins and their data); the files `~/.netrc`, `~/.npmrc` and
`~/.pypirc`; the shell histories `~/.zsh_history`, `~/.zsh_sessions`, `~/.bash_history`, `~/.bash_sessions`,
`~/.sh_history`, `~/.history`, `~/.local/share/fish` and `~/.local/share/atuin`; and the histories of python, node,
psql, mysql, sqlite3, irb and less: `~/.python_history`, `~/.node_repl_history`, `~/.psql_history`, `~/.mysql_history`,
`~/.sqlite_history`, `~/.irb_history` and `~/.lesshst`. A denied file covers every name that begins with it
(`~/.zsh_history.new`, where zsh writes the history before renaming it). A link inside a denied folder other than
`~/Library` and nerd's state root, at most four levels down and among its first 2000 entries, denies what it points
to, and so does a denied file or folder that is a link, even to something not yet there, unless the target is your
home folder or above it, or a device such as `/dev/null` (how MySQL turns its history off). These rules are fixed when
nerd reads the plugin's manifest, so a link added later counts after Reload plugins and agents. A history kept anywhere else (another `HISTFILE`, `ZDOTDIR` or
`XDG_DATA_HOME`) is readable. Inside the state root a plugin reads only its own folder and data folder. It never opens
a terminal device, so what you type into a pane or into nerd stays out of its reach. **It can read the command line
and the environment of every program you run**: macOS gives those to any process of the same user, and the sandbox
has no rule against it, so a key
in a pane's environment (`ANTHROPIC_API_KEY`, `GH_TOKEN`) is readable by any plugin. **With any network it could send anything it can
read**: with hosts and ports to those hosts, which may pass it on; with `"localhost"`, to any service on this Mac, which
may pass it on too. A `write` path is a way out too, when that folder is synced or shared. A program that later reads a written
file may act on what the plugin put there, which is why the paths above are refused.
