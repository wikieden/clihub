/**
 * Shell completion script generators for bash / zsh / fish / PowerShell.
 *
 * Covers top-level subcommand completion plus the per-subcommand action
 * lists (skill / plugin / tool: list|install|uninstall|update;
 * preset: list|apply; catalog: sync|status|verify; completion shells).
 * Dynamic id completion (skill ids etc.) is intentionally out of scope
 * for v0.5.0 to keep the script self-contained.
 */

const COMMANDS = [
  'tool',
  'doctor',
  'skill',
  'preset',
  'plugin',
  'catalog',
  'backup',
  'restore',
  'rollback',
  'config',
  'search',
  'watch',
  'self-update',
  'completion',
];

export type CompletionShell = 'bash' | 'zsh' | 'fish' | 'powershell';

export function generateCompletion(shell: CompletionShell): string {
  switch (shell) {
    case 'bash':
      return bashCompletion();
    case 'zsh':
      return zshCompletion();
    case 'fish':
      return fishCompletion();
    case 'powershell':
      return powershellCompletion();
  }
}

function bashCompletion(): string {
  const cmds = COMMANDS.join(' ');
  return `# clihub bash completion
# Install: clihub completion bash > /etc/bash_completion.d/clihub
#     or:  clihub completion bash >> ~/.bashrc

_clihub_complete() {
  local cur prev words cword
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  if [ "\$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( \$(compgen -W "${cmds} --help --version" -- "\$cur") )
    return 0
  fi

  case "\$prev" in
    skill|plugin|tool)
      COMPREPLY=( \$(compgen -W "list install uninstall update" -- "\$cur") )
      return 0 ;;
    preset)
      COMPREPLY=( \$(compgen -W "list apply" -- "\$cur") )
      return 0 ;;
    catalog)
      COMPREPLY=( \$(compgen -W "sync status verify" -- "\$cur") )
      return 0 ;;
    backup)
      COMPREPLY=( \$(compgen -W "list" -- "\$cur") )
      return 0 ;;
    config)
      COMPREPLY=( \$(compgen -W "show" -- "\$cur") )
      return 0 ;;
    completion)
      COMPREPLY=( \$(compgen -W "bash zsh fish powershell" -- "\$cur") )
      return 0 ;;
  esac
}
complete -F _clihub_complete clihub
`;
}

function zshCompletion(): string {
  const cmds = COMMANDS.map((c) => `    "${c}:${describe(c)}"`).join('\n');
  return `#compdef clihub
# clihub zsh completion
# Install: clihub completion zsh > "\${fpath[1]}/_clihub"

_clihub() {
  local -a commands
  commands=(
${cmds}
  )

  if (( CURRENT == 2 )); then
    _describe 'clihub command' commands
    return
  fi

  case \${words[2]} in
    skill|plugin|tool)
      _values 'action' list install uninstall update
      ;;
    preset)
      _values 'action' list apply
      ;;
    catalog)
      _values 'action' sync status verify
      ;;
    completion)
      _values 'shell' bash zsh fish powershell
      ;;
  esac
}

compdef _clihub clihub
`;
}

function fishCompletion(): string {
  const lines: string[] = [
    '# clihub fish completion',
    '# Install: clihub completion fish > ~/.config/fish/completions/clihub.fish',
    '',
  ];
  for (const c of COMMANDS) {
    lines.push(`complete -c clihub -n "__fish_use_subcommand" -a ${c} -d '${describe(c)}'`);
  }
  lines.push('');
  lines.push(`complete -c clihub -n "__fish_seen_subcommand_from skill plugin tool" -a "list install uninstall update"`);
  lines.push(`complete -c clihub -n "__fish_seen_subcommand_from preset" -a "list apply"`);
  lines.push(`complete -c clihub -n "__fish_seen_subcommand_from catalog" -a "sync status verify"`);
  lines.push(`complete -c clihub -n "__fish_seen_subcommand_from completion" -a "bash zsh fish powershell"`);
  return lines.join('\n') + '\n';
}

function powershellCompletion(): string {
  const cmds = COMMANDS.map((c) => `        @{Name='${c}'; Tooltip='${describe(c)}'}`).join('\n');
  return `# clihub PowerShell completion
# Install: clihub completion powershell | Out-String | Invoke-Expression
# Or append to your profile: clihub completion powershell >> $PROFILE

Register-ArgumentCompleter -Native -CommandName clihub -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)

    $commands = @(
${cmds}
    )

    $tokens = $commandAst.CommandElements | ForEach-Object { $_.ToString() }

    if ($tokens.Count -le 2) {
        $commands | Where-Object { $_.Name -like "$wordToComplete*" } |
            ForEach-Object { [System.Management.Automation.CompletionResult]::new($_.Name, $_.Name, 'ParameterValue', $_.Tooltip) }
        return
    }

    $sub = $tokens[1]
    $actions = switch ($sub) {
        'skill'    { 'list','install','uninstall','update' }
        'plugin'   { 'list','install','uninstall','update' }
        'tool'     { 'list','install','uninstall','update' }
        'preset'   { 'list','apply' }
        'catalog'  { 'sync','status','verify' }
        'completion' { 'bash','zsh','fish','powershell' }
        default    { @() }
    }
    $actions | Where-Object { $_ -like "$wordToComplete*" } |
        ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
}
`;
}

function describe(cmd: string): string {
  switch (cmd) {
    case 'tool': return 'Manage CLI tools';
    case 'doctor': return 'Cross-CLI health matrix';
    case 'skill': return 'Manage skills';
    case 'preset': return 'Apply preset bundles';
    case 'plugin': return 'Manage plugins';
    case 'catalog': return 'Sync remote catalog';
    case 'backup': return 'Backup configs';
    case 'restore': return 'Restore from backup';
    case 'rollback': return 'Restore most recent backup';
    case 'config': return 'Show or edit config';
    case 'search': return 'Search the catalog';
    case 'watch': return 'Watch CLI settings for changes';
    case 'self-update': return 'Update clihub itself';
    case 'completion': return 'Print shell completion script';
    default: return cmd;
  }
}
