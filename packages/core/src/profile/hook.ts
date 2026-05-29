/**
 * Shell hook generator (v1.11.0) — auto-activate the profile named in a
 * directory's `clihub.yaml` on `cd`.
 *
 *   eval "$(clihub profile hook bash)"   # ~/.bashrc
 *   eval "$(clihub profile hook zsh)"    # ~/.zshrc
 *   clihub profile hook fish | source    # ~/.config/fish/config.fish
 *
 * The hook is self-contained: it reads the top-level `profile:` line from
 * `$PWD/clihub.yaml` itself (sed, no clihub spawn) and only calls
 * `clihub profile use` when the wanted profile differs from the one it
 * last activated (tracked in `CLIHUB_ACTIVE_PROFILE`). Cheap on every cd.
 */

export type HookShell = 'bash' | 'zsh' | 'fish';

const POSIX_FN = `_clihub_profile_hook() {
  [ -f "$PWD/clihub.yaml" ] || return 0
  local _p
  _p=$(sed -n 's/^profile:[[:space:]]*//p' "$PWD/clihub.yaml" 2>/dev/null | head -1 | tr -d "\\"' ")
  [ -n "$_p" ] || return 0
  if [ "$_p" != "\${CLIHUB_ACTIVE_PROFILE:-}" ]; then
    clihub profile use "$_p" >/dev/null 2>&1 && export CLIHUB_ACTIVE_PROFILE="$_p"
  fi
}`;

function bash(): string {
  return `# clihub profile hook (bash) — eval "$(clihub profile hook bash)" in ~/.bashrc
${POSIX_FN}
case "\${PROMPT_COMMAND:-}" in
  *_clihub_profile_hook*) ;;
  *) PROMPT_COMMAND="_clihub_profile_hook\${PROMPT_COMMAND:+;$PROMPT_COMMAND}" ;;
esac
_clihub_profile_hook
`;
}

function zsh(): string {
  return `# clihub profile hook (zsh) — eval "$(clihub profile hook zsh)" in ~/.zshrc
${POSIX_FN}
autoload -Uz add-zsh-hook
add-zsh-hook chpwd _clihub_profile_hook
_clihub_profile_hook
`;
}

function fish(): string {
  return `# clihub profile hook (fish) — clihub profile hook fish | source  (in config.fish)
function _clihub_profile_hook --on-variable PWD
  test -f "$PWD/clihub.yaml"; or return 0
  set -l _p (sed -n 's/^profile:[[:space:]]*//p' "$PWD/clihub.yaml" 2>/dev/null | head -1 | tr -d "\\"' ")
  test -n "$_p"; or return 0
  if test "$_p" != "$CLIHUB_ACTIVE_PROFILE"
    clihub profile use "$_p" >/dev/null 2>&1; and set -gx CLIHUB_ACTIVE_PROFILE "$_p"
  end
end
_clihub_profile_hook
`;
}

export function profileHook(shell: HookShell): string {
  switch (shell) {
    case 'bash': return bash();
    case 'zsh': return zsh();
    case 'fish': return fish();
    default: throw new Error(`unsupported shell: ${shell as string} (bash | zsh | fish)`);
  }
}
